import { db } from '../db';
import { usersTable } from '../db/schema';
import { type RegisterUserInput, type AuthResponse } from '../schema';
import { eq, or } from 'drizzle-orm';
import { createHash, randomBytes, pbkdf2Sync } from 'crypto';

// Simple JWT implementation using crypto
function createJWT(payload: any, secret: string, expiresIn: string): string {
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };

  const now = Math.floor(Date.now() / 1000);
  const exp = now + (7 * 24 * 60 * 60); // 7 days in seconds

  const jwtPayload = {
    ...payload,
    iat: now,
    exp: exp
  };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(jwtPayload)).toString('base64url');

  const signature = createHash('sha256')
    .update(`${encodedHeader}.${encodedPayload}.${secret}`)
    .digest('base64url');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

// Password hashing using pbkdf2
function hashPassword(password: string): string {
  const salt = randomBytes(32).toString('hex');
  const hash = pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, hashedPassword: string): boolean {
  const [salt, hash] = hashedPassword.split(':');
  const verifyHash = pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return hash === verifyHash;
}

export const registerUser = async (input: RegisterUserInput): Promise<AuthResponse> => {
  try {
    // Check if username or email already exists
    const existingUsers = await db.select()
      .from(usersTable)
      .where(or(
        eq(usersTable.username, input.username),
        eq(usersTable.email, input.email)
      ))
      .execute();

    if (existingUsers.length > 0) {
      const existingUser = existingUsers[0];
      if (existingUser.username === input.username) {
        throw new Error('Username already exists');
      }
      if (existingUser.email === input.email) {
        throw new Error('Email already exists');
      }
    }

    // Hash the password
    const password_hash = hashPassword(input.password);

    // Create new user record
    const result = await db.insert(usersTable)
      .values({
        username: input.username,
        email: input.email,
        password_hash: password_hash
      })
      .returning()
      .execute();

    const user = result[0];

    // Generate JWT token
    const jwtSecret = process.env['JWT_SECRET'] || 'default_secret_for_development';
    const token = createJWT(
      { 
        userId: user.id,
        username: user.username,
        email: user.email
      },
      jwtSecret,
      '7d'
    );

    return {
      user: user,
      token: token
    };
  } catch (error) {
    console.error('User registration failed:', error);
    throw error;
  }
};

// Export helper functions for testing
export { hashPassword, verifyPassword };