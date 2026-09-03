import InputAdornment from '@mui/material/InputAdornment';
import SearchIcon from '@mui/icons-material/SearchOutlined';
import TextField from '@mui/material/TextField';

/** The one search box. Uncontrolled debouncing is the caller's business. */
export function SearchField({
  value,
  onChange,
  placeholder = 'Search',
  width = 246,
  fullWidth = false,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  width?: number;
  /** Let the caller hand it the whole row on a narrow screen. */
  fullWidth?: boolean;
}) {
  return (
    <TextField
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      fullWidth={false}
      sx={{ width: fullWidth ? { xs: '100%', md: width } : width }}
      slotProps={{
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon sx={{ fontSize: 16, color: 'grey.600' }} />
            </InputAdornment>
          ),
        },
      }}
    />
  );
}
