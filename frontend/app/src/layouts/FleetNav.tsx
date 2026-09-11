import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeftOutlined';
import ChevronRightIcon from '@mui/icons-material/ChevronRightOutlined';
import { NavLink } from 'react-router-dom';
import { navForRole } from '../app/nav';
import { USER_ROLE_LABEL } from '../lib/labels';
import { base, layout, mix, neutral, radius } from '../theme/tokens';
import { railCollapse, railLabel } from '../theme/motion';
import { useSession } from '../app/sessionContext';

/** Initials for the collapsed persona button — two words at most. */
function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * The fixed left rail. Sections are labelled rather than separated by rules —
 * a dark ground already reads as grouped, and rules would compete with the
 * table rules that are the product's actual signature.
 *
 * The rail is filtered to the current role, so a service manager and a fleet
 * hand see only the screens their job touches. The persona switch at the foot
 * is a demo affordance — it stands in for logging in as a different person and
 * disappears the day real auth arrives.
 *
 * Collapsed, it keeps the icons rather than disappearing: a rail that closes to
 * nothing has to be reopened from a button that is no longer on screen, and the
 * icons alone are enough to navigate once the shape of the app is familiar.
 * Every label then moves into a tooltip, so nothing becomes unreachable.
 */
export function FleetNav({
  onNavigate,
  collapsed = false,
  onToggleCollapse,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
  /** Omitted in the mobile drawer, where the rail is never collapsed. */
  onToggleCollapse?: () => void;
} = {}) {
  const { user, tenant, personas, switchPersona } = useSession();
  const sections = navForRole(user.roleKey);

  return (
    <Box
      component="nav"
      sx={{
        width: collapsed ? layout.navWidthCollapsed : layout.navWidth,
        minHeight: '100vh',
        bgcolor: 'background.default',
        display: 'flex',
        flexDirection: 'column',
        borderRight: `1px solid ${neutral[900]}`,
        px: collapsed ? 2 : 3.5,
        py: 6,
        position: 'sticky',
        top: 0,
        alignSelf: 'flex-start',
        height: '100vh',
        overflowX: 'hidden',
        ...railCollapse,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: collapsed ? 'center' : 'space-between',
          gap: 2,
          px: collapsed ? 0 : 2.5,
          pb: 6,
        }}
      >
        {!collapsed && (
          <Box sx={{ minWidth: 0, ...railLabel(collapsed) }}>
            <Typography
              sx={{ fontSize: 18, fontWeight: 500, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}
            >
              FleeTech <Box component="span" sx={{ color: base.accent }}>OS</Box>
            </Typography>
            <Typography variant="overline" sx={{ mt: 1, whiteSpace: 'nowrap' }}>
              {tenant}
            </Typography>
          </Box>
        )}

        {onToggleCollapse && (
          <Tooltip title={collapsed ? 'Expand navigation' : 'Collapse navigation'} placement="right">
            <IconButton
              size="small"
              onClick={onToggleCollapse}
              aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
              aria-expanded={!collapsed}
              sx={{ flex: '0 0 auto', mt: collapsed ? 0 : '-2px' }}
            >
              {collapsed ? (
                <ChevronRightIcon sx={{ fontSize: 18 }} />
              ) : (
                <ChevronLeftIcon sx={{ fontSize: 18 }} />
              )}
            </IconButton>
          </Tooltip>
        )}
      </Box>

      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: collapsed ? 3 : 5,
          overflowY: 'auto',
          overflowX: 'hidden',
          flex: 1,
        }}
      >
        {sections.map((section) => (
          <Box key={section.heading}>
            {/* The heading is what a collapsed rail cannot keep — an icon
                column has no room for a word, and truncating it to three
                letters reads as a bug. The grouping survives as spacing. */}
            {!collapsed && (
              <Typography
                variant="overline"
                sx={{ px: 2.5, mb: 1.5, whiteSpace: 'nowrap', ...railLabel(collapsed) }}
              >
                {section.heading}
              </Typography>
            )}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
              {section.items.map((item) => {
                const Icon = item.icon;
                const link = (
                  <Box
                    key={item.path}
                    component={NavLink}
                    to={item.path}
                    end={item.path === '/riders'}
                    onClick={onNavigate}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: collapsed ? 'center' : 'flex-start',
                      gap: collapsed ? 0 : 2.5,
                      px: collapsed ? 0 : 2.5,
                      py: 2,
                      borderRadius: radius.sm,
                      fontSize: 13.5,
                      color: neutral[400],
                      textDecoration: 'none',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      transition: 'color 120ms, background 120ms',
                      '& svg': { fontSize: 17, flex: '0 0 auto' },
                      '&:hover': { color: base.text, background: neutral[900] },
                      // was a hardcoded purple rgba, which stayed purple in
                      // light mode — the accent is a token now.
                      '&.active': { color: base.accent, background: mix(base.accent, 10) },
                    }}
                  >
                    <Icon />
                    {!collapsed && (
                      <Box component="span" sx={railLabel(collapsed)}>
                        {item.label}
                      </Box>
                    )}
                  </Box>
                );

                return collapsed ? (
                  <Tooltip key={item.path} title={item.label} placement="right">
                    {link}
                  </Tooltip>
                ) : (
                  link
                );
              })}
            </Box>
          </Box>
        ))}
      </Box>

      <Box
        sx={{
          pt: 5,
          mt: 3,
          borderTop: `1px solid ${neutral[900]}`,
          px: collapsed ? 0 : 2.5,
          display: collapsed ? 'flex' : 'block',
          justifyContent: 'center',
        }}
      >
        {collapsed ? (
          // The select cannot live in 64px, so the collapsed rail offers the
          // person instead of the control: it says who you are, and opens the
          // rail so the switch itself is reachable.
          <Tooltip
            title={`${user.name} · ${USER_ROLE_LABEL[user.roleKey]} — open to switch`}
            placement="right"
          >
            <IconButton
              size="small"
              onClick={onToggleCollapse}
              aria-label={`Viewing as ${user.name}. Expand navigation to switch persona.`}
              sx={{
                width: 30,
                height: 30,
                fontSize: 11,
                fontWeight: 600,
                color: base.accent,
                background: mix(base.accent, 12),
                '&:hover': { background: mix(base.accent, 20) },
              }}
            >
              {initials(user.name)}
            </IconButton>
          </Tooltip>
        ) : (
          <Box sx={railLabel(collapsed)}>
            <Typography variant="overline" sx={{ color: neutral[600] }}>
              Viewing as
            </Typography>
            <Select
              value={user.email}
              onChange={(e) => switchPersona(e.target.value)}
              variant="standard"
              disableUnderline
              fullWidth
              sx={{
                mt: 0.5,
                '& .MuiSelect-select': { p: 0, fontSize: 13, color: base.text },
                '& .MuiSvgIcon-root': { color: neutral[500] },
              }}
            >
              {personas.map((p) => (
                <MenuItem key={p.email} value={p.email} sx={{ fontSize: 13 }}>
                  {p.name} · {USER_ROLE_LABEL[p.roleKey]}
                </MenuItem>
              ))}
            </Select>
            <Typography variant="overline" sx={{ mt: 0.5, display: 'block' }}>
              {USER_ROLE_LABEL[user.roleKey]}
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}
