import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useNavigate } from 'react-router-dom';
import { Mono } from '../components/Mono';
import { useSession } from '../app/sessionContext';
import { ApiError, IS_LIVE } from '../lib/api/client';
import { base, neutral } from '../theme/tokens';

/**
 * One form, two meanings.
 *
 * Against the live API the credentials are checked server-side and a wrong
 * password stays on this screen. Without VITE_API_BASE there is no
 * authentication and there must not appear to be one — any credentials sign
 * in, and the note under the button says so out loud, to us and to the client.
 */
export function Login() {
  const navigate = useNavigate();
  const { signIn, user, tenant } = useSession();
  const [email, setEmail] = useState(IS_LIVE ? '' : user.email);
  const [password, setPassword] = useState(IS_LIVE ? '' : 'demo-build');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await signIn(email, password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      // The server says the same thing for an unknown email and a wrong
      // password, deliberately. Repeating it verbatim keeps that property.
      setError(
        err instanceof ApiError && err.status === 401
          ? 'Email or password is incorrect.'
          : 'Could not sign in. Please try again.',
      );
      setPending(false);
    }
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
      <Box component="form" onSubmit={submit} sx={{ width: '100%', maxWidth: 392, display: 'flex', flexDirection: 'column', gap: 5.5 }}>
        <Box>
          <Mono sx={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: neutral[500] }}>
            e-Connects
          </Mono>
          <Typography variant="h3" sx={{ mt: 1 }}>
            FleeTech <Box component="span" sx={{ color: base.accent }}>OS</Box>
          </Typography>
          <Typography sx={{ fontSize: 13, color: neutral[400], mt: 1 }}>
            {tenant || 'FleeTech'} · Bengaluru
          </Typography>
        </Box>

        <Paper sx={{ p: 6, display: 'flex', flexDirection: 'column', gap: 3.5 }}>
          {error && (
            <Alert severity="error" sx={{ fontSize: 13 }}>
              {error}
            </Alert>
          )}
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
          <Button type="submit" fullWidth disabled={pending} sx={{ mt: 1 }}>
            {pending ? 'Signing in…' : 'Sign in'}
          </Button>
        </Paper>

        <Typography sx={{ fontSize: 12, color: neutral[600], textAlign: 'center' }}>
          {IS_LIVE
            ? 'Accounts are created by your administrator.'
            : 'Demo build — no authentication yet. Any credentials sign in.'}
        </Typography>
      </Box>
    </Box>
  );
}
