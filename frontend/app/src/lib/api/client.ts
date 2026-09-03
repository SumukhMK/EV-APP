/**
 * The seam between the UI and the backend.
 *
 * Today every resource module resolves from src/mocks. When Spring Boot
 * exists, these two helpers are the only things that change: `delay` goes,
 * and `respond` becomes a fetch against API_BASE. No screen is touched,
 * because no screen knows which side of the seam it is on.
 */

export const API_BASE = import.meta.env.VITE_API_BASE ?? '/api/v1';

/** Network-ish latency, so loading and empty states are real, not theoretical. */
const LATENCY_MS = 220;

export function delay<T>(value: T, ms = LATENCY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

export class ApiError extends Error {
  status: number;
  /** Set when the failure belongs to one form field, so RHF can attach it. */
  field?: string;

  constructor(message: string, status: number, field?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.field = field;
  }
}

/** Shared paging over an in-memory array, matching Spring's Page shape. */
export function paginate<T>(all: T[], page = 0, size = 12) {
  const start = page * size;
  return {
    content: all.slice(start, start + size),
    page,
    size,
    totalElements: all.length,
    totalPages: Math.max(1, Math.ceil(all.length / size)),
  };
}
