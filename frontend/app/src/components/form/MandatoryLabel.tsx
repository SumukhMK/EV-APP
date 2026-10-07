import Box from '@mui/material/Box';

/**
 * Marks a required field in a long form. The word, not an asterisk: an
 * asterisk is a convention that has to be learned, and this form already
 * spells "optional" out for the fields that are, so a required field gets
 * the same courtesy.
 *
 * Rendered inside the field's label, so the accessible name of the field
 * carries the marker too — a screen reader hears "Full name Mandatory".
 */
export function MandatoryLabel() {
  return (
    <Box
      component="span"
      sx={{
        ml: 1,
        fontSize: 11,
        fontWeight: 600,
        color: 'error.main',
        // The overline labels (VerifyField) uppercase and letter-space their
        // text; the marker stays as written so it reads as a tag, not a word
        // that belongs to the label.
        textTransform: 'none',
        letterSpacing: 0,
      }}
    >
      Mandatory
    </Box>
  );
}