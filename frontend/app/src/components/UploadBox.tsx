import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useRef } from 'react';
import { neutral } from '../theme/tokens';

/**
 * Where a file goes in, and what it has to contain.
 *
 * The expected-column list is the point. The prototype's note — "allow field
 * mapping if source column names differ" — is really an admission that the
 * spreadsheets arriving from the hubs do not agree with each other, so telling
 * somebody the columns we want *before* they upload is what stops the mapping
 * step becoming the whole job. Native input, hidden, driven by the button, so
 * the keyboard reaches it.
 */
export function UploadBox({
  title,
  description,
  accept,
  buttonLabel,
  onFile,
  expectedColumns,
  columnNote,
}: {
  title: string;
  description: string;
  accept: string;
  buttonLabel: string;
  onFile: (file: File) => void;
  expectedColumns?: readonly string[];
  columnNote?: string;
}) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <Box>
      <Box
        sx={{
          border: `1px dashed ${neutral[700]}`,
          borderRadius: 2,
          p: { xs: 5, sm: 7 },
          textAlign: 'center',
        }}
      >
        <Typography sx={{ fontSize: 15 }}>{title}</Typography>
        <Typography sx={{ fontSize: 13, color: 'grey.500', mt: 2, mb: 4 }}>{description}</Typography>
        <input
          ref={input}
          type="file"
          accept={accept}
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = '';
          }}
        />
        <Button variant="contained" onClick={() => input.current?.click()}>
          {buttonLabel}
        </Button>
      </Box>

      {expectedColumns && (
        <Box sx={{ mt: 4 }}>
          <Typography variant="overline">Expected columns</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 2 }}>
            {expectedColumns.map((c) => (
              <Box
                key={c}
                sx={{
                  fontSize: 12,
                  px: 2,
                  py: '3px',
                  borderRadius: '4px',
                  background: neutral[900],
                  color: neutral[300],
                }}
              >
                {c}
              </Box>
            ))}
          </Box>
          {columnNote && (
            <Typography sx={{ fontSize: 12, color: 'grey.500', mt: 3 }}>{columnNote}</Typography>
          )}
        </Box>
      )}
    </Box>
  );
}
