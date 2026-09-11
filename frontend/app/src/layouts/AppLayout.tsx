import { useState } from 'react';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import MenuIcon from '@mui/icons-material/MenuOutlined';
import { useLocation } from 'react-router-dom';
import { Outlet } from 'react-router-dom';
import { FleetNav } from './FleetNav';
import { ModeToggle } from '../components/ModeToggle';
import { base, layout, neutral } from '../theme/tokens';
import { riseIn } from '../theme/motion';

/**
 * Two shells, one nav.
 *
 * From `md` up the rail is permanent and the content centres in what is left
 * of it — capped at `contentMax` rather than at the artboard's 1180, so a wide
 * display fills instead of leaving a third of itself empty.
 *
 * Below `md` the rail becomes a temporary drawer behind a slim top bar. Fleet
 * staff do open this on a phone to check a bike, and a 232px rail on a 390px
 * screen leaves nothing for the table.
 */
export function AppLayout() {
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <Box sx={{ display: { xs: 'none', md: 'block' }, flex: `0 0 ${layout.navWidth}px` }}>
        <FleetNav />
      </Box>

      <Drawer
        open={navOpen}
        onClose={() => setNavOpen(false)}
        // Closing on every navigation is what makes the drawer usable — without
        // it the user taps a link and stares at the menu they just used.
        key={location.pathname}
        slotProps={{ paper: { sx: { border: 0, backgroundImage: 'none' } } }}
        sx={{ display: { xs: 'block', md: 'none' } }}
      >
        <FleetNav onNavigate={() => setNavOpen(false)} />
      </Drawer>

      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Box
          sx={{
            display: { xs: 'flex', md: 'none' },
            alignItems: 'center',
            gap: 2,
            px: 4,
            py: 3,
            borderBottom: `1px solid ${neutral[900]}`,
            position: 'sticky',
            top: 0,
            zIndex: 10,
            bgcolor: 'background.default',
          }}
        >
          <IconButton onClick={() => setNavOpen(true)} aria-label="Open navigation">
            <MenuIcon sx={{ fontSize: 20 }} />
          </IconButton>
          <Typography sx={{ fontSize: 16, fontWeight: 500 }}>
            FleeTech <Box component="span" sx={{ color: base.accent }}>OS</Box>
          </Typography>
          <Box sx={{ flex: 1 }} />
          <ModeToggle />
        </Box>

        {/* Appearance sits top-right on every screen, where a user looks for it.
            On mobile it rides in the bar above; from md up the bar is gone, so
            the control gets its own strip aligned to the content column. */}
        <Box
          sx={{
            display: { xs: 'none', md: 'flex' },
            justifyContent: 'flex-end',
            width: '100%',
            maxWidth: layout.contentMax,
            mx: 'auto',
            px: { xs: 4, sm: 6, lg: 8 },
            pt: 4,
          }}
        >
          <ModeToggle />
        </Box>

        <Box
          component="main"
          sx={{
            width: '100%',
            maxWidth: layout.contentMax,
            mx: 'auto',
            px: { xs: 4, sm: 6, lg: 8 },
            pt: { xs: 4, md: 2 },
            pb: 16,
          }}
        >
          {/* Keyed on the path so the fade-up replays on every navigation —
              each screen arrives rather than blinks into place. */}
          <Box key={location.pathname} sx={riseIn()}>
            <Outlet />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
