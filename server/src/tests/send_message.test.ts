import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, chatRoomsTable, roomMembersTable, messagesTable } from '../db/schema';
import { type SendMessageInput } from '../schema';
import { sendMessage } from '../handlers/send_message';
import { eq } from 'drizzle-orm';

// Test data setup
const testUser = {
  username: 'testuser',
  email: 'test@example.com',
  password_hash: 'hashed_password'
};

const anotherUser = {
  username: 'anotheruser',
  email: 'another@example.com',
  password_hash: 'hashed_password'
};

const testRoom = {
  name: 'Test Room',
  description: 'A room for testing',
  invitation_code: 'TEST123'
};

describe('sendMessage', () => {
  let userId: number;
  let anotherUserId: number;
  let roomId: number;
  let creatorId: number;

  beforeEach(async () => {
    await createDB();

    // Create test users
    const userResults = await db.insert(usersTable)
      .values([testUser, anotherUser])
      .returning()
      .execute();
    
    userId = userResults[0].id;
    anotherUserId = userResults[1].id;
    creatorId = userId;

    // Create test room
    const roomResult = await db.insert(chatRoomsTable)
      .values({
        ...testRoom,
        created_by: creatorId
      })
      .returning()
      .execute();

    roomId = roomResult[0].id;

    // Add user as member of the room
    await db.insert(roomMembersTable)
      .values({
        room_id: roomId,
        user_id: userId
      })
      .execute();
  });

  afterEach(resetDB);

  describe('text messages', () => {
    const textMessageInput: SendMessageInput = {
      room_id: 1, // Will be set in tests
      content: 'Hello, world!',
      message_type: 'text'
    };

    it('should send a text message successfully', async () => {
      const input = { ...textMessageInput, room_id: roomId };
      const result = await sendMessage(input, userId);

      expect(result.id).toBeDefined();
      expect(result.room_id).toEqual(roomId);
      expect(result.user_id).toEqual(userId);
      expect(result.content).toEqual('Hello, world!');
      expect(result.message_type).toEqual('text');
      expect(result.file_url).toBeNull();
      expect(result.file_name).toBeNull();
      expect(result.file_size).toBeNull();
      expect(result.file_type).toBeNull();
      expect(result.is_deleted).toBe(false);
      expect(result.deleted_at).toBeNull();
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
      expect(result.username).toEqual('testuser');
    });

    it('should save text message to database', async () => {
      const input = { ...textMessageInput, room_id: roomId };
      const result = await sendMessage(input, userId);

      const messages = await db.select()
        .from(messagesTable)
        .where(eq(messagesTable.id, result.id))
        .execute();

      expect(messages).toHaveLength(1);
      expect(messages[0].content).toEqual('Hello, world!');
      expect(messages[0].message_type).toEqual('text');
      expect(messages[0].user_id).toEqual(userId);
      expect(messages[0].room_id).toEqual(roomId);
    });

    it('should reject text message without content', async () => {
      const input = {
        room_id: roomId,
        message_type: 'text' as const
        // No content provided
      };

      await expect(sendMessage(input, userId)).rejects.toThrow(/text messages must have content/i);
    });
  });

  describe('file messages', () => {
    const fileMessageInput: SendMessageInput = {
      room_id: 1, // Will be set in tests
      message_type: 'file',
      file_url: 'https://example.com/file.pdf',
      file_name: 'document.pdf',
      file_size: 1024,
      file_type: 'application/pdf'
    };

    it('should send a file message successfully', async () => {
      const input = { ...fileMessageInput, room_id: roomId };
      const result = await sendMessage(input, userId);

      expect(result.id).toBeDefined();
      expect(result.room_id).toEqual(roomId);
      expect(result.user_id).toEqual(userId);
      expect(result.content).toBeNull();
      expect(result.message_type).toEqual('file');
      expect(result.file_url).toEqual('https://example.com/file.pdf');
      expect(result.file_name).toEqual('document.pdf');
      expect(result.file_size).toEqual(1024);
      expect(result.file_type).toEqual('application/pdf');
      expect(result.username).toEqual('testuser');
    });

    it('should send an image message successfully', async () => {
      const imageInput: SendMessageInput = {
        room_id: roomId,
        message_type: 'image',
        file_url: 'https://example.com/image.jpg',
        file_name: 'photo.jpg',
        file_size: 2048,
        file_type: 'image/jpeg'
      };

      const result = await sendMessage(imageInput, userId);

      expect(result.message_type).toEqual('image');
      expect(result.file_url).toEqual('https://example.com/image.jpg');
      expect(result.file_type).toEqual('image/jpeg');
    });

    it('should send a document message successfully', async () => {
      const docInput: SendMessageInput = {
        room_id: roomId,
        message_type: 'document',
        file_url: 'https://example.com/doc.docx',
        file_name: 'report.docx',
        file_size: 4096,
        file_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      };

      const result = await sendMessage(docInput, userId);

      expect(result.message_type).toEqual('document');
      expect(result.file_url).toEqual('https://example.com/doc.docx');
      expect(result.file_type).toEqual('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    });

    it('should reject file message without file_url', async () => {
      const input = {
        room_id: roomId,
        message_type: 'file' as const,
        file_name: 'test.pdf'
        // No file_url provided
      };

      await expect(sendMessage(input, userId)).rejects.toThrow(/file messages must have file_url/i);
    });
  });

  describe('room membership validation', () => {
    it('should reject message from non-member user', async () => {
      const input: SendMessageInput = {
        room_id: roomId,
        content: 'Hello from non-member',
        message_type: 'text'
      };

      // anotherUserId is not a member of the room
      await expect(sendMessage(input, anotherUserId)).rejects.toThrow(/user is not a member of this room/i);
    });

    it('should allow message after user joins room', async () => {
      // Add another user as member
      await db.insert(roomMembersTable)
        .values({
          room_id: roomId,
          user_id: anotherUserId
        })
        .execute();

      const input: SendMessageInput = {
        room_id: roomId,
        content: 'Hello from new member',
        message_type: 'text'
      };

      const result = await sendMessage(input, anotherUserId);
      expect(result.username).toEqual('anotheruser');
      expect(result.content).toEqual('Hello from new member');
    });

    it('should reject message to non-existent room', async () => {
      const input: SendMessageInput = {
        room_id: 99999, // Non-existent room
        content: 'Hello',
        message_type: 'text'
      };

      await expect(sendMessage(input, userId)).rejects.toThrow(/user is not a member of this room/i);
    });
  });

  describe('message content variations', () => {
    it('should handle empty optional file fields', async () => {
      const input: SendMessageInput = {
        room_id: roomId,
        message_type: 'file',
        file_url: 'https://example.com/file.txt'
        // Optional fields not provided
      };

      const result = await sendMessage(input, userId);
      expect(result.file_name).toBeNull();
      expect(result.file_size).toBeNull();
      expect(result.file_type).toBeNull();
    });

    it('should handle text message with explicit message_type', async () => {
      const input: SendMessageInput = {
        room_id: roomId,
        content: 'Test message',
        message_type: 'text' // Explicitly set since handler expects parsed input
      };

      const result = await sendMessage(input, userId);
      expect(result.message_type).toEqual('text');
      expect(result.content).toEqual('Test message');
    });
  });
});