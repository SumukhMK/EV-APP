import Box from '@mui/material/Box';
import { Mono } from './Mono';
import { shortId } from '../lib/shortId';

export function EntityId({ id, sx }: { id: string | null | undefined; sx?: object }) {
  if (!id) return null;
  return (
    <Mono title={id} sx={{ whiteSpace: 'nowrap', ...sx }}>
      {shortId(id)}
    </Mono>
  );
}

/**
 * A name with its id underneath, for a cell that has to identify a record.
 *
 * The name takes the room and truncates last; the id is secondary by size and
 * colour. This is the ordering the screens are meant to have — an operator
 * knows a rider by name and a bike by its registry id, never by a uuid.
 */
export function NamedRef({
  name,
  id,
  fallback = 'Unnamed',
}: {
  name: string | null | undefined;
  id: string | null | undefined;
  fallback?: string;
}) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Box
        component="span"
        title={name ?? undefined}
        sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {name || fallback}
      </Box>
      {id && (
        <EntityId id={id} sx={{ display: 'block', fontSize: 11, color: 'text.secondary' }} />
      )}
    </Box>
  );
}
