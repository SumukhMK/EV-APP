import Box from '@mui/material/Box';
import { Outlet } from 'react-router-dom';
import { FleetNav } from './FleetNav';
import { layout } from '../theme/tokens';

export function AppLayout() {
  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <FleetNav />
      <Box
        component="main"
        sx={{
          flex: 1,
          minWidth: 0,
          maxWidth: layout.contentMax,
          px: `${layout.contentPadX}px`,
          pb: 12,
        }}
      >
        <Outlet />
      </Box>
    </Box>
  );
}
