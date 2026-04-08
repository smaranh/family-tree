import type { Node, Edge } from 'reactflow';
import type { Person, Relationship } from '../store/familyStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BuildTreeInput {
  persons: Person[];
  relationships: Relationship[];
  rootPersonId: string | null;
  expandedNodes: Set<string>;
}

export interface PersonNodeData {
  person: Person;
  isSpouse: boolean;
}

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const CARD_WIDTH = 180;
const CARD_HEIGHT = 100;
const H_GAP = 40;       // horizontal gap between cards
const SPOUSE_GAP = 16;  // tighter gap between a person and their spouse
const V_GAP = 80;       // vertical gap between generations

// Width of a "couple unit" (person + spouse side-by-side)
const COUPLE_WIDTH = CARD_WIDTH * 2 + SPOUSE_GAP;
// Width of a single person unit
const SINGLE_WIDTH = CARD_WIDTH;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSpouseOf(personId: string, relationships: Relationship[]): string | null {
  const rel = relationships.find(
    (r) => r.type === 'spouse' && (r.from === personId || r.to === personId)
  );
  if (!rel) return null;
  return rel.from === personId ? rel.to : rel.from;
}

function getChildrenOf(personId: string, relationships: Relationship[]): string[] {
  return relationships
    .filter((r) => r.type === 'parent' && r.from === personId)
    .map((r) => r.to);
}

/**
 * Returns the unique children of a couple (or single person).
 * De-duplicates children that appear under both the person and their spouse.
 */
function getCoupleChildren(
  personId: string,
  spouseId: string | null,
  relationships: Relationship[]
): string[] {
  const childSet = new Set<string>(getChildrenOf(personId, relationships));
  if (spouseId) {
    for (const id of getChildrenOf(spouseId, relationships)) {
      childSet.add(id);
    }
  }
  return Array.from(childSet);
}

/**
 * Measures the total horizontal width required to render a subtree rooted at
 * personId (excluding their spouse — the caller handles the couple unit).
 * Used to space sibling subtrees evenly.
 */
function measureSubtreeWidth(
  personId: string,
  relationships: Relationship[],
  expandedNodes: Set<string>
): number {
  const spouseId = getSpouseOf(personId, relationships);
  const unitWidth = spouseId ? COUPLE_WIDTH : SINGLE_WIDTH;

  if (!expandedNodes.has(personId)) {
    return unitWidth;
  }

  const children = getCoupleChildren(personId, spouseId, relationships);
  if (children.length === 0) return unitWidth;

  const childrenWidth = children.reduce((sum, childId, i) => {
    return sum + measureSubtreeWidth(childId, relationships, expandedNodes) + (i > 0 ? H_GAP : 0);
  }, 0);

  return Math.max(unitWidth, childrenWidth);
}

// ---------------------------------------------------------------------------
// Core recursive builder
// ---------------------------------------------------------------------------

interface BuildContext {
  persons: Person[];
  relationships: Relationship[];
  expandedNodes: Set<string>;
  nodes: Node<PersonNodeData>[];
  edges: Edge[];
  visited: Set<string>;  // prevents infinite loops on malformed data
}

function buildLevel(
  ctx: BuildContext,
  personIds: string[],
  level: number,
  startX: number
): void {
  let cursor = startX;

  for (const personId of personIds) {
    if (ctx.visited.has(personId)) continue;
    ctx.visited.add(personId);

    const person = ctx.persons.find((p) => p.id === personId);
    if (!person) continue;

    const spouseId = getSpouseOf(personId, ctx.relationships);
    const spouse = spouseId ? ctx.persons.find((p) => p.id === spouseId) : null;

    const subtreeWidth = measureSubtreeWidth(personId, ctx.relationships, ctx.expandedNodes);
    const unitWidth = spouseId ? COUPLE_WIDTH : SINGLE_WIDTH;
    const blockWidth = Math.max(unitWidth, subtreeWidth);

    // Center the couple/person within the block
    const blockCenter = cursor + blockWidth / 2;
    const personX = spouse
      ? blockCenter - COUPLE_WIDTH / 2
      : blockCenter - CARD_WIDTH / 2;
    const y = level * (CARD_HEIGHT + V_GAP);

    // Emit person node
    ctx.nodes.push({
      id: personId,
      type: 'personCard',
      position: { x: personX, y },
      data: { person, isSpouse: false },
      // selectable: false,
    });

    // Emit spouse node (side-by-side, slightly tighter gap)
    if (spouse && !ctx.visited.has(spouseId!)) {
      ctx.visited.add(spouseId!);
      ctx.nodes.push({
        id: spouseId!,
        type: 'personCard',
        position: { x: personX + CARD_WIDTH + SPOUSE_GAP, y },
        data: { person: spouse, isSpouse: true },
        // selectable: false,
      });

      // Spouse edge (dashed horizontal)
      ctx.edges.push({
        id: `spouse-${personId}-${spouseId}`,
        source: personId,
        target: spouseId!,
        type: 'straight',
        style: { strokeDasharray: '4 4', stroke: '#aaa' },
      });
    }

    // Recurse into children if expanded
    if (ctx.expandedNodes.has(personId)) {
      const children = getCoupleChildren(personId, spouseId ?? null, ctx.relationships);

      if (children.length > 0) {
        // Calculate where children subtrees start
        const childrenTotalWidth = children.reduce((sum, childId, i) => {
          return (
            sum +
            measureSubtreeWidth(childId, ctx.relationships, ctx.expandedNodes) +
            (i > 0 ? H_GAP : 0)
          );
        }, 0);
        const childrenStartX = blockCenter - childrenTotalWidth / 2;

        for (const childId of children) {
          ctx.edges.push({
            id: `parent-${personId}-${childId}`,
            source: personId,
            target: childId,
            sourceHandle: null,
            targetHandle: null,
            type: 'smoothstep',
            style: { stroke: '#555' },
          });
        }

        buildLevel(ctx, children, level + 1, childrenStartX);
      }
    }

    cursor += blockWidth + H_GAP;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function buildTree(input: BuildTreeInput): {
  nodes: Node<PersonNodeData>[];
  edges: Edge[];
} {
  const { persons, relationships, rootPersonId, expandedNodes } = input;

  if (!rootPersonId) return { nodes: [], edges: [] };

  const ctx: BuildContext = {
    persons,
    relationships,
    expandedNodes,
    nodes: [],
    edges: [],
    visited: new Set(),
  };

  buildLevel(ctx, [rootPersonId], 0, 0);

  return { nodes: ctx.nodes, edges: ctx.edges };
}
