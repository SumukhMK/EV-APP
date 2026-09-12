import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import type { SvgIconComponent } from '@mui/icons-material';
import { accent, layout, neutral } from '../theme/tokens';

/**
 * The header band every screen opens with: a tracked-out section label, the
 * screen title, and the screen's actions on the right, over a hairline rule.
 * An optional icon sits in an accent-tinted tile beside the title, so a screen
 * has a face and the rail's glyph is echoed on the page it opens.
 *
 * **It sticks.** Payment run is a hundred rows and rider onboarding is four
 * steps deep; scroll either and the old header took the screen's name and its
 * Save and Cancel with it, so the operator had to scroll back up to commit
 * work they had just finished. Pinning the band keeps the answer to "where am
 * I" and "how do I finish" on screen the whole way down.
 *
 * Below `md` it pins under the mobile bar rather than at the viewport top —
 * `layout.topBar` is the one number both of them read.
 */
export function PageHeader({
  section,
  title,
  icon: Icon,
  actions,
  meta,
}: {
  section: string;
  title: ReactNode;
  icon?: SvgIconComponent;
  actions?: ReactNode;
  /** Right-hand text used where a screen has no actions, e.g. the clock on the dashboard. */
  meta?: ReactNode;
}) {
  return (
    <Box
      component="header"
      sx={{
        position: 'sticky',
        top: { xs: `${layout.topBar}px`, md: 0 },
        // Above the page content it covers, below the mobile bar it tucks under.
        zIndex: 5,
        // Opaque, or the rows scrolling beneath show through the band.
        bgcolor: 'background.default',
        display: 'flex',
        // Stacks below sm so a long title and three actions do not squeeze
        // each other into two words per line.
        flexDirection: { xs: 'column', sm: 'row' },
        alignItems: { xs: 'flex-start', sm: 'flex-end' },
        justifyContent: 'space-between',
        gap: { xs: 4, sm: 6 },
        // Tighter once pinned than the artboard's 24px, because that padding is
        // now permanent screen real estate rather than a one-off at the top.
        pt: { xs: 4, md: 5 },
        pb: 3.5,
        borderBottom: `1px solid ${neutral[900]}`,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 3.5 }}>
        {Icon && (
          <Box
            aria-hidden
            sx={{
              flex: '0 0 auto',
              width: 40,
              height: 40,
              borderRadius: 2,
              display: 'grid',
              placeItems: 'center',
              color: accent[200],
              background: accent[900],
              border: `1px solid ${accent[800]}`,
              '& svg': { fontSize: 20 },
            }}
          >
            <Icon />
          </Box>
        )}
        <Box>
          <Typography variant="overline">{section}</Typography>
          <Typography variant="h3" sx={{ mt: '2px', fontSize: { xs: 22, sm: 25, xl: 28 } }}>
            {title}
          </Typography>
        </Box>
      </Box>
      {actions ? (
        <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', rowGap: 2 }}>
          {actions}
        </Stack>
      ) : null}
      {meta}
    </Box>
  );
}
