import { useState } from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { Mono } from '../../../components/Mono';
import type { Rider } from '../../../types';

/**
 * Pick a rider by any of the four things the hubs remember about them — id,
 * name, mobile, or the bike they are holding — and submit their id.
 *
 * The prototype's search promises all four, and `RecordSearchSelect` (SMK's
 * Task 3 component) only matches id and name, so this wrapper lives in the
 * assignments folder and does the wider match itself. The caller owns the
 * query and passes the riders; filtering is done here so the placeholder and
 * the behaviour cannot drift apart.
 */
export function RiderSearchSelect({
  label,
  placeholder,
  value,
  onChange,
  riders,
  loading,
  error,
  note,
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (riderId: string) => void;
  riders: readonly Rider[];
  loading?: boolean;
  error?: string;
  note?: string;
}) {
  const [query, setQuery] = useState('');
  const selected = riders.find((r) => r.id === value) ?? null;

  const q = query.trim().toLowerCase();
  const filtered =
    q === ''
      ? riders
      : riders.filter(
          (r) =>
            r.id.toLowerCase().includes(q) ||
            r.name.toLowerCase().includes(q) ||
            r.phone.includes(q) ||
            (r.currentVehicleId ?? '').toLowerCase().includes(q),
        );

  return (
    <Box>
      <Autocomplete
        value={selected}
        onChange={(_, next) => onChange(next?.id ?? '')}
        onInputChange={(_, next) => setQuery(next)}
        options={filtered as Rider[]}
        // The options are already filtered above; MUI's own filter would drop
        // phone and vehicle-id matches because they are not in the label.
        filterOptions={(options) => options}
        loading={loading}
        noOptionsText="No matching riders"
        isOptionEqualToValue={(a, b) => a.id === b.id}
        getOptionLabel={(r) => `${r.id} · ${r.name}`}
        renderOption={(props, r) => (
          <Box component="li" {...props} key={r.id}>
            <Box sx={{ display: 'flex', width: '100%', gap: 3, alignItems: 'baseline' }}>
              <Mono sx={{ fontSize: 12 }}>{r.id}</Mono>
              <Typography sx={{ fontSize: 13, flex: 1 }}>{r.name}</Typography>
              <Typography sx={{ fontSize: 12, color: 'grey.500' }}>{r.phone}</Typography>
              <Mono sx={{ fontSize: 12, color: 'grey.500' }}>{r.currentVehicleId ?? '—'}</Mono>
            </Box>
          </Box>
        )}
        renderInput={(params) => (
          <TextField
            {...params}
            label={label}
            placeholder={placeholder}
            error={Boolean(error)}
            helperText={error}
          />
        )}
      />
      {note && !error && (
        <Typography sx={{ fontSize: 12, color: 'grey.500', mt: 2 }}>{note}</Typography>
      )}
    </Box>
  );
}