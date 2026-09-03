import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { neutral } from '../theme/tokens';
import { Mono } from './Mono';

/**
 * The pagination row from the wireframe: a plain count on the left, Previous
 * and Next on the right. Used instead of the DataGrid's own footer so every
 * list paginates the same way and reads in words rather than in icons.
 */
export function TableFooter({
  page,
  pageSize,
  total,
  onPageChange,
  noun = 'rows',
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (next: number) => void;
  noun?: string;
}) {
  const first = total === 0 ? 0 : page * pageSize + 1;
  const last = Math.min((page + 1) * pageSize, total);
  const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1);

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 4 }}>
      <Mono sx={{ fontSize: 12, color: neutral[500] }}>
        {total === 0 ? `No ${noun}` : `Showing ${first}–${last} of ${total}`}
      </Mono>
      <Box sx={{ display: 'flex', gap: 1.5 }}>
        <Button color="inherit" disabled={page === 0} onClick={() => onPageChange(page - 1)}>
          Previous
        </Button>
        <Button color="inherit" disabled={page >= lastPage} onClick={() => onPageChange(page + 1)}>
          Next
        </Button>
      </Box>
    </Box>
  );
}
