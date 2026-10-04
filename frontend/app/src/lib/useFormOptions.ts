import { useQuery } from '@tanstack/react-query';
import { getFormOptions } from './api/reference';

export interface Option {
  value: string;
  label: string;
}

/**
 * The hub and model pickers' options, from the tenant's own reference data.
 *
 * Only active entries are offered. `including(current)` keeps whatever the
 * form already holds in the list even when it is not offered any more — an
 * old bike at a retired hub still shows its hub, and a value that is not in
 * the list would otherwise make the select warn and render blank.
 */
export function useFormOptions() {
  const query = useQuery({
    queryKey: ['reference', 'form-options'],
    queryFn: getFormOptions,
    staleTime: 5 * 60_000,
  });

  const hubs: Option[] = (query.data?.hubs ?? [])
    .filter((h) => h.active)
    .map((h) => ({ value: h.name, label: h.name }));
  const models: Option[] = (query.data?.models ?? [])
    .filter((m) => m.active)
    .map((m) => ({ value: m.name, label: m.name }));

  const including = (options: Option[], current: string | undefined | null): Option[] =>
    current && !options.some((o) => o.value === current)
      ? [...options, { value: current, label: current }]
      : options;

  return { hubs, models, including, isLoading: query.isLoading, isError: query.isError };
}
