import { useState, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateUser } from '../../lib/api/users';
import { invalidateUsers } from '../../lib/invalidate';
import { USER_ROLE_LABEL, USER_STATUS_LABEL } from '../../lib/labels';
import { USER_ROLES, type User, type UserRole, type UserStatus } from '../../types';

const STATUSES: UserStatus[] = ['ACTIVE', 'INVITED', 'DISABLED'];

/** A tracked-out caption over a control, the app's own label style. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box sx={{ flex: 1 }}>
      <Typography variant="overline" sx={{ mb: 0.75 }}>
        {label}
      </Typography>
      {children}
    </Box>
  );
}

const EMAIL_RE = /^\S+@\S+\.\S+$|^\S+@\S+$/;

/**
 * Edit one account (screen 18): the four things an admin changes at the desk —
 * name, email, role and status. It is a simulated write, like the QC and
 * payment screens, so the edit shows the moment the list refetches. The record
 * fields that are history (joined, last seen) are not editable by hand.
 */
export function EditUserDialog({
  target,
  onClose,
  onSaved,
}: {
  target: User | null;
  onClose: () => void;
  onSaved?: (name: string) => void;
}) {
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('FLEET_STAFF');
  const [status, setStatus] = useState<UserStatus>('ACTIVE');

  // Load the target's values when a different account's dialog opens. Done in
  // render, not an effect, so the fields never flash the previous user first.
  const [lastId, setLastId] = useState<string | null>(null);
  if (target && target.id !== lastId) {
    setLastId(target.id);
    setName(target.name);
    setEmail(target.email);
    setRole(target.role);
    setStatus(target.status);
  }

  const save = useMutation({
    mutationFn: () => updateUser({ id: target!.id, name, email, role, status }),
    onSuccess: () => {
      invalidateUsers(queryClient);
      onSaved?.(name.trim());
      onClose();
    },
  });

  const nameOk = name.trim().length > 0;
  const emailOk = EMAIL_RE.test(email.trim());
  const valid = nameOk && emailOk;

  return (
    <Dialog open={Boolean(target)} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontSize: 16 }}>Edit user · {target?.name}</DialogTitle>
      <DialogContent>
        <Stack spacing={3.5} sx={{ mt: 1 }}>
          <Field label="Name">
            <TextField
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              error={name !== '' && !nameOk}
            />
          </Field>
          <Field label="Email">
            <TextField
              value={email}
              type="email"
              onChange={(e) => setEmail(e.target.value)}
              error={email !== '' && !emailOk}
              helperText={email !== '' && !emailOk ? 'Enter a valid email address.' : ' '}
            />
          </Field>
          <Box sx={{ display: 'flex', gap: 2.5 }}>
            <Field label="Role">
              <TextField select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
                {USER_ROLES.map((r) => (
                  <MenuItem key={r} value={r}>{USER_ROLE_LABEL[r]}</MenuItem>
                ))}
              </TextField>
            </Field>
            <Field label="Status">
              <TextField select value={status} onChange={(e) => setStatus(e.target.value as UserStatus)}>
                {STATUSES.map((s) => (
                  <MenuItem key={s} value={s}>{USER_STATUS_LABEL[s]}</MenuItem>
                ))}
              </TextField>
            </Field>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 6, pb: 5 }}>
        <Button color="inherit" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => valid && save.mutate()} disabled={!valid || save.isPending}>
          Save changes
        </Button>
      </DialogActions>
    </Dialog>
  );
}
