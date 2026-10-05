import Snackbar from '@mui/material/Snackbar';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * The one-line confirmation a screen shows when another screen sends the
 * user here after saving something: "BLRSS0428 added", "R21 onboarded",
 * "Bike assigned to Ravi Kumar".
 *
 * The sending screen passes the sentence as `state.notice` on the navigate.
 * It is read once and cleared from history straight away, so a refresh or a
 * back-then-forward does not announce the save a second time.
 */
export function ArrivalNotice() {
  const location = useLocation();
  const navigate = useNavigate();
  const incoming = (location.state as { notice?: unknown } | null)?.notice;
  const [notice, setNotice] = useState<string | null>(typeof incoming === 'string' ? incoming : null);

  useEffect(() => {
    if (typeof incoming === 'string') {
      setNotice(incoming);
      const { notice: _spent, ...rest } = location.state as { notice?: unknown } & Record<string, unknown>;
      navigate(location.pathname + location.search, { replace: true, state: Object.keys(rest).length ? rest : null });
    }
    // Only when a new notice arrives; the state replace above must not re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming]);

  return (
    <Snackbar
      open={Boolean(notice)}
      autoHideDuration={3200}
      onClose={() => setNotice(null)}
      message={notice}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    />
  );
}
