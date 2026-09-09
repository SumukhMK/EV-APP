import Box from '@mui/material/Box';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

export interface EntryMethod {
  value: string;
  label: string;
  /** Written onto the saved record so its provenance survives. */
  dataSource: string;
}

/**
 * Three ways to get the same record in: typed, imported, or read off a label
 * by camera.
 *
 * The prototype repeats one instruction next to each of them — "Data source
 * should be stored as: Spreadsheet Import" / "AI Scan" / "Manual Entry". That
 * is a provenance requirement, not decoration: a chassis number an OCR guessed
 * is not a chassis number a person read out, and six months on somebody will
 * need to know which. So the method carries its own `dataSource` and this
 * component keeps it visible while the form is being filled.
 */
export function MethodTabs({
  methods,
  value,
  onChange,
  children,
}: {
  methods: readonly EntryMethod[];
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  const current = methods.find((m) => m.value === value);
  return (
    <Box>
      <Tabs
        value={value}
        onChange={(_, next: string) => onChange(next)}
        sx={{ borderBottom: 1, borderColor: 'divider', mb: 4 }}
      >
        {methods.map((m) => (
          <Tab key={m.value} value={m.value} label={m.label} sx={{ fontSize: 13, minHeight: 40 }} />
        ))}
      </Tabs>
      {children}
      {current && (
        <Typography sx={{ fontSize: 12, color: 'grey.500', mt: 4 }}>
          Data source recorded as: {current.dataSource}
        </Typography>
      )}
    </Box>
  );
}
