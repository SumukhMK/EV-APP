import type { Page, UpdateUserRequest, User } from '../../types';
import { request } from './client';

/**
 * The users module against the real API (S3).
 *
 * Every function here is the same signature as its twin in users.mock.ts,
 * because users.ts picks between them and no screen knows which it got.
 * There is no mapping layer: UserResponse was written field-for-field against
 * the contract types, so the JSON *is* the type.
 */
export function listUsers(page = 0, size = 12): Promise<Page<User>> {
  return request<Page<User>>('/users', { query: { page, size } });
}

export function updateUser(req: UpdateUserRequest): Promise<User> {
  // id addresses the row; it is not editable, and the request record has no
  // field to receive it. Sending it in the body is how they disagree.
  const { id, ...rest } = req;
  return request<User>(`/users/${encodeURIComponent(id)}`, { method: 'PUT', body: rest });
}