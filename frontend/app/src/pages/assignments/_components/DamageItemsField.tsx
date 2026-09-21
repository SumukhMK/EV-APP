import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import AddIcon from '@mui/icons-material/AddOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
import { useFieldArray, useFormContext } from 'react-hook-form';
import type { DeboardRiderValues } from '../../../lib/schemas/assignment';

/**
 * Part-level damage detail for deboard/exchange tagged MINOR, MAJOR or ACCIDENT.
 *
 * This is what the assistance desk and QC actually work from once the bike
 * lands in their queue — "damaged" alone tells a technician nothing they can
 * quote against. One row per part: what it is, and what's wrong with it.
 *
 * Reads the form via context rather than props, the same as `DispositionFields`
 * — the parent must wrap the form in `FormProvider`.
 */
export function DamageItemsField({ noDamage = false }: { noDamage?: boolean }) {
  const { control, register, formState } = useFormContext<Pick<DeboardRiderValues, 'damageItems'>>();
  const { fields, append, remove } = useFieldArray({ control, name: 'damageItems' });
  const errors = formState.errors;

  const listError = errors.damageItems?.root?.message ?? errors.damageItems?.message;

  return (
    <Box sx={{ display: 'grid', gap: 3 }}>
      <Typography variant="overline">Damaged parts</Typography>
      {noDamage && fields.length > 0 && (
        <Box>
          <Typography variant="body2" color="text.secondary">No damage is selected. Clear these rows, or choose a damage severity.</Typography>
          <Button onClick={() => remove()}>Clear damage details</Button>
        </Box>
      )}
      {fields.length === 0 && (
        <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
          No parts added yet — add one for every part that needs attention.
        </Typography>
      )}
      {fields.map((field, index) => (
        <Box
          key={field.id}
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: '1fr 2fr auto' },
            gap: 3,
            alignItems: 'start',
          }}
        >
          <TextField
            label="Part / area"
            defaultValue={field.part}
            {...register(`damageItems.${index}.part` as const)}
            error={Boolean(errors.damageItems?.[index]?.part)}
            helperText={errors.damageItems?.[index]?.part?.message}
          />
          <TextField
            label="What's wrong with it (optional)"
            defaultValue={field.note}
            {...register(`damageItems.${index}.note` as const)}
            error={Boolean(errors.damageItems?.[index]?.note)}
            helperText={errors.damageItems?.[index]?.note?.message}
          />
          <IconButton aria-label="Remove part" onClick={() => remove(index)} sx={{ mt: 1 }}>
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Box>
      ))}
      {typeof listError === 'string' && (
        <Typography sx={{ fontSize: 12.5, color: 'error.main' }}>{listError}</Typography>
      )}
      <Box>
        <Button
          size="small"
          startIcon={<AddIcon />}
          onClick={() => append({ part: '', note: '' })}
        >
          Add damaged part
        </Button>
      </Box>
    </Box>
  );
}
