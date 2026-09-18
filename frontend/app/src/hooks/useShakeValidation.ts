import { useRef, useCallback } from 'react';

/**
 * Shake the first incomplete field inside a container to guide the user.
 * If many fields are wrong (> threshold), shakes the nearest parent panel instead.
 *
 * Usage:
 *   const { containerRef, shake } = useShakeValidation();
 *   <Box ref={containerRef} sx={shakeStyles}>...</Box>
 *   <Button onClick={() => { if (!ready) { shake(); return; } save(); }}>Save</Button>
 */
export function useShakeValidation(manyThreshold = 2) {
  const containerRef = useRef<HTMLDivElement>(null);

  const shake = useCallback(() => {
    const root = containerRef.current;
    if (!root) return;

    const errors = root.querySelectorAll<HTMLElement>('[aria-invalid="true"], .Mui-error');
    const unchecked = root.querySelectorAll<HTMLElement>('input[type="checkbox"]:not(:checked)');

    // Many problems → shake the parent panel.
    if (errors.length > manyThreshold || unchecked.length > manyThreshold + 1) {
      const panel = (errors[0] ?? unchecked[0])?.closest<HTMLElement>('.MuiPaper-root, [class*="Panel"]');
      if (panel) {
        panel.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
        panel.classList.add('shake-field');
        setTimeout(() => panel.classList.remove('shake-field'), 600);
        return;
      }
    }

    // Single problem → shake the specific field.
    const target = errors[0]
      ?? root.querySelector<HTMLElement>('input[required]:placeholder-shown, textarea[required]:not(:focus)')
      ?? unchecked[0];
    if (!target) return;

    const el = target.closest('.MuiFormControl-root, .MuiFormControlLabel-root') ?? target;
    el.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    el.classList.add('shake-field');
    setTimeout(() => el.classList.remove('shake-field'), 600);
  }, [manyThreshold]);

  return { containerRef, shake };
}

/** Drop this into the sx of any container that uses useShakeValidation. */
export const shakeStyles = {
  '@keyframes shake': {
    '0%,100%': { transform: 'translateX(0)' },
    '20%,60%': { transform: 'translateX(-6px)' },
    '40%,80%': { transform: 'translateX(6px)' },
  },
  '& .shake-field': { animation: 'shake 0.4s ease-in-out' },
} as const;
