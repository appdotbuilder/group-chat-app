import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, chatRoomsTable, roomMembersTable, messagesTable } from '../db/schema';
import { type GetMessagesInput } from '../schema';
import { getMessages } from '../handlers/get_messages';

// Test data
const testUser1 = {
  username: 'testuser1',
  email: 'test1@example.com',
  password_hash: 'hashedpassword1',
};

const testUser2 = {
  username: 'testuser2', 
  email: 'test2@example.com',
  password_hash: 'hashedpassword2',
};

const testRoom = {
  name: 'Test Room',
  description: 'A room for testing',
  invitation_code: 'TEST123',
  created_by: 0, // Will be set to actual user ID
};

const testInput: GetMessagesInput = {
  room_id: 0, // Will be set to actual room ID
  limit: 50,
  offset: 0,
};

describe('getMessages', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should get messages for a room member', async () => {
    // Create test users
    const user1Result = await db.insert(usersTable)
      .values(testUser1)
      .returning()
      .execute();
    const user1Id = user1Result[0].id;

    const user2Result = await db.insert(usersTable)
      .values(testUser2)
      .returning()
      .execute();
    const user2Id = user2Result[0].id;

    // Create test room
    const roomResult = await db.insert(chatRoomsTable)
      .values({ ...testRoom, created_by: user1Id })
      .returning()
      .execute();
    const roomId = roomResult[0].id;

    // Add both users as members
    await db.insert(roomMembersTable)
      .values([
        { room_id: roomId, user_id: user1Id },
        { room_id: roomId, user_id: user2Id },
      ])
      .execute();

    // Create test messages with small delays to ensure proper ordering
    await db.insert(messagesTable)
      .values({
        room_id: roomId,
        user_id: user1Id,
        content: 'First message',
        message_type: 'text',
      })
      .execute();

    // Small delay to ensure different timestamps
    await new Promise(resolve => setTimeout(resolve, 10));

    await db.insert(messagesTable)
      .values({
        room_id: roomId,
        user_id: user2Id,
        content: 'Second message',
        message_type: 'text',
      })
      .execute();

    await new Promise(resolve => setTimeout(resolve, 10));

    await db.insert(messagesTable)
      .values({
        room_id: roomId,
        user_id: user1Id,
        content: 'Third message',
        message_type: 'text',
      })
      .execute();

    const input = { ...testInput, room_id: roomId };
    const result = await getMessages(input, user1Id);

    expect(result).toHaveLength(3);
    
    // Verify message structure and ordering (newest first)
    expect(result[0].content).toEqual('Third message');
    expect(result[0].username).toEqual('testuser1');
    expect(result[0].room_id).toEqual(roomId);
    expect(result[0].user_id).toEqual(user1Id);
    expect(result[0].message_type).toEqual('text');
    expect(result[0].is_deleted).toEqual(false);
    expect(result[0].deleted_at).toBeNull();
    expect(result[0].created_at).toBeInstanceOf(Date);

    expect(result[1].content).toEqual('Second message');
    expect(result[1].username).toEqual('testuser2');
    expect(result[1].user_id).toEqual(user2Id);

    expect(result[2].content).toEqual('First message');
    expect(result[2].username).toEqual('testuser1');
    expect(result[2].user_id).toEqual(user1Id);
  });

  it('should include deleted messages with is_deleted flag', async () => {
    // Create test user and room
    const userResult = await db.insert(usersTable)
      .values(testUser1)
      .returning()
      .execute();
    const userId = userResult[0].id;

    const roomResult = await db.insert(chatRoomsTable)
      .values({ ...testRoom, created_by: userId })
      .returning()
      .execute();
    const roomId = roomResult[0].id;

    // Add user as member
    await db.insert(roomMembersTable)
      .values({ room_id: roomId, user_id: userId })
      .execute();

    const deletedAt = new Date();

    // Create messages including deleted one with delay for ordering
    await db.insert(messagesTable)
      .values({
        room_id: roomId,
        user_id: userId,
        content: 'Active message',
        message_type: 'text',
      })
      .execute();

    await new Promise(resolve => setTimeout(resolve, 10));

    await db.insert(messagesTable)
      .values({
        room_id: roomId,
        user_id: userId,
        content: 'Deleted message',
        message_type: 'text',
        is_deleted: true,
        deleted_at: deletedAt,
      })
      .execute();

    const input = { ...testInput, room_id: roomId };
    const result = await getMessages(input, userId);

    expect(result).toHaveLength(2);
    
    const deletedMessage = result.find(msg => msg.is_deleted);
    const activeMessage = result.find(msg => !msg.is_deleted);

    expect(deletedMessage).toBeDefined();
    expect(deletedMessage!.content).toEqual('Deleted message');
    expect(deletedMessage!.is_deleted).toEqual(true);
    expect(deletedMessage!.deleted_at).toBeInstanceOf(Date);

    expect(activeMessage).toBeDefined();
    expect(activeMessage!.content).toEqual('Active message');
    expect(activeMessage!.is_deleted).toEqual(false);
    expect(activeMessage!.deleted_at).toBeNull();
  });

  it('should handle file messages correctly', async () => {
    // Create test user and room
    const userResult = await db.insert(usersTable)
      .values(testUser1)
      .returning()
      .execute();
    const userId = userResult[0].id;

    const roomResult = await db.insert(chatRoomsTable)
      .values({ ...testRoom, created_by: userId })
      .returning()
      .execute();
    const roomId = roomResult[0].id;

    // Add user as member
    await db.insert(roomMembersTable)
      .values({ room_id: roomId, user_id: userId })
      .execute();

    // Create file message
    await db.insert(messagesTable)
      .values({
        room_id: roomId,
        user_id: userId,
        content: null,
        message_type: 'image',
        file_url: 'https://example.com/image.jpg',
        file_name: 'image.jpg',
        file_size: 2048,
        file_type: 'image/jpeg',
      })
      .execute();

    const input = { ...testInput, room_id: roomId };
    const result = await getMessages(input, userId);

    expect(result).toHaveLength(1);
    expect(result[0].content).toBeNull();
    expect(result[0].message_type).toEqual('image');
    expect(result[0].file_url).toEqual('https://example.com/image.jpg');
    expect(result[0].file_name).toEqual('image.jpg');
    expect(result[0].file_size).toEqual(2048);
    expect(result[0].file_type).toEqual('image/jpeg');
    expect(result[0].username).toEqual('testuser1');
  });

  it('should apply pagination correctly', async () => {
    // Create test user and room
    const userResult = await db.insert(usersTable)
      .values(testUser1)
      .returning()
      .execute();
    const userId = userResult[0].id;

    const roomResult = await db.insert(chatRoomsTable)
      .values({ ...testRoom, created_by: userId })
      .returning()
      .execute();
    const roomId = roomResult[0].id;

    // Add user as member
    await db.insert(roomMembersTable)
      .values({ room_id: roomId, user_id: userId })
      .execute();

    // Create 5 messages with delays to ensure proper ordering
    for (let i = 1; i <= 5; i++) {
      await db.insert(messagesTable)
        .values({
          room_id: roomId,
          user_id: userId,
          content: `Message ${i}`,
          message_type: 'text',
        })
        .execute();
      
      // Small delay to ensure different timestamps
      if (i < 5) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }

    // Test first page (limit 2, offset 0)
    const page1 = await getMessages({ room_id: roomId, limit: 2, offset: 0 }, userId);
    expect(page1).toHaveLength(2);
    expect(page1[0].content).toEqual('Message 5'); // Newest first
    expect(page1[1].content).toEqual('Message 4');

    // Test second page (limit 2, offset 2)
    const page2 = await getMessages({ room_id: roomId, limit: 2, offset: 2 }, userId);
    expect(page2).toHaveLength(2);
    expect(page2[0].content).toEqual('Message 3');
    expect(page2[1].content).toEqual('Message 2');

    // Test third page (limit 2, offset 4)
    const page3 = await getMessages({ room_id: roomId, limit: 2, offset: 4 }, userId);
    expect(page3).toHaveLength(1);
    expect(page3[0].content).toEqual('Message 1');
  });

  it('should throw error when user is not a room member', async () => {
    // Create test users
    const user1Result = await db.insert(usersTable)
      .values(testUser1)
      .returning()
      .execute();
    const user1Id = user1Result[0].id;

    const user2Result = await db.insert(usersTable)
      .values(testUser2)
      .returning()
      .execute();
    const user2Id = user2Result[0].id;

    // Create test room with user1 as creator
    const roomResult = await db.insert(chatRoomsTable)
      .values({ ...testRoom, created_by: user1Id })
      .returning()
      .execute();
    const roomId = roomResult[0].id;

    // Add only user1 as member (user2 is not a member)
    await db.insert(roomMembersTable)
      .values({ room_id: roomId, user_id: user1Id })
      .execute();

    const input = { ...testInput, room_id: roomId };
    
    // User2 trying to access messages should fail
    expect(getMessages(input, user2Id)).rejects.toThrow(/not a member of this room/i);
  });

  it('should return empty array for room with no messages', async () => {
    // Create test user and room
    const userResult = await db.insert(usersTable)
      .values(testUser1)
      .returning()
      .execute();
    const userId = userResult[0].id;

    const roomResult = await db.insert(chatRoomsTable)
      .values({ ...testRoom, created_by: userId })
      .returning()
      .execute();
    const roomId = roomResult[0].id;

    // Add user as member
    await db.insert(roomMembersTable)
      .values({ room_id: roomId, user_id: userId })
      .execute();

    // Don't create any messages

    const input = { ...testInput, room_id: roomId };
    const result = await getMessages(input, userId);

    expect(result).toHaveLength(0);
    expect(Array.isArray(result)).toBe(true);
  });

  it('should handle messages from multiple users correctly', async () => {
    // Create multiple test users
    const users = await Promise.all([
      db.insert(usersTable).values(testUser1).returning().execute(),
      db.insert(usersTable).values(testUser2).returning().execute(),
    ]);
    const user1Id = users[0][0].id;
    const user2Id = users[1][0].id;

    // Create test room
    const roomResult = await db.insert(chatRoomsTable)
      .values({ ...testRoom, created_by: user1Id })
      .returning()
      .execute();
    const roomId = roomResult[0].id;

    // Add both users as members
    await db.insert(roomMembersTable)
      .values([
        { room_id: roomId, user_id: user1Id },
        { room_id: roomId, user_id: user2Id },
      ])
      .execute();

    // Create messages from different users with delay for ordering
    await db.insert(messagesTable)
      .values({
        room_id: roomId,
        user_id: user1Id,
        content: 'Message from user1',
        message_type: 'text',
      })
      .execute();

    await new Promise(resolve => setTimeout(resolve, 10));

    await db.insert(messagesTable)
      .values({
        room_id: roomId,
        user_id: user2Id,
        content: 'Message from user2',
        message_type: 'text',
      })
      .execute();

    const input = { ...testInput, room_id: roomId };
    const result = await getMessages(input, user1Id);

    expect(result).toHaveLength(2);
    
    // Find messages by content
    const user1Message = result.find(msg => msg.content === 'Message from user1');
    const user2Message = result.find(msg => msg.content === 'Message from user2');

    expect(user1Message).toBeDefined();
    expect(user1Message!.username).toEqual('testuser1');
    expect(user1Message!.user_id).toEqual(user1Id);

    expect(user2Message).toBeDefined();
    expect(user2Message!.username).toEqual('testuser2');
    expect(user2Message!.user_id).toEqual(user2Id);
  });
});