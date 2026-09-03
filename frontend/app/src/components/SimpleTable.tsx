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
/** A column with no declared width still needs room for its content. */
const FLEXIBLE_COLUMN_WIDTH = 180;

export function SimpleTable<R>({
  columns,
  rows,
  getRowKey,
  rowSx,
  minWidth,
}: {
  columns: Column<R>[];
  rows: R[];
  getRowKey: (row: R, index: number) => string;
  /** Per-row styling, e.g. tinting an import row that failed validation. */
  rowSx?: (row: R) => object | undefined;
  /** Override the derived scroll threshold. Rarely needed. */
  minWidth?: number;
}) {
  // Derived, not guessed. `table-layout: fixed` honours the colgroup even when
  // the declared widths exceed the table, and the columns then overlap rather
  // than overflow — so the threshold has to be at least what the columns ask
  // for. Getting this wrong is invisible until someone opens a phone.
  const derivedMinWidth = columns.reduce(
    (total, c) => total + (typeof c.width === 'number' ? c.width : FLEXIBLE_COLUMN_WIDTH),
    0,
  );

  return (
    // The scroll lives on the table, not the page: a narrow screen should
    // still scroll the document vertically without the whole layout sliding.
    <Box sx={{ width: '100%', overflowX: 'auto' }}>
      <Box
        component="table"
        sx={{
          width: '100%',
          minWidth: minWidth ?? derivedMinWidth,
          borderCollapse: 'collapse',
          fontSize: 14,
          tableLayout: 'fixed',
        }}
      >
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
    </Box>
  );
}
