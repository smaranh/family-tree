# Phase 1B — Implementation Steps

## Step 1 — Extend the Zustand Store

Add mutation actions and persistence to `src/store/familyStore.ts`. All new actions append to the existing store — no existing state or selectors change.

**New actions to add:**

```ts
addPerson(data: Omit<Person, 'id'>): string
// Generates a UUID, appends to persons[], persists to localStorage. Returns the new UUID.

updatePerson(id: string, patch: Partial<Omit<Person, 'id'>>): void
// Merges patch into the matching person entry. Persists.

setPersonRelationships(personId: string, incoming: RelationshipInput[]): void
// Diffs the current relationships involving personId against the incoming set.
// Removes stale entries (by id). Adds missing ones (generating new UUIDs).
// After diffing, runs auto-inference (see below). Persists.

persist(): void
// Serializes { root_person, persons, relationships } to localStorage under key 'familyData'.
// Called internally by addPerson / updatePerson / setPersonRelationships.
```

**Auto-inference logic** (run inside `setPersonRelationships` after the diff):
- If person A and person B are both recorded as parents of the same child C → add a `spouse` relationship between A and B if one does not already exist.
- If person A and person B share at least one common parent → add a `sibling` relationship between A and B if one does not already exist.

**localStorage load** — update `loadData` to check localStorage first before falling back to the bundled `family.json`:
```ts
const stored = localStorage.getItem('familyData');
const data: FamilyData = stored ? JSON.parse(stored) : initialData;
```

**New export hooks** to expose the new actions:
```ts
export const useAddPerson = () => useFamilyStore(s => s.addPerson);
export const useUpdatePerson = () => useFamilyStore(s => s.updatePerson);
export const useSetPersonRelationships = () => useFamilyStore(s => s.setPersonRelationships);
```

**New `RelationshipInput` type** (used by the form, consumed by the store):
```ts
interface RelationshipInput {
  type: RelationshipType;   // 'parent' | 'spouse' | 'sibling'
  targetId: string;         // the other person's UUID
  direction: 'from' | 'to'; // which side personId sits on
}
```

---

## Step 2 — EditMode Page Shell

Create `src/pages/EditMode/` with the same 3-file structure as `ViewMode/`. Replace the `EditModePlaceholder` stub in `App.tsx` with the imported `EditMode` component.

```
src/pages/EditMode/
├── component.tsx   # page logic
├── styles.ts       # Emotion styled components
└── index.ts        # barrel export
```

**component.tsx — Layout:**
- Full-page container (same 100vw × 100vh warm cream `#faf6ef` background as ViewMode)
- Top bar with two buttons: **Add Person** and **Edit Person**
- Main content area below — renders the `PersonForm` component

**component.tsx — Behaviour:**
- Default state on route load: `Add Person` mode — blank `PersonForm` rendered immediately
- Clicking **Add Person**: resets the form to blank (if `Edit Person` was previously selected)
- Clicking **Edit Person**: renders the `PersonSearch` widget in place of the form; selecting a person from it replaces the search widget with a pre-filled `PersonForm`
- After a successful form save, the page resets to **Add Person** mode (blank form)
- A **Back** link/button navigates to `/` (View Mode)

**styles.ts** — Emotion styled components for page-level layout:
- `PageWrapper`: full-viewport container, warm cream background `#faf6ef`
- `TopBar`: horizontal bar, houses the Add/Edit toggle buttons and Back link
- `ModeButton`: styled toggle button — active/inactive states using the warm brown palette
- `ContentArea`: main area below the top bar, centers the form

**index.ts:**
```ts
export { EditMode } from './component';
```

---

## Step 3 — PersonSearch Component

Create `src/components/PersonSearch/`:
- `component.tsx`
- `styles.ts`
- `index.ts`

This component is **reusable** — the same component will be used for the Phase 2 search bar in ViewMode.

**Props:**
```ts
interface PersonSearchProps {
  onSelect: (person: Person) => void;
  placeholder?: string;
}
```

**Behaviour:**
- Renders a text input
- On each keystroke, filters `usePersons()` by prefix/substring match on `name` (case-insensitive)
- Renders a dropdown suggestion list below the input; each item shows name + formatted DOB
- Selecting a suggestion calls `onSelect(person)` and clears the input
- If no matches found, shows a "No results" label in the list
- Clicking outside the suggestion list closes it (no selection)

**Styles (`styles.ts`):**
- `Wrapper`: relative positioned container to anchor the suggestion list
- `Input`: full-width text input, styled to match the warm earthy palette (#3d2b1a text, #d6c4a8 border, Georgia serif)
- `SuggestionList`: absolute dropdown below input, white background with warm border, max-height with scroll
- `SuggestionItem`: row with name (bold) + DOB (muted); hover state with light tan background

---

## Step 4 — AddPersonModal Component

Create `src/components/AddPersonModal/`:
- `component.tsx`
- `styles.ts`
- `index.ts`

**Props:**
```ts
interface AddPersonModalProps {
  open: boolean;
  onSave: (newPerson: Person) => void;
  onCancel: () => void;
}
```

**Behaviour:**
- Rendered as a modal overlay (portal or positioned fixed)
- Fields: Name (required text input), Date of Birth (required date input)
- **Save:** validates that both fields are non-empty → calls `addPerson({ name, dob, image: null })` from the store → calls `onSave(newPerson)` with the created person → modal closes
- **Cancel:** calls `onCancel()`, no person is created, modal closes
- Pressing Escape triggers Cancel behaviour

**Styles (`styles.ts`):**
- `Overlay`: fixed full-screen semi-transparent backdrop (#3d2b1a at 40% opacity)
- `Modal`: centered card (max-width 400px), warm gradient background matching `PersonCard`, rounded corners, shadow
- `Title`: serif heading, dark brown
- `FieldGroup`: label + input pair, consistent spacing
- `Input`: matches PersonSearch Input style
- `ButtonRow`: right-aligned row, Cancel (ghost) + Save (filled, #7a5c3a)
- `ErrorText`: small orange (#c8915a) error message below a field

---

## Step 5 — PersonForm Component

Create `src/components/PersonForm/`:
- `component.tsx`
- `styles.ts`
- `index.ts`

This is the main add/edit form. It is a **controlled form** — all field state is held locally with `useState`; the Zustand store is only touched on Save.

**Props:**
```ts
interface PersonFormProps {
  person?: Person;    // undefined → Add mode; provided → Edit mode
  onSave: () => void; // called after successful store commit
}
```

**Fields:**

| Field | Input Type | Required | Notes |
|---|---|---|---|
| Name | Text | Yes | |
| Date of Birth | Date | Yes | |
| Image URL | Text | No | Blank → placeholder avatar |
| Parent(s) | Select dropdown | No | Multi-select, max 2 persons |
| Spouse | Select dropdown | No | Single-select |
| Child/Children | Select dropdown | No | Multi-select |

**Relationship dropdowns:**
- Each dropdown lists all persons from `usePersons()` except the current person being edited
- A special **"+ Add New Person"** option appears at the bottom of every relationship dropdown
- Selecting "Add New Person" opens the `AddPersonModal`; on save the modal returns the new person and it is auto-selected in the originating dropdown

**Save logic (on Save button click):**
1. Run validation (see Step 6). Abort and show inline errors if any fail.
2. Call `addPerson(...)` or `updatePerson(id, ...)` for the person's core fields.
3. Build a `RelationshipInput[]` from the form's relationship fields and call `setPersonRelationships(personId, inputs)`.
4. The store handles diffing, auto-inference, and `persist()`.
5. Call `onSave()`.

**Styles (`styles.ts`):**
- `FormWrapper`: max-width 560px, centered, padding, warm background
- `SectionTitle`: serif label for form sections ("Personal Details", "Relationships")
- `FieldGroup`: label + input/select pair with consistent spacing
- `Input`, `Select`: matching warm palette, Georgia serif
- `RelationshipRow`: dropdown + optional "remove" (×) icon per selected relationship
- `AddOptionItem`: the "+ Add New Person" option styled in muted italic
- `ButtonRow`: right-aligned, Cancel + Save buttons
- `ErrorText`: small orange error below fields that fail validation

---

## Step 6 — Validation

Validation is enforced on form Save. All rules are hard blocks — the save does not proceed if any fail. Errors are shown inline next to the relevant field.

| Rule | Field | Error Message |
|---|---|---|
| Name is empty | Name | "Name is required" |
| DOB is empty | Date of Birth | "Date of birth is required" |
| Self-relationship | Any relationship dropdown | "A person cannot be related to themselves" |
| Circular parent (A is parent of B and B is parent of A) | Parent / Child dropdowns | "Circular parent relationship detected" |
| DOB plausibility — child's DOB is on or before a parent's DOB | Parent / Child dropdowns | "Child must be born after the parent" |

Validation runs in `PersonForm` before calling any store action. It only checks relationships between existing persons (not newly created ones from the modal, whose DOB is not yet known at the time the modal save occurs).

---

## Step 7 — Wire Up App.tsx

- Import `EditMode` from `src/pages/EditMode.tsx`
- Replace the `EditModePlaceholder` stub with `<EditMode />`
- No routing changes needed — `/edit` route already exists

---

## Step 8 — Verify End-to-End

Manual test checklist:

- [ ] Navigate to `/edit` — blank Add Person form renders
- [ ] Fill in name + DOB → Save → navigate to `/` → new person card appears in the store (not necessarily visible in tree unless they're related to the root)
- [ ] Navigate back to `/edit` → Edit Person → search for the new person → form pre-fills correctly
- [ ] Change name → Save → return to View Mode → card shows updated name
- [ ] In a relationship dropdown, select "Add New Person" → modal opens → fill name + DOB → Save → new person is auto-selected in the dropdown
- [ ] Cancel from the modal → dropdown reverts, no new person in store
- [ ] Assign two people as parents of the same child → Save → verify a `spouse` relationship was auto-inferred in the store
- [ ] Assign two people the same parent → Save → verify a `sibling` relationship was auto-inferred
- [ ] Attempt to save with empty name → error shown, save blocked
- [ ] Attempt to save with self-relationship → error shown, save blocked
- [ ] Reload the page → data persists from localStorage (store loads saved state, not fresh family.json)
- [ ] Navigating View → Edit → View preserves tree state (same root, same expanded nodes)
