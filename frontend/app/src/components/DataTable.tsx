import Box from '@mui/material/Box';
import { DataGrid } from '@mui/x-data-grid';
import type { DataGridProps, GridRowIdGetter, GridValidRowModel } from '@mui/x-data-grid';
import { alpha } from '@mui/material/styles';
import { base, fonts, neutral } from '../theme/tokens';

/**
 * Every list screen renders through this. One wrapper means sorting, paging,
 * density, empty and loading states behave identically on all of them, and
 * Nocturne's table treatment is defined once.
 *
 * The signature detail is the row rule: a hairline that fades out over the
 * last 48px at each end rather than butting into the table edge. It is drawn
 * as a row-level background so it spans the row instead of each cell.
 */

const fadingRule = (colour: string) =>
  `linear-gradient(to right, transparent, ${colour} 48px, ${colour} calc(100% - 48px), transparent) no-repeat bottom / 100% 1px`;

export interface DataTableProps<R extends GridValidRowModel> extends Omit<DataGridProps<R>, 'rows'> {
  rows: R[];
  getRowId?: GridRowIdGetter<R>;
  /** Rendered in place of the grid body when there are no rows. */
  emptyMessage?: string;
}

export function DataTable<R extends GridValidRowModel>({
  rows,
  emptyMessage = 'Nothing to show',
  sx,
  ...rest
}: DataTableProps<R>) {
  return (
    <Box sx={{ width: '100%' }}>
      <DataGrid<R>
        rows={rows}
        density="standard"
        disableColumnMenu
        disableRowSelectionOnClick
        rowHeight={44}
        columnHeaderHeight={38}
        localeText={{ noRowsLabel: emptyMessage }}
        sx={[
          {
            border: 0,
            fontSize: 14,
            color: 'text.primary',
            '--DataGrid-rowBorderColor': 'transparent',

            '& .MuiDataGrid-columnHeaders': { borderBottom: 0 },
            '& .MuiDataGrid-columnHeader': {
              padding: '0 6px',
              '&:focus, &:focus-within': { outline: 'none' },
            },
            '& .MuiDataGrid-columnHeaderTitle': {
              fontSize: 11,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              fontWeight: 400,
              color: alpha(base.text, 0.6),
            },
            '& .MuiDataGrid-columnSeparator': { display: 'none' },
            '& .MuiDataGrid-columnHeaderRow, & [role="row"]:has(.MuiDataGrid-columnHeader)': {
              background: fadingRule(alpha(base.text, 0.16)),
            },

            '& .MuiDataGrid-cell': {
              padding: '0 6px',
              borderBottom: 0,
              '&:focus, &:focus-within': { outline: 'none' },
            },
            '& .MuiDataGrid-row': {
              background: fadingRule(alpha(base.text, 0.08)),
              '&:hover': {
                background: `linear-gradient(${alpha(base.text, 0.04)}, ${alpha(base.text, 0.04)}) no-repeat 0 0 / 100% 100%, ${fadingRule(alpha(base.text, 0.08))}`,
              },
              '&.Mui-selected, &.Mui-selected:hover': {
                background: `linear-gradient(${alpha(base.accent, 0.1)}, ${alpha(base.accent, 0.1)}) no-repeat 0 0 / 100% 100%, ${fadingRule(alpha(base.text, 0.08))}`,
              },
            },

            '& .MuiDataGrid-footerContainer': {
              borderTop: 0,
              minHeight: 44,
              fontFamily: fonts.mono,
              color: neutral[500],
            },
            '& .MuiTablePagination-root': { fontSize: 12, color: neutral[500] },
            '& .MuiDataGrid-overlay': { background: 'transparent', color: neutral[500], fontSize: 14 },
          },
          ...(Array.isArray(sx) ? sx : [sx]),
        ]}
        {...rest}
      />
    </Box>
  );
}
