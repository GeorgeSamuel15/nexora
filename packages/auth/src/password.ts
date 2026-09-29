/**
 * Password hashing helpers. bcrypt with a cost factor of 12 - deliberately
 * never exposes a way to store or compare plaintext. Requires `bcrypt` to
 * be installed (`pnpm install` at the repo root).
 */

import bcrypt from "bcrypt";

const SALT_ROUNDS = 12;

export async function hashPassword(plainTextPassword: string): Promise<string> {
  return bcrypt.hash(plainTextPassword, SALT_ROUNDS);
}

export async function verifyPassword(
  plainTextPassword: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(plainTextPassword, passwordHash);
}
