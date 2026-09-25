import type { Page, UpdateUserRequest, User } from '../../types';
import { updateUserInPlace, users } from '../../mocks/users';
import { delay, paginate } from './client';

/**
 * The users module against the fixtures (no backend wired).
 *
 * Every function here is the same signature as its twin in users.live.ts,
 * because users.ts picks between them and no screen knows which it got.
 */
export async function listUsers(page = 0, size = 12): Promise<Page<User>> {
  return delay(paginate(users, page, size));
}

/** Save an edit to an account. Simulated write; see the mock. */
export async function updateUser(req: UpdateUserRequest): Promise<User> {
  return delay(updateUserInPlace(req));
}