import bcrypt from 'bcryptjs';
import { env } from '../../config/env.js';

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, env.BCRYPT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Burns roughly the same CPU as a real verification. Called when the email does
 * not exist so response timing cannot be used to enumerate registered users.
 */
const DUMMY_HASH = '$2a$12$C6UzMDM.H6dfI/f/IKcEe.7Vd1sQZ0FvHnCw0lYtLxKcJfWpJ8x0S';

export async function fakeVerify(plain: string): Promise<void> {
  await bcrypt.compare(plain, DUMMY_HASH).catch(() => false);
}
