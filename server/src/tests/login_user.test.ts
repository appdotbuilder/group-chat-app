import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable } from '../db/schema';
import { type LoginUserInput } from '../schema';
import { loginUser, hashPassword, verifyPassword, createToken } from '../handlers/login_user';

// Test user data
const testUserData = {
  username: 'testuser',
  email: 'test@example.com',
  password: 'testpassword123',
};

const testLoginInput: LoginUserInput = {
  email: testUserData.email,
  password: testUserData.password,
};

// Helper to decode our simple JWT-like token
const decodeToken = (token: string): any => {
  const [header, payload, signature] = token.split('.');
  return JSON.parse(Buffer.from(payload, 'base64url').toString());
};

describe('loginUser', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should successfully login a user with correct credentials', async () => {
    // Create test user with hashed password
    const { hash, salt } = hashPassword(testUserData.password);
    const storedHash = `${salt}:${hash}`;
    
    const insertResult = await db.insert(usersTable)
      .values({
        username: testUserData.username,
        email: testUserData.email,
        password_hash: storedHash,
      })
      .returning()
      .execute();

    const createdUser = insertResult[0];

    // Attempt login
    const result = await loginUser(testLoginInput);

    // Verify user data
    expect(result.user.id).toEqual(createdUser.id);
    expect(result.user.username).toEqual(testUserData.username);
    expect(result.user.email).toEqual(testUserData.email);
    expect(result.user.password_hash).toEqual(storedHash);
    expect(result.user.created_at).toBeInstanceOf(Date);
    expect(result.user.updated_at).toBeInstanceOf(Date);

    // Verify token is present and valid
    expect(result.token).toBeDefined();
    expect(typeof result.token).toBe('string');
    expect(result.token.length).toBeGreaterThan(0);

    // Verify token content
    const decodedToken = decodeToken(result.token);
    expect(decodedToken.userId).toEqual(createdUser.id);
    expect(decodedToken.email).toEqual(testUserData.email);
    expect(decodedToken.exp).toBeDefined();
    expect(decodedToken.iat).toBeDefined();
  });

  it('should throw error for non-existent email', async () => {
    const invalidLoginInput: LoginUserInput = {
      email: 'nonexistent@example.com',
      password: 'anypassword',
    };

    await expect(loginUser(invalidLoginInput)).rejects.toThrow(/invalid email or password/i);
  });

  it('should throw error for incorrect password', async () => {
    // Create test user
    const { hash, salt } = hashPassword(testUserData.password);
    const storedHash = `${salt}:${hash}`;
    
    await db.insert(usersTable)
      .values({
        username: testUserData.username,
        email: testUserData.email,
        password_hash: storedHash,
      })
      .execute();

    const invalidLoginInput: LoginUserInput = {
      email: testUserData.email,
      password: 'wrongpassword',
    };

    await expect(loginUser(invalidLoginInput)).rejects.toThrow(/invalid email or password/i);
  });

  it('should handle different valid email formats', async () => {
    const emailFormats = [
      'user@domain.com',
      'user.name@domain.co.uk',
      'user+tag@domain.org',
    ];

    for (const email of emailFormats) {
      // Create user with this email
      const { hash, salt } = hashPassword('password123');
      const storedHash = `${salt}:${hash}`;
      
      await db.insert(usersTable)
        .values({
          username: `user_${email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '')}`,
          email: email,
          password_hash: storedHash,
        })
        .execute();

      // Test login
      const loginInput: LoginUserInput = {
        email: email,
        password: 'password123',
      };

      const result = await loginUser(loginInput);
      expect(result.user.email).toEqual(email);
      expect(result.token).toBeDefined();
    }
  });

  it('should handle case-sensitive email comparison', async () => {
    // Create user with lowercase email
    const { hash, salt } = hashPassword(testUserData.password);
    const storedHash = `${salt}:${hash}`;
    
    await db.insert(usersTable)
      .values({
        username: testUserData.username,
        email: testUserData.email.toLowerCase(),
        password_hash: storedHash,
      })
      .execute();

    // Try login with uppercase email
    const uppercaseLoginInput: LoginUserInput = {
      email: testUserData.email.toUpperCase(),
      password: testUserData.password,
    };

    // Should fail because email comparison is case-sensitive
    await expect(loginUser(uppercaseLoginInput)).rejects.toThrow(/invalid email or password/i);
  });

  it('should generate unique tokens for different login sessions', async () => {
    // Create test user
    const { hash, salt } = hashPassword(testUserData.password);
    const storedHash = `${salt}:${hash}`;
    
    await db.insert(usersTable)
      .values({
        username: testUserData.username,
        email: testUserData.email,
        password_hash: storedHash,
      })
      .execute();

    // Login twice with small delay to ensure different timestamps
    const result1 = await loginUser(testLoginInput);
    await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
    const result2 = await loginUser(testLoginInput);

    // Tokens should be different (due to timestamp in token)
    expect(result1.token).not.toEqual(result2.token);
    
    // But both should contain same user data
    const decoded1 = decodeToken(result1.token);
    const decoded2 = decodeToken(result2.token);
    
    expect(decoded1.userId).toEqual(decoded2.userId);
    expect(decoded1.email).toEqual(decoded2.email);
    expect(decoded1.iat).toBeLessThan(decoded2.iat); // First token issued earlier
  });

  it('should preserve user data integrity during login', async () => {
    // Create test user with specific timestamps
    const { hash, salt } = hashPassword(testUserData.password);
    const storedHash = `${salt}:${hash}`;
    
    const insertResult = await db.insert(usersTable)
      .values({
        username: testUserData.username,
        email: testUserData.email,
        password_hash: storedHash,
      })
      .returning()
      .execute();

    const originalUser = insertResult[0];

    // Login
    const result = await loginUser(testLoginInput);

    // Verify all user fields are preserved exactly
    expect(result.user.id).toEqual(originalUser.id);
    expect(result.user.username).toEqual(originalUser.username);
    expect(result.user.email).toEqual(originalUser.email);
    expect(result.user.password_hash).toEqual(originalUser.password_hash);
    expect(result.user.created_at).toEqual(originalUser.created_at);
    expect(result.user.updated_at).toEqual(originalUser.updated_at);
  });

  it('should handle malformed password hashes gracefully', async () => {
    // Create user with malformed password hash (missing salt separator)
    await db.insert(usersTable)
      .values({
        username: testUserData.username,
        email: testUserData.email,
        password_hash: 'malformed_hash_without_salt',
      })
      .execute();

    // Should fail gracefully
    await expect(loginUser(testLoginInput)).rejects.toThrow(/invalid email or password/i);
  });
});

describe('password hashing utilities', () => {
  it('should generate different hashes for same password', async () => {
    const password = 'testpassword';
    const hash1 = hashPassword(password);
    const hash2 = hashPassword(password);
    
    // Hashes should be different due to different salts
    expect(hash1.hash).not.toEqual(hash2.hash);
    expect(hash1.salt).not.toEqual(hash2.salt);
  });

  it('should verify correct passwords', async () => {
    const password = 'testpassword';
    const { hash, salt } = hashPassword(password);
    const storedHash = `${salt}:${hash}`;
    
    expect(verifyPassword(password, storedHash)).toBe(true);
    expect(verifyPassword('wrongpassword', storedHash)).toBe(false);
  });

  it('should handle invalid hash formats in verification', async () => {
    expect(verifyPassword('password', 'invalid')).toBe(false);
    expect(verifyPassword('password', '')).toBe(false);
    expect(verifyPassword('password', 'no:separator:here:too:many')).toBe(false);
  });
});

describe('token utilities', () => {
  it('should create valid token structure', async () => {
    const payload = { userId: 123, email: 'test@example.com' };
    const token = createToken(payload);
    
    // Token should have 3 parts separated by dots
    const parts = token.split('.');
    expect(parts).toHaveLength(3);
    
    // Should be able to decode payload
    const decoded = decodeToken(token);
    expect(decoded.userId).toEqual(123);
    expect(decoded.email).toEqual('test@example.com');
    expect(decoded.iat).toBeDefined();
    expect(decoded.exp).toBeDefined();
  });
});