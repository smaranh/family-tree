# Family Tree App — Project Summary

> This document captures all design decisions, data model specifications, and phased implementation plans for the Family Tree App. It is intended to serve as a complete handoff document for any LLM or developer picking up this project.

---

## Tech Stack

| Concern | Decision |
|---|---|
| Framework | React 19.2 + Vite |
| Graph Visualization | React Flow 11.11 |
| State Management | Zustand 5.0 |
| Routing | React Router 7.14 |
| Styling | Emotion (CSS-in-JS) |
| Data (Phase 1) | JSON file + localStorage persistence |

---

## Data Model

### Schema

```json
{
  "root_person": "<uuid>",
  "persons": [
    {
      "id": "<uuid>",
      "name": "Robert Johnson",
      "dob": "1965-04-12",
      "image": "<url or null>"
    }
  ],
  "relationships": [
    {
      "id": "<uuid>",
      "type": "parent | spouse | sibling",
      "from": "<uuid>",
      "to": "<uuid>"
    }
  ]
}
```

### Relationship Semantics

Relationship types are split into two categories. The categorization is enforced via **application-level constants** in code — not flags in the stored data:

```js
// Symmetric: a single entry covers both directions — from/to order is irrelevant
const SYMMETRIC_RELATIONSHIPS = ['spouse', 'sibling'];

// Directed: from → to carries explicit meaning (parent → child). Inverse is derived, never stored.
const DIRECTED_RELATIONSHIPS = ['parent'];

// Derived inverse types — computed in traversal logic, never stored in JSON
const INVERSE_RELATIONSHIP = { parent: 'child' };
```

### Rules & Defaults

- All IDs (persons and relationships) are **UUIDs** — no prefix convention
- `root_person` is optional:
  - If a valid UUID → use as the default root on load
  - If missing or points to a non-existent person → fallback to **oldest ancestor by DOB**
  - If all persons are missing a `dob` → fallback to **first person in the array**
- If a person is missing `name` or `dob` → show a **notification icon** on their Person Card
- `image` is a URL string. If `null` or missing → show **default placeholder avatar**
- Each relationship entry has its own `id` UUID for clean, targeted removal without ambiguity
- `parent`: directed — `from` is always the parent, `to` is always the child
- `spouse`: symmetric — a single entry suffices, `from/to` order is irrelevant
- `sibling`: symmetric — a single entry suffices, `from/to` order is irrelevant
- The `child` relationship is always **derived** at runtime from `parent` entries — it is never stored explicitly
- Phase 1 assumes **one spouse per person** and **shared parents per child** (no blended families, no single parents, no divorce/remarriage)

### Auto-Inferred Relationships (applied on Save in Edit Mode)

| Condition | Inferred Relationship Stored |
|---|---|
| A and B are both marked as parents of C | `spouse` between A and B (if not already present) |
| A and B share the same parent | `sibling` between A and B (if not already present) |

---

## Implementation Notes (Phase 1A)

### File Structure

```
src/
├── App.tsx                    # Router setup — / → ViewMode, /edit → placeholder
├── pages/
│   └── ViewMode.tsx           # React Flow container; auto-expands 3 generations on mount
├── store/
│   └── familyStore.ts         # Zustand store; exports granular selector hooks
├── components/
│   ├── PersonCard/            # Custom React Flow node — name, DOB, avatar, focus icon, warning dot
│   ├── Avatar/                # Initials fallback or image
│   └── FocusIcon/             # SVG crosshair — triggers fitView on subtree
├── utils/
│   └── buildTree.ts           # Recursive layout engine (depth-first, absolute positioning)
└── data/
    └── family.json            # Sample dataset (10 people, 3 generations)
```

### Layout Engine (`buildTree.ts`)

- Card size: 180×100px; horizontal gap between siblings: 40px; spouse gap: 16px; vertical gap: 80px
- `measureSubtreeWidth()` calculates total horizontal space for a person and all their descendants
- `buildLevel()` places nodes recursively, generating absolute `(x, y)` coordinates for React Flow
- Visited Set prevents infinite loops on malformed data
- Couple unit (person + spouse) is centered as a block above their children
- De-duplication: shared children of a couple appear once, not twice

### State & Rendering Flow

```
Zustand (expandedNodes, rootPersonId changes)
  → ViewMode useMemo → buildTree() → new nodes/edges arrays
  → React Flow setNodes/setEdges → re-render
```

- React Flow has pan/zoom enabled (0.2–2.0×), drag/connect disabled
- `fitView` is called on mount and when any card's focus icon is clicked
- `PersonCard` is `React.memo`'d; `buildTree` is `useMemo`'d for performance

### Edge Types

| Edge | Style |
|---|---|
| Parent → child | Solid smoothstep curve |
| Spouse ↔ spouse | Dashed straight line |

### Missing-Data Indicator

If a person is missing `name` or `dob`, an orange warning dot appears on their card.

### Tests

- `familyStore.test.ts` — root resolution, expand/collapse cascade, getters
- `buildTree.test.ts` — spouse placement, generation spacing, sibling alignment, de-duplication (50+ cases)

---

## Phase 1A — View Mode (Route: `/`)

### Initial Load

Root person is determined in priority order:
1. `root_person` value in JSON (if valid UUID and exists in persons array)
2. Oldest ancestor by `dob`
3. First person in the `persons` array (if all DOBs are missing)

### Tree Layout

- **Level 1:** Root person + their spouse (displayed side-by-side)
- **Level 2:** Their children, each with their spouse if applicable (side-by-side)
- **Level 3:** Grandchildren (children of Level 2 persons), each with their spouse
- Spouses always appear **side-by-side at the same level** as their partner
- Initial load always renders **3 downward generations** from the root

### Person Card

- Displays: name, date of birth, profile image (or default placeholder)
- If `name` or `dob` is missing → shows a **notification/warning icon** on the card
- Has a **focus/fit control icon** for auto-scaling the canvas to that card's subtree (see below)

### Click-to-Expand / Collapse

- Clicking a person card **toggles** the branch below it (expand ↔ collapse)
- Expanding reveals the **next downward generation for that specific card only** — the tree root does not change
- There is **no hard depth cap** — users can keep expanding downward indefinitely
- Collapsing a node **recursively collapses all descendant expansions** (entire sub-branch collapses)
- Clicking a **leaf node** (a person with no children) → does nothing (no toast, no indication)

### Auto-Scale / Zoom Control Icon (per card)

- Each person card has a **focus/fit control icon**
- Clicking it auto-fits the React Flow canvas to display that card and all of its currently visible downward levels
- React Flow's built-in **global pan and zoom** remain available at all times for the user

---

## Phase 1B — Add/Edit Mode (Route: `/edit`)

### Current State

A placeholder `EditMode` component is wired up at `/edit` in `App.tsx`. No form logic exists yet.

### Implementation Approach

#### New Files to Create

```
src/
├── pages/
│   └── EditMode.tsx               # Page shell — top bar + form area
├── components/
│   ├── PersonSearch/              # Autocomplete search widget (reusable in Phase 2)
│   │   ├── component.tsx
│   │   ├── styles.ts              # Emotion styled components for search input + suggestion list
│   │   └── index.ts
│   ├── PersonForm/                # The main add/edit form
│   │   ├── component.tsx
│   │   ├── styles.ts              # Emotion styled components for form layout + field wrappers
│   │   └── index.ts
│   └── AddPersonModal/            # Quick-add modal for relationship dropdowns
│       ├── component.tsx
│       ├── styles.ts              # Emotion styled components for modal overlay + content
│       └── index.ts
```

#### Store Changes Required

The Zustand store needs the following new actions (to be added to `familyStore.ts`):

```ts
addPerson(person: Omit<Person, 'id'>): string         // returns new UUID
updatePerson(id: string, patch: Partial<Person>): void
setRelationships(personId: string, rels: RelationshipInput[]): void
  // Diffs current relationships for this person against the new set,
  // adds missing ones, removes stale ones, then runs auto-inference.
persist(): void
  // Serializes persons + relationships to localStorage.
  // Called after addPerson / updatePerson / setRelationships.
```

No changes needed to the existing read selectors or `toggleExpand`.

#### Page Layout

Two action buttons at the top of the page:
- **Add Person** → renders a blank Person form (default state on route load)
- **Edit Person** → renders the `PersonSearch` widget; selecting a person pre-fills the form

#### PersonSearch Component

- **Reusable** — same component used for Phase 2 search bar
- Filters `usePersons()` in real time as the user types (prefix/fuzzy match on `name`)
- Renders a suggestion list; selecting an entry calls `onSelect(person)` callback
- Stateless — all data comes from the store via selector; caller owns the selection callback

#### PersonForm Component

**Props:**

```ts
interface PersonFormProps {
  person?: Person;          // undefined → Add mode; defined → Edit mode
  onSave: () => void;       // called after successful store commit
}
```

**Fields:**

| Field | Required | Notes |
|---|---|---|
| Name | Yes | Text input |
| Date of Birth | Yes | Date input (ISO format internally) |
| Image URL | No | Text input; blank → placeholder avatar |
| Parent(s) | No | Multi-value dropdown; max 2 in Phase 1 |
| Spouse | No | Single-value dropdown |
| Child/Children | No | Multi-value dropdown |

Each relationship dropdown:
- Lists all persons from the store (excluding current person)
- Includes an **"+ Add New Person"** option at the bottom

> **Deferred to future versions:** Multi-select for children, "Add Child" repeater pattern, and the ✕ icon UX for relationship removal within the form.

#### AddPersonModal Component

Triggered when "Add New Person" is selected from any relationship dropdown.

- Fields: Name (required), DOB (required), Save, Cancel
- **On Save:** calls `addPerson()` + `persist()` immediately; new person auto-selected in originating dropdown
- **On Cancel:** dropdown reverts to previous value; no person created

#### Save Logic (Main Form)

1. Validate (see Validation section below) — abort on any error
2. `addPerson()` or `updatePerson()` for the core person fields
3. `setRelationships()` with the full relationship state from the form — the action handles diffing and auto-inference:
   - If A and B are both parents of C → infer `spouse` between A and B
   - If A and B share a parent → infer `sibling` between A and B
4. `persist()` to write to localStorage

#### Relationship Removal

- Remove a person from a relationship dropdown → that relationship is dropped on Save
- Removal is **non-cascading** — only the targeted relationship entry (by `id`) is deleted
- The user is responsible for removing any other relationships they wish to clean up

#### Validation (hard blocks — enforced on Save, inline error messages)

| Rule | Behaviour |
|---|---|
| Self-relationship | Blocked — a person cannot be related to themselves |
| Circular parent relationship (A is parent of B and B is parent of A) | Blocked |
| DOB plausibility — child's DOB is on or before a parent's DOB | Blocked |

---

## Navigation & State

- View Mode: `/`
- Edit Mode: `/edit`
- Edit Mode has **no awareness** of who was active or selected in View Mode — the form always starts fresh (`Add Person` state) unless `Edit Person` is explicitly triggered
- Navigating **View → Edit → back to View** restores the tree to its **previous state** (same root person, same expanded/collapsed nodes)
- If the Zustand store has new or updated relationships in the currently visible levels of the tree, those changes **are reflected** when the View is restored

---

## Phase 2 — Search (Planned, Not Yet Implemented)

- A persistent **search bar** added to the View Mode UI, powered by the **reusable Autocomplete Search Widget** built in Phase 1
- As the user types, prefix/fuzzy matched suggestions appear from the `persons` store
- Selecting a suggestion **sets that person as the new tree root** and renders 3 downward generations
- A **parent bubble** UI element appears above the root node, allowing the user to optionally reveal the parent tier above the current root

---

## Deferred to Future Versions

- Multiple spouses / divorce / remarriage
- Blended families / children from previous relationships
- Single parent households
- Image file upload (Phase 1 supports URL-only images)
- Visual rendering of sibling relationships in the tree canvas (sibling data is stored in Phase 1, but not visually represented in the tree layout)
- Multi-select / repeater UX for child relationships in the Edit form
- Relationship removal UX (e.g., ✕ icon per relationship) in the Edit form

---

## Open Items & Future Decisions

These items have been explicitly deferred and should be revisited in future phases:

1. **Child field UX in Edit form** — multi-select dropdown vs. "Add Child" repeater pattern (one at a time)
2. **Relationship removal UX in Edit form** — ✕ icon per listed relationship vs. another interaction pattern
3. **Sibling visual layout in tree** — how sibling relationships are rendered spatially in React Flow
4. **Parent bubble design in Phase 2** — exact UX for toggling the parent tier above the root node

---

*Last updated: 2026-04-09*
