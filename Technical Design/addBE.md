# Backend Architecture

> Prerequisite design doc before Phase 1B implementation. Covers the introduction of a Node/Express backend, Neo4j Aura graph database, and Google OAuth authentication to evolve the app from a static personal tool into a hosted, multi-user platform.

---

## Overview

### Current State
The app is a purely static React frontend deployed to GitHub Pages. All data lives in a bundled `family.json` file. There is no persistence, no auth, and no backend.

### Target Architecture

```
Browser (GitHub Pages)                Server (Railway/Render)            Database
┌──────────────────────┐              ┌──────────────────────────┐        ┌─────────────┐
│  React + Zustand     │ ──REST API──▶│  Node.js + Express       │───────▶│  Neo4j Aura │
│  (unchanged shape)   │ ◀──JSON──────│  - Google OAuth handler  │        │  (Free tier)│
└──────────────────────┘              │  - JWT auth middleware    │        └─────────────┘
                                      │  - Tree / Person / Rel   │
         Google OAuth                 │    CRUD endpoints         │
         consent screen               │  - DB credentials (safe) │
              ▲                       └──────────────────────────┘
              │
        accounts.google.com
```

### Monorepo Structure

```
family-tree/                  ← existing GitHub repo
├── src/                      ← React frontend (unchanged)
├── server/                   ← new Node/Express API
│   ├── src/
│   ├── scripts/
│   └── package.json
├── package.json              ← frontend
└── .github/workflows/
    └── deploy.yml            ← addition: inject VITE_API_BASE_URL into Vite build
```

#### deploy.yml change explained

Vite only embeds environment variables prefixed with `VITE_` into the compiled bundle — anything else is invisible to the browser. `VITE_API_BASE_URL` is the frontend's only runtime configuration: it tells `apiFetch()` where the backend lives.

GitHub Actions variables (set under **Settings → Variables → Actions** in the repo) are not automatically available to build steps. They must be explicitly passed via the `env:` block on the step that runs `vite build`. Without this, `import.meta.env.VITE_API_BASE_URL` would be `undefined` at runtime in the deployed app.

The addition to the existing `deploy.yml` build step:

```yaml
# .github/workflows/deploy.yml
- name: Install & Build
  env:
    VITE_API_BASE_URL: ${{ vars.VITE_API_BASE_URL }}   # ← this line is new
  run: |
    npm install
    npm run build
```

`VITE_API_BASE_URL` is stored as a GitHub Actions **variable** (not a secret) because it is a public URL — there is no harm in it being visible in the Actions UI. Secrets are appropriate for credentials that must never be logged; a backend base URL does not qualify.

### Scope (Phase 1)
- One family tree per user — multiple trees and collaborative trees are deferred
- Google OAuth only — no email/password auth
- JWT in `Authorization` header — no refresh token mechanism initially
- Demo mode available — unauthenticated users can preview the app with `family.json` data; EditMode is hidden in this state

---

## Neo4j Graph Schema

### Node Labels

#### `(:User)`
Represents an authenticated user. Minimal — just enough to own a tree.

```cypher
CREATE CONSTRAINT user_id_unique IF NOT EXISTS
  FOR (u:User) REQUIRE u.id IS UNIQUE;

CREATE CONSTRAINT user_google_id_unique IF NOT EXISTS
  FOR (u:User) REQUIRE u.googleId IS UNIQUE;
```

| Property | Type | Notes |
|---|---|---|
| `id` | String (UUID) | Internal ID — used in JWT `sub` claim |
| `googleId` | String | Google OAuth `sub` claim — stable identity anchor |
| `email` | String | From Google ID token — informational only, never used as a lookup key |
| `createdAt` | String | ISO 8601 datetime |

#### `(:FamilyTree)`
One tree per user in Phase 1. Exists as a first-class node so Phase 2 multi-tree support is an addition, not a schema change.

```cypher
CREATE CONSTRAINT tree_id_unique IF NOT EXISTS
  FOR (t:FamilyTree) REQUIRE t.id IS UNIQUE;
```

| Property | Type | Notes |
|---|---|---|
| `id` | String (UUID) | |
| `name` | String | Display name, e.g. "The Johnson Family" |
| `rootPersonId` | String (UUID) | Designated root — mirrors `root_person` from current `family.json` |
| `createdAt` | String | ISO 8601 datetime |
| `updatedAt` | String | ISO 8601 datetime |

#### `(:Person)`
Maps directly to the existing `Person` TypeScript interface.

```cypher
CREATE CONSTRAINT person_id_unique IF NOT EXISTS
  FOR (p:Person) REQUIRE p.id IS UNIQUE;

CREATE INDEX person_name_index IF NOT EXISTS
  FOR (p:Person) ON (p.name);
```

| Property | Type | Notes |
|---|---|---|
| `id` | String (UUID) | |
| `name` | String \| null | |
| `dob` | String \| null | ISO 8601 date `"YYYY-MM-DD"` |
| `image` | String \| null | URL |

### Relationship (Edge) Types

All three semantic types from the current JSON model map to Neo4j edges — not intermediate nodes. This keeps traversal queries idiomatic.

Each edge carries an `id` UUID property to allow targeted deletion by ID, matching the existing `relationship.id` from the JSON schema.

#### `[:PARENT_OF]` — directed
`(parent:Person)-[:PARENT_OF {id}]->(child:Person)`

Direction encodes semantics: arrow always points parent → child.

#### `[:SPOUSE_OF]` — symmetric
`(a:Person)-[:SPOUSE_OF {id}]-(b:Person)`

Stored with a direction internally, but always queried with the undirected pattern `-[:SPOUSE_OF]-`. To guarantee at-most-one edge between any pair and make `MERGE` safe, the convention is: `from` = the person with the lexicographically smaller UUID, `to` = the larger. This ordering is enforced by a backend utility, never by the caller.

#### `[:SIBLING_OF]` — symmetric
`(a:Person)-[:SIBLING_OF {id}]-(b:Person)`

Same approach as `SPOUSE_OF`.

### Ownership Edges

```cypher
(u:User)-[:OWNS]->(t:FamilyTree)
(t:FamilyTree)-[:HAS_PERSON]->(p:Person)
```

`HAS_PERSON` is the critical ownership chain. All queries are scoped through it — no `treeId` property needs to be denormalized onto every `Person` node.

### Directed vs Symmetric Summary

| Type | Neo4j edge direction | Query pattern | `from` storage rule |
|---|---|---|---|
| `parent` | `(parent)→(child)` | Directed `->` | Natural direction |
| `spouse` | Stored with direction | Undirected `-` | Lexicographically smaller UUID |
| `sibling` | Stored with direction | Undirected `-` | Lexicographically smaller UUID |

### Key Cypher Patterns

**Load full tree data (replaces `loadData(family.json)`):**
```cypher
MATCH (u:User {id: $userId})-[:OWNS]->(t:FamilyTree {id: $treeId})
MATCH (t)-[:HAS_PERSON]->(p:Person)
OPTIONAL MATCH (p)-[r:PARENT_OF|SPOUSE_OF|SIBLING_OF]-()
RETURN t, collect(DISTINCT p) AS persons, collect(DISTINCT r) AS relationships
```

**Get children:**
```cypher
MATCH (u:User {id: $userId})-[:OWNS]->(t:FamilyTree {id: $treeId})
MATCH (t)-[:HAS_PERSON]->(parent:Person {id: $personId})-[:PARENT_OF]->(child:Person)
RETURN child
```

**Get spouse:**
```cypher
MATCH (u:User {id: $userId})-[:OWNS]->(t:FamilyTree {id: $treeId})
MATCH (t)-[:HAS_PERSON]->(p:Person {id: $personId})-[:SPOUSE_OF]-(spouse:Person)
RETURN spouse
```

**Create person:**
```cypher
MATCH (u:User {id: $userId})-[:OWNS]->(t:FamilyTree {id: $treeId})
CREATE (p:Person {id: $id, name: $name, dob: $dob, image: $image})
CREATE (t)-[:HAS_PERSON]->(p)
RETURN p
```

**Add symmetric relationship (idempotent):**
```cypher
MATCH (u:User {id: $userId})-[:OWNS]->(t:FamilyTree {id: $treeId})
MATCH (t)-[:HAS_PERSON]->(a:Person {id: $aId})  // $aId = smaller UUID
MATCH (t)-[:HAS_PERSON]->(b:Person {id: $bId})
MERGE (a)-[r:SPOUSE_OF]-(b)
ON CREATE SET r.id = $relId
RETURN r
```

**Delete relationship by id:**
```cypher
MATCH (u:User {id: $userId})-[:OWNS]->(t:FamilyTree {id: $treeId})
MATCH (t)-[:HAS_PERSON]->(:Person)-[r {id: $relId}]-(:Person)
DELETE r
```

**Delete person (cascade all edges):**
```cypher
MATCH (u:User {id: $userId})-[:OWNS]->(t:FamilyTree {id: $treeId})
MATCH (t)-[hp:HAS_PERSON]->(p:Person {id: $personId})
DETACH DELETE p
```

---

## API Design

### Base URL
`https://<backend-host>/api/v1`

### Auth Convention
- Protected routes require: `Authorization: Bearer <jwt>`
- The JWT encodes `userId` (internal UUID)
- Unauthenticated requests to protected routes → `401 Unauthorized`
- Valid JWT but mismatched tree ownership → `403 Forbidden`

### Error Response Shape
```typescript
interface ApiError {
  error: {
    code: string;    // machine-readable, e.g. "PERSON_NOT_FOUND"
    message: string; // human-readable
  };
}
```

### TypeScript DTO Interfaces

```typescript
interface PersonDTO {
  id: string;
  name: string | null;
  dob: string | null;   // "YYYY-MM-DD"
  image: string | null;
}

interface RelationshipDTO {
  id: string;
  type: 'parent' | 'spouse' | 'sibling';
  from: string;  // person UUID
  to: string;    // person UUID
}

interface FamilyDataDTO {
  rootPersonId: string | null;
  persons: PersonDTO[];
  relationships: RelationshipDTO[];
}

interface TreeSummaryDTO {
  id: string;
  name: string;
  rootPersonId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CreatePersonRequest {
  name: string | null;
  dob: string | null;
  image: string | null;
}

interface UpdatePersonRequest {
  name?: string | null;
  dob?: string | null;
  image?: string | null;
}

interface CreateRelationshipRequest {
  type: 'parent' | 'spouse' | 'sibling';
  from: string;
  to: string;
}

interface UpdateTreeRequest {
  name?: string;
  rootPersonId?: string;
}
```

### Endpoints

#### Auth (public)

| Method | Path | Description |
|---|---|---|
| `GET` | `/auth/google` | Redirect to Google OAuth consent screen |
| `GET` | `/auth/google/callback` | Exchange code for token; issue JWT; redirect to frontend |
| `GET` | `/auth/me` | Returns current user — **protected** |

**`GET /auth/google/callback`** — on success, redirects to:
```
https://<FRONTEND_ORIGIN>/family-tree?token=<jwt>
```
The frontend reads `?token=` once, stores it, strips it from the URL.

**`GET /auth/me`** — response `200`:
```typescript
{ id: string; email: string; }
```

#### Tree — protected

| Method | Path | Description |
|---|---|---|
| `GET` | `/trees/mine` | Get tree summary; `404` if no tree yet |
| `PATCH` | `/trees/mine` | Update tree name or `rootPersonId` |
| `GET` | `/trees/mine/data` | Full tree load — **primary bulk-fetch endpoint** |

**`GET /trees/mine/data`** is the direct replacement for loading `family.json`. Response `200`: `FamilyDataDTO`. The `relationships` array uses the same `from/to` semantics as the current JSON model — the frontend store requires no changes to consume it.

#### Persons — protected

| Method | Path | Body | Response |
|---|---|---|---|
| `POST` | `/trees/mine/persons` | `CreatePersonRequest` | `201` `PersonDTO` |
| `GET` | `/trees/mine/persons/:personId` | — | `200` `PersonDTO` |
| `PATCH` | `/trees/mine/persons/:personId` | `UpdatePersonRequest` | `200` `PersonDTO` |
| `DELETE` | `/trees/mine/persons/:personId` | — | `204` |

`DELETE` uses `DETACH DELETE` in Cypher — removes the person node and all their edges.

#### Relationships — protected

| Method | Path | Body | Response |
|---|---|---|---|
| `POST` | `/trees/mine/relationships` | `CreateRelationshipRequest` | `201` `RelationshipDTO` |
| `DELETE` | `/trees/mine/relationships/:relId` | — | `204` |

`POST` returns `409` for duplicates, `422` for validation failures (self-relationship, circular parent, DOB plausibility).

### Frontend Store Selector Mapping

| Current store action | API call |
|---|---|
| `loadData(family.json)` at module init | `GET /trees/mine/data` after auth |
| `getPersonById`, `getChildren`, `getSpouse` | No change — resolved from in-memory store |
| `addPerson` (Phase 1B) | `POST /trees/mine/persons` |
| `updatePerson` (Phase 1B) | `PATCH /trees/mine/persons/:id` |
| `setPersonRelationships` (Phase 1B) | `POST` / `DELETE /trees/mine/relationships` per diff |

The Zustand store remains an in-memory read model. For Phase 1 scale (small trees), a full re-fetch via `GET /trees/mine/data` after each mutation is the simplest correct approach.

---

## Google OAuth + JWT Auth Flow

```
1. User clicks "Sign in with Google"
   └─ Frontend navigates to: GET /api/v1/auth/google

2. Backend builds the Google authorization URL and responds 302 → accounts.google.com
   Params: client_id, redirect_uri, response_type=code, scope=openid email, state=<signed nonce>

3. User authenticates on Google's consent screen
   └─ Google redirects to GET /api/v1/auth/google/callback?code=...&state=...

4. Backend callback handler:
   a. Verify state nonce (CSRF protection)
   b. POST to https://oauth2.googleapis.com/token with code + client_secret
      → receives { id_token, ... }
   c. Verify id_token signature against Google's JWKS (via google-auth-library)
   d. Extract claims: { sub → googleId, email }
   e. Upsert User node in Neo4j:
        MERGE (u:User {googleId: $sub})
        ON CREATE SET u.id = $uuid, u.email = $email, u.createdAt = $now
        ON MATCH  SET u.email = $email
   f. If new user: CREATE FamilyTree node + OWNS edge
   g. Sign JWT { sub: u.id, email: u.email, exp: now + 7 days } with HS256
   h. 302 → https://<FRONTEND_ORIGIN>/family-tree?token=<jwt>

5. Frontend receives redirect
   └─ Reads ?token= from URL
   └─ Stores in localStorage under key "ft_token"
   └─ Strips token from URL (window.history.replaceState)
   └─ Calls GET /trees/mine/data with Authorization: Bearer <jwt>
   └─ Feeds response into existing loadData() action → store hydrated
```

### JWT Payload

```typescript
interface JWTPayload {
  sub: string;    // internal User UUID (not googleId, not email)
  email: string;  // informational — frontend can display "signed in as"
  iat: number;    // issued at (Unix seconds)
  exp: number;    // iat + 604800 (7 days)
}
```

Algorithm: `HS256`. `JWT_SECRET` is a 256-bit random hex string, stored only as an environment variable — never committed.

**Expiry strategy:** 7-day token; user re-authenticates on expiry. The frontend detects `401` responses, clears the stored token, and shows the sign-in state. Silent refresh via a refresh token is deferred to a future phase.

### Frontend API Client (`src/api/client.ts` — new file)

```typescript
async function apiFetch<T>(path: string, options?: { method?: string; body?: unknown }): Promise<T> {
  const token = localStorage.getItem('ft_token');
  const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}${path}`, {
    method: options?.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 401) {
    localStorage.removeItem('ft_token');
    throw new Error('UNAUTHENTICATED');
  }
  if (!res.ok) throw await res.json();
  return res.status === 204 ? undefined as T : res.json();
}
```

---

## Backend Folder Structure

```
server/
├── src/
│   ├── index.ts                  # Server entry: warm Neo4j connection, app.listen(), graceful shutdown
│   ├── app.ts                    # Express setup: cors, json, routes, error handler
│   │
│   ├── config/
│   │   └── env.ts                # Validates + exports all env vars; throws at startup if any are missing
│   │
│   ├── db/
│   │   └── neo4j.ts              # neo4j-driver singleton; exports getDriver(), getSession(), closeDriver()
│   │
│   ├── middleware/
│   │   ├── auth.ts               # Parses Bearer token, verifies JWT, attaches req.user = {id, email}
│   │   └── errorHandler.ts       # Global error handler; formats all thrown errors as ApiError shape
│   │
│   ├── routes/
│   │   ├── auth.ts               # GET /auth/google, /auth/google/callback, /auth/me
│   │   ├── trees.ts              # GET|PATCH /trees/mine, GET /trees/mine/data
│   │   ├── persons.ts            # POST|GET|PATCH|DELETE /trees/mine/persons(/:id)
│   │   └── relationships.ts      # POST|DELETE /trees/mine/relationships(/:id)
│   │
│   ├── services/
│   │   ├── authService.ts        # Google token exchange, ID token verification, User upsert in Neo4j
│   │   ├── treeService.ts        # Tree CRUD, full data load, ownership checks
│   │   ├── personService.ts      # Person CRUD, tree membership validation
│   │   └── relationshipService.ts# Relationship CRUD, symmetric ordering, validation rules
│   │
│   ├── utils/
│   │   ├── jwt.ts                # signJwt(payload), verifyJwt(token)
│   │   ├── uuid.ts               # generateUuid() — thin wrapper around crypto.randomUUID()
│   │   └── relationshipOrder.ts  # Lexicographic ordering for symmetric relationship edges
│   │
│   └── types/
│       ├── express.d.ts          # Augments Express Request: user?: { id: string; email: string }
│       └── api.ts                # All DTO interfaces shared across routes and services
│
├── scripts/
│   └── seed.ts                   # One-shot migration: reads family.json, writes to Neo4j (see Migration)
│
├── .env.example                  # Committed — documents all required env vars with placeholder values
├── .env                          # Not committed — gitignored
├── package.json
└── tsconfig.json
```

**Key separation of concerns:**
- All Cypher queries live in `services/` — never in route handlers
- Route handlers only parse the HTTP request, call a service function, and format the response
- `config/env.ts` is the single source of truth for env var names — no other file reads `process.env` directly

### `.env.example`
```
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret

JWT_SECRET=replace-with-256-bit-random-hex

NEO4J_URI=neo4j+s://xxxxxxxx.databases.neo4j.io
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your-aura-password

PORT=3001
NODE_ENV=development

FRONTEND_ORIGIN=https://<your-github-username>.github.io
```

---

## Deployment Plan

### Where Things Run

| Concern | Host | Notes |
|---|---|---|
| Frontend (React + Vite) | GitHub Pages | Unchanged — existing `deploy.yml` workflow |
| Backend (Node + Express) | Railway or Render | Free tier; auto-deploys `server/` on push to `main` |
| Database | Neo4j Aura Free | Managed, hosted — no infrastructure to provision |

### Environment Variables

**Frontend — set as a GitHub Actions variable (`vars.VITE_API_BASE_URL`):**
```
VITE_API_BASE_URL=https://your-backend.railway.app/api/v1
```
This is the only frontend env var needed. It is a public URL — safe to store as a variable (not a secret).

**Backend — set in Railway/Render's environment variables UI (never in source control):**
```
GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
JWT_SECRET
NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD
FRONTEND_ORIGIN=https://<username>.github.io
PORT, NODE_ENV=production
```

### GitHub Actions Change (deploy.yml)

One addition to the existing build step — pass `VITE_API_BASE_URL` into the Vite build:

```yaml
- name: Install & Build
  env:
    VITE_API_BASE_URL: ${{ vars.VITE_API_BASE_URL }}
  run: |
    npm install
    npm run build
```

The backend is **not** deployed via GitHub Actions. Railway/Render auto-deploys from the `server/` subdirectory via their own webhook. Set **root directory** to `server/` in the platform's project settings.

### CORS Configuration

```typescript
// server/src/app.ts
app.use(cors({
  origin: FRONTEND_ORIGIN,   // e.g. "https://username.github.io"
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,        // JWT in Authorization header — no cookies
}));
```

For local development: set `FRONTEND_ORIGIN=http://localhost:5173` in `server/.env`.

---

## Frontend Migration Path

### New Frontend File Structure

The migration introduces an `AuthPage`, a `Layout` container, and an `api/` layer alongside the existing `store/`, `components/`, `pages/`, and `utils/` directories.

```
src/
├── api/
│   ├── client.ts             # apiFetch() — base HTTP client with Bearer token injection
│   └── operations.ts         # All API call functions (fetchTreeData, createPerson, etc.)
│
├── store/
│   ├── familyStore.ts        # Unchanged shape; loadData() action kept as-is
│   └── authStore.ts          # New — auth state only (token, user, mode, setAuth, clearAuth)
│
├── pages/
│   ├── AuthPage/             # Landing / sign-in page (outside Layout)
│   │   ├── component.tsx
│   │   ├── styles.ts
│   │   └── index.ts
│   ├── ViewMode/             # Unchanged
│   └── EditMode/             # Unchanged (hidden in demo mode)
│
└── layout/
    └── Layout/               # Authenticated shell — nav bar, data loading, route guard
        ├── component.tsx
        ├── styles.ts
        └── index.ts
```

### Step 1 — Add `authStore.ts`

Create `src/store/authStore.ts` as a standalone Zustand store, separate from `familyStore`. It owns all auth and session state including the **app mode** (demo vs. authenticated).

```typescript
type AppMode = 'unauthenticated' | 'demo' | 'authenticated';

interface AuthState {
  mode: AppMode;
  token: string | null;
  user: { id: string; email: string } | null;
  setAuth: (token: string, user: { id: string; email: string }) => void;
  setDemo: () => void;
  clearAuth: () => void;
}
```

**On app startup** (`main.tsx` or `App.tsx` before any render):
1. Read `localStorage.getItem('ft_token')`
2. If present and not expired (check `exp` claim): call `setAuth()` → `mode = 'authenticated'`
3. Otherwise: `mode = 'unauthenticated'` — user must choose to sign in or try the demo

**Actions:**
- `setAuth(token, user)` — stores token in localStorage, sets `mode = 'authenticated'`
- `setDemo()` — sets `mode = 'demo'`, no token stored; calls `loadData(initialData)` with the bundled `family.json`
- `clearAuth()` — removes token from localStorage, resets to `mode = 'unauthenticated'`

**Export hooks:**
```typescript
export const useAppMode = () => useAuthStore(s => s.mode);
export const useAuthUser = () => useAuthStore(s => s.user);
export const useSetAuth = () => useAuthStore(s => s.setAuth);
export const useSetDemo = () => useAuthStore(s => s.setDemo);
export const useClearAuth = () => useAuthStore(s => s.clearAuth);
```

### Step 2 — Add `AuthPage`

Create `src/pages/AuthPage/` (3-file structure: `component.tsx`, `styles.ts`, `index.ts`).

Rendered by `App.tsx` when `mode === 'unauthenticated'`.

**UI:**
- App name / branding
- **"Sign in with Google"** button → navigates to `GET /api/v1/auth/google`
- **"Try a Demo"** button → calls `setDemo()`, which loads `family.json` into `familyStore` then sets `mode = 'demo'`

`family.json` import and `loadData()` call move here (out of `familyStore.ts`) and are only invoked on Demo button click.

### Step 3 — Add `api/client.ts` and `api/operations.ts`

**`src/api/client.ts`** — base HTTP client:

```typescript
export async function apiFetch<T>(path: string, options?: { method?: string; body?: unknown }): Promise<T> {
  const token = localStorage.getItem('ft_token');
  const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}${path}`, {
    method: options?.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 401) {
    localStorage.removeItem('ft_token');
    throw new Error('UNAUTHENTICATED');
  }
  if (!res.ok) throw await res.json();
  return res.status === 204 ? undefined as T : res.json();
}
```

**`src/api/operations.ts`** — all API calls live here. No API call is made directly in a component, store, or `App.tsx`:

```typescript
export async function fetchTreeData(): Promise<FamilyData> {
  const data = await apiFetch<FamilyDataDTO>('/trees/mine/data');
  return {
    root_person: data.rootPersonId ?? undefined,
    persons: data.persons,
    relationships: data.relationships,
  };
}

export async function createPerson(payload: CreatePersonRequest): Promise<PersonDTO> { ... }
export async function updatePerson(id: string, patch: UpdatePersonRequest): Promise<PersonDTO> { ... }
export async function deletePerson(id: string): Promise<void> { ... }
export async function createRelationship(payload: CreateRelationshipRequest): Promise<RelationshipDTO> { ... }
export async function deleteRelationship(id: string): Promise<void> { ... }
```

**Delete** these two lines from `familyStore.ts`:
```typescript
import initialData from '../data/family.json'; // ← delete (moves to AuthPage/authStore)
useFamilyStore.getState().loadData(initialData as FamilyData); // ← delete
```

The `loadData(data: FamilyData)` **action itself is completely unchanged**.

### Step 4 — Add `Layout` container

Create `src/layout/Layout/` (3-file structure).

`App.tsx` renders `Layout` when `mode === 'authenticated'` or `mode === 'demo'`. `ViewMode` and `EditMode` are rendered inside it via React Router's `<Outlet />`.

**Responsibilities:**

1. **Fetch tree data on mount** — in authenticated mode, calls `fetchTreeData()` from `operations.ts` and feeds the result to `useFamilyStore.getState().loadData(data)`. In demo mode, data is already loaded; this step is skipped.
2. **Top navigation bar** — View / Edit nav links; signed-in user email and Sign Out button (authenticated only); a "Sign in to save your tree" prompt in demo mode.
3. **Auth state guard** — the `/edit` route is only accessible when `mode === 'authenticated'`. In demo mode the Edit nav link is not rendered; navigating to `/edit` directly redirects to `/`.
4. **Loading / error states** — owns the loading spinner while `fetchTreeData()` is in flight and an error state if the fetch fails.

**`component.tsx` sketch:**

```typescript
export const Layout = () => {
  const mode = useAppMode();
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');

  useEffect(() => {
    if (mode !== 'authenticated') { setStatus('loaded'); return; }
    fetchTreeData()
      .then(data => { useFamilyStore.getState().loadData(data); setStatus('loaded'); })
      .catch(() => setStatus('error'));
  }, [mode]);

  if (status === 'loading') return <LoadingSpinner />;
  if (status === 'error')   return <ErrorState />;

  return (
    <Styles.Shell>
      <Styles.NavBar>
        <NavLink to="/">View</NavLink>
        {mode === 'authenticated' && <NavLink to="/edit">Edit</NavLink>}
        {mode === 'authenticated'
          ? <SignOutButton />
          : <Styles.DemoBanner>Demo — <a onClick={goToSignIn}>Sign in to save</a></Styles.DemoBanner>
        }
      </Styles.NavBar>
      <Styles.Content>
        <Outlet />
      </Styles.Content>
    </Styles.Shell>
  );
};
```

### Step 5 — Update `App.tsx`

`App.tsx` becomes a thin routing shell — no data fetching, no auth logic, no `useEffect`. It reads `mode` from `authStore`, handles the post-OAuth token extraction on mount, then renders either `AuthPage` or the `Layout`-wrapped routes.

```
App.tsx routing logic:

On mount: check URL for ?token=<jwt> (Google OAuth redirect)
  → if present: call setAuth(), strip token from URL

mode === 'unauthenticated'  →  <AuthPage />

mode === 'demo' | 'authenticated'
  └─ <Layout>
       ├─ /        → <ViewMode />
       └─ /edit    → mode === 'authenticated' ? <EditMode /> : <Navigate to="/" />
```

### What changes in `familyStore.ts` — summary

| Change | Details |
|---|---|
| Remove `import initialData` | Deleted — demo load moves to `authStore.setDemo()` |
| Remove auto-load call | Deleted — auth load moves to `Layout`; demo load moves to `authStore.setDemo()` |
| `loadData` action | **Unchanged** |
| All selectors and hooks | **Unchanged** |
| All components (`ViewMode`, `EditMode`, `PersonCard`, etc.) | **Unchanged** |

### Seed Script (`server/scripts/seed.ts`)

One-shot migration to load `family.json` into Neo4j. Safely re-runnable via `MERGE`.

```
1. Read src/data/family.json
2. MERGE User node (using a GOOGLE_ID env var for the seed owner)
3. MERGE FamilyTree node + OWNS edge; set rootPersonId
4. For each person: MERGE Person node + HAS_PERSON edge
5. For each relationship:
   - parent  → CREATE (from)-[:PARENT_OF {id}]->(to)
   - spouse  → enforce lex order, MERGE (a)-[:SPOUSE_OF {id}]-(b)
   - sibling → enforce lex order, MERGE (a)-[:SIBLING_OF {id}]-(b)
6. Log summary: N persons, M relationships written
```

---

## Deferred to Future Phases

- Refresh token / silent re-auth
- Multiple trees per user
- Collaborative / shared trees
- Image file upload (currently URL-only)
- Additional OAuth providers

---

*Last updated: 2026-04-09 (revised: server/ rename, deploy.yml elaboration, demo mode, authStore, Layout container pattern)*
