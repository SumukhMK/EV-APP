import type { Page, User } from '../../types';
import { users } from '../../mocks/users';
import { delay, paginate } from './client';

export async function listUsers(page = 0, size = 12): Promise<Page<User>> {
  return delay(paginate(users, page, size));
}
