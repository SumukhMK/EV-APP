import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { Mono } from './Mono';

export interface SearchableRecord {
  /** What the form actually submits. */
  id: string;
  primary: string;
  secondary?: string;
  trailing?: string;
}

/**
 * Pick a record by typing any of the things people remember about it — an id,
 * a name, a phone number, the bike it is holding — and submit its id.
 *
 * The prototype hangs a hidden id field beside every one of these searches for
 * exactly this reason: the operator searches by "Ramesh" and the request has
 * to carry `R014`. Keeping that pairing here means no form has to remember to
 * do it. Filtering is the caller's job — it owns the query and knows which
 * fields the server matches on.
 */
export function RecordSearchSelect({
  label,
  placeholder,
  value,
  onChange,
  options,
  loading,
  error,
  note,
  emptyText = 'No matching records',
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (id: string) => void;
  options: readonly SearchableRecord[];
  loading?: boolean;
  error?: string;
  note?: string;
  emptyText?: string;
}) {
  const selected = options.find((o) => o.id === value) ?? null;

  return (
    <Box>
      <Autocomplete
        value={selected}
        onChange={(_, next) => onChange(next?.id ?? '')}
        options={options as SearchableRecord[]}
        loading={loading}
        noOptionsText={emptyText}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        getOptionLabel={(o) => `${o.id} · ${o.primary}`}
        renderOption={(props, o) => (
          <Box component="li" {...props} key={o.id}>
            <Box sx={{ display: 'flex', width: '100%', gap: 3, alignItems: 'baseline' }}>
              <Mono sx={{ fontSize: 12 }}>{o.id}</Mono>
              <Typography sx={{ fontSize: 13, flex: 1 }}>{o.primary}</Typography>
              {o.secondary && (
                <Typography sx={{ fontSize: 12, color: 'grey.500' }}>{o.secondary}</Typography>
              )}
              {o.trailing && <Mono sx={{ fontSize: 12, color: 'grey.500' }}>{o.trailing}</Mono>}
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
