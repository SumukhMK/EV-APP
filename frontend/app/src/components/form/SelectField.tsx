import Autocomplete from '@mui/material/Autocomplete';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form';

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * A list this long stops being a menu and starts being a lookup: past this
 * many options the field turns into a type-to-search box, the same way the
 * register and the yard are searched rather than scrolled.
 */
const SEARCHABLE_FROM = 8;

/**
 * MUI's `select` TextField renders a MUI Select, not a native one, so
 * `register` cannot wire it — it needs a controlled value. This is the one
 * place that knows that, so no form has to.
 *
 * A short, fixed list (a reason, a condition) stays a plain menu. A list of
 * people or bikes becomes a search box, either because it is long enough to
 * cross `SEARCHABLE_FROM` or because the caller passes `searchable` — nobody
 * should have to scroll a register to find a name they already know.
 */
export function SelectField<T extends FieldValues>({
  control,
  name,
  label,
  options,
  searchable,
  placeholder,
}: {
  control: Control<T>;
  name: Path<T>;
  label: string;
  options: readonly SelectOption[];
  /** Force the search box on or off. Defaults to on past `SEARCHABLE_FROM`. */
  searchable?: boolean;
  /** Only shown on the search variant, where the box starts out empty. */
  placeholder?: string;
}) {
  const withSearch = searchable ?? options.length >= SEARCHABLE_FROM;

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        if (withSearch) {
          // Autocomplete deals in options, the form deals in ids, so the value
          // is looked up on the way in and unwrapped on the way out. `null`
          // rather than `undefined` keeps it controlled while nothing is set.
          const picked = options.find((o) => o.value === field.value) ?? null;
          return (
            <Autocomplete
              options={options}
              value={picked}
              onChange={(_, next) => field.onChange(next?.value ?? '')}
              onBlur={field.onBlur}
              getOptionLabel={(o) => o.label}
              isOptionEqualToValue={(a, b) => a.value === b.value}
              // The default filter matches anywhere in the label, and the label
              // carries both the name and the id, so either one finds the row.
              // Highlighting the first match lets Enter pick it without arrows.
              autoHighlight
              renderInput={(params) => (
                <TextField
                  {...params}
                  inputRef={field.ref}
                  label={label}
                  placeholder={placeholder ?? 'Type to search'}
                  error={Boolean(fieldState.error)}
                  helperText={fieldState.error?.message}
                />
              )}
            />
          );
        }

        return (
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
        );
      }}
    />
  );
}
