import { db } from '../db';
import { chatRoomsTable, roomMembersTable } from '../db/schema';
import { type JoinRoomInput, type ChatRoom } from '../schema';
import { eq, and } from 'drizzle-orm';

export const joinRoom = async (input: JoinRoomInput, userId: number): Promise<ChatRoom> => {
  try {
    // 1. Find chat room by invitation code
    const rooms = await db.select()
      .from(chatRoomsTable)
      .where(eq(chatRoomsTable.invitation_code, input.invitation_code))
      .execute();

    if (rooms.length === 0) {
      throw new Error('Invalid invitation code');
    }

    const room = rooms[0];

    // 2. Check if user is not already a member
    const existingMembership = await db.select()
      .from(roomMembersTable)
      .where(
        and(
          eq(roomMembersTable.room_id, room.id),
          eq(roomMembersTable.user_id, userId)
        )
      )
      .execute();

    if (existingMembership.length > 0) {
      throw new Error('User is already a member of this room');
    }

    // 3. Add user to room_members table
    await db.insert(roomMembersTable)
      .values({
        room_id: room.id,
        user_id: userId
      })
      .execute();

    // 4. Return the joined room data
    return room;
  } catch (error) {
    console.error('Join room failed:', error);
    throw error;
  }
};