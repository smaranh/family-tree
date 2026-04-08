import { describe, it, expect } from 'vitest';
import { buildTree } from '../buildTree';
import type { BuildTreeInput } from '../buildTree';
import type { Person, Relationship } from '../../store/familyStore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePerson(id: string, name: string, dob = '1970-01-01'): Person {
  return { id, name, dob, image: null };
}

function makeRel(id: string, type: Relationship['type'], from: string, to: string): Relationship {
  return { id, type, from, to };
}

function input(overrides: Partial<BuildTreeInput> = {}): BuildTreeInput {
  return {
    persons: [],
    relationships: [],
    rootPersonId: null,
    expandedNodes: new Set(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('buildTree — edge cases', () => {
  it('returns empty nodes and edges when rootPersonId is null', () => {
    const result = buildTree(input());
    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
  });

  it('returns a single node for a lone person with no relationships', () => {
    const persons = [makePerson('A', 'Alice')];
    const result = buildTree(input({ persons, rootPersonId: 'A' }));
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].id).toBe('A');
    expect(result.edges).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Spouse rendering
// ---------------------------------------------------------------------------

describe('buildTree — spouse', () => {
  const persons = [makePerson('A', 'Alice'), makePerson('B', 'Bob')];
  const relationships = [makeRel('r1', 'spouse', 'A', 'B')];

  it('renders both the root and their spouse', () => {
    const result = buildTree(input({ persons, relationships, rootPersonId: 'A' }));
    const ids = result.nodes.map((n) => n.id);
    expect(ids).toContain('A');
    expect(ids).toContain('B');
  });

  it('places the spouse to the right of the root person', () => {
    const result = buildTree(input({ persons, relationships, rootPersonId: 'A' }));
    const nodeA = result.nodes.find((n) => n.id === 'A')!;
    const nodeB = result.nodes.find((n) => n.id === 'B')!;
    expect(nodeB.position.x).toBeGreaterThan(nodeA.position.x);
  });

  it('emits a spouse edge between them', () => {
    const result = buildTree(input({ persons, relationships, rootPersonId: 'A' }));
    const spouseEdge = result.edges.find(
      (e) => e.id.startsWith('spouse-')
    );
    expect(spouseEdge).toBeDefined();
    const endpoints = new Set([spouseEdge!.source, spouseEdge!.target]);
    expect(endpoints.has('A')).toBe(true);
    expect(endpoints.has('B')).toBe(true);
  });

  it('marks the spouse node with isSpouse: true', () => {
    const result = buildTree(input({ persons, relationships, rootPersonId: 'A' }));
    const spouseNode = result.nodes.find((n) => n.id === 'B')!;
    expect(spouseNode.data.isSpouse).toBe(true);
  });

  it('marks the root node with isSpouse: false', () => {
    const result = buildTree(input({ persons, relationships, rootPersonId: 'A' }));
    const rootNode = result.nodes.find((n) => n.id === 'A')!;
    expect(rootNode.data.isSpouse).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Expand / collapse
// ---------------------------------------------------------------------------

describe('buildTree — expand / collapse', () => {
  const persons = [
    makePerson('A', 'Alice'),
    makePerson('B', 'Bob'),
    makePerson('C', 'Carol'),
  ];
  const relationships = [
    makeRel('r1', 'parent', 'A', 'C'),
    makeRel('r2', 'parent', 'B', 'C'),
    makeRel('r3', 'spouse', 'A', 'B'),
  ];

  it('does not render children when parent is not expanded', () => {
    const result = buildTree(input({ persons, relationships, rootPersonId: 'A' }));
    const ids = result.nodes.map((n) => n.id);
    expect(ids).not.toContain('C');
  });

  it('renders children when parent is expanded', () => {
    const result = buildTree(
      input({ persons, relationships, rootPersonId: 'A', expandedNodes: new Set(['A']) })
    );
    const ids = result.nodes.map((n) => n.id);
    expect(ids).toContain('C');
  });

  it('emits a parent-child edge when parent is expanded', () => {
    const result = buildTree(
      input({ persons, relationships, rootPersonId: 'A', expandedNodes: new Set(['A']) })
    );
    const parentEdge = result.edges.find((e) => e.id.startsWith('parent-'));
    expect(parentEdge).toBeDefined();
    expect(parentEdge!.target).toBe('C');
  });

  it('does not emit parent-child edges when collapsed', () => {
    const result = buildTree(input({ persons, relationships, rootPersonId: 'A' }));
    const parentEdges = result.edges.filter((e) => e.id.startsWith('parent-'));
    expect(parentEdges).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Generation layout
// ---------------------------------------------------------------------------

describe('buildTree — generation layout', () => {
  const persons = [
    makePerson('G', 'Grandpa'),
    makePerson('GM', 'Grandma'),
    makePerson('P', 'Parent'),
    makePerson('C', 'Child'),
  ];
  const relationships = [
    makeRel('r1', 'spouse', 'G', 'GM'),
    makeRel('r2', 'parent', 'G', 'P'),
    makeRel('r3', 'parent', 'GM', 'P'),
    makeRel('r4', 'parent', 'P', 'C'),
  ];

  it('places each generation on a lower y than the previous', () => {
    const result = buildTree(
      input({
        persons,
        relationships,
        rootPersonId: 'G',
        expandedNodes: new Set(['G', 'P']),
      })
    );
    const yOf = (id: string) => result.nodes.find((n) => n.id === id)!.position.y;
    expect(yOf('G')).toBe(yOf('GM'));        // same generation, same y
    expect(yOf('P')).toBeGreaterThan(yOf('G')); // gen 2 lower than gen 1
    expect(yOf('C')).toBeGreaterThan(yOf('P')); // gen 3 lower than gen 2
  });

  it('uses personCard as the node type for all nodes', () => {
    const result = buildTree(
      input({ persons, relationships, rootPersonId: 'G', expandedNodes: new Set(['G']) })
    );
    for (const node of result.nodes) {
      expect(node.type).toBe('personCard');
    }
  });
});

// ---------------------------------------------------------------------------
// Multiple children
// ---------------------------------------------------------------------------

describe('buildTree — multiple children', () => {
  const persons = [
    makePerson('A', 'Alice'),
    makePerson('C1', 'Child1'),
    makePerson('C2', 'Child2'),
    makePerson('C3', 'Child3'),
  ];
  const relationships = [
    makeRel('r1', 'parent', 'A', 'C1'),
    makeRel('r2', 'parent', 'A', 'C2'),
    makeRel('r3', 'parent', 'A', 'C3'),
  ];

  it('renders all children when expanded', () => {
    const result = buildTree(
      input({ persons, relationships, rootPersonId: 'A', expandedNodes: new Set(['A']) })
    );
    const ids = result.nodes.map((n) => n.id);
    expect(ids).toContain('C1');
    expect(ids).toContain('C2');
    expect(ids).toContain('C3');
  });

  it('places children in left-to-right order with increasing x', () => {
    const result = buildTree(
      input({ persons, relationships, rootPersonId: 'A', expandedNodes: new Set(['A']) })
    );
    const xOf = (id: string) => result.nodes.find((n) => n.id === id)!.position.x;
    expect(xOf('C2')).toBeGreaterThan(xOf('C1'));
    expect(xOf('C3')).toBeGreaterThan(xOf('C2'));
  });

  it('emits one parent edge per child', () => {
    const result = buildTree(
      input({ persons, relationships, rootPersonId: 'A', expandedNodes: new Set(['A']) })
    );
    const parentEdges = result.edges.filter((e) => e.id.startsWith('parent-'));
    expect(parentEdges).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// De-duplication: shared children between couple
// ---------------------------------------------------------------------------

describe('buildTree — shared children de-duplication', () => {
  it('does not render a shared child twice when both parents list them', () => {
    const persons = [
      makePerson('A', 'Alice'),
      makePerson('B', 'Bob'),
      makePerson('C', 'Carol'),
    ];
    const relationships = [
      makeRel('r1', 'spouse', 'A', 'B'),
      makeRel('r2', 'parent', 'A', 'C'),
      makeRel('r3', 'parent', 'B', 'C'),  // same child, both parents
    ];
    const result = buildTree(
      input({ persons, relationships, rootPersonId: 'A', expandedNodes: new Set(['A']) })
    );
    const childNodes = result.nodes.filter((n) => n.id === 'C');
    expect(childNodes).toHaveLength(1);
  });
});
