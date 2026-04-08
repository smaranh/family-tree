import { create } from 'zustand';
import initialData from '../data/family.json';

const SYMMETRIC_RELATIONSHIPS = ['spouse', 'sibling'];
const DIRECTED_RELATIONSHIPS = ['parent'];
const INVERSE_RELATIONSHIP = { parent: 'child' };

function resolveRootPersonId(data) {
  const { root_person, persons } = data;

  // Priority 1: root_person UUID if valid and exists
  if (root_person && persons.some((p) => p.id === root_person)) {
    return root_person;
  }

  // Priority 2: oldest ancestor by dob
  const withDob = persons.filter((p) => p.dob);
  if (withDob.length > 0) {
    return withDob.reduce((oldest, p) =>
      new Date(p.dob) < new Date(oldest.dob) ? p : oldest
    ).id;
  }

  // Priority 3: first person in array
  return persons[0]?.id ?? null;
}

function getDescendants(personId, relationships, visited = new Set()) {
  if (visited.has(personId)) return visited;
  visited.add(personId);
  const children = relationships
    .filter((r) => r.type === 'parent' && r.from === personId)
    .map((r) => r.to);
  for (const childId of children) {
    getDescendants(childId, relationships, visited);
  }
  return visited;
}

const useFamilyStore = create((set, get) => ({
  persons: [],
  relationships: [],
  rootPersonId: null,
  expandedNodes: new Set(),

  loadData(data) {
    const rootPersonId = resolveRootPersonId(data);
    set({
      persons: data.persons,
      relationships: data.relationships,
      rootPersonId,
      expandedNodes: new Set(),
    });
  },

  toggleExpand(personId) {
    const { relationships, expandedNodes } = get();
    const isExpanded = expandedNodes.has(personId);
    const next = new Set(expandedNodes);

    if (isExpanded) {
      // Collapse: remove this node and all descendants
      const descendants = getDescendants(personId, relationships);
      for (const id of descendants) {
        next.delete(id);
      }
    } else {
      // Expand: just add this node
      next.add(personId);
    }

    set({ expandedNodes: next });
  },

  // Helpers for tree building
  getSpouse(personId) {
    const { persons, relationships } = get();
    const rel = relationships.find(
      (r) =>
        r.type === 'spouse' &&
        (r.from === personId || r.to === personId)
    );
    if (!rel) return null;
    const spouseId = rel.from === personId ? rel.to : rel.from;
    return persons.find((p) => p.id === spouseId) ?? null;
  },

  getChildren(personId) {
    const { persons, relationships } = get();
    return relationships
      .filter((r) => r.type === 'parent' && r.from === personId)
      .map((r) => persons.find((p) => p.id === r.to))
      .filter(Boolean);
  },

  getPersonById(personId) {
    return get().persons.find((p) => p.id === personId) ?? null;
  },
}));

// Load initial data on module init
useFamilyStore.getState().loadData(initialData);

export { SYMMETRIC_RELATIONSHIPS, DIRECTED_RELATIONSHIPS, INVERSE_RELATIONSHIP };
export default useFamilyStore;
