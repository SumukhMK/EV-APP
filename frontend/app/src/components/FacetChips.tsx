import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import { base, fonts, neutral } from '../theme/tokens';

export interface FacetOption<V extends string> {
  value: V;
  label: string;
  count: number;
}

/**
 * The counted filter row above a list. Deliberately not MUI Chips: these are
 * a segmented filter, and the outlined-square treatment reads as one control
 * rather than as removable tags.
 */
export function FacetChips<V extends string>({
  options,
  value,
  onChange,
}: {
  options: FacetOption<V>[];
  value: V;
  onChange: (next: V) => void;
}) {
  return (
    <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <ButtonBase
            key={o.value}
            onClick={() => onChange(o.value)}
            sx={{
              fontFamily: fonts.mono,
              fontVariantNumeric: 'tabular-nums',
              fontSize: 12,
              px: '11px',
              py: '5px',
              borderRadius: '5px',
              background: 'transparent',
              border: `1px solid ${selected ? base.accent : neutral[800]}`,
              color: selected ? base.accent : neutral[400],
              transition: 'color 120ms, border-color 120ms',
              '&:hover': { borderColor: selected ? base.accent : neutral[700], color: selected ? base.accent : neutral[300] },
            }}
          >
            {o.label} {o.count}
          </ButtonBase>
        );
      })}
    </Box>
  );
}
