import type { Node } from '@xyflow/react';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import CloseIcon from '@mui/icons-material/CloseOutlined';
import { Link } from 'react-router-dom';
import { StateChip } from '../../../components/StateChip';
import { status } from '../../../theme/tokens';
import { USER_ROLE_LABEL } from '../../../lib/labels';
import type { FlowNodeData, FlowMode } from './types';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="overline" sx={{ mb: 1, display: 'block' }}>{title}</Typography>
      {children}
    </Box>
  );
}

function FieldTable({ fields }: { fields: FlowNodeData['fields'] }) {
  if (!fields.length) return <Typography variant="body2" color="text.secondary">No fields tracked at this state.</Typography>;
  return (
    <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', '& td, & th': { py: 0.75, px: 1, fontSize: 12, textAlign: 'left', borderBottom: 1, borderColor: 'divider' } }}>
      <thead><tr><th>Field</th><th>Type</th><th>Example</th></tr></thead>
      <tbody>{fields.map((f) => <tr key={f.name}><td><code>{f.name}</code></td><td><code>{f.type}</code></td><td>{f.example}</td></tr>)}</tbody>
    </Box>
  );
}

export function FlowSidebar({ node, mode, onClose }: { node: Node<FlowNodeData> | null; mode: FlowMode; onClose: () => void }) {
  if (!node) return null;
  const d = node.data;
  const tone = status[d.tone];

  return (
    <Box sx={{
      width: 360, borderLeft: 1, borderColor: 'divider', bgcolor: 'background.paper',
      p: 3, overflowY: 'auto', height: '100%',
    }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600, color: tone.fg }}>{d.label}</Typography>
          <Typography variant="body2" color="text.secondary">{d.description}</Typography>
        </Box>
        <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
      </Box>

      {mode === 'operational' && (
        <>
          <Section title="Screens">
            {d.screens.length ? d.screens.map((s) => (
              <Chip key={s.path} label={s.label} component={Link} to={s.path} clickable size="small" sx={{ mr: 1, mb: 1 }} />
            )) : <Typography variant="body2" color="text.secondary">No screen for this state.</Typography>}
          </Section>
          <Section title="Who acts here">
            {d.actors.map((r) => <Chip key={r} label={USER_ROLE_LABEL[r]} size="small" sx={{ mr: 1, mb: 1 }} />)}
          </Section>
          <Section title="What can be done">
            {d.actions.length ? <ul style={{ margin: 0, paddingLeft: 20 }}>{d.actions.map((a) => <li key={a}><Typography variant="body2">{a}</Typography></li>)}</ul> : <Typography variant="body2" color="text.secondary">Terminal state.</Typography>}
          </Section>
          <Section title="How a bike gets here">
            {d.triggers.map((t) => <Typography key={t} variant="body2">&#8226; {t}</Typography>)}
          </Section>
        </>
      )}

      {mode === 'data' && (
        <>
          <Section title="Type">
            <Typography variant="body2"><code>{d.typeName}</code></Typography>
            {d.relatedTypes.length > 0 && <Typography variant="caption" color="text.secondary">Related: {d.relatedTypes.join(', ')}</Typography>}
          </Section>
          <Section title="Key fields"><FieldTable fields={d.fields} /></Section>
        </>
      )}

      {mode === 'rbac' && (
        <Section title="Permissions">
          <Typography variant="body2" sx={{ mb: 1 }}>{d.permissionFn ? <><code>{d.permissionFn}()</code></> : 'No specific permission gate'}</Typography>
          {Object.entries(d.permissions).map(([role, perm]) => (
            <Box key={role} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <StateChip label={USER_ROLE_LABEL[role as keyof typeof USER_ROLE_LABEL]} tone={perm.canAct ? 'good' : perm.canView ? 'caution' : 'bad'} />
              <Typography variant="caption">{perm.canAct ? 'Full access' : perm.canView ? 'View only' : 'No access'}</Typography>
            </Box>
          ))}
        </Section>
      )}

      {mode === 'asis' && (
        <>
          <Section title="Current status">
            <StateChip label={d.asIs === 'dead' ? 'Dead code' : d.asIs === 'problematic' ? 'Has problems' : 'Working'} tone={d.asIs === 'exists' ? 'good' : 'bad'} />
            {d.problems.length > 0 && <Typography variant="body2" sx={{ mt: 1 }}>Problems: {d.problems.join(', ')}</Typography>}
          </Section>
          <Section title="Proposed change">
            <StateChip label={d.toBe === 'removed' ? 'Remove' : d.toBe === 'added' ? 'New' : d.toBe === 'modified' ? 'Modified' : 'No change'} tone={d.toBe === 'removed' ? 'bad' : d.toBe === 'added' ? 'good' : d.toBe === 'modified' ? 'caution' : 'neutral'} />
            {d.changeNote && <Typography variant="body2" sx={{ mt: 1 }}>{d.changeNote}</Typography>}
          </Section>
        </>
      )}

      {mode === 'money' && d.moneyDetail && (
        <Section title="How it works">
          <Typography variant="body2">{d.moneyDetail}</Typography>
        </Section>
      )}
    </Box>
  );
}
