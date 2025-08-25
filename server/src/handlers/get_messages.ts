import { db } from '../db';
import { messagesTable, usersTable, roomMembersTable } from '../db/schema';
import { type GetMessagesInput, type MessageWithUser } from '../schema';
import { eq, desc, and } from 'drizzle-orm';

export const getMessages = async (input: GetMessagesInput, userId: number): Promise<MessageWithUser[]> => {
  try {
    // First, validate that the user is a member of the room
    const membership = await db.select()
      .from(roomMembersTable)
      .where(and(
        eq(roomMembersTable.room_id, input.room_id),
        eq(roomMembersTable.user_id, userId)
      ))
      .execute();

    if (membership.length === 0) {
      throw new Error('User is not a member of this room');
    }

    // Query messages with user information, ordered by creation time (newest first)
    const results = await db.select({
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
      username: usersTable.username,
    })
      .from(messagesTable)
      .innerJoin(usersTable, eq(messagesTable.user_id, usersTable.id))
      .where(eq(messagesTable.room_id, input.room_id))
      .orderBy(desc(messagesTable.created_at)) // Newest first for better UX
      .limit(input.limit)
      .offset(input.offset)
      .execute();

    return results;
  } catch (error) {
    console.error('Get messages failed:', error);
    throw error;
  }
};