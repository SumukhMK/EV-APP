import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { useDropzone, type Accept, type FileRejection } from 'react-dropzone';
import { accent, neutral } from '../theme/tokens';
import { shakeStyles } from '../hooks/useShakeValidation';

/** Why a file was turned away before it was sent. The screen owns the wording. */
export type UploadRejection = 'type' | 'size' | 'count';

/**
 * Where a file goes in, and what it has to contain.
 *
 * The expected-column list is the point. The prototype's note — "allow field
 * mapping if source column names differ" — is really an admission that the
 * spreadsheets arriving from the hubs do not agree with each other, so telling
 * somebody the columns we want *before* they upload is what stops the mapping
 * step becoming the whole job.
 *
 * Drag-and-drop is real (react-dropzone), which is also what checks the type
 * and size before a byte leaves the browser: a photo or a 40 MB export is
 * turned away here with a shake, rather than after a round trip. Native
 * input, hidden, driven by the button, so the keyboard reaches it.
 */
export function UploadBox({
  title,
  description,
  accept,
  maxSize,
  buttonLabel,
  onFile,
  onReject,
  expectedColumns,
  columnNote,
}: {
  title: string;
  description: string;
  /** MIME type → extensions, as react-dropzone wants it. */
  accept: Accept;
  /** In bytes. Files over it are rejected before upload. */
  maxSize?: number;
  buttonLabel: string;
  onFile: (file: File) => void;
  onReject?: (reason: UploadRejection) => void;
  expectedColumns?: readonly string[];
  columnNote?: string;
}) {
  const [shaking, setShaking] = useState(false);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept,
    maxSize,
    multiple: false,
    // The button opens the picker; a click anywhere on the box would also
    // open it, which surprises people who were only reaching for the text.
    noClick: true,
    noKeyboard: true,
    onDropAccepted: (files) => onFile(files[0]),
    onDropRejected: (rejections: FileRejection[]) => {
      setShaking(true);
      setTimeout(() => setShaking(false), 600);
      onReject?.(reasonFor(rejections));
    },
  });

  return (
    <Box sx={shakeStyles}>
      <Box
        {...getRootProps()}
        className={shaking ? 'shake-field' : undefined}
        sx={{
          border: `1px dashed ${isDragActive ? accent[400] : neutral[700]}`,
          background: isDragActive ? accent[900] : undefined,
          borderRadius: 2,
          p: { xs: 5, sm: 7 },
          textAlign: 'center',
          transition: 'border-color 120ms, background 120ms',
        }}
      >
        <Typography sx={{ fontSize: 15 }}>{isDragActive ? 'Drop it here' : title}</Typography>
        <Typography sx={{ fontSize: 13, color: 'grey.500', mt: 2, mb: 4 }}>{description}</Typography>
        <input {...getInputProps()} />
        <Button variant="contained" onClick={open}>
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

/** The first rejection's first reason, as one of ours. */
function reasonFor(rejections: FileRejection[]): UploadRejection {
  const code = rejections[0]?.errors[0]?.code;
  if (code === 'file-too-large') return 'size';
  if (code === 'too-many-files') return 'count';
  return 'type';
}
