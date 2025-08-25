import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, chatRoomsTable, roomMembersTable } from '../db/schema';
import { type GetUserRoomsInput } from '../schema';
import { getUserRooms } from '../handlers/get_user_rooms';
import { eq } from 'drizzle-orm';

// Test input
const testInput: GetUserRoomsInput = {
  user_id: 1,
};

describe('getUserRooms', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return user rooms with member count', async () => {
    // Create test users
    await db.insert(usersTable).values([
      { username: 'user1', email: 'user1@example.com', password_hash: 'hash1' },
      { username: 'user2', email: 'user2@example.com', password_hash: 'hash2' },
      { username: 'user3', email: 'user3@example.com', password_hash: 'hash3' },
    ]).execute();

    // Create test room
    await db.insert(chatRoomsTable).values({
      name: 'Test Room',
      description: 'A test room',
      invitation_code: 'TEST123',
      created_by: 1,
    }).execute();

    // Add multiple members to the room
    await db.insert(roomMembersTable).values([
      { room_id: 1, user_id: 1 }, // User we're querying for
      { room_id: 1, user_id: 2 }, // Additional member
      { room_id: 1, user_id: 3 }, // Additional member
    ]).execute();

    const result = await getUserRooms(testInput);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
    expect(result[0].name).toBe('Test Room');
    expect(result[0].description).toBe('A test room');
    expect(result[0].invitation_code).toBe('TEST123');
    expect(result[0].created_by).toBe(1);
    expect(result[0].member_count).toBe(3);
    expect(result[0].is_member).toBe(true);
    expect(result[0].created_at).toBeInstanceOf(Date);
    expect(result[0].updated_at).toBeInstanceOf(Date);
  });

  it('should return multiple rooms ordered by updated_at desc', async () => {
    // Create test user
    await db.insert(usersTable).values({
      username: 'testuser',
      email: 'test@example.com',
      password_hash: 'hash',
    }).execute();

    // Create multiple rooms with different update times
    const room1 = await db.insert(chatRoomsTable).values({
      name: 'Room 1',
      description: 'First room',
      invitation_code: 'ROOM1',
      created_by: 1,
    }).returning().execute();

    // Wait a bit to ensure different timestamps
    await new Promise(resolve => setTimeout(resolve, 10));

    const room2 = await db.insert(chatRoomsTable).values({
      name: 'Room 2',
      description: 'Second room',
      invitation_code: 'ROOM2',
      created_by: 1,
    }).returning().execute();

    // Add user as member to both rooms
    await db.insert(roomMembersTable).values([
      { room_id: room1[0].id, user_id: 1 },
      { room_id: room2[0].id, user_id: 1 },
    ]).execute();

    const result = await getUserRooms(testInput);

    expect(result).toHaveLength(2);
    
    // Should be ordered by updated_at desc (newest first)
    expect(result[0].name).toBe('Room 2');
    expect(result[1].name).toBe('Room 1');
    
    // Both should have is_member true and member_count 1
    expect(result[0].is_member).toBe(true);
    expect(result[1].is_member).toBe(true);
    expect(result[0].member_count).toBe(1);
    expect(result[1].member_count).toBe(1);
  });

  it('should return empty array for user with no room memberships', async () => {
    // Create test user
    await db.insert(usersTable).values({
      username: 'testuser',
      email: 'test@example.com',
      password_hash: 'hash',
    }).execute();

    // Create a room but don't add user as member
    await db.insert(chatRoomsTable).values({
      name: 'Test Room',
      description: 'A test room',
      invitation_code: 'TEST123',
      created_by: 1,
    }).execute();

    const result = await getUserRooms(testInput);

    expect(result).toHaveLength(0);
  });

  it('should not return rooms where user is not a member', async () => {
    // Create test users
    await db.insert(usersTable).values([
      { username: 'user1', email: 'user1@example.com', password_hash: 'hash1' },
      { username: 'user2', email: 'user2@example.com', password_hash: 'hash2' },
    ]).execute();

    // Create rooms
    await db.insert(chatRoomsTable).values([
      { name: 'Room 1', invitation_code: 'ROOM1', created_by: 1 },
      { name: 'Room 2', invitation_code: 'ROOM2', created_by: 2 },
    ]).execute();

    // Add user1 to room1 only
    await db.insert(roomMembersTable).values({
      room_id: 1,
      user_id: 1,
    }).execute();

    // Add user2 to room2 only
    await db.insert(roomMembersTable).values({
      room_id: 2,
      user_id: 2,
    }).execute();

    const result = await getUserRooms({ user_id: 1 });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Room 1');
  });

  it('should handle rooms with null description', async () => {
    // Create test user
    await db.insert(usersTable).values({
      username: 'testuser',
      email: 'test@example.com',
      password_hash: 'hash',
    }).execute();

    // Create room with null description
    await db.insert(chatRoomsTable).values({
      name: 'Test Room',
      description: null,
      invitation_code: 'TEST123',
      created_by: 1,
    }).execute();

    // Add user as member
    await db.insert(roomMembersTable).values({
      room_id: 1,
      user_id: 1,
    }).execute();

    const result = await getUserRooms(testInput);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Test Room');
    expect(result[0].description).toBeNull();
    expect(result[0].member_count).toBe(1);
    expect(result[0].is_member).toBe(true);
  });

  it('should correctly count members across multiple rooms', async () => {
    // Create test users
    await db.insert(usersTable).values([
      { username: 'user1', email: 'user1@example.com', password_hash: 'hash1' },
      { username: 'user2', email: 'user2@example.com', password_hash: 'hash2' },
      { username: 'user3', email: 'user3@example.com', password_hash: 'hash3' },
    ]).execute();

    // Create rooms
    await db.insert(chatRoomsTable).values([
      { name: 'Popular Room', invitation_code: 'POP123', created_by: 1 },
      { name: 'Small Room', invitation_code: 'SMALL', created_by: 1 },
    ]).execute();

    // Add different numbers of members to each room
    // Popular room: 3 members (including user1)
    await db.insert(roomMembersTable).values([
      { room_id: 1, user_id: 1 },
      { room_id: 1, user_id: 2 },
      { room_id: 1, user_id: 3 },
    ]).execute();

    // Small room: 1 member (only user1)
    await db.insert(roomMembersTable).values([
      { room_id: 2, user_id: 1 },
    ]).execute();

    const result = await getUserRooms({ user_id: 1 });

    expect(result).toHaveLength(2);
    
    // Find each room in results
    const popularRoom = result.find(r => r.name === 'Popular Room');
    const smallRoom = result.find(r => r.name === 'Small Room');

    expect(popularRoom).toBeDefined();
    expect(smallRoom).toBeDefined();
    expect(popularRoom!.member_count).toBe(3);
    expect(smallRoom!.member_count).toBe(1);
  });
});