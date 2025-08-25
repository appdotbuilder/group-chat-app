import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, chatRoomsTable, messagesTable } from '../db/schema';
import { type DeleteMessageInput } from '../schema';
import { deleteMessage } from '../handlers/delete_message';
import { eq } from 'drizzle-orm';


describe('deleteMessage', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  let testUser: any;
  let anotherUser: any;
  let testRoom: any;
  let testMessage: any;

  beforeEach(async () => {
    // Create test users
    const users = await db.insert(usersTable)
      .values([
        {
          username: 'testuser',
          email: 'test@example.com',
          password_hash: 'hashed_password'
        },
        {
          username: 'anotheruser',
          email: 'another@example.com',
          password_hash: 'hashed_password'
        }
      ])
      .returning()
      .execute();

    testUser = users[0];
    anotherUser = users[1];

    // Create test room
    const rooms = await db.insert(chatRoomsTable)
      .values({
        name: 'Test Room',
        description: 'A room for testing',
        invitation_code: 'TEST123',
        created_by: testUser.id
      })
      .returning()
      .execute();

    testRoom = rooms[0];

    // Create test message
    const messages = await db.insert(messagesTable)
      .values({
        room_id: testRoom.id,
        user_id: testUser.id,
        content: 'Test message to be deleted',
        message_type: 'text'
      })
      .returning()
      .execute();

    testMessage = messages[0];
  });

  it('should successfully delete a message', async () => {
    const input: DeleteMessageInput = {
      message_id: testMessage.id
    };

    const result = await deleteMessage(input, testUser.id);

    // Verify response structure
    expect(result.id).toEqual(testMessage.id);
    expect(result.room_id).toEqual(testRoom.id);
    expect(result.user_id).toEqual(testUser.id);
    expect(result.content).toEqual('Test message to be deleted'); // Content should be preserved
    expect(result.message_type).toEqual('text');
    expect(result.is_deleted).toBe(true);
    expect(result.deleted_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
    expect(result.username).toEqual('testuser');
    expect(result.file_url).toBeNull();
    expect(result.file_name).toBeNull();
    expect(result.file_size).toBeNull();
    expect(result.file_type).toBeNull();
  });

  it('should save deletion status to database', async () => {
    const input: DeleteMessageInput = {
      message_id: testMessage.id
    };

    await deleteMessage(input, testUser.id);

    // Query database to verify the message was marked as deleted
    const messages = await db.select()
      .from(messagesTable)
      .where(eq(messagesTable.id, testMessage.id))
      .execute();

    expect(messages).toHaveLength(1);
    const deletedMessage = messages[0];
    expect(deletedMessage.is_deleted).toBe(true);
    expect(deletedMessage.deleted_at).toBeInstanceOf(Date);
    expect(deletedMessage.updated_at).toBeInstanceOf(Date);
    expect(deletedMessage.content).toEqual('Test message to be deleted'); // Content preserved
  });

  it('should throw error when message does not exist', async () => {
    const input: DeleteMessageInput = {
      message_id: 99999 // Non-existent message ID
    };

    expect(deleteMessage(input, testUser.id))
      .rejects.toThrow(/message not found or you are not authorized/i);
  });

  it('should throw error when user is not authorized to delete message', async () => {
    const input: DeleteMessageInput = {
      message_id: testMessage.id
    };

    // Try to delete with different user
    expect(deleteMessage(input, anotherUser.id))
      .rejects.toThrow(/message not found or you are not authorized/i);
  });

  it('should throw error when message is already deleted', async () => {
    // First, mark the message as deleted
    await db.update(messagesTable)
      .set({
        is_deleted: true,
        deleted_at: new Date()
      })
      .where(eq(messagesTable.id, testMessage.id))
      .execute();

    const input: DeleteMessageInput = {
      message_id: testMessage.id
    };

    expect(deleteMessage(input, testUser.id))
      .rejects.toThrow(/message is already deleted/i);
  });

  it('should handle file message deletion correctly', async () => {
    // Create a file message
    const fileMessage = await db.insert(messagesTable)
      .values({
        room_id: testRoom.id,
        user_id: testUser.id,
        content: null,
        message_type: 'image',
        file_url: 'https://example.com/image.jpg',
        file_name: 'image.jpg',
        file_size: 1024,
        file_type: 'image/jpeg'
      })
      .returning()
      .execute();

    const input: DeleteMessageInput = {
      message_id: fileMessage[0].id
    };

    const result = await deleteMessage(input, testUser.id);

    expect(result.message_type).toEqual('image');
    expect(result.file_url).toEqual('https://example.com/image.jpg');
    expect(result.file_name).toEqual('image.jpg');
    expect(result.file_size).toEqual(1024);
    expect(result.file_type).toEqual('image/jpeg');
    expect(result.is_deleted).toBe(true);
    expect(result.deleted_at).toBeInstanceOf(Date);
    expect(result.content).toBeNull();
  });

  it('should preserve original timestamps when deleting', async () => {
    const input: DeleteMessageInput = {
      message_id: testMessage.id
    };

    const result = await deleteMessage(input, testUser.id);

    expect(result.created_at).toEqual(testMessage.created_at);
    expect(result.updated_at.getTime()).toBeGreaterThan(testMessage.updated_at.getTime());
  });
});