import { serial, text, pgTable, timestamp, integer, boolean, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Define enum for message types
export const messageTypeEnum = pgEnum('message_type', ['text', 'file', 'image', 'document']);

// Users table
export const usersTable = pgTable('users', {
  id: serial('id').primaryKey(),
  username: text('username').notNull().unique(),
  email: text('email').notNull().unique(),
  password_hash: text('password_hash').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Chat rooms table
export const chatRoomsTable = pgTable('chat_rooms', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'), // Nullable by default
  invitation_code: text('invitation_code').notNull().unique(),
  created_by: integer('created_by').notNull().references(() => usersTable.id),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Room members table (many-to-many relationship between users and rooms)
export const roomMembersTable = pgTable('room_members', {
  id: serial('id').primaryKey(),
  room_id: integer('room_id').notNull().references(() => chatRoomsTable.id, { onDelete: 'cascade' }),
  user_id: integer('user_id').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
  joined_at: timestamp('joined_at').defaultNow().notNull(),
});

// Messages table
export const messagesTable = pgTable('messages', {
  id: serial('id').primaryKey(),
  room_id: integer('room_id').notNull().references(() => chatRoomsTable.id, { onDelete: 'cascade' }),
  user_id: integer('user_id').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
  content: text('content'), // Nullable for file messages
  message_type: messageTypeEnum('message_type').notNull().default('text'),
  file_url: text('file_url'), // Nullable
  file_name: text('file_name'), // Nullable
  file_size: integer('file_size'), // Nullable, file size in bytes
  file_type: text('file_type'), // Nullable, MIME type
  is_deleted: boolean('is_deleted').notNull().default(false),
  deleted_at: timestamp('deleted_at'), // Nullable
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Define relations
export const usersRelations = relations(usersTable, ({ many }) => ({
  createdRooms: many(chatRoomsTable),
  roomMemberships: many(roomMembersTable),
  messages: many(messagesTable),
}));

export const chatRoomsRelations = relations(chatRoomsTable, ({ one, many }) => ({
  creator: one(usersTable, {
    fields: [chatRoomsTable.created_by],
    references: [usersTable.id],
  }),
  members: many(roomMembersTable),
  messages: many(messagesTable),
}));

export const roomMembersRelations = relations(roomMembersTable, ({ one }) => ({
  room: one(chatRoomsTable, {
    fields: [roomMembersTable.room_id],
    references: [chatRoomsTable.id],
  }),
  user: one(usersTable, {
    fields: [roomMembersTable.user_id],
    references: [usersTable.id],
  }),
}));

export const messagesRelations = relations(messagesTable, ({ one }) => ({
  room: one(chatRoomsTable, {
    fields: [messagesTable.room_id],
    references: [chatRoomsTable.id],
  }),
  user: one(usersTable, {
    fields: [messagesTable.user_id],
    references: [usersTable.id],
  }),
}));

// TypeScript types for the table schemas
export type User = typeof usersTable.$inferSelect;
export type NewUser = typeof usersTable.$inferInsert;

export type ChatRoom = typeof chatRoomsTable.$inferSelect;
export type NewChatRoom = typeof chatRoomsTable.$inferInsert;

export type RoomMember = typeof roomMembersTable.$inferSelect;
export type NewRoomMember = typeof roomMembersTable.$inferInsert;

export type Message = typeof messagesTable.$inferSelect;
export type NewMessage = typeof messagesTable.$inferInsert;

// Export all tables and relations for proper query building
export const tables = {
  users: usersTable,
  chatRooms: chatRoomsTable,
  roomMembers: roomMembersTable,
  messages: messagesTable,
};