import Box from '@mui/material/Box';
import type { ReactNode } from 'react';
import { neutral } from '../theme/tokens';

export interface Column<R> {
  key: string;
  header: string;
  align?: 'left' | 'right';
  /**
   * A width *weight*, not a hard size. Columns are laid out as percentages of
   * the table, so a column declared 200 simply gets twice the share of one
   * declared 100. Left off, the column takes an average share.
   */
  width?: string | number;
  /** Let this cell wrap onto a second line instead of truncating. */
  wrap?: boolean;
  render: (row: R) => ReactNode;
}

/** The share a column with no declared width asks for. */
const DEFAULT_WEIGHT = 140;

/**
 * A static table for the small, fixed lists inside a panel — assignment
 * history, a QC queue, an import preview.
 *
 * DataTable (the DataGrid) is for the paginated list screens; reaching for it
 * here would bring virtualisation and a footer to render four rows. This gives
 * the same type, rules and alignment without any of that.
 *
 * It never scrolls sideways. Declared widths are turned into percentages of
 * the table so the columns always add up to exactly the space available, and
 * a cell that runs out of room truncates rather than pushing the table wider.
 * A horizontal scrollbar inside a page is the thing operators complain about
 * first, so the trade is made here once instead of per screen.
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
  // Percentages, so the columns divide the table rather than overflow it.
  const weights = columns.map((c) => (typeof c.width === 'number' ? c.width : DEFAULT_WEIGHT));
  const totalWeight = weights.reduce((t, w) => t + w, 0) || 1;

  return (
    <Box sx={{ width: '100%', maxWidth: '100%', overflowX: 'clip' }}>
      <Box
        component="table"
        sx={{
          width: '100%',
          tableLayout: 'fixed',
          borderCollapse: 'collapse',
          fontSize: 13.5,
        }}
      >
        <Box component="colgroup">
          {columns.map((c, i) => (
            <Box
              component="col"
              key={c.key}
              sx={{ width: `${((weights[i] / totalWeight) * 100).toFixed(4)}%` }}
            />
          ))}
        </Box>
        <Box component="thead">
          <Box component="tr">
            {columns.map((c, i) => (
              <Box
                component="th"
                key={c.key}
                sx={{
                  textAlign: c.align ?? 'left',
                  fontSize: 10.5,
                  letterSpacing: '0.07em',
                  textTransform: 'uppercase',
                  fontWeight: 400,
                  color: neutral[500],
                  py: 2.5,
                  // Extra room at the extreme ends so the outer columns are not
                  // flush against the table edge.
                  pl: i === 0 ? 3 : 1.5,
                  pr: i === columns.length - 1 ? 3 : 1.5,
                  borderBottom: `1px solid ${neutral[900]}`,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
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
              {columns.map((c, j) => (
                <Box
                  component="td"
                  key={c.key}
                  sx={{
                    textAlign: c.align ?? 'left',
                    py: 2.5,
                    pl: j === 0 ? 3 : 1.5,
                    pr: j === columns.length - 1 ? 3 : 1.5,
                    borderBottom: `1px solid ${neutral[900]}`,
                    verticalAlign: 'middle',
                    overflow: 'hidden',
                    ...(c.wrap
                      ? {}
                      : { whiteSpace: 'nowrap', textOverflow: 'ellipsis' }),
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
