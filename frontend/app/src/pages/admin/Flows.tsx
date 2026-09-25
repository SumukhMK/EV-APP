import { useCallback, useEffect, useMemo, useState } from 'react';
import { ReactFlow, Background, MiniMap, useNodesState, useEdgesState, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { StateChip } from '../../components/StateChip';
import { neutral, base, status as statusTokens } from '../../theme/tokens';
import { USER_ROLE_LABEL } from '../../lib/labels';
import { FlowNode } from './flows/FlowNode';
import { FlowEdge } from './flows/FlowEdge';
import { FlowSidebar } from './flows/FlowSidebar';
import { nodesForMode, edgesForMode } from './flows/flowData';
import { FLOW_MODES, type FlowMode, type FlowNodeData } from './flows/types';
import type { UserRole } from '../../types';

const nodeTypes = { flow: FlowNode };
const edgeTypes = { flow: FlowEdge };
const ALL_ROLES: UserRole[] = ['SUPER_ADMIN', 'FLEET_ADMIN', 'FLEET_STAFF', 'SERVICE_MANAGER'];

function isFlowMode(v: string | null): v is FlowMode {
  return FLOW_MODES.some((m) => m.id === v);
}

export function Flows() {
  const [params, setParams] = useSearchParams();
  const rawMode = params.get('mode');
  const mode: FlowMode = isFlowMode(rawMode) ? rawMode : 'operational';
  const [selectedNode, setSelectedNode] = useState<Node<FlowNodeData> | null>(null);
  const [rbacRole, setRbacRole] = useState<UserRole>('FLEET_STAFF');
  const [asIsView, setAsIsView] = useState<'asis' | 'tobe'>('tobe');

  const setMode = useCallback(
    (next: FlowMode) => {
      setParams({ mode: next }, { replace: true });
      setSelectedNode(null);
    },
    [setParams],
  );

  const initialNodes = useMemo(() => nodesForMode(mode), [mode]);
  const initialEdges = useMemo(
    () => edgesForMode(mode, mode === 'rbac' ? rbacRole : undefined),
    [mode, rbacRole],
  );

  // Apply visual overrides per mode
  const styledNodes = useMemo(() => {
    return initialNodes.map((node) => {
      const d = node.data;
      let opacity = 1;
      let borderStyle: string | undefined;

      if (mode === 'rbac') {
        const perm = d.permissions[rbacRole];
        if (!perm.canAct && !perm.canView) opacity = 0.25;
        else if (!perm.canAct) opacity = 0.55;
      }

      if (mode === 'asis') {
        if (asIsView === 'tobe' && d.toBe === 'removed') opacity = 0.25;
        if (asIsView === 'asis' && d.asIs === 'dead') borderStyle = 'dashed';
      }

      return { ...node, style: { opacity, borderStyle } };
    });
  }, [initialNodes, mode, rbacRole, asIsView]);

  const styledEdges = useMemo(() => {
    return initialEdges.map((edge) => {
      const d = edge.data;
      if (!d) return edge;
      let opacity = 1;
      if (mode === 'asis' && asIsView === 'tobe' && d.toBe === 'removed') opacity = 0.2;
      if (mode === 'asis' && asIsView === 'asis' && d.asIs === 'bypass') opacity = 0.7;
      return { ...edge, style: { ...edge.style, opacity } };
    });
  }, [initialEdges, mode, asIsView]);

  const [nodes, setNodes, onNodesChange] = useNodesState(styledNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(styledEdges);

  // Sync nodes/edges when mode, role, or as-is view changes
  useEffect(() => {
    setNodes(styledNodes);
  }, [styledNodes, setNodes]);

  useEffect(() => {
    setEdges(styledEdges);
  }, [styledEdges, setEdges]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node as Node<FlowNodeData>);
  }, []);

  return (
    <>
      <PageHeader section="Reference" title="How the work flows" />
      <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
        Click any box to see what happens there. Switch modes to see data, roles, proposed changes,
        or money flow.
      </Typography>

      {/* Mode tabs */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 3 }}>
        {FLOW_MODES.map((m) => (
          <Button
            key={m.id}
            variant={mode === m.id ? 'contained' : 'outlined'}
            color={mode === m.id ? 'primary' : 'inherit'}
            size="small"
            onClick={() => setMode(m.id)}
          >
            {m.label}
          </Button>
        ))}
      </Box>

      {/* RBAC role picker */}
      {mode === 'rbac' && (
        <Box sx={{ mt: 2 }}>
          <ToggleButtonGroup
            value={rbacRole}
            exclusive
            onChange={(_, v) => {
              if (v) setRbacRole(v as UserRole);
            }}
            size="small"
          >
            {ALL_ROLES.map((r) => (
              <ToggleButton key={r} value={r}>
                {USER_ROLE_LABEL[r]}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>
      )}

      {/* As-Is / To-Be toggle */}
      {mode === 'asis' && (
        <Box sx={{ mt: 2 }}>
          <ToggleButtonGroup
            value={asIsView}
            exclusive
            onChange={(_, v) => {
              if (v) setAsIsView(v as 'asis' | 'tobe');
            }}
            size="small"
          >
            <ToggleButton value="asis">As-is (current)</ToggleButton>
            <ToggleButton value="tobe">To-be (proposed)</ToggleButton>
          </ToggleButtonGroup>
        </Box>
      )}

      {/* Canvas + Sidebar */}
      <Box
        sx={{
          display: 'flex',
          mt: 3,
          height: 600,
          border: 1,
          borderColor: 'divider',
          borderRadius: 2,
          overflow: 'hidden',
          bgcolor: base.bgDeep,
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            proOptions={{ hideAttribution: true }}
            minZoom={0.3}
            maxZoom={2}
          >
            <Background color={neutral[800]} gap={24} />
            <MiniMap
              nodeColor={(n) => {
                const d = n.data as FlowNodeData;
                return statusTokens[d.tone]?.fg ?? neutral[500];
              }}
              maskColor="rgba(0,0,0,0.6)"
              style={{ borderRadius: 8 }}
            />
          </ReactFlow>
        </Box>
        <FlowSidebar node={selectedNode} mode={mode} onClose={() => setSelectedNode(null)} />
      </Box>

      {/* Legend */}
      <Panel sx={{ mt: 3 }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
            Legend:
          </Typography>
          <StateChip label="Healthy" tone="good" />
          <StateChip label="Caution" tone="caution" />
          <StateChip label="Warning" tone="warn" />
          <StateChip label="Problem" tone="bad" />
          <StateChip label="Neutral" tone="neutral" />
          {mode === 'asis' && (
            <>
              <Typography variant="caption" color="text.secondary">
                |
              </Typography>
              <Typography variant="caption" sx={{ color: 'var(--s-bad-fg)' }}>
                --- Dashed = bypass / removed
              </Typography>
              <Typography variant="caption" sx={{ color: 'var(--s-good-fg)' }}>
                NEW = added in to-be
              </Typography>
            </>
          )}
          {mode === 'rbac' && (
            <>
              <Typography variant="caption" color="text.secondary">
                |
              </Typography>
              <Typography variant="caption">Bright = can act</Typography>
              <Typography variant="caption" sx={{ opacity: 0.55 }}>
                Faded = view only
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.25 }}>
                Ghost = no access
              </Typography>
            </>
          )}
        </Box>
      </Panel>
    </>
  );
}
