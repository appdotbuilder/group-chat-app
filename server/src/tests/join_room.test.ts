import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, chatRoomsTable, roomMembersTable } from '../db/schema';
import { type JoinRoomInput } from '../schema';
import { joinRoom } from '../handlers/join_room';
import { eq, and } from 'drizzle-orm';

// Test data
const testUser = {
  username: 'testuser',
  email: 'test@example.com',
  password_hash: 'hashedpassword'
};

const testUser2 = {
  username: 'testuser2',
  email: 'test2@example.com',
  password_hash: 'hashedpassword2'
};

const testRoom = {
  name: 'Test Room',
  description: 'A room for testing',
  invitation_code: 'TEST123',
  created_by: 1
};

describe('joinRoom', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should join a room with valid invitation code', async () => {
    // Create test user and room
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    const userId = userResult[0].id;

    const roomResult = await db.insert(chatRoomsTable)
      .values({ ...testRoom, created_by: userId })
      .returning()
      .execute();
    const room = roomResult[0];

    // Create another user to join the room
    const user2Result = await db.insert(usersTable)
      .values(testUser2)
      .returning()
      .execute();
    const user2Id = user2Result[0].id;

    const input: JoinRoomInput = {
      invitation_code: 'TEST123'
    };

    const result = await joinRoom(input, user2Id);

    // Verify room data is returned
    expect(result.id).toEqual(room.id);
    expect(result.name).toEqual('Test Room');
    expect(result.description).toEqual('A room for testing');
    expect(result.invitation_code).toEqual('TEST123');
    expect(result.created_by).toEqual(userId);
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should add user to room_members table', async () => {
    // Create test user and room
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    const userId = userResult[0].id;

    const roomResult = await db.insert(chatRoomsTable)
      .values({ ...testRoom, created_by: userId })
      .returning()
      .execute();
    const room = roomResult[0];

    // Create another user to join the room
    const user2Result = await db.insert(usersTable)
      .values(testUser2)
      .returning()
      .execute();
    const user2Id = user2Result[0].id;

    const input: JoinRoomInput = {
      invitation_code: 'TEST123'
    };

    await joinRoom(input, user2Id);

    // Verify membership was created
    const memberships = await db.select()
      .from(roomMembersTable)
      .where(
        and(
          eq(roomMembersTable.room_id, room.id),
          eq(roomMembersTable.user_id, user2Id)
        )
      )
      .execute();

    expect(memberships).toHaveLength(1);
    expect(memberships[0].room_id).toEqual(room.id);
    expect(memberships[0].user_id).toEqual(user2Id);
    expect(memberships[0].joined_at).toBeInstanceOf(Date);
  });

  it('should throw error for invalid invitation code', async () => {
    // Create test user
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    const userId = userResult[0].id;

    const input: JoinRoomInput = {
      invitation_code: 'INVALID123'
    };

    await expect(joinRoom(input, userId)).rejects.toThrow(/invalid invitation code/i);
  });

  it('should throw error if user is already a member', async () => {
    // Create test user and room
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    const userId = userResult[0].id;

    const roomResult = await db.insert(chatRoomsTable)
      .values({ ...testRoom, created_by: userId })
      .returning()
      .execute();
    const room = roomResult[0];

    // Create another user and add them as a member
    const user2Result = await db.insert(usersTable)
      .values(testUser2)
      .returning()
      .execute();
    const user2Id = user2Result[0].id;

    // Add user as member first
    await db.insert(roomMembersTable)
      .values({
        room_id: room.id,
        user_id: user2Id
      })
      .execute();

    const input: JoinRoomInput = {
      invitation_code: 'TEST123'
    };

    // Try to join again - should throw error
    await expect(joinRoom(input, user2Id)).rejects.toThrow(/already a member/i);
  });

  it('should allow room creator to use their own invitation code', async () => {
    // Create test user and room
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    const userId = userResult[0].id;

    await db.insert(chatRoomsTable)
      .values({ ...testRoom, created_by: userId })
      .returning()
      .execute();

    const input: JoinRoomInput = {
      invitation_code: 'TEST123'
    };

    const result = await joinRoom(input, userId);

    // Verify room creator can join their own room
    expect(result.name).toEqual('Test Room');
    expect(result.created_by).toEqual(userId);

    // Verify membership was created for creator
    const memberships = await db.select()
      .from(roomMembersTable)
      .where(eq(roomMembersTable.user_id, userId))
      .execute();

    expect(memberships).toHaveLength(1);
  });

  it('should handle multiple users joining the same room', async () => {
    // Create test users and room
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    const userId = userResult[0].id;

    const user2Result = await db.insert(usersTable)
      .values(testUser2)
      .returning()
      .execute();
    const user2Id = user2Result[0].id;

    const user3Result = await db.insert(usersTable)
      .values({
        username: 'testuser3',
        email: 'test3@example.com',
        password_hash: 'hashedpassword3'
      })
      .returning()
      .execute();
    const user3Id = user3Result[0].id;

    const roomResult = await db.insert(chatRoomsTable)
      .values({ ...testRoom, created_by: userId })
      .returning()
      .execute();
    const room = roomResult[0];

    const input: JoinRoomInput = {
      invitation_code: 'TEST123'
    };

    // Join room with multiple users
    await joinRoom(input, user2Id);
    await joinRoom(input, user3Id);

    // Verify both memberships were created
    const memberships = await db.select()
      .from(roomMembersTable)
      .where(eq(roomMembersTable.room_id, room.id))
      .execute();

    expect(memberships).toHaveLength(2);
    const userIds = memberships.map(m => m.user_id);
    expect(userIds).toContain(user2Id);
    expect(userIds).toContain(user3Id);
  });
});