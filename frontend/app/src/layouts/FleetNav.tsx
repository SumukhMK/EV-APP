import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { NavLink } from 'react-router-dom';
import { NAV } from '../app/nav';
import { base, layout, neutral } from '../theme/tokens';
import { useSession } from '../app/sessionContext';

/**
 * The fixed left rail. Sections are labelled rather than separated by rules —
 * a dark ground already reads as grouped, and rules would compete with the
 * table rules that are the product's actual signature.
 */
export function FleetNav({ onNavigate }: { onNavigate?: () => void } = {}) {
  const { user, tenant } = useSession();

  return (
    <Box
      component="nav"
      sx={{
        width: layout.navWidth,
        minHeight: '100vh',
        bgcolor: 'background.default',
        display: 'flex',
        flexDirection: 'column',
        borderRight: `1px solid ${neutral[900]}`,
        px: 3.5,
        py: 6,
        position: 'sticky',
        top: 0,
        alignSelf: 'flex-start',
        height: '100vh',
      }}
    >
      <Box sx={{ px: 2.5, pb: 6 }}>
        <Typography sx={{ fontSize: 18, fontWeight: 500, letterSpacing: '-0.01em' }}>
          FleeTech <Box component="span" sx={{ color: base.accent }}>OS</Box>
        </Typography>
        <Typography variant="overline" sx={{ mt: 1 }}>
          {tenant}
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 5, overflowY: 'auto', flex: 1 }}>
        {NAV.map((section) => (
          <Box key={section.heading}>
            <Typography variant="overline" sx={{ px: 2.5, mb: 1.5 }}>
              {section.heading}
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <Box
                    key={item.path}
                    component={NavLink}
                    to={item.path}
                    end={item.path === '/riders'}
                    onClick={onNavigate}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 2.5,
                      px: 2.5,
                      py: 2,
                      borderRadius: 2,
                      fontSize: 13.5,
                      color: neutral[400],
                      textDecoration: 'none',
                      transition: 'color 120ms, background 120ms',
                      '& svg': { fontSize: 17 },
                      '&:hover': { color: base.text, background: neutral[900] },
                      '&.active': { color: base.accent, background: 'rgba(145,132,217,0.10)' },
                    }}
                  >
                    <Icon />
                    <span>{item.label}</span>
                  </Box>
                );
              })}
            </Box>
          </Box>
        ))}
      </Box>

      <Box sx={{ pt: 5, mt: 3, borderTop: `1px solid ${neutral[900]}`, px: 2.5 }}>
        <Typography sx={{ fontSize: 13 }}>{user.name}</Typography>
        <Typography variant="overline">{user.role}</Typography>
      </Box>
    </Box>
  );
}
