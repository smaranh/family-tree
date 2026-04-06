# Family Tree App — Project Summary

> This document captures all design decisions, data model specifications, and phased implementation plans for the Family Tree App. It is intended to serve as a complete handoff document for any LLM or developer picking up this project.

---

## Tech Stack

| Concern | Decision |
|---|---|
| Framework | React + Vite |
| Graph Visualization | React Flow |
| State Management | Zustand |
| Routing | React Router v6 |
| Styling | Material UI + Styled Components |
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

### Page Layout

Two action buttons at the top of the page:
- **Add Person** → renders a blank Person form
- **Edit Person** → renders the **Autocomplete Search Widget** to find an existing person; on selection, the same Person form renders with the selected person's data pre-filled

### Autocomplete Search Widget

- **Reusable component** — shared between Edit Mode (Phase 1) and the Search feature (Phase 2)
- Performs prefix/fuzzy match against persons in the Zustand store as the user types
- User selects one person from the suggestions list
- Triggers the Person form to render with that person's data pre-filled for editing

### Person Form Fields

| Field | Required | Notes |
|---|---|---|
| Name | Yes | |
| Date of Birth | Yes | |
| Image URL | No | Defaults to placeholder avatar if empty |
| Parent(s) | No | Dropdown of existing persons |
| Spouse | No | Dropdown of existing persons (one spouse only in Phase 1) |
| Child/Children | No | Dropdown of existing persons |

> **Deferred to future versions:** Multi-select for children, "Add Child" repeater pattern, and the ✕ icon UX for relationship removal within the form.

### Relationship Dropdowns — "Add New Person" Option

- Each relationship dropdown includes an **"+ Add New Person"** option at the bottom of the list
- Selecting it opens a **modal** containing: Name (required), DOB (required), Save button, Cancel button
- **On modal Save:**
  - New person is created immediately with a generated UUID
  - Added to the Zustand store and persisted to localStorage right away (not waiting for outer form save)
  - The new person is **auto-selected** as the value in the dropdown that triggered the modal
- **On modal Cancel:**
  - The dropdown reverts to its previous value
  - No person is created

### Save Logic (Main Form)

- **New person:** generates a UUID, appends to `persons` array in Zustand store
- **Existing person:** updates matching entry fields in place
- Updates `relationships` array in Zustand store based on the form's relationship fields
- Applies auto-inference rules (spouse from shared parenting, sibling from shared parent)
- Persists the full updated state to `localStorage`

### Relationship Removal

- Individual relationships can be removed independently via the Edit form
- Removal is **non-cascading** — only the targeted relationship entry (matched by its `id`) is deleted
- No other relationships are affected as a side effect
- The user is responsible for manually removing any other relationships they wish to clean up

### Validation (all are hard blocks — enforced on Save, with clear error messages)

| Rule | Behaviour |
|---|---|
| Self-relationship | Blocked — a person cannot be related to themselves |
| Circular relationship (e.g., A is parent of B and B is parent of A) | Blocked |
| DOB plausibility (child's DOB is on or before a parent's DOB) | Blocked |

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

*Last updated: 2026-04-05*
