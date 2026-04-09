import { useEffect, useMemo } from 'react';
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

import { PersonCard } from '../../components/PersonCard';
import { useToggleExpand, usePersons, useRelationships, useRootPersonId, useExpandedNodes } from '../../store/familyStore';
import { buildTree } from '../../utils/buildTree';
import { Container } from './styles';

// ---------------------------------------------------------------------------
// Register custom node types outside component to avoid re-registration
// ---------------------------------------------------------------------------

const nodeTypes = { personCard: PersonCard };

// ---------------------------------------------------------------------------
// Inner component (must be inside ReactFlowProvider to use useReactFlow)
// ---------------------------------------------------------------------------

function ViewModeInner() {
    const expandedNodes = useExpandedNodes();
    const persons = usePersons();
    const relationships = useRelationships();
    const rootPersonId = useRootPersonId();
    const toggleExpand = useToggleExpand();

    // Auto-expand 3 generations from root on initial load
    useEffect(() => {
        if (!rootPersonId) return;

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

    return (
        <Container>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
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
        </Container>
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
