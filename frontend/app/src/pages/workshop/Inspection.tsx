import { useMemo, useState } from 'react';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControlLabel from '@mui/material/FormControlLabel';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { invalidateVehicles } from '../../lib/invalidate';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { StateChip } from '../../components/StateChip';
import { DefinitionList } from '../../components/DefinitionList';
import { Mono } from '../../components/Mono';
import { listInspectableVehicles, recordInspection } from '../../lib/api/vehicles';
import { VEHICLE_STATE_LABEL, VEHICLE_STATE_TONE } from '../../lib/labels';
import { formatNumber } from '../../lib/format';
import { neutral, status as tones } from '../../theme/tokens';
import type { DamageCategory, Vehicle, VehicleState } from '../../types';

/**
 * The one place a bike changes state by hand.
 *
 * Outcome is chosen first, because it determines what else the form needs:
 * "no work needed" asks for nothing more, the other two ask for a category, a
 * technician and notes. Showing all of it at once is how the paper process
 * ended up with half-filled forms.
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

export function Inspection() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [outcome, setOutcome] = useState<VehicleState>('UNDER_REPAIR');
  const [category, setCategory] = useState<DamageCategory>('MINOR');
  const [technician, setTechnician] = useState(TECHNICIANS[0]);
  const [notes, setNotes] = useState('');
  const [saved, setSaved] = useState<string | null>(null);

  const options = useQuery({ queryKey: ['vehicles', 'inspectable'], queryFn: listInspectableVehicles });

  // Deep link from a vehicle's detail page: ?vehicle=BLRSS0388
  const preselected = params.get('vehicle');
  const resolved = useMemo(() => {
    if (vehicle) return vehicle;
    if (!preselected) return null;
    return options.data?.find((v) => v.id === preselected) ?? null;
  }, [vehicle, preselected, options.data]);

  const save = useMutation({
    mutationFn: () =>
      recordInspection({
        vehicleId: resolved!.id,
        category: outcome === 'READY_TO_DEPLOY' ? 'NONE' : category,
        notes,
        estimatedCostPaise: null,
        nextState: outcome,
      }),
    onSuccess: (v) => {
      invalidateVehicles(queryClient);
      setSaved(`${v.id} moved to ${VEHICLE_STATE_LABEL[v.state]}.`);
      setVehicle(null);
      setNotes('');
    },
  });

  const needsWorkshop = outcome !== 'READY_TO_DEPLOY';

  return (
    <>
      <PageHeader
        section="Workshop"
        title="Inspection and state change"
        actions={
          <>
            <Button color="inherit" onClick={() => navigate('/vehicles')}>
              Cancel
            </Button>
            <Button
              onClick={() => save.mutate()}
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
            <Autocomplete
              options={options.data ?? []}
              value={resolved}
              onChange={(_, next) => setVehicle(next)}
              getOptionLabel={(v) => `${v.id} — ${v.model}`}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              renderInput={(p) => <TextField {...p} label="Vehicle id" placeholder="Search a bike" />}
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

              <TextField
                label="Notes"
                multiline
                minRows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
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
                  {resolved.model} · {resolved.batteryType === 'SWAPPABLE' ? 'Sun Mobility' : 'Fixed pack'}
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
    </>
  );
}
