import { describe, it, expect, beforeEach } from 'vitest';
import useFamilyStore from '../familyStore';

// Minimal test data — isolated from the real family.json
const testData = {
  root_person: 'person-A',
  persons: [
    { id: 'person-A', name: 'Alice', dob: '1940-01-01', image: null },
    { id: 'person-B', name: 'Bob',   dob: '1942-06-15', image: null },
    { id: 'person-C', name: 'Carol', dob: '1965-03-20', image: null },
    { id: 'person-D', name: 'Dave',  dob: '1967-09-10', image: null },
    { id: 'person-E', name: 'Eve',   dob: '1990-07-04', image: null },
    { id: 'person-F', name: 'Frank', dob: null,         image: null },
  ],
  relationships: [
    { id: 'rel-1', type: 'spouse', from: 'person-A', to: 'person-B' },
    { id: 'rel-2', type: 'parent', from: 'person-A', to: 'person-C' },
    { id: 'rel-3', type: 'parent', from: 'person-B', to: 'person-C' },
    { id: 'rel-4', type: 'parent', from: 'person-A', to: 'person-D' },
    { id: 'rel-5', type: 'parent', from: 'person-B', to: 'person-D' },
    { id: 'rel-6', type: 'sibling', from: 'person-C', to: 'person-D' },
    { id: 'rel-7', type: 'parent', from: 'person-C', to: 'person-E' },
  ],
};

beforeEach(() => {
  useFamilyStore.getState().loadData(testData);
});

// ---------------------------------------------------------------------------
// loadData
// ---------------------------------------------------------------------------
describe('loadData', () => {
  it('loads persons and relationships', () => {
    const { persons, relationships } = useFamilyStore.getState();
    expect(persons).toHaveLength(6);
    expect(relationships).toHaveLength(7);
  });

  it('resets expandedNodes to an empty Set', () => {
    // First expand something
    useFamilyStore.getState().toggleExpand('person-A');
    // Reload
    useFamilyStore.getState().loadData(testData);
    expect(useFamilyStore.getState().expandedNodes.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// resolveRootPersonId — tested via the rootPersonId state after loadData
// ---------------------------------------------------------------------------
describe('rootPersonId resolution', () => {
  it('uses root_person when it is a valid UUID in the persons array', () => {
    expect(useFamilyStore.getState().rootPersonId).toBe('person-A');
  });

  it('falls back to oldest person by dob when root_person is missing', () => {
    useFamilyStore.getState().loadData({
      persons: [
        { id: 'p1', name: 'Younger', dob: '1980-01-01', image: null },
        { id: 'p2', name: 'Oldest',  dob: '1930-05-10', image: null },
        { id: 'p3', name: 'Middle',  dob: '1955-03-03', image: null },
      ],
      relationships: [],
    });
    expect(useFamilyStore.getState().rootPersonId).toBe('p2');
  });

  it('falls back to oldest when root_person points to a non-existent id', () => {
    useFamilyStore.getState().loadData({
      root_person: 'does-not-exist',
      persons: [
        { id: 'p1', name: 'Younger', dob: '1980-01-01', image: null },
        { id: 'p2', name: 'Oldest',  dob: '1930-05-10', image: null },
      ],
      relationships: [],
    });
    expect(useFamilyStore.getState().rootPersonId).toBe('p2');
  });

  it('falls back to first person when all dobs are missing', () => {
    useFamilyStore.getState().loadData({
      persons: [
        { id: 'p1', name: 'No DOB 1', dob: null,      image: null },
        { id: 'p2', name: 'No DOB 2', dob: undefined, image: null },
      ],
      relationships: [],
    });
    expect(useFamilyStore.getState().rootPersonId).toBe('p1');
  });
});

// ---------------------------------------------------------------------------
// toggleExpand
// ---------------------------------------------------------------------------
describe('toggleExpand', () => {
  it('adds a node to expandedNodes when not yet expanded', () => {
    useFamilyStore.getState().toggleExpand('person-A');
    expect(useFamilyStore.getState().expandedNodes.has('person-A')).toBe(true);
  });

  it('removes a node from expandedNodes when already expanded', () => {
    useFamilyStore.getState().toggleExpand('person-A');
    useFamilyStore.getState().toggleExpand('person-A');
    expect(useFamilyStore.getState().expandedNodes.has('person-A')).toBe(false);
  });

  it('recursively collapses all descendants when a node is collapsed', () => {
    // Expand: A → C → E
    useFamilyStore.getState().toggleExpand('person-A');
    useFamilyStore.getState().toggleExpand('person-C');
    // Collapse A — should remove A, C, and E
    useFamilyStore.getState().toggleExpand('person-A');
    const { expandedNodes } = useFamilyStore.getState();
    expect(expandedNodes.has('person-A')).toBe(false);
    expect(expandedNodes.has('person-C')).toBe(false);
    expect(expandedNodes.has('person-E')).toBe(false);
  });

  it('does not affect siblings or unrelated nodes when collapsing', () => {
    useFamilyStore.getState().toggleExpand('person-A');
    useFamilyStore.getState().toggleExpand('person-C');
    useFamilyStore.getState().toggleExpand('person-D');
    // Collapse only C's branch
    useFamilyStore.getState().toggleExpand('person-C');
    const { expandedNodes } = useFamilyStore.getState();
    expect(expandedNodes.has('person-C')).toBe(false);
    expect(expandedNodes.has('person-A')).toBe(true);
    expect(expandedNodes.has('person-D')).toBe(true);
  });

  it('can expand multiple nodes independently', () => {
    useFamilyStore.getState().toggleExpand('person-A');
    useFamilyStore.getState().toggleExpand('person-C');
    const { expandedNodes } = useFamilyStore.getState();
    expect(expandedNodes.has('person-A')).toBe(true);
    expect(expandedNodes.has('person-C')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getSpouse
// ---------------------------------------------------------------------------
describe('getSpouse', () => {
  it('returns the spouse when a spouse relationship exists', () => {
    const spouse = useFamilyStore.getState().getSpouse('person-A');
    expect(spouse?.id).toBe('person-B');
  });

  it('finds the spouse regardless of from/to direction', () => {
    const spouse = useFamilyStore.getState().getSpouse('person-B');
    expect(spouse?.id).toBe('person-A');
  });

  it('returns null when no spouse relationship exists', () => {
    const spouse = useFamilyStore.getState().getSpouse('person-E');
    expect(spouse).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getChildren
// ---------------------------------------------------------------------------
describe('getChildren', () => {
  it('returns all children of a person', () => {
    const children = useFamilyStore.getState().getChildren('person-A');
    const ids = children.map((c) => c.id).sort();
    expect(ids).toEqual(['person-C', 'person-D'].sort());
  });

  it('returns an empty array for a leaf node', () => {
    const children = useFamilyStore.getState().getChildren('person-E');
    expect(children).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getPersonById
// ---------------------------------------------------------------------------
describe('getPersonById', () => {
  it('returns the correct person', () => {
    const person = useFamilyStore.getState().getPersonById('person-C');
    expect(person?.name).toBe('Carol');
  });

  it('returns null for an unknown id', () => {
    const person = useFamilyStore.getState().getPersonById('unknown-id');
    expect(person).toBeNull();
  });
});
