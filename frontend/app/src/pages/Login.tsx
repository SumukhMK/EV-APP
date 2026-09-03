import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useNavigate } from 'react-router-dom';
import { Mono } from '../components/Mono';
import { useSession } from '../app/sessionContext';
import { base, neutral } from '../theme/tokens';

/**
 * There is no authentication here and there must not appear to be one.
 *
 * Any credentials sign in. Real auth is server-side, arrives with the Spring
 * Boot API, and is the only thing that will ever gate tenant data — building
 * a convincing-looking fake now would invite everyone to treat it as done.
 * The note under the button says so out loud, to us and to the client.
 */
export function Login() {
  const navigate = useNavigate();
  const { signIn, user, tenant } = useSession();
  const [email, setEmail] = useState(user.email);
  const [password, setPassword] = useState('demo-build');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    signIn();
    navigate('/dashboard', { replace: true });
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        bgcolor: 'background.default',
        px: 4,
      }}
    >
      <Box component="form" onSubmit={submit} sx={{ width: 392, display: 'flex', flexDirection: 'column', gap: 5.5 }}>
        <Box>
          <Mono sx={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: neutral[500] }}>
            e-Connects
          </Mono>
          <Typography variant="h3" sx={{ mt: 1 }}>
            FleeTech <Box component="span" sx={{ color: base.accent }}>OS</Box>
          </Typography>
          <Typography sx={{ fontSize: 13, color: neutral[400], mt: 1 }}>{tenant} · Bengaluru</Typography>
        </Box>

        <Paper sx={{ p: 6, display: 'flex', flexDirection: 'column', gap: 3.5 }}>
          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
          />
          <TextField
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          <Button type="submit" fullWidth sx={{ mt: 1 }}>
            Sign in
          </Button>
        </Paper>

        <Typography sx={{ fontSize: 12, color: neutral[600], textAlign: 'center' }}>
          Demo build — no authentication yet. Any credentials sign in.
        </Typography>
      </Box>
    </Box>
  );
}
