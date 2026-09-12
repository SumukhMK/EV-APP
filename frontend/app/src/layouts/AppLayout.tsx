import { Suspense, useState } from 'react';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import MenuIcon from '@mui/icons-material/MenuOutlined';
import { useLocation } from 'react-router-dom';
import { Outlet } from 'react-router-dom';
import { FleetNav } from './FleetNav';
import { ModeToggle } from '../components/ModeToggle';
import { RouteFallback } from '../components/RouteFallback';
import { base, layout, neutral } from '../theme/tokens';
import { railCollapse, riseIn } from '../theme/motion';

/** Where the rail's open/closed choice is remembered. */
const NAV_KEY = 'fleetech-nav';

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
  // Open by default, and remembered after that. The rail is where the product
  // is navigated from, so a first-time user should never have to find it; an
  // operator who has collapsed it once should not have to do so every morning.
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(NAV_KEY) === 'collapsed';
    } catch {
      return false;
    }
  });
  const location = useLocation();

  const toggleCollapsed = () =>
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(NAV_KEY, next ? 'collapsed' : 'open');
      } catch {
        // A private window that refuses storage still gets a working rail.
      }
      return next;
    });

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <Box
        sx={{
          display: { xs: 'none', md: 'block' },
          flex: `0 0 ${collapsed ? layout.navWidthCollapsed : layout.navWidth}px`,
          ...railCollapse,
        }}
      >
        <FleetNav collapsed={collapsed} onToggleCollapse={toggleCollapsed} />
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
            // A declared height, not whatever the icon button happens to
            // measure: the page header pins itself directly beneath this bar
            // and both read `layout.topBar` to agree on where that is.
            height: layout.topBar,
            flex: `0 0 ${layout.topBar}px`,
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
              each screen arrives rather than blinks into place.

              The Suspense boundary sits here rather than around the whole
              shell: every screen is a lazily-imported chunk, and a boundary
              any higher would unmount the rail and the mode toggle each time
              one loaded — a full-page flash instead of a column swap. */}
          <Box key={location.pathname} sx={riseIn()}>
            <Suspense fallback={<RouteFallback />}>
              <Outlet />
            </Suspense>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
