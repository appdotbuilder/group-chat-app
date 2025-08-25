import { db } from '../db';
import { chatRoomsTable, roomMembersTable } from '../db/schema';
import { type GetUserRoomsInput, type RoomWithMemberCount } from '../schema';
import { eq, desc, count } from 'drizzle-orm';

export const getUserRooms = async (input: GetUserRoomsInput): Promise<RoomWithMemberCount[]> => {
  try {
    // First, get rooms where user is a member
    const userRooms = await db
      .select({
        id: chatRoomsTable.id,
        name: chatRoomsTable.name,
        description: chatRoomsTable.description,
        invitation_code: chatRoomsTable.invitation_code,
        created_by: chatRoomsTable.created_by,
        created_at: chatRoomsTable.created_at,
        updated_at: chatRoomsTable.updated_at,
      })
      .from(roomMembersTable)
      .innerJoin(chatRoomsTable, eq(roomMembersTable.room_id, chatRoomsTable.id))
      .where(eq(roomMembersTable.user_id, input.user_id))
      .orderBy(desc(chatRoomsTable.updated_at))
      .execute();

    // Then, for each room, count the total members
    const roomsWithMemberCount: RoomWithMemberCount[] = [];
    
    for (const room of userRooms) {
      const memberCountResult = await db
        .select({ count: count(roomMembersTable.id) })
        .from(roomMembersTable)
        .where(eq(roomMembersTable.room_id, room.id))
        .execute();

      roomsWithMemberCount.push({
        ...room,
        member_count: Number(memberCountResult[0].count),
        is_member: true, // Always true since we're querying rooms where user is a member
      });
    }

    return roomsWithMemberCount;
  } catch (error) {
    console.error('Get user rooms failed:', error);
    throw error;
  }
};