import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps, type Edge } from '@xyflow/react';
import Typography from '@mui/material/Typography';
import { neutral } from '../../../theme/tokens';
import type { FlowEdgeData } from './types';

export function FlowEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  style,
  markerStart,
  markerEnd,
  interactionWidth,
}: EdgeProps<Edge<FlowEdgeData>>) {
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });

  const isRemoved = data?.toBe === 'removed';
  const isBypass = data?.asIs === 'bypass';

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerStart={markerStart}
        markerEnd={markerEnd}
        interactionWidth={interactionWidth}
        style={{
          ...style,
          stroke: isBypass || isRemoved ? 'var(--s-bad-fg)' : neutral[600],
          strokeWidth: isBypass ? 1.5 : 2,
          strokeDasharray: isBypass || isRemoved ? '6 4' : undefined,
          opacity: isRemoved ? 0.5 : 1,
        }}
      />
      {data?.trigger && (
        <EdgeLabelRenderer>
          <Typography
            variant="caption"
            sx={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'none',
              bgcolor: 'var(--c-bg)',
              px: 1,
              py: 0.25,
              borderRadius: 1,
              color: isBypass || isRemoved ? 'var(--s-bad-fg)' : neutral[400],
              fontSize: 10,
              lineHeight: 1.2,
              maxWidth: 140,
              textAlign: 'center',
              textDecoration: isRemoved ? 'line-through' : undefined,
            }}
          >
            {data.trigger}
          </Typography>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
