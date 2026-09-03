import { createTheme, alpha } from '@mui/material/styles';
import { accent, base, fonts, neutral, radius } from './tokens';

/**
 * The Nocturne tokens expressed as a MUI theme.
 *
 * Dark only, deliberately: the wireframe the client signed off is dark, and a
 * second scheme doubles the review surface on every component. If light mode
 * is ever asked for, it goes in here as a `colorSchemes` entry — never as
 * per-screen overrides.
 */
export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: base.accent, light: accent[400], dark: accent[700], contrastText: accent[100] },
    secondary: { main: base.accent2 },
    background: { default: base.bg, paper: base.surface },
    text: {
      primary: base.text,
      secondary: alpha(base.text, 0.55),
      disabled: alpha(base.text, 0.38),
    },
    divider: alpha(base.text, 0.16),
    grey: neutral,
  },

  shape: { borderRadius: radius.md },

  // Nocturne's spacing unit is 2.8px; 4 is the nearest sane MUI step and every
  // artboard measurement lands on it.
  spacing: 4,

  typography: {
    fontFamily: fonts.body,
    fontSize: 15,
    htmlFontSize: 16,
    body1: { fontSize: 15, lineHeight: 1.55 },
    body2: { fontSize: 14, lineHeight: 1.5 },
    caption: { fontSize: 12, lineHeight: 1.45 },
    button: { textTransform: 'none', fontWeight: 500, fontSize: 14, lineHeight: 1.2 },
    h1: { fontSize: 42 },
    h2: { fontSize: 32 },
    h3: { fontSize: 25 },
    h4: { fontSize: 20 },
    h5: { fontSize: 16 },
    h6: { fontSize: 13 },
    // `.k` in the wireframe: the small tracked-out label above every heading,
    // stat tile and panel. Used constantly, so it gets a real variant.
    overline: {
      fontSize: 10,
      letterSpacing: '0.14em',
      textTransform: 'uppercase',
      lineHeight: 1.4,
      color: neutral[500],
      display: 'block',
    },
  },

  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: base.bg,
          color: base.text,
          fontFamily: fonts.body,
        },
        'h1, h2, h3, h4, h5, h6': {
          fontFamily: fonts.heading,
          fontWeight: 500,
          lineHeight: 1.12,
          letterSpacing: '-0.015em',
          margin: 0,
        },
        '::selection': { background: alpha(base.accent, 0.3) },
        ':focus-visible': { outline: `2px solid ${base.accent}`, outlineOffset: 2 },
        // tabular numerals everywhere a figure can change width
        '.mono': { fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' },
      },
    },

    // Nocturne buttons are outlined or text — never filled. `contained` still
    // exists for the one-per-screen destructive confirm.
    MuiButton: {
      defaultProps: { variant: 'outlined', disableElevation: true, size: 'small' },
      styleOverrides: {
        root: {
          borderRadius: radius.md,
          padding: '6px 10px',
          minWidth: 0,
          fontFamily: fonts.heading,
        },
      },
      // v9 dropped the `outlined<Color>` override slots; colour-specific
      // treatment goes through `variants`.
      variants: [
        {
          props: { variant: 'outlined', color: 'primary' },
          style: {
            borderColor: base.accent,
            color: base.accent,
            '&:hover': { background: alpha(base.accent, 0.12), borderColor: base.accent },
          },
        },
        {
          props: { variant: 'outlined', color: 'inherit' },
          style: {
            borderColor: alpha(base.text, 0.16),
            color: base.text,
            '&:hover': { background: alpha(base.text, 0.07), borderColor: alpha(base.text, 0.16) },
          },
        },
      ],
    },

    MuiIconButton: {
      styleOverrides: { root: { borderRadius: radius.md, color: neutral[400] } },
    },

    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: base.surface,
          border: `1px solid ${neutral[900]}`,
          borderRadius: radius.md,
        },
      },
    },

    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: base.surface,
          borderRadius: radius.md,
          fontSize: 14,
          minHeight: 36,
          '& fieldset': { borderColor: alpha(base.text, 0.16) },
          '&:hover fieldset': { borderColor: alpha(base.text, 0.45) },
          '&.Mui-focused fieldset': { borderColor: base.accent, borderWidth: 1 },
        },
        input: { padding: '7px 10px' },
      },
    },

    MuiInputLabel: {
      styleOverrides: { root: { fontSize: 12, color: alpha(base.text, 0.7) } },
    },

    MuiTextField: {
      defaultProps: { size: 'small', fullWidth: true },
    },

    MuiFormHelperText: {
      styleOverrides: { root: { fontSize: 11, marginLeft: 0 } },
    },

    MuiDivider: { styleOverrides: { root: { borderColor: neutral[900] } } },

    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          background: neutral[900],
          border: `1px solid ${neutral[800]}`,
          fontSize: 12,
          borderRadius: radius.sm,
        },
      },
    },

    MuiDialog: {
      styleOverrides: { paper: { borderRadius: radius.lg, borderColor: neutral[800] } },
    },

    MuiLink: { defaultProps: { underline: 'hover' } },
  },
});
