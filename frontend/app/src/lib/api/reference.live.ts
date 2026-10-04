import type { FormOptions } from '../../types';
import { request } from './client';

/** The hubs and models this tenant has, for the vehicle forms' pickers. */
export function getFormOptions(): Promise<FormOptions> {
  return request<FormOptions>('/reference/form-options');
}
