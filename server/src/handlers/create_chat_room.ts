import { db } from '../db';
import { chatRoomsTable, roomMembersTable } from '../db/schema';
import { type CreateChatRoomInput, type ChatRoom } from '../schema';

// Generate a unique random invitation code
const generateInvitationCode = (): string => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const length = 8;
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
};

export const createChatRoom = async (input: CreateChatRoomInput, userId: number): Promise<ChatRoom> => {
  try {
    // Generate unique invitation code
    let invitationCode = generateInvitationCode();
    
    // Insert chat room record
    const result = await db.insert(chatRoomsTable)
      .values({
        name: input.name,
        description: input.description,
        invitation_code: invitationCode,
        created_by: userId
      })
      .returning()
      .execute();

    const chatRoom = result[0];

    // Automatically add the creator as the first member of the room
    await db.insert(roomMembersTable)
      .values({
        room_id: chatRoom.id,
        user_id: userId
      })
      .execute();

    return chatRoom;
  } catch (error) {
    console.error('Chat room creation failed:', error);
    throw error;
  }
};