import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import type { ScreenOwner } from '../app/nav';
import { neutral } from '../theme/tokens';

const OWNER_LABEL: Record<ScreenOwner, string> = {
  smk: 'SMK',
  abhiram: 'Abhiram',
  unassigned: 'Not yet assigned',
};

/**
 * A route that exists in the nav but has not been built yet.
 *
 * It is deliberately not hidden: the client walks the whole rail during a
 * demo, and a nav item that goes nowhere reads worse than one that says
 * plainly what is coming and who is building it.
 */
export function Placeholder({
  section,
  title,
  artboard,
  owner,
  summary,
}: {
  section: string;
  title: string;
  artboard: number;
  owner: ScreenOwner;
  summary: string;
}) {
  return (
    <>
      <PageHeader section={section} title={title} />
      <Paper sx={{ mt: 5, p: 8, borderStyle: 'dashed', borderColor: neutral[800] }}>
        <Typography variant="overline">Not built yet</Typography>
        <Typography sx={{ fontSize: 15, mt: 2, maxWidth: 640 }}>{summary}</Typography>
        <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 4 }}>
          Wireframe artboard {String(artboard).padStart(2, '0')} · owner: {OWNER_LABEL[owner]}
        </Typography>
        <Button component={Link} to="/dashboard" sx={{ mt: 5 }}>
          Back to dashboard
        </Button>
      </Paper>
    </>
  );
}
