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
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { USER_ROLE_LABEL, USER_STATUS_LABEL } from '../../lib/labels';
import { USER_ROLES, type User, type UserRole, type UserStatus } from '../../types';
import { useSession } from '../../app/sessionContext';
import { MandatoryLabel } from '../../components/form/MandatoryLabel';
import { shakeStyles, useShakeValidation } from '../../hooks/useShakeValidation';

const STATUSES: UserStatus[] = ['ACTIVE', 'INVITED', 'DISABLED'];

/** A tracked-out caption over a control, the app's own label style. */
function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <Box sx={{ flex: 1 }}>
      <Typography variant="overline" sx={{ mb: 0.75 }}>
        {label}
        {required && <MandatoryLabel />}
      </Typography>
      {children}
    </Box>
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

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
  const { user } = useSession();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('FLEET_STAFF');
  const [status, setStatus] = useState<UserStatus>('ACTIVE');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [tried, setTried] = useState(false);
  const { containerRef, shake } = useShakeValidation();

  // Load the target's values when a different account's dialog opens. Done in
  // render, not an effect, so the fields never flash the previous user first.
  const [lastId, setLastId] = useState<string | null>(null);
  if (target && target.id !== lastId) {
    setLastId(target.id);
    setName(target.name);
    setEmail(target.email);
    setRole(target.role);
    setStatus(target.status);
    setTried(false);
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
    <>
      <Dialog open={Boolean(target)} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontSize: 16 }}>Edit user · {target?.name}</DialogTitle>
      <DialogContent ref={containerRef} sx={shakeStyles}>
        <Stack spacing={3.5} sx={{ mt: 1 }}>
          <Field label="Name" required>
            <TextField
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              error={(tried || name !== '') && !nameOk}
              helperText={(tried || name !== '') && !nameOk ? 'Enter the name.' : ' '}
              slotProps={{ htmlInput: { maxLength: 100 } }}
            />
          </Field>
          <Field label="Email" required>
            <TextField
              value={email}
              type="email"
              onChange={(e) => setEmail(e.target.value)}
              error={(tried || email !== '') && !emailOk}
              helperText={(tried || email !== '') && !emailOk ? 'Enter a valid email address.' : ' '}
            />
          </Field>
          <Box sx={{ display: 'flex', gap: 2.5 }}>
            <Field label="Role" required>
              <TextField select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
                {/* Only a super admin can grant super admin; a target who already holds it keeps it visible. */}
                {USER_ROLES.filter((r) => r !== 'SUPER_ADMIN' || user.roleKey === 'SUPER_ADMIN' || r === target?.role).map((r) => (
                  <MenuItem key={r} value={r}>{USER_ROLE_LABEL[r]}</MenuItem>
                ))}
              </TextField>
            </Field>
            <Field label="Status" required>
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
        {/* Never greyed out: a missing field shakes and says what is wrong. */}
        <Button
          onClick={() => {
            if (save.isPending) return;
            if (!valid) {
              setTried(true);
              requestAnimationFrame(shake);
              return;
            }
            setConfirmOpen(true);
          }}
        >
          Save changes
        </Button>
      </DialogActions>
      </Dialog>
      <ConfirmDialog
        open={confirmOpen}
        title="Save changes?"
        message={`Update ${target?.name}'s account.`}
        info={`Role: ${USER_ROLE_LABEL[role]}. Status: ${USER_STATUS_LABEL[status]}.`}
        confirmLabel="Save changes"
        tone="neutral"
        dismissible
        pending={save.isPending}
        onConfirm={() => { setConfirmOpen(false); save.mutate(); }}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
