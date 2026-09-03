import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <Box sx={{ py: 16, textAlign: 'center' }}>
      <Typography sx={{ fontSize: 15 }}>{title}</Typography>
      {description && (
        <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 1.5 }}>{description}</Typography>
      )}
      {action && <Box sx={{ mt: 4 }}>{action}</Box>}
    </Box>
  );
}
