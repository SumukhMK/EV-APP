import InputAdornment from '@mui/material/InputAdornment';
import SearchIcon from '@mui/icons-material/SearchOutlined';
import TextField from '@mui/material/TextField';

/** The one search box. Uncontrolled debouncing is the caller's business. */
export function SearchField({
  value,
  onChange,
  placeholder = 'Search',
  width = 246,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  width?: number;
}) {
  return (
    <TextField
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      fullWidth={false}
      sx={{ width }}
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
