import { useMemo, useState } from 'react';
import BuildIcon from '@mui/icons-material/BuildOutlined';
import AddIcon from '@mui/icons-material/AddOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Stack from '@mui/material/Stack';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { invalidateVehicles } from '../../lib/invalidate';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { StateChip } from '../../components/StateChip';
import { DefinitionList } from '../../components/DefinitionList';
import { Mono } from '../../components/Mono';
import { RecordSearchSelect } from '../../components/RecordSearchSelect';
import { listInspectableVehicles, recordInspection } from '../../lib/api/vehicles';
import { VEHICLE_STATE_LABEL, VEHICLE_STATE_TONE } from '../../lib/labels';
import { formatNumber, rupees } from '../../lib/format';
import { neutral, status as tones } from '../../theme/tokens';
import type { DamageCategory, VehicleState } from '../../types';

/**
 * The one place a bike changes state by hand.
 *
 * Outcome is chosen first, because it determines what else the form needs:
 * "no work needed" asks for nothing more, the other two ask for a category, a
 * technician and a priced line-by-line record. Showing all of it at once is
 * how the paper process ended up with half-filled forms.
 */
const OUTCOMES: Array<{ value: VehicleState; label: string; hint: string }> = [
  { value: 'READY_TO_DEPLOY', label: 'Ready to deploy', hint: 'No work needed' },
  { value: 'UNDER_REPAIR', label: 'Under repair', hint: 'Send to workshop' },
  { value: 'ACCIDENT', label: 'Accident', hint: 'Off road, insurance path' },
];

const CATEGORIES: Array<{ value: DamageCategory; label: string }> = [
  { value: 'MINOR', label: 'Minor' },
  { value: 'MAJOR', label: 'Major' },
  { value: 'ACCIDENT', label: 'Accident' },
];

const TECHNICIANS = ['Dhananjay', 'Abhinandan'];

/** One priced line while the record is being built — a part, a labour charge. */
interface DraftItem {
  label: string;
  costRupees: string;
}

export function Inspection() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();

  // Deep link from a vehicle's detail page: ?vehicle=BLRSS0388. Seeded into
  // state at construction, not just read off `params` at render time — the
  // field used to stay blank until the operator typed into it because only
  // the resolved-record lookup below consulted `preselected`, never the
  // control's own value.
  const [vehicleId, setVehicleId] = useState(() => params.get('vehicle') ?? '');
  const [outcome, setOutcome] = useState<VehicleState>('UNDER_REPAIR');
  const [category, setCategory] = useState<DamageCategory>('MINOR');
  const [technician, setTechnician] = useState(TECHNICIANS[0]);
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<DraftItem[]>([{ label: '', costRupees: '' }]);
  const [saved, setSaved] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const options = useQuery({ queryKey: ['vehicles', 'inspectable'], queryFn: listInspectableVehicles });

  const resolved = useMemo(
    () => options.data?.find((v) => v.id === vehicleId) ?? null,
    [vehicleId, options.data],
  );

  const priced = items
    .map((i) => ({ label: i.label.trim(), costPaise: Math.round((Number(i.costRupees) || 0) * 100) }))
    .filter((i) => i.label.length > 0 && i.costPaise > 0);
  const totalPaise = priced.reduce((sum, i) => sum + i.costPaise, 0);

  const save = useMutation({
    mutationFn: () =>
      recordInspection({
        vehicleId: resolved!.id,
        category: outcome === 'READY_TO_DEPLOY' ? 'NONE' : category,
        notes,
        items: priced,
        estimatedCostPaise: priced.length > 0 ? totalPaise : null,
        technician: outcome === 'READY_TO_DEPLOY' ? null : technician,
        nextState: outcome,
      }),
    onSuccess: (v) => {
      invalidateVehicles(queryClient);
      setSaved(`${v.id} moved to ${VEHICLE_STATE_LABEL[v.state]}.`);
      setVehicleId('');
      setNotes('');
      setItems([{ label: '', costRupees: '' }]);
      setConfirmOpen(false);
    },
  });

  const needsWorkshop = outcome !== 'READY_TO_DEPLOY';

  return (
    <>
      <PageHeader
        section="Service management"
        title="Inspection and state change"
        icon={BuildIcon}
        backTo="/vehicles"
        backLabel="Back to vehicles"
        actions={
          <>
            <Button color="inherit" onClick={() => navigate('/vehicles')}>
              Cancel
            </Button>
            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={!resolved || save.isPending || (needsWorkshop && notes.trim().length === 0)}
            >
              {save.isPending ? 'Recording…' : 'Record inspection'}
            </Button>
          </>
        }
      />

      {saved && (
        <Alert severity="success" variant="outlined" sx={{ mt: 5 }}>
          {saved}
        </Alert>
      )}

      <Box sx={{
          display: 'grid',
          // The aside drops under the main column rather than shrinking:
          // below lg a 372px panel and a spec table both end up unreadable.
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 372px' },
          gap: 5,
          mt: 5,
          alignItems: 'start',
        }}>
        <Box sx={{ display: 'grid', gap: 5 }}>
          <Panel label="Vehicle">
            <RecordSearchSelect
              label="Vehicle id"
              placeholder="Search a bike"
              value={vehicleId}
              onChange={setVehicleId}
              options={(options.data ?? []).map((v) => ({
                id: v.id,
                primary: v.model,
                secondary: VEHICLE_STATE_LABEL[v.state],
                trailing: v.chassisNumber,
              }))}
              loading={options.isLoading}
            />
          </Panel>

          <Panel label="Outcome">
            <RadioGroup value={outcome} onChange={(e) => setOutcome(e.target.value as VehicleState)}>
              {OUTCOMES.map((o) => (
                <FormControlLabel
                  key={o.value}
                  value={o.value}
                  control={<Radio size="small" />}
                  sx={{ py: 1 }}
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
                      <Box component="span" sx={{ fontSize: 14 }}>{o.label}</Box>
                      <Box component="span" sx={{ fontSize: 12, color: neutral[500] }}>— {o.hint}</Box>
                    </Box>
                  }
                />
              ))}
            </RadioGroup>
          </Panel>

          {needsWorkshop && (
            <Panel label="Repair details">
              <Typography variant="overline" sx={{ mb: 1.5 }}>
                Category
              </Typography>
              <ToggleButtonGroup
                exclusive
                size="small"
                value={category}
                onChange={(_, next) => next && setCategory(next)}
                sx={{ mb: 5 }}
              >
                {CATEGORIES.map((c) => (
                  <ToggleButton key={c.value} value={c.value} sx={{ px: 4, textTransform: 'none', fontSize: 13 }}>
                    {c.label}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>

              <Typography variant="overline" sx={{ mb: 1.5 }}>
                Assigned technician
              </Typography>
              <ToggleButtonGroup
                exclusive
                size="small"
                value={technician}
                onChange={(_, next) => next && setTechnician(next)}
                sx={{ mb: 5 }}
              >
                {TECHNICIANS.map((t) => (
                  <ToggleButton key={t} value={t} sx={{ px: 4, textTransform: 'none', fontSize: 13 }}>
                    {t}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>

              <Typography variant="overline" sx={{ mb: 1.5 }}>
                Parts and labour
              </Typography>
              <Box sx={{ display: 'grid', gap: 2, mb: 3 }}>
                {items.map((item, index) => (
                  <Box
                    key={index}
                    sx={{ display: 'grid', gridTemplateColumns: '1fr 120px auto', gap: 2, alignItems: 'start' }}
                  >
                    <TextField
                      label="Part / labour"
                      size="small"
                      value={item.label}
                      onChange={(e) => {
                        const next = [...items];
                        next[index] = { ...next[index], label: e.target.value };
                        setItems(next);
                      }}
                    />
                    <TextField
                      label="Cost (₹)"
                      size="small"
                      type="number"
                      value={item.costRupees}
                      onChange={(e) => {
                        const next = [...items];
                        next[index] = { ...next[index], costRupees: e.target.value };
                        setItems(next);
                      }}
                    />
                    <IconButton
                      aria-label="Remove line"
                      size="small"
                      onClick={() => setItems(items.filter((_, i) => i !== index))}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Box>
                ))}
                <Box>
                  <Button
                    size="small"
                    startIcon={<AddIcon />}
                    onClick={() => setItems([...items, { label: '', costRupees: '' }])}
                  >
                    Add line
                  </Button>
                </Box>
              </Box>
              {priced.length > 0 && (
                <Stack direction="row" sx={{ justifyContent: 'space-between', mb: 5 }}>
                  <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>Estimated cost</Typography>
                  <Mono sx={{ fontSize: 14 }}>{rupees(totalPaise)}</Mono>
                </Stack>
              )}

              <TextField
                label="Notes"
                multiline
                minRows={3}
                value={notes}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNotes(e.target.value)}
                placeholder="What is wrong, what is needed, how long"
                helperText="Required — this is what the technician works from."
              />
            </Panel>
          )}
        </Box>

        <Box sx={{ display: 'grid', gap: 5 }}>
          <Panel label="Record">
            {resolved ? (
              <>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, mb: 3 }}>
                  <Mono sx={{ fontSize: 19 }}>{resolved.id}</Mono>
                  <StateChip
                    label={VEHICLE_STATE_LABEL[resolved.state]}
                    tone={VEHICLE_STATE_TONE[resolved.state]}
                  />
                </Box>
                <Typography sx={{ fontSize: 13, color: neutral[400], mb: 3 }}>
                  {resolved.model} · {resolved.batteryType}
                </Typography>
                <DefinitionList
                  divider="top"
                  items={[
                    { label: 'Hub', value: resolved.hub },
                    { label: 'Last rider', value: resolved.currentRiderName ?? '—' },
                    {
                      label: 'Odometer',
                      value: <Mono sx={{ fontSize: 13 }}>{formatNumber(resolved.odometerKm ?? 0)} km</Mono>,
                    },
                  ]}
                />
              </>
            ) : (
              <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>
                Pick a vehicle to see its record.
              </Typography>
            )}
          </Panel>

          <Panel>
            <Typography sx={{ fontSize: 13, color: neutral[400] }}>
              Recording this moves the vehicle to{' '}
              <Box component="span" sx={{ color: tones[VEHICLE_STATE_TONE[outcome]].fg }}>
                {VEHICLE_STATE_LABEL[outcome]}
              </Box>
              {outcome === 'UNDER_REPAIR'
                ? '. It will appear in the QC queue when the technician closes the repair.'
                : '.'}
            </Typography>
          </Panel>
        </Box>
      </Box>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: 16 }}>Confirm inspection · {resolved?.id}</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
            This moves the vehicle to{' '}
            <Box component="span" sx={{ color: tones[VEHICLE_STATE_TONE[outcome]].fg }}>
              {VEHICLE_STATE_LABEL[outcome]}
            </Box>
            {priced.length > 0 ? ` at an estimated cost of ${rupees(totalPaise)}.` : '.'} This cannot be
            undone from here.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 6, pb: 5 }}>
          <Button color="inherit" onClick={() => setConfirmOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'Recording…' : 'Confirm'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

