# 🌳 Family Tree App

A dynamic, interactive family tree visualizer built with React and React Flow. Explore relationships across generations, add new family members, and navigate your family history with ease.

---

## Features

### View Mode
- Visualizes up to 3 generations downward from a root ancestor
- Spouses appear side-by-side at each generation level
- Click any person card to expand or collapse their branch
- No hard depth limit — keep exploring as far as the data goes
- Per-card auto-zoom control to focus on any subtree

### Add / Edit Mode
- Add new family members with name, date of birth, and a profile image URL
- Edit existing person details and relationships
- Define relationships — parents, spouse, and children
- Smart auto-inference: shared parents automatically infer a spouse link; shared grandparents infer a sibling link
- Inline "Add New Person" modal from within relationship dropdowns

### Search *(Phase 2)*
- Autocomplete search to find any person in the tree
- Selecting a result re-roots the tree to that person
- A parent bubble above the root allows navigating one generation upward

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React + Vite |
| Tree Visualization | React Flow |
| State Management | Zustand |
| Routing | React Router v6 |
| Styling | Material UI + Styled Components |

---

## Data

Family data is stored as a flat, graph-based JSON file with `persons` and `relationships` arrays. Changes are persisted to `localStorage`. No backend is required for Phase 1.

See [`summary.md`](./summary.md) for the full data model specification and all design decisions.

---

## Getting Started

```bash
npm install
npm run dev
```

---

## Project Status

| Phase | Feature | Status |
|---|---|---|
| 1A | View Mode — Tree Visualization | 🔲 Planned |
| 1B | Add / Edit Mode | 🔲 Planned |
| 2 | Search & Autocomplete | 🔲 Planned |
