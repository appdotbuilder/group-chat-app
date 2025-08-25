import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import 'dotenv/config';
import cors from 'cors';
import superjson from 'superjson';

// Import schemas
import { 
  registerUserInputSchema,
  loginUserInputSchema,
  createChatRoomInputSchema,
  joinRoomInputSchema,
  getUserRoomsInputSchema,
  sendMessageInputSchema,
  getMessagesInputSchema,
  deleteMessageInputSchema
} from './schema';

// Import handlers
import { registerUser } from './handlers/register_user';
import { loginUser } from './handlers/login_user';
import { createChatRoom } from './handlers/create_chat_room';
import { joinRoom } from './handlers/join_room';
import { getUserRooms } from './handlers/get_user_rooms';
import { sendMessage } from './handlers/send_message';
import { getMessages } from './handlers/get_messages';
import { deleteMessage } from './handlers/delete_message';

const t = initTRPC.create({
  transformer: superjson,
});

const publicProcedure = t.procedure;
const router = t.router;

// Main application router
const appRouter = router({
  // Health check endpoint
  healthcheck: publicProcedure.query(() => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }),

  // Authentication endpoints
  registerUser: publicProcedure
    .input(registerUserInputSchema)
    .mutation(({ input }) => registerUser(input)),

  loginUser: publicProcedure
    .input(loginUserInputSchema)
    .mutation(({ input }) => loginUser(input)),

  // Chat room management endpoints
  createChatRoom: publicProcedure
    .input(createChatRoomInputSchema)
    .mutation(({ input, ctx }) => {
      // TODO: Extract userId from JWT token in context
      const userId = 1; // Placeholder - should come from authenticated context
      return createChatRoom(input, userId);
    }),

  joinRoom: publicProcedure
    .input(joinRoomInputSchema)
    .mutation(({ input, ctx }) => {
      // TODO: Extract userId from JWT token in context
      const userId = 1; // Placeholder - should come from authenticated context
      return joinRoom(input, userId);
    }),

  getUserRooms: publicProcedure
    .input(getUserRoomsInputSchema)
    .query(({ input }) => getUserRooms(input)),

  // Message management endpoints
  sendMessage: publicProcedure
    .input(sendMessageInputSchema)
    .mutation(({ input, ctx }) => {
      // TODO: Extract userId from JWT token in context
      const userId = 1; // Placeholder - should come from authenticated context
      return sendMessage(input, userId);
    }),

  getMessages: publicProcedure
    .input(getMessagesInputSchema)
    .query(({ input, ctx }) => {
      // TODO: Extract userId from JWT token in context
      const userId = 1; // Placeholder - should come from authenticated context
      return getMessages(input, userId);
    }),

  deleteMessage: publicProcedure
    .input(deleteMessageInputSchema)
    .mutation(({ input, ctx }) => {
      // TODO: Extract userId from JWT token in context
      const userId = 1; // Placeholder - should come from authenticated context
      return deleteMessage(input, userId);
    }),
});

export type AppRouter = typeof appRouter;

async function start() {
  const port = process.env['SERVER_PORT'] || 2022;
  const server = createHTTPServer({
    middleware: (req, res, next) => {
      cors()(req, res, next);
    },
    router: appRouter,
    createContext() {
      // TODO: Implement JWT token extraction and user authentication
      // Context should include authenticated user information
      return {};
    },
  });
  server.listen(port);
  console.log(`TRPC server listening at port: ${port}`);
}

start();