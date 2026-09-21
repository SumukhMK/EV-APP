import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { status, neutral } from '../../../theme/tokens';
import type { FlowNodeData } from './types';

export function FlowNode({ data, selected }: NodeProps<Node<FlowNodeData>>) {
  const tone = status[data.tone];
  return (
    <Box
      sx={{
        border: 2,
        borderColor: selected ? tone.fg : neutral[700],
        borderRadius: 2,
        bgcolor: tone.bg,
        px: 2,
        py: 1.5,
        minWidth: 150,
        maxWidth: 220,
        cursor: 'pointer',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        '&:hover': { borderColor: tone.fg },
        ...(selected && { boxShadow: `0 0 0 2px ${tone.fg}` }),
      }}
    >
      <Typography variant="body2" sx={{ fontWeight: 600, color: tone.fg, lineHeight: 1.3 }}>
        {data.label}
      </Typography>
      <Typography variant="caption" sx={{ color: neutral[500], display: 'block', mt: 0.5, lineHeight: 1.3 }}>
        {data.description}
      </Typography>
      <Handle type="target" position={Position.Left} style={{ background: tone.fg, width: 8, height: 8, border: 'none' }} />
      <Handle type="source" position={Position.Right} style={{ background: tone.fg, width: 8, height: 8, border: 'none' }} />
    </Box>
  );
}
