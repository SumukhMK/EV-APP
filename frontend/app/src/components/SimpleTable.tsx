import Box from '@mui/material/Box';
import type { ReactNode } from 'react';
import { neutral } from '../theme/tokens';

export interface Column<R> {
  key: string;
  header: string;
  align?: 'left' | 'right';
  /** Any CSS width. Left off, the column takes its share of what is left. */
  width?: string | number;
  render: (row: R) => ReactNode;
}

/**
 * A static table for the small, fixed lists inside a panel — assignment
 * history, a QC queue, an import preview.
 *
 * DataTable (the DataGrid) is for the paginated list screens; reaching for it
 * here would bring virtualisation and a footer to render four rows. This gives
 * the same type, rules and alignment without any of that.
 */
export function SimpleTable<R>({
  columns,
  rows,
  getRowKey,
  rowSx,
}: {
  columns: Column<R>[];
  rows: R[];
  getRowKey: (row: R, index: number) => string;
  /** Per-row styling, e.g. tinting an import row that failed validation. */
  rowSx?: (row: R) => object | undefined;
}) {
  return (
    <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, tableLayout: 'fixed' }}>
      <Box component="colgroup">
        {columns.map((c) => (
          <Box component="col" key={c.key} sx={c.width ? { width: c.width } : undefined} />
        ))}
      </Box>
      <Box component="thead">
        <Box component="tr">
          {columns.map((c) => (
            <Box
              component="th"
              key={c.key}
              sx={{
                textAlign: c.align ?? 'left',
                fontSize: 11,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                fontWeight: 400,
                color: neutral[500],
                py: 3,
                px: 2,
                borderBottom: `1px solid ${neutral[900]}`,
                whiteSpace: 'nowrap',
              }}
            >
              {c.header}
            </Box>
          ))}
        </Box>
      </Box>
      <Box component="tbody">
        {rows.map((row, i) => (
          <Box component="tr" key={getRowKey(row, i)} sx={rowSx?.(row)}>
            {columns.map((c) => (
              <Box
                component="td"
                key={c.key}
                sx={{
                  textAlign: c.align ?? 'left',
                  py: 3,
                  px: 2,
                  borderBottom: `1px solid ${neutral[900]}`,
                  verticalAlign: 'middle',
                }}
              >
                {c.render(row)}
              </Box>
            ))}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
