import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable } from '../db/schema';
import { type RegisterUserInput } from '../schema';
import { registerUser, hashPassword, verifyPassword } from '../handlers/register_user';
import { eq } from 'drizzle-orm';

// Simple JWT decoder for testing
function decodeJWT(token: string): any {
  const [header, payload, signature] = token.split('.');
  return JSON.parse(Buffer.from(payload, 'base64url').toString());
}

// Test input data
const testInput: RegisterUserInput = {
  username: 'testuser',
  email: 'test@example.com',
  password: 'password123'
};

const duplicateUsernameInput: RegisterUserInput = {
  username: 'testuser',
  email: 'different@example.com',
  password: 'password456'
};

const duplicateEmailInput: RegisterUserInput = {
  username: 'differentuser',
  email: 'test@example.com',
  password: 'password789'
};

describe('registerUser', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should register a new user successfully', async () => {
    const result = await registerUser(testInput);

    // Validate user data
    expect(result.user.id).toBeDefined();
    expect(result.user.username).toEqual('testuser');
    expect(result.user.email).toEqual('test@example.com');
    expect(result.user.password_hash).toBeDefined();
    expect(result.user.password_hash).not.toEqual('password123'); // Should be hashed
    expect(result.user.created_at).toBeInstanceOf(Date);
    expect(result.user.updated_at).toBeInstanceOf(Date);

    // Validate token
    expect(result.token).toBeDefined();
    expect(typeof result.token).toBe('string');
    expect(result.token.length).toBeGreaterThan(0);
  });

  it('should save user to database with hashed password', async () => {
    const result = await registerUser(testInput);

    // Query database to verify user was saved
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, result.user.id))
      .execute();

    expect(users).toHaveLength(1);
    const savedUser = users[0];
    
    expect(savedUser.username).toEqual('testuser');
    expect(savedUser.email).toEqual('test@example.com');
    expect(savedUser.password_hash).toBeDefined();
    expect(savedUser.created_at).toBeInstanceOf(Date);
    expect(savedUser.updated_at).toBeInstanceOf(Date);

    // Verify password is properly hashed
    const isValidPassword = verifyPassword('password123', savedUser.password_hash);
    expect(isValidPassword).toBe(true);

    // Verify original password is not stored
    expect(savedUser.password_hash).not.toEqual('password123');
    expect(savedUser.password_hash).toContain(':'); // Should contain salt separator
  });

  it('should generate valid JWT token', async () => {
    const result = await registerUser(testInput);

    // Decode and verify token structure
    const decoded = decodeJWT(result.token);

    expect(decoded.userId).toEqual(result.user.id);
    expect(decoded.username).toEqual('testuser');
    expect(decoded.email).toEqual('test@example.com');
    expect(decoded.exp).toBeDefined(); // Expiration time
    expect(decoded.iat).toBeDefined(); // Issued at time

    // Verify token has 3 parts (header.payload.signature)
    const tokenParts = result.token.split('.');
    expect(tokenParts).toHaveLength(3);
  });

  it('should reject duplicate username', async () => {
    // Register first user
    await registerUser(testInput);

    // Try to register user with same username
    await expect(registerUser(duplicateUsernameInput))
      .rejects.toThrow(/username already exists/i);
  });

  it('should reject duplicate email', async () => {
    // Register first user
    await registerUser(testInput);

    // Try to register user with same email
    await expect(registerUser(duplicateEmailInput))
      .rejects.toThrow(/email already exists/i);
  });

  it('should handle password hashing securely', async () => {
    const result1 = await registerUser(testInput);
    
    // Reset database and register same user again
    await resetDB();
    await createDB();
    const result2 = await registerUser(testInput);

    // Same password should generate different hashes (due to salt)
    expect(result1.user.password_hash).not.toEqual(result2.user.password_hash);

    // Both hashes should validate against the original password
    const isValid1 = verifyPassword('password123', result1.user.password_hash);
    const isValid2 = verifyPassword('password123', result2.user.password_hash);
    expect(isValid1).toBe(true);
    expect(isValid2).toBe(true);
  });

  it('should create user with proper timestamps', async () => {
    const beforeRegistration = new Date();
    const result = await registerUser(testInput);
    const afterRegistration = new Date();

    expect(result.user.created_at).toBeInstanceOf(Date);
    expect(result.user.updated_at).toBeInstanceOf(Date);
    expect(result.user.created_at.getTime()).toBeGreaterThanOrEqual(beforeRegistration.getTime());
    expect(result.user.created_at.getTime()).toBeLessThanOrEqual(afterRegistration.getTime());
    expect(result.user.updated_at.getTime()).toBeGreaterThanOrEqual(beforeRegistration.getTime());
    expect(result.user.updated_at.getTime()).toBeLessThanOrEqual(afterRegistration.getTime());
  });

  it('should verify password hashing functions work correctly', async () => {
    const password = 'testpassword';
    const hashedPassword = hashPassword(password);

    // Hash should contain salt separator
    expect(hashedPassword).toContain(':');
    
    // Verify correct password
    expect(verifyPassword(password, hashedPassword)).toBe(true);
    
    // Verify incorrect password
    expect(verifyPassword('wrongpassword', hashedPassword)).toBe(false);

    // Same password should generate different hashes
    const hashedPassword2 = hashPassword(password);
    expect(hashedPassword).not.toEqual(hashedPassword2);
    
    // But both should verify correctly
    expect(verifyPassword(password, hashedPassword2)).toBe(true);
  });
});