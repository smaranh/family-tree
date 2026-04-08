import { useEffect, useMemo, useCallback } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
} from 'reactflow';
import 'reactflow/dist/style.css';

import PersonCard from '../components/PersonCard';
import useFamilyStore from '../store/familyStore';
import { buildTree } from '../utils/buildTree';

// ---------------------------------------------------------------------------
// Register custom node types outside component to avoid re-registration
// ---------------------------------------------------------------------------

const nodeTypes = { personCard: PersonCard };

// ---------------------------------------------------------------------------
// Inner component (must be inside ReactFlowProvider to use useReactFlow)
// ---------------------------------------------------------------------------

function ViewModeInner() {
  const persons = useFamilyStore((s) => s.persons);
  const relationships = useFamilyStore((s) => s.relationships);
  const rootPersonId = useFamilyStore((s) => s.rootPersonId);
  const expandedNodes = useFamilyStore((s) => s.expandedNodes);
  const toggleExpand = useFamilyStore((s) => s.toggleExpand);

  // Auto-expand 3 generations from root on initial load
  useEffect(() => {
    if (!rootPersonId) return;

    // const { toggleExpand, relationships: rels } = useFamilyStore.getState();

    function expandGenerations(personId: string, depth: number) {
      if (depth === 0) return;
      toggleExpand(personId);
      const children = relationships
        .filter((r) => r.type === 'parent' && r.from === personId)
        .map((r) => r.to);
      for (const childId of children) {
        expandGenerations(childId, depth - 1);
      }
    }

    // Expand root + 2 more levels (= 3 generations visible)
    expandGenerations(rootPersonId, 2);
  }, [rootPersonId]); // intentionally run only once on mount

  // Rebuild nodes/edges whenever store state changes
  const { nodes: builtNodes, edges: builtEdges } = useMemo(
    () => buildTree({ persons, relationships, rootPersonId, expandedNodes }),
    [persons, relationships, rootPersonId, expandedNodes]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(builtNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(builtEdges);

  // Sync built nodes/edges into React Flow state when they change
  useEffect(() => { setNodes(builtNodes); }, [builtNodes, setNodes]);
  useEffect(() => { setEdges(builtEdges); }, [builtEdges, setEdges]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: { id: string }) => {
      toggleExpand(node.id);
    },
    [toggleExpand]
  );

  console.log(nodes)

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#faf6ef' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.2}
        maxZoom={2}
        nodesDraggable={false}
        nodesConnectable={false}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="#d6c4a8"
        />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor="#c8ae8a"
          maskColor="rgba(250,246,239,0.7)"
          style={{ border: '1px solid #d6c4a8' }}
        />
      </ReactFlow>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public export — wraps with ReactFlowProvider
// ---------------------------------------------------------------------------

export default function ViewMode() {
  return (
    <ReactFlowProvider>
      <ViewModeInner />
    </ReactFlowProvider>
  );
}
