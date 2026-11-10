import AddIcon from '@mui/icons-material/AddOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutlineOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { preciseRupeesWithSymbol as rupees } from '../../../lib/format';
import { MONEY, toItems, type CostLine } from './lineItems';

/**
 * Damaged parts and repair work, one row each: what it is and what it costs.
 * Two add buttons stand in for a type dropdown on every row.
 */
export function CostLines({ lines, onChange, sx }: { lines: CostLine[]; onChange: (lines: CostLine[]) => void; sx?: object }) {
  const patch = (index: number, next: Partial<CostLine>) => onChange(lines.map((l, i) => (i === index ? { ...l, ...next } : l)));
  const total = toItems(lines).reduce((sum, item) => sum + (Number.isSafeInteger(item.costPaise) ? item.costPaise : 0), 0);
  return (
    <Box sx={{ display: 'grid', gap: 1.5, ...sx }}>
      <Typography variant="subtitle2">Damaged parts &amp; repair work</Typography>
      {lines.map((line, index) => (
        <Box key={index} sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 110px 40px', gap: 1.5, alignItems: 'start' }}>
          <TextField size="small" label={line.kind === 'PART' ? 'Part' : 'Repair work'} value={line.label}
            onChange={(e) => patch(index, { label: e.target.value })} />
          <TextField size="small" label="₹" value={line.cost} onChange={(e) => patch(index, { cost: e.target.value })}
            slotProps={{ htmlInput: { inputMode: 'decimal' } }} error={Boolean(line.cost) && !MONEY.test(line.cost)} />
          <IconButton aria-label={`Remove line ${index + 1}`} onClick={() => onChange(lines.filter((_, i) => i !== index))}><DeleteIcon /></IconButton>
        </Box>
      ))}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
        <Button size="small" startIcon={<AddIcon />} onClick={() => onChange([...lines, { label: '', cost: '', kind: 'PART' }])}>Add part</Button>
        <Button size="small" startIcon={<AddIcon />} onClick={() => onChange([...lines, { label: '', cost: '', kind: 'LABOUR' }])}>Add repair work</Button>
        {lines.length > 0 && <Typography variant="body2" sx={{ ml: 'auto', fontWeight: 600 }}>Total: {rupees(total)}</Typography>}
      </Box>
    </Box>
  );
}
