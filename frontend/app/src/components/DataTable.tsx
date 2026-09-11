import Box from '@mui/material/Box';
import { DataGrid } from '@mui/x-data-grid';
import type { DataGridProps, GridRowIdGetter, GridValidRowModel } from '@mui/x-data-grid';
import { base, fonts, mix, neutral } from '../theme/tokens';

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
    <Box sx={{ width: '100%', maxWidth: '100%' }}>
      <DataGrid<R>
        rows={rows}
        density="standard"
        disableColumnMenu
        disableRowSelectionOnClick
        rowHeight={42}
        columnHeaderHeight={36}
        localeText={{ noRowsLabel: emptyMessage }}
        sx={[
          {
            border: 0,
            fontSize: 13.5,
            color: 'text.primary',
            '--DataGrid-rowBorderColor': 'transparent',

            // The grid never scrolls sideways. Columns are sized with `flex`
            // by the list screens so they divide the width instead of
            // overflowing it; this is the backstop that keeps a stray fixed
            // width from reintroducing the scrollbar operators complain about.
            '& .MuiDataGrid-virtualScroller': { overflowX: 'hidden' },
            '& .MuiDataGrid-main': { overflow: 'hidden' },

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
              color: mix(base.text, 60),
            },
            '& .MuiDataGrid-columnSeparator': { display: 'none' },
            '& .MuiDataGrid-columnHeaderRow, & [role="row"]:has(.MuiDataGrid-columnHeader)': {
              background: fadingRule(mix(base.text, 16)),
            },

            '& .MuiDataGrid-cell': {
              padding: '0 6px',
              borderBottom: 0,
              '&:focus, &:focus-within': { outline: 'none' },
            },

            // Breathing room at the extreme ends so the first and last columns
            // do not butt against the table edge — the content then lines up
            // with where the row rule fades in rather than hugging the border.
            '& .MuiDataGrid-columnHeader:first-of-type, & .MuiDataGrid-cell:first-of-type': {
              paddingLeft: '22px',
            },
            '& .MuiDataGrid-columnHeader:last-of-type, & .MuiDataGrid-cell:last-of-type': {
              paddingRight: '22px',
            },

            '& .MuiDataGrid-row': {
              background: fadingRule(mix(base.text, 8)),
              '&:hover': {
                background: `linear-gradient(${mix(base.text, 4)}, ${mix(base.text, 4)}) no-repeat 0 0 / 100% 100%, ${fadingRule(mix(base.text, 8))}`,
              },
              '&.Mui-selected, &.Mui-selected:hover': {
                background: `linear-gradient(${mix(base.accent, 10)}, ${mix(base.accent, 10)}) no-repeat 0 0 / 100% 100%, ${fadingRule(mix(base.text, 8))}`,
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
