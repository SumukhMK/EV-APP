import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { accent, base } from '../theme/tokens';

/**
 * A numbered section of a long form.
 *
 * Deliberately not a MUI `Stepper`: the prototype lets the operator fill step
 * five before step two, because a rider standing at the counter volunteers
 * their details in whatever order they like. Every step stays visible and
 * editable; the number is orientation, not a gate.
 */
export function StepSection({
  step,
  title,
  subtitle,
  children,
}: {
  step: number;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <Box
      component="section"
      sx={{
        background: base.surface,
        borderRadius: 2,
        p: { xs: '16px 14px 14px', sm: '18px 20px 16px' },
      }}
    >
      <Box sx={{ display: 'flex', gap: 3, alignItems: 'flex-start', mb: 4 }}>
        <Box
          aria-hidden
          sx={{
            flex: '0 0 auto',
            width: 26,
            height: 26,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            fontSize: 13,
            color: accent[100],
            background: accent[800],
          }}
        >
          {step}
        </Box>
        <Box>
          <Typography sx={{ fontSize: 15 }}>{title}</Typography>
          {subtitle && (
            <Typography sx={{ fontSize: 13, color: 'grey.500', mt: '2px' }}>{subtitle}</Typography>
          )}
        </Box>
      </Box>
      {children}
    </Box>
  );
}
