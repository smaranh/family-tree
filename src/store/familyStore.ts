import { create } from 'zustand';
import initialData from '../data/family.json';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RelationshipType = 'parent' | 'spouse' | 'sibling';

export interface Person {
  id: string;
  name: string | null;
  dob: string | null;
  image: string | null;
}

export interface Relationship {
  id: string;
  type: RelationshipType;
  from: string;
  to: string;
}

export interface FamilyData {
  root_person?: string;
  persons: Person[];
  relationships: Relationship[];
}

interface FamilyState {
  persons: Person[];
  relationships: Relationship[];
  rootPersonId: string | null;
  expandedNodes: Set<string>;
  loadData: (data: FamilyData) => void;
  toggleExpand: (personId: string) => void;
  getSpouse: (personId: string) => Person | null;
  getChildren: (personId: string) => Person[];
  getPersonById: (personId: string) => Person | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SYMMETRIC_RELATIONSHIPS: RelationshipType[] = ['spouse', 'sibling'];
export const DIRECTED_RELATIONSHIPS: RelationshipType[] = ['parent'];
export const INVERSE_RELATIONSHIP: Partial<Record<RelationshipType, string>> = {
  parent: 'child',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveRootPersonId(data: FamilyData): string | null {
  const { root_person, persons } = data;

  // Priority 1: root_person UUID if valid and exists
  if (root_person && persons.some((p) => p.id === root_person)) {
    return root_person;
  }

  // Priority 2: oldest ancestor by dob
  const withDob = persons.filter((p): p is Person & { dob: string } => p.dob !== null);
  if (withDob.length > 0) {
    return withDob.reduce((oldest, p) =>
      new Date(p.dob).getTime() < new Date(oldest.dob).getTime() ? p : oldest
    ).id;
  }

  // Priority 3: first person in array
  return persons[0]?.id ?? null;
}

function getDescendants(
  personId: string,
  relationships: Relationship[],
  visited: Set<string> = new Set()
): Set<string> {
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

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const useFamilyStore = create<FamilyState>((set, get) => ({
  persons: [],
  relationships: [],
  rootPersonId: null,
  expandedNodes: new Set(),

  loadData(data: FamilyData) {
    const rootPersonId = resolveRootPersonId(data);
    set({
      persons: data.persons,
      relationships: data.relationships,
      rootPersonId,
      expandedNodes: new Set(),
    });
  },

  toggleExpand(personId: string) {
    const { relationships, expandedNodes } = get();
    const isExpanded = expandedNodes.has(personId);
    const next = new Set(expandedNodes);

    if (isExpanded) {
      const descendants = getDescendants(personId, relationships);
      for (const id of descendants) {
        next.delete(id);
      }
    } else {
      next.add(personId);
    }

    set({ expandedNodes: next });
  },

  getSpouse(personId: string): Person | null {
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

  getChildren(personId: string): Person[] {
    const { persons, relationships } = get();
    return relationships
      .filter((r) => r.type === 'parent' && r.from === personId)
      .map((r) => persons.find((p) => p.id === r.to))
      .filter((p): p is Person => p !== undefined);
  },

  getPersonById(personId: string): Person | null {
    return get().persons.find((p) => p.id === personId) ?? null;
  },
}));

// Load initial data on module init
useFamilyStore.getState().loadData(initialData as FamilyData);

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export const usePersons = () => useFamilyStore((s) => s.persons);
export const useRelationships = () => useFamilyStore((s) => s.relationships);
export const useRootPersonId = () => useFamilyStore((s) => s.rootPersonId);
export const useExpandedNodes = () => useFamilyStore((s) => s.expandedNodes);
export const useToggleExpand = () => useFamilyStore((s) => s.toggleExpand);
export const useGetSpouse = () => useFamilyStore((s) => s.getSpouse);
export const useGetChildren = () => useFamilyStore((s) => s.getChildren);
export const useGetPersonById = () => useFamilyStore((s) => s.getPersonById);
