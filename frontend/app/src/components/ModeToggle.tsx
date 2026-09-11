import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import { useColorScheme } from '@mui/material/styles';
import DarkIcon from '@mui/icons-material/DarkModeOutlined';
import LightIcon from '@mui/icons-material/LightModeOutlined';
import { base, mix, neutral, radius } from '../theme/tokens';

/**
 * Day / night.
 *
 * MUI persists the choice and restores it before first paint, so there is no
 * flash of the wrong scheme on reload. `mode` is undefined on the server pass
 * and on the very first client render — rendering the control anyway, but
 * inert, keeps the rail from shifting under the cursor once it resolves.
 */
export function ModeToggle() {
  const { mode, setMode } = useColorScheme();
  const isLight = mode === 'light';

  return (
    <Box
      sx={{
        display: 'inline-flex',
        gap: '2px',
        p: '2px',
        borderRadius: radius.md,
        border: `1px solid ${neutral[900]}`,
        background: base.raised,
      }}
    >
      {(
        [
          ['dark', DarkIcon, 'Night — the signed-off Nocturne'],
          ['light', LightIcon, 'Day — Saffron'],
        ] as const
      ).map(([value, Icon, hint]) => {
        const on = value === 'light' ? isLight : !isLight;
        return (
          <Tooltip key={value} title={hint} placement="top">
            <IconButton
              size="small"
              aria-label={hint}
              aria-pressed={on}
              onClick={() => setMode(value)}
              sx={{
                p: '4px',
                borderRadius: radius.sm,
                color: on ? base.accent : neutral[600],
                background: on ? mix(base.accent, 14) : 'transparent',
                '&:hover': { background: mix(base.accent, on ? 20 : 8) },
              }}
            >
              <Icon sx={{ fontSize: 15 }} />
            </IconButton>
          </Tooltip>
        );
      })}
    </Box>
  );
}
