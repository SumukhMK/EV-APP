import { createTheme } from '@mui/material/styles';
import { accent, base, cssVars, fonts, mix, neutral, radius, schemes } from './tokens';

/**
 * The Nocturne tokens expressed as a MUI theme, in two schemes.
 *
 * Dark is still the design of record — it is what the client signed off and it
 * is what the app opens in. Light is a genuine second scheme rather than an
 * inversion: amber cannot be read as small text on white, so by day green
 * carries the interactive labels and orange becomes a fill.
 *
 * MUI owns `palette` (it needs real colours to compute hovers and contrast
 * text). Everything a screen touches directly goes through the custom
 * properties declared in CssBaseline below, which is what makes the swap
 * instant and total.
 */
export const theme = createTheme({
  cssVariables: { colorSchemeSelector: 'data-mode' },
  defaultColorScheme: 'dark',

  colorSchemes: {
    dark: {
      palette: {
        mode: 'dark',
        primary: {
          main: schemes.dark.base.accent,
          light: schemes.dark.accent[300],
          dark: schemes.dark.accent[600],
          contrastText: schemes.dark.base.onFill,
        },
        secondary: { main: schemes.dark.base.accent2 },
        background: { default: schemes.dark.base.bg, paper: schemes.dark.base.surface },
        text: {
          primary: schemes.dark.base.text,
          secondary: schemes.dark.neutral[400],
          disabled: schemes.dark.neutral[600],
        },
        divider: schemes.dark.base.divider,
        grey: schemes.dark.neutral,
        success: { main: schemes.dark.status.good.fg },
        warning: { main: schemes.dark.status.warn.fg },
        error: { main: schemes.dark.status.bad.fg },
      },
    },
    light: {
      palette: {
        mode: 'light',
        primary: {
          main: schemes.light.base.accent,
          light: schemes.light.accent[400],
          dark: schemes.light.accent[200],
          contrastText: '#ffffff',
        },
        secondary: { main: schemes.light.base.accent2 },
        background: { default: schemes.light.base.bg, paper: schemes.light.base.surface },
        text: {
          primary: schemes.light.base.text,
          secondary: schemes.light.neutral[400],
          disabled: schemes.light.neutral[600],
        },
        divider: schemes.light.base.divider,
        grey: schemes.light.neutral,
        success: { main: schemes.light.status.good.fg },
        warning: { main: schemes.light.status.warn.fg },
        error: { main: schemes.light.status.bad.fg },
      },
    },
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
        // Both schemes are declared up front and the attribute on <html>
        // decides which wins. No flash, no re-render — the browser repaints.
        ':root, [data-mode="dark"]': { colorScheme: 'dark', ...cssVars(schemes.dark) },
        '[data-mode="light"]': { colorScheme: 'light', ...cssVars(schemes.light) },
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
        '::selection': { background: mix(base.accent, 30) },
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
            '&:hover': { background: mix(base.accent, 12), borderColor: base.accent },
          },
        },
        {
          props: { variant: 'outlined', color: 'inherit' },
          style: {
            borderColor: base.divider,
            color: base.text,
            '&:hover': { background: mix(base.text, 7), borderColor: base.divider },
          },
        },
        // The solid commit action: purple by night, orange by day. Its label
        // colour is a token too, because a dark label is right on orange and
        // wrong on purple.
        {
          props: { variant: 'contained', color: 'primary' },
          style: {
            background: base.fill,
            color: base.onFill,
            '&:hover': { background: base.fill, filter: 'brightness(1.08)' },
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
          backgroundColor: base.raised,
          borderRadius: radius.md,
          fontSize: 14,
          minHeight: 36,
          '& fieldset': { borderColor: base.divider },
          '&:hover fieldset': { borderColor: mix(base.text, 45, base.surface) },
          '&.Mui-focused fieldset': { borderColor: base.accent, borderWidth: 1 },
        },
        input: { padding: '7px 10px' },
      },
    },

    MuiInputLabel: {
      styleOverrides: { root: { fontSize: 12, color: neutral[400] } },
    },

    MuiTextField: {
      defaultProps: { size: 'small', fullWidth: true },
    },

    MuiFormHelperText: {
      styleOverrides: { root: { fontSize: 11, marginLeft: 0 } },
    },

    MuiDivider: { styleOverrides: { root: { borderColor: neutral[900] } } },

    // A tooltip inverts against the page, so it cannot use the ramp — in light
    // mode `neutral[900]` is a hairline and a tooltip painted with it would be
    // white text on almost-white.
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          background: base.inverseSurface,
          color: base.inverseText,
          border: `1px solid ${mix(base.inverseText, 18, base.inverseSurface)}`,
          fontSize: 12,
          borderRadius: radius.sm,
        },
      },
    },

    MuiDialog: {
      styleOverrides: { paper: { borderRadius: radius.lg, borderColor: neutral[800] } },
    },

    MuiLink: { defaultProps: { underline: 'hover' }, styleOverrides: { root: { color: accent[300] } } },
  },
});
