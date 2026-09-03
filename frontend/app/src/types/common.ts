/**
 * OWNER: SMK. These types are the API contract in draft form.
 * Every mock in src/mocks is a valid instance of one of them, so when Ashok
 * signs off the screens, this folder is what we hand the backend.
 */

/** Every list endpoint is paginated. No screen ever fetches "all". */
export interface Page<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface PageRequest {
  page?: number;
  size?: number;
  sort?: string;
  q?: string;
}

/** A counted facet, e.g. the state chips above the vehicles table. */
export interface Facet<V extends string> {
  value: V | 'ALL';
  label: string;
  count: number;
}

export type Iso8601 = string;
/** Money is minor-unit integers (paise) on the wire; never a float. */
export type Paise = number;
