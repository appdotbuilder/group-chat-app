import { z } from 'zod';

// User schema
export const userSchema = z.object({
  id: z.number(),
  username: z.string(),
  email: z.string().email(),
  password_hash: z.string(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export type User = z.infer<typeof userSchema>;

// User registration input schema
export const registerUserInputSchema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email(),
  password: z.string().min(8),
});

export type RegisterUserInput = z.infer<typeof registerUserInputSchema>;

// User login input schema
export const loginUserInputSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export type LoginUserInput = z.infer<typeof loginUserInputSchema>;

// Chat room schema
export const chatRoomSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  invitation_code: z.string(),
  created_by: z.number(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export type ChatRoom = z.infer<typeof chatRoomSchema>;

// Chat room creation input schema
export const createChatRoomInputSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().nullable(),
});

export type CreateChatRoomInput = z.infer<typeof createChatRoomInputSchema>;

// Join room input schema
export const joinRoomInputSchema = z.object({
  invitation_code: z.string(),
});

export type JoinRoomInput = z.infer<typeof joinRoomInputSchema>;

// Room member schema
export const roomMemberSchema = z.object({
  id: z.number(),
  room_id: z.number(),
  user_id: z.number(),
  joined_at: z.coerce.date(),
});

export type RoomMember = z.infer<typeof roomMemberSchema>;

// Message schema
export const messageSchema = z.object({
  id: z.number(),
  room_id: z.number(),
  user_id: z.number(),
  content: z.string().nullable(),
  message_type: z.enum(['text', 'file', 'image', 'document']),
  file_url: z.string().nullable(),
  file_name: z.string().nullable(),
  file_size: z.number().nullable(),
  file_type: z.string().nullable(),
  is_deleted: z.boolean(),
  deleted_at: z.coerce.date().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export type Message = z.infer<typeof messageSchema>;

// Send message input schema
export const sendMessageInputSchema = z.object({
  room_id: z.number(),
  content: z.string().optional(),
  message_type: z.enum(['text', 'file', 'image', 'document']).default('text'),
  file_url: z.string().optional(),
  file_name: z.string().optional(),
  file_size: z.number().optional(),
  file_type: z.string().optional(),
});

export type SendMessageInput = z.infer<typeof sendMessageInputSchema>;

// Delete message input schema
export const deleteMessageInputSchema = z.object({
  message_id: z.number(),
});

export type DeleteMessageInput = z.infer<typeof deleteMessageInputSchema>;

// Get messages input schema
export const getMessagesInputSchema = z.object({
  room_id: z.number(),
  limit: z.number().int().positive().max(100).default(50),
  offset: z.number().int().nonnegative().default(0),
});

export type GetMessagesInput = z.infer<typeof getMessagesInputSchema>;

// Get user rooms schema
export const getUserRoomsInputSchema = z.object({
  user_id: z.number(),
});

export type GetUserRoomsInput = z.infer<typeof getUserRoomsInputSchema>;

// Auth response schema
export const authResponseSchema = z.object({
  user: userSchema,
  token: z.string(),
});

export type AuthResponse = z.infer<typeof authResponseSchema>;

// Message with user info schema (for responses)
export const messageWithUserSchema = messageSchema.extend({
  username: z.string(),
});

export type MessageWithUser = z.infer<typeof messageWithUserSchema>;

// Room with member count schema (for responses)
export const roomWithMemberCountSchema = chatRoomSchema.extend({
  member_count: z.number(),
  is_member: z.boolean(),
});

export type RoomWithMemberCount = z.infer<typeof roomWithMemberCountSchema>;