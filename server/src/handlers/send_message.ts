import { db } from '../db';
import { messagesTable, roomMembersTable, usersTable } from '../db/schema';
import { type SendMessageInput, type MessageWithUser } from '../schema';
import { eq, and } from 'drizzle-orm';

export const sendMessage = async (input: SendMessageInput, userId: number): Promise<MessageWithUser> => {
  try {
    // 1. Validate user is a member of the specified room
    const membership = await db.select()
      .from(roomMembersTable)
      .where(
        and(
          eq(roomMembersTable.room_id, input.room_id),
          eq(roomMembersTable.user_id, userId)
        )
      )
      .execute();

    if (membership.length === 0) {
      throw new Error('User is not a member of this room');
    }

    // 2. Validate message content based on message type
    if (input.message_type === 'text' && !input.content) {
      throw new Error('Text messages must have content');
    }

    if (input.message_type !== 'text' && !input.file_url) {
      throw new Error('File messages must have file_url');
    }

    // 3. Insert new message record in database
    const messageResult = await db.insert(messagesTable)
      .values({
        room_id: input.room_id,
        user_id: userId,
        content: input.content || null,
        message_type: input.message_type,
        file_url: input.file_url || null,
        file_name: input.file_name || null,
        file_size: input.file_size || null,
        file_type: input.file_type || null,
        is_deleted: false,
        deleted_at: null
      })
      .returning()
      .execute();

    const message = messageResult[0];

    // 4. Join with user data to get username for response
    const messageWithUser = await db.select({
      id: messagesTable.id,
      room_id: messagesTable.room_id,
      user_id: messagesTable.user_id,
      content: messagesTable.content,
      message_type: messagesTable.message_type,
      file_url: messagesTable.file_url,
      file_name: messagesTable.file_name,
      file_size: messagesTable.file_size,
      file_type: messagesTable.file_type,
      is_deleted: messagesTable.is_deleted,
      deleted_at: messagesTable.deleted_at,
      created_at: messagesTable.created_at,
      updated_at: messagesTable.updated_at,
      username: usersTable.username
    })
      .from(messagesTable)
      .innerJoin(usersTable, eq(messagesTable.user_id, usersTable.id))
      .where(eq(messagesTable.id, message.id))
      .execute();

    return messageWithUser[0];
  } catch (error) {
    console.error('Send message failed:', error);
    throw error;
  }
};