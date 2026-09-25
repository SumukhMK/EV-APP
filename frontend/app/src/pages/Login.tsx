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
 *
 * Every failure the API can answer with gets its own line, so the user knows
 * which of the four it was: a field the server rejected (422, attached to the
 * input), bad credentials (401), a server that broke (5xx), or a server that
 * could not be reached at all (network error or timeout). The 401 message is
 * the backend's own, verbatim — it deliberately says the same thing for an
 * unknown email, a wrong password, a disabled account and a suspended tenant,
 * so a stranger cannot tell which one it was.
 */
export function Login() {
  const navigate = useNavigate();
  const { signIn, user, tenant } = useSession();
  const [email, setEmail] = useState(IS_LIVE ? '' : user.email);
  const [password, setPassword] = useState(IS_LIVE ? '' : 'demo-build');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    setFieldErrors({});
    try {
      await signIn(email, password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.field) {
        // 422: the server named the field that failed. Attach it there.
        setFieldErrors((prev) => ({ ...prev, [err.field as 'email' | 'password']: err.message }));
      } else if (err instanceof ApiError && err.status === 401) {
        setError(err.message);
      } else if (err instanceof ApiError && err.status >= 500) {
        setError('The server hit a problem. Please try again in a moment.');
      } else if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof DOMException && err.name === 'AbortError') {
        setError('The server took too long to respond. Please try again.');
      } else {
        setError('Cannot reach the server. Check your connection and try again.');
      }
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
            onChange={(e) => {
              setEmail(e.target.value);
              if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
            }}
            autoComplete="username"
            error={Boolean(fieldErrors.email)}
            helperText={fieldErrors.email}
          />
          <TextField
            label="Password"
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }));
            }}
            autoComplete="current-password"
            error={Boolean(fieldErrors.password)}
            helperText={fieldErrors.password}
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
