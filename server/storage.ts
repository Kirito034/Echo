import { 
  users, type User, type InsertUser,
  chats, type Chat, type InsertChat,
  chatParticipants, type ChatParticipant, type InsertChatParticipant,
  messages, type Message, type InsertMessage
} from "@shared/schema";
import session from "express-session";
import { Store } from "express-session";
import { db } from "./db";
import { eq, and, asc, or, inArray } from "drizzle-orm";
import connectPg from "connect-pg-simple";
import { pool } from "./db";
import createMemoryStore from "memorystore";

// Create PostgreSQL session store
const PostgresSessionStore = connectPg(session);

// Create a memory store as fallback (in case DB connection fails)
const MemoryStore = createMemoryStore(session);

export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail?(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserStatus(userId: number, status: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  
  // Chat operations
  getChat(id: number): Promise<Chat | undefined>;
  createChat(chat: InsertChat): Promise<Chat>;
  getChatsByUserId(userId: number): Promise<Chat[]>;
  pinChat(chatId: number, isPinned: boolean): Promise<Chat | undefined>;
  
  // Chat participant operations
  addParticipantToChat(participant: InsertChatParticipant): Promise<ChatParticipant>;
  getChatParticipants(chatId: number): Promise<User[]>;
  
  // Message operations
  createMessage(message: InsertMessage): Promise<Message>;
  getMessagesByChatId(chatId: number): Promise<Message[]>;
  markMessageAsRead(messageId: number): Promise<Message | undefined>;
  
  // Session store for authentication
  sessionStore: Store;
}

export class DatabaseStorage implements IStorage {
  sessionStore: Store;
  
  constructor() {
    this.sessionStore = new PostgresSessionStore({ 
      pool, 
      createTableIfMissing: true 
    });
  }

  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [newUser] = await db.insert(users).values(user).returning();
    return newUser;
  }

  async updateUserStatus(userId: number, status: string): Promise<User | undefined> {
    const [updatedUser] = await db
      .update(users)
      .set({ status, lastSeen: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return updatedUser;
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  async getChat(id: number): Promise<Chat | undefined> {
    const [chat] = await db.select().from(chats).where(eq(chats.id, id));
    return chat;
  }

  async createChat(chat: InsertChat): Promise<Chat> {
    const [newChat] = await db.insert(chats).values(chat).returning();
    return newChat;
  }

  async getChatsByUserId(userId: number): Promise<Chat[]> {
    // Get chat IDs where user is a participant
    const chatParticipantResults = await db
      .select({ chatId: chatParticipants.chatId })
      .from(chatParticipants)
      .where(eq(chatParticipants.userId, userId));
    
    if (chatParticipantResults.length === 0) {
      return [];
    }
    
    const chatIds = chatParticipantResults.map(c => c.chatId);
    
    // Get the chats
    return await db
      .select()
      .from(chats)
      .where(inArray(chats.id, chatIds));
  }

  async pinChat(chatId: number, isPinned: boolean): Promise<Chat | undefined> {
    const [updatedChat] = await db
      .update(chats)
      .set({ isPinned })
      .where(eq(chats.id, chatId))
      .returning();
    return updatedChat;
  }

  async addParticipantToChat(participant: InsertChatParticipant): Promise<ChatParticipant> {
    const [newParticipant] = await db
      .insert(chatParticipants)
      .values(participant)
      .returning();
    return newParticipant;
  }

  async getChatParticipants(chatId: number): Promise<User[]> {
    const participants = await db
      .select({ userId: chatParticipants.userId })
      .from(chatParticipants)
      .where(eq(chatParticipants.chatId, chatId));

    if (participants.length === 0) {
      return [];
    }

    const userIds = participants.map(p => p.userId);
    
    return await db
      .select()
      .from(users)
      .where(inArray(users.id, userIds));
  }

  async createMessage(message: InsertMessage): Promise<Message> {
    const [newMessage] = await db
      .insert(messages)
      .values(message)
      .returning();
    return newMessage;
  }

  async getMessagesByChatId(chatId: number): Promise<Message[]> {
    return await db
      .select()
      .from(messages)
      .where(eq(messages.chatId, chatId))
      .orderBy(asc(messages.sentAt));
  }

  async markMessageAsRead(messageId: number): Promise<Message | undefined> {
    const [updatedMessage] = await db
      .update(messages)
      .set({ isRead: true })
      .where(eq(messages.id, messageId))
      .returning();
    return updatedMessage;
  }
}

// Switch to use the database storage
export const storage = new DatabaseStorage();