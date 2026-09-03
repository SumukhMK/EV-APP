import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form';

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * MUI's `select` TextField renders a MUI Select, not a native one, so
 * `register` cannot wire it — it needs a controlled value. This is the one
 * place that knows that, so no form has to.
 */
export function SelectField<T extends FieldValues>({
  control,
  name,
  label,
  options,
}: {
  control: Control<T>;
  name: Path<T>;
  label: string;
  options: readonly SelectOption[];
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <TextField
          {...field}
          select
          label={label}
          error={Boolean(fieldState.error)}
          helperText={fieldState.error?.message}
        >
          {options.map((o) => (
            <MenuItem key={o.value} value={o.value}>
              {o.label}
            </MenuItem>
          ))}
        </TextField>
      )}
    />
  );
}
