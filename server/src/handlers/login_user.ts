import { db } from '../db';
import { usersTable } from '../db/schema';
import { type LoginUserInput, type AuthResponse } from '../schema';
import { eq } from 'drizzle-orm';
import { createHash, randomBytes, pbkdf2Sync, timingSafeEqual } from 'crypto';

// Simple JWT-like token implementation using crypto
const createToken = (payload: object): string => {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const exp = now + (24 * 60 * 60); // 24 hours
  
  const tokenPayload = { ...payload, iat: now, exp };
  
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(tokenPayload)).toString('base64url');
  
  const secret = process.env['JWT_SECRET'] || 'fallback_secret_key';
  const signature = createHash('sha256')
    .update(`${encodedHeader}.${encodedPayload}.${secret}`)
    .digest('base64url');
  
  return `${encodedHeader}.${encodedPayload}.${signature}`;
};

// Hash password using PBKDF2
const hashPassword = (password: string, salt?: string): { hash: string, salt: string } => {
  const saltBuffer = salt ? Buffer.from(salt, 'hex') : randomBytes(32);
  const hash = pbkdf2Sync(password, saltBuffer, 100000, 64, 'sha512');
  
  return {
    hash: hash.toString('hex'),
    salt: saltBuffer.toString('hex')
  };
};

// Verify password using constant-time comparison
const verifyPassword = (password: string, storedHash: string): boolean => {
  try {
    // Extract salt and hash from stored format (salt:hash)
    const [salt, hash] = storedHash.split(':');
    if (!salt || !hash) {
      return false;
    }
    
    const { hash: computedHash } = hashPassword(password, salt);
    
    // Use timing-safe comparison
    const storedBuffer = Buffer.from(hash, 'hex');
    const computedBuffer = Buffer.from(computedHash, 'hex');
    
    return storedBuffer.length === computedBuffer.length && 
           timingSafeEqual(storedBuffer, computedBuffer);
  } catch {
    return false;
  }
};

export const loginUser = async (input: LoginUserInput): Promise<AuthResponse> => {
  try {
    // Find user by email
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.email, input.email))
      .execute();

    if (users.length === 0) {
      throw new Error('Invalid email or password');
    }

    const user = users[0];

    // Verify password against stored hash
    const isValidPassword = verifyPassword(input.password, user.password_hash);
    
    if (!isValidPassword) {
      throw new Error('Invalid email or password');
    }

    // Generate token
    const token = createToken({
      userId: user.id,
      email: user.email
    });

    // Return user data with token
    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        password_hash: user.password_hash,
        created_at: user.created_at,
        updated_at: user.updated_at,
      },
      token
    };
  } catch (error) {
    console.error('User login failed:', error);
    throw error;
  }
};

// Export helper functions for testing
export { hashPassword, verifyPassword, createToken };