import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import PaletteIcon from '@mui/icons-material/PaletteOutlined';
import { useColorScheme } from '@mui/material/styles';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { Mono } from '../../components/Mono';
import { StateChip } from '../../components/StateChip';
import { InfoStrip } from '../../components/InfoStrip';
import { ScaleMeter } from '../../components/ScaleMeter';
import { DefinitionList } from '../../components/DefinitionList';
import {
  accent,
  bandFor,
  base,
  chart,
  neutral,
  radius,
  scale,
  status,
  type ScaleBand,
  type StatusTone,
} from '../../theme/tokens';

const RAMP = [100, 200, 300, 400, 500, 600, 700, 800, 900] as const;
const TONES: StatusTone[] = ['accent', 'good', 'caution', 'warn', 'bad', 'neutral'];
const BANDS: ScaleBand[] = ['high', 'mid', 'low', 'risk'];

const TONE_MEANS: Record<StatusTone, string> = {
  accent: 'Deployed — the signature state',
  good: 'Ready, paid, healthy',
  caution: 'QC pending — queued, not wrong',
  warn: 'Under repair, recovery',
  bad: 'Accident, overdue',
  neutral: 'Inducted, returned, retired',
};

const BAND_MEANS: Record<ScaleBand, string> = {
  high: 'Working hard — 85% and up',
  mid: 'Acceptable — 55 to 84%',
  low: 'Slipping — 35 to 54%',
  risk: 'Act now — under 35%',
};

function Swatch({ label, value, tall }: { label: string; value: string; tall?: boolean }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Box
        sx={{
          height: tall ? 52 : 34,
          borderRadius: radius.sm,
          background: value,
          border: `1px solid ${neutral[900]}`,
        }}
      />
      <Box sx={{ fontSize: 10, color: neutral[500], mt: 1 }}>{label}</Box>
    </Box>
  );
}

/**
 * Every colour the product owns, on one screen.
 *
 * It exists so a change to `tokens.ts` can be seen rather than imagined, and
 * so the two schemes can be compared without clicking through twelve routes:
 * flip the toggle and everything here repaints, because none of it holds a
 * hex — it all reads the same custom properties the rest of the app does.
 */
export function DesignTokens() {
  const { mode } = useColorScheme();

  return (
    <>
      <PageHeader
        section="System"
        title="Design tokens"
        icon={PaletteIcon}
        meta={
          <Mono sx={{ fontSize: 12, color: neutral[500] }}>
            {mode === 'light' ? 'Saffron Day' : 'Nocturne Night'} · flip the toggle, top right
          </Mono>
        }
      />

      <Box sx={{ display: 'grid', gap: 5, mt: 5 }}>
        <Panel
          label="Intensity scale"
          subtitle="Magnitude, not state. Green → orange → yellow → red by day; by night purple stands in for orange and grey for yellow, so a dark dashboard ranks the same without turning into a fruit bowl."
        >
          <Box sx={{ display: 'grid', gap: 5, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
            <Box sx={{ display: 'grid', gap: 4 }}>
              {BANDS.map((b) => (
                <Box key={b} sx={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Box
                    sx={{
                      width: 46,
                      height: 30,
                      borderRadius: radius.sm,
                      background: scale[b].bar,
                      flex: '0 0 46px',
                    }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box
                      component="span"
                      sx={{
                        fontSize: 11,
                        fontWeight: 700,
                        px: 2,
                        py: '2px',
                        borderRadius: 100,
                        color: scale[b].fg,
                        background: scale[b].bg,
                        textTransform: 'capitalize',
                      }}
                    >
                      {b}
                    </Box>
                    <Box sx={{ fontSize: 12, color: neutral[500], mt: 1 }}>{BAND_MEANS[b]}</Box>
                  </Box>
                </Box>
              ))}
            </Box>

            {/* The same four bands doing the job they exist for. */}
            <Box sx={{ display: 'grid', gap: 5, alignContent: 'start' }}>
              <ScaleMeter label="Whitefield" percent={92} caption="Derived, not hardcoded" />
              <ScaleMeter label="HSR Layout" percent={71} />
              <ScaleMeter label="Koramangala" percent={44} />
              <ScaleMeter label="Hebbal" percent={23} />
            </Box>
          </Box>
        </Panel>

        <Panel
          label="Status tones"
          subtitle="Discrete states, wired to eight label maps. Kept separate from the scale because a warning must stay warm at night even though the scale's mid turns purple."
        >
          <Box
            sx={{
              display: 'grid',
              gap: 4,
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr 1fr 1fr' },
            }}
          >
            {TONES.map((t) => (
              <Box
                key={t}
                sx={{
                  border: `1px solid ${neutral[900]}`,
                  borderRadius: radius.md,
                  p: 3,
                  display: 'grid',
                  gap: 2,
                }}
              >
                <Box>
                  <StateChip label={t} tone={t} />
                </Box>
                <Box sx={{ fontSize: 12, color: neutral[500] }}>{TONE_MEANS[t]}</Box>
                <Mono sx={{ fontSize: 10, color: neutral[600] }}>
                  {`status.${t}`}
                </Mono>
              </Box>
            ))}
          </Box>
        </Panel>

        <Panel label="Neutrals" subtitle="Indexed by role, not lightness — 100 is always furthest from the page and 900 always nearest, which is what lets one token mean 'hairline' in both schemes.">
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: 2 }}>
            {RAMP.map((s) => (
              <Swatch key={s} label={String(s)} value={neutral[s]} />
            ))}
          </Box>
        </Panel>

        <Panel label="Accent" subtitle="Purple by night, green by day — green because amber cannot be read as small text on white without going muddy.">
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: 2 }}>
            {RAMP.map((s) => (
              <Swatch key={s} label={String(s)} value={accent[s]} />
            ))}
          </Box>
        </Panel>

        <Panel label="Surfaces and fills">
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' },
              gap: 3,
            }}
          >
            <Swatch tall label="base.bg" value={base.bg} />
            <Swatch tall label="base.bgDeep" value={base.bgDeep} />
            <Swatch tall label="base.surface" value={base.surface} />
            <Swatch tall label="base.raised" value={base.raised} />
            <Swatch tall label="base.accent" value={base.accent} />
            <Swatch tall label="base.fill" value={base.fill} />
            <Swatch tall label="base.divider" value={base.divider} />
            <Swatch tall label="base.inverseSurface" value={base.inverseSurface} />
          </Box>
        </Panel>

        <Panel
          label="Plot colours"
          subtitle="A bar takes the colour of the band it falls in, so a chart ranks itself. The bright saffrons are not used here: #FFD700 and #FFA500 measure 1.40 and 1.97 on white, and a data mark wants 3:1 — so plots use the deeper cut of the same hues, and the bright pair stay fills."
        >
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: 'repeat(3, 1fr)', sm: 'repeat(5, 1fr)' },
              gap: 3,
            }}
          >
            {BANDS.map((b) => (
              <Swatch key={b} tall label={`scale.${b}.bar`} value={scale[b].bar} />
            ))}
            <Swatch tall label="chart.current" value={chart.current} />
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 74, mt: 5 }}>
            {[38, 55, 32, 70, 86, 61, 47, 74, 100, 66, 52, 29].map((h, i, all) => (
              <Box
                key={h + '-' + i}
                sx={{
                  flex: 1,
                  height: `${h}%`,
                  background: i === all.length - 1 ? chart.current : scale[bandFor(h)].bar,
                }}
              />
            ))}
          </Box>
          <Box sx={{ fontSize: 11, color: neutral[500], mt: 2 }}>
            The last bar is the period still running, held out of the banding — a partial figure is
            not a bad month.
          </Box>
        </Panel>

        <Panel label="Controls" subtitle="The same components every screen uses, so a token change is visible here before it is discovered somewhere else.">
          <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center' }}>
            <Button>Default</Button>
            <Button color="inherit">Inherit</Button>
            <Button variant="contained">Commit action</Button>
            <Button disabled>Disabled</Button>
            <Tooltip title="Tooltips invert against the page in both schemes">
              <Button>Hover me</Button>
            </Tooltip>
          </Box>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
              gap: 5,
              mt: 5,
            }}
          >
            <TextField label="Text field" defaultValue="BLRSS0428" />
            <TextField label="With an error" defaultValue="bad value" error helperText="Something is wrong" />
          </Box>

          <Box sx={{ mt: 5 }}>
            <InfoStrip>An info strip, for the notes that qualify a control.</InfoStrip>
          </Box>

          <Box sx={{ mt: 5 }}>
            <DefinitionList
              divider="top"
              columns={2}
              items={[
                { label: 'Mono figure', value: <Mono sx={{ fontSize: 13 }}>₹1,400</Mono> },
                { label: 'Negative', value: <Mono sx={{ fontSize: 13, color: status.bad.fg }}>−₹2,500</Mono> },
                { label: 'Healthy', value: <Mono sx={{ fontSize: 13, color: status.good.fg }}>92%</Mono> },
                { label: 'Muted', value: <Typography sx={{ fontSize: 13, color: neutral[500] }}>Settled</Typography> },
              ]}
            />
          </Box>
        </Panel>
      </Box>
    </>
  );
}
