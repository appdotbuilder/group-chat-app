import { db } from '../db';
import { messagesTable, usersTable } from '../db/schema';
import { type DeleteMessageInput, type MessageWithUser } from '../schema';
import { eq, and } from 'drizzle-orm';

export const deleteMessage = async (input: DeleteMessageInput, userId: number): Promise<MessageWithUser> => {
  try {
    // First, verify the message exists and belongs to the requesting user
    const existingMessage = await db.select()
      .from(messagesTable)
      .where(
        and(
          eq(messagesTable.id, input.message_id),
          eq(messagesTable.user_id, userId)
        )
      )
      .execute();

    if (existingMessage.length === 0) {
      throw new Error('Message not found or you are not authorized to delete this message');
    }

    const message = existingMessage[0];

    // Check if message is already deleted
    if (message.is_deleted) {
      throw new Error('Message is already deleted');
    }

    // Update the message to mark it as deleted
    const updatedMessages = await db.update(messagesTable)
      .set({
        is_deleted: true,
        deleted_at: new Date(),
        updated_at: new Date()
      })
      .where(eq(messagesTable.id, input.message_id))
      .returning()
      .execute();

    const updatedMessage = updatedMessages[0];

    // Get username by joining with users table
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
      .where(eq(messagesTable.id, input.message_id))
      .execute();

    return messageWithUser[0];
  } catch (error) {
    console.error('Message deletion failed:', error);
    throw error;
  }
};