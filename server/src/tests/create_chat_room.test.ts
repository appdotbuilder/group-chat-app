import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { chatRoomsTable, roomMembersTable, usersTable } from '../db/schema';
import { type CreateChatRoomInput } from '../schema';
import { createChatRoom } from '../handlers/create_chat_room';
import { eq } from 'drizzle-orm';

// Test input
const testInput: CreateChatRoomInput = {
  name: 'Test Chat Room',
  description: 'A room for testing'
};

const testInputWithNullDescription: CreateChatRoomInput = {
  name: 'Test Room No Description',
  description: null
};

describe('createChatRoom', () => {
  let testUserId: number;

  beforeEach(async () => {
    await createDB();
    
    // Create a test user first
    const userResult = await db.insert(usersTable)
      .values({
        username: 'testuser',
        email: 'test@example.com',
        password_hash: 'hashedpassword'
      })
      .returning()
      .execute();
    
    testUserId = userResult[0].id;
  });

  afterEach(resetDB);

  it('should create a chat room with description', async () => {
    const result = await createChatRoom(testInput, testUserId);

    // Basic field validation
    expect(result.name).toEqual('Test Chat Room');
    expect(result.description).toEqual('A room for testing');
    expect(result.created_by).toEqual(testUserId);
    expect(result.id).toBeDefined();
    expect(result.invitation_code).toBeDefined();
    expect(typeof result.invitation_code).toBe('string');
    expect(result.invitation_code.length).toBe(8);
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should create a chat room with null description', async () => {
    const result = await createChatRoom(testInputWithNullDescription, testUserId);

    expect(result.name).toEqual('Test Room No Description');
    expect(result.description).toBeNull();
    expect(result.created_by).toEqual(testUserId);
    expect(result.id).toBeDefined();
    expect(result.invitation_code).toBeDefined();
  });

  it('should save chat room to database', async () => {
    const result = await createChatRoom(testInput, testUserId);

    // Query the database to verify the room was created
    const chatRooms = await db.select()
      .from(chatRoomsTable)
      .where(eq(chatRoomsTable.id, result.id))
      .execute();

    expect(chatRooms).toHaveLength(1);
    expect(chatRooms[0].name).toEqual('Test Chat Room');
    expect(chatRooms[0].description).toEqual('A room for testing');
    expect(chatRooms[0].created_by).toEqual(testUserId);
    expect(chatRooms[0].invitation_code).toEqual(result.invitation_code);
    expect(chatRooms[0].created_at).toBeInstanceOf(Date);
    expect(chatRooms[0].updated_at).toBeInstanceOf(Date);
  });

  it('should automatically add creator as room member', async () => {
    const result = await createChatRoom(testInput, testUserId);

    // Check if the creator was automatically added as a member
    const roomMembers = await db.select()
      .from(roomMembersTable)
      .where(eq(roomMembersTable.room_id, result.id))
      .execute();

    expect(roomMembers).toHaveLength(1);
    expect(roomMembers[0].room_id).toEqual(result.id);
    expect(roomMembers[0].user_id).toEqual(testUserId);
    expect(roomMembers[0].joined_at).toBeInstanceOf(Date);
  });

  it('should generate unique invitation codes', async () => {
    const result1 = await createChatRoom(testInput, testUserId);
    const result2 = await createChatRoom({
      name: 'Second Room',
      description: 'Another test room'
    }, testUserId);

    // Invitation codes should be different
    expect(result1.invitation_code).not.toEqual(result2.invitation_code);
    
    // Both should be 8 characters long and alphanumeric
    expect(result1.invitation_code).toMatch(/^[A-Z0-9]{8}$/);
    expect(result2.invitation_code).toMatch(/^[A-Z0-9]{8}$/);
  });

  it('should handle foreign key relationship correctly', async () => {
    const result = await createChatRoom(testInput, testUserId);

    // Verify the foreign key relationship works
    const chatRooms = await db.select()
      .from(chatRoomsTable)
      .innerJoin(usersTable, eq(chatRoomsTable.created_by, usersTable.id))
      .where(eq(chatRoomsTable.id, result.id))
      .execute();

    expect(chatRooms).toHaveLength(1);
    expect(chatRooms[0].chat_rooms.created_by).toEqual(testUserId);
    expect(chatRooms[0].users.id).toEqual(testUserId);
    expect(chatRooms[0].users.username).toEqual('testuser');
  });
});