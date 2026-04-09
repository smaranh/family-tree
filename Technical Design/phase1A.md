# Phase 1A — Implementation Steps

## Step 1 — Project Scaffolding
- `npm create vite@latest` with React template
- Install dependencies:
  - `reactflow` — tree canvas
  - `zustand` — state management
  - `react-router-dom` v6 — routing
  - `@mui/material` + `@emotion/react` + `@emotion/styled` — UI components
  - `uuid` — ID generation
- Verify app renders "Hello Family"

## Step 2 — Sample Data File
- Create `src/data/family.json` with a 3-generation family satisfying the schema in `summary.md`
- Structure:
  - Generation 1: root person + spouse
  - Generation 2: two children, each with a spouse
  - Generation 3: grandchildren (two per Gen 2 couple)
- Cover all relationship types: `parent`, `spouse`, `sibling`
- Set `root_person` to the oldest ancestor

## Step 3 — Zustand Store
- Create `src/store/familyStore.js`
- State shape:
  - `persons[]` and `relationships[]` loaded from `family.json`
  - `rootPersonId` — computed via priority fallback:
    1. `root_person` UUID from JSON (if valid and exists)
    2. Oldest ancestor by `dob`
    3. First person in the array
  - `expandedNodes` — a `Set` of person IDs currently expanded in the tree
- Actions:
  - `loadData(json)` — initializes store from JSON
  - `toggleExpand(personId)` — expands or collapses a node; collapsing recursively collapses all descendants

## Step 4 — Tree Layout Engine
- Create `src/utils/buildTree.js`
- Pure utility: takes store state, returns React Flow `nodes[]` and `edges[]`
- Logic:
  - Start from `rootPersonId`
  - For each person, find their spouse via `spouse` relationships and place them side-by-side at the same level
  - Derive children at runtime from `parent` relationships (entries where `to === personId`)
  - Only render levels present in `expandedNodes`
  - Assign x/y coordinates: fixed y per generation, persons spaced evenly on x-axis
  - Spouses share the same y row and are placed adjacent to each other

## Step 5 — Person Card Component
- Create `src/components/PersonCard.jsx`
- Displays:
  - Name
  - Date of birth
  - Profile image (or default placeholder avatar if `image` is null/missing)
  - Warning/notification icon if `name` or `dob` is missing
  - Focus/fit icon that triggers React Flow `fitView` scoped to that node's visible subtree
- Click handler calls `toggleExpand(id)` in the store
- No-op if the person has no children (leaf node)

## Step 6 — React Flow Canvas (View Mode Page)
- Create `src/pages/ViewMode.jsx`
- Consumes `buildTree()` output and passes `nodes` and `edges` to `<ReactFlow />`
- Registers `PersonCard` as a custom node type
- On initial load: auto-expands 3 generations from the root person
- Handles node click events → delegates to `toggleExpand`
- React Flow's built-in pan and zoom remain available at all times

## Step 7 — Routing Shell
- Update `src/App.jsx` with React Router v6:
  - `/` → `ViewMode`
  - `/edit` → stub `EditMode` placeholder page (Phase 1B, not yet implemented)
