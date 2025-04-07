import { 
  users, type User, type InsertUser,
  chats, type Chat, type InsertChat,
  chatParticipants, type ChatParticipant, type InsertChatParticipant,
  messages, type Message, type InsertMessage,
  connectionRequests, type ConnectionRequest, type InsertConnectionRequest
} from "../shared/schema";
import session from "express-session";
import { Store } from "express-session";
import { db } from "./db.ts";
import { eq, and, asc, or, inArray, ne, sql } from "drizzle-orm";
import connectPg from "connect-pg-simple";
import { pool } from "./db.ts";
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
  updateUser(userId: number, updates: Partial<User>): Promise<User | undefined>;
  updateUserStatus(userId: number, status: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  searchUsers(query: string, currentUserId: number): Promise<User[]>;
  
  // Connection request operations
  createConnectionRequest(request: InsertConnectionRequest): Promise<ConnectionRequest>;
  getConnectionRequest(id: number): Promise<ConnectionRequest | undefined>;
  getConnectionRequestByUsers(senderId: number, receiverId: number): Promise<ConnectionRequest | undefined>;
  getReceivedConnectionRequests(userId: number): Promise<(ConnectionRequest & { sender: User })[]>;
  getSentConnectionRequests(userId: number): Promise<(ConnectionRequest & { receiver: User })[]>;
  updateConnectionRequestStatus(requestId: number, status: string): Promise<ConnectionRequest | undefined>;
  getConnectedUsers(userId: number): Promise<User[]>;
  
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

  async updateUser(userId: number, updates: Partial<User>): Promise<User | undefined> {
    const [updatedUser] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, userId))
      .returning();
    return updatedUser;
  }

  async updateUserStatus(userId: number, status: string): Promise<User | undefined> {
    return this.updateUser(userId, { status, lastSeen: new Date() });
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  async searchUsers(query: string, currentUserId: number): Promise<User[]> {
    try {
      // Use simple exact matches for safety
      const exactMatches = await db.select()
        .from(users)
        .where(
          and(
            ne(users.id, currentUserId),
            or(
              eq(users.username, query),
              eq(users.email, query)
            )
          )
        );
      
      // Then separately find partial matches in a way that's safer
      const lowerQuery = query.toLowerCase();
      const allUsers = await db.select()
        .from(users)
        .where(ne(users.id, currentUserId));
      
      // Filter users for partial matches in JavaScript (safer approach)
      const partialMatches = allUsers.filter(user => 
        !exactMatches.some(match => match.id === user.id) && (
          user.email.toLowerCase().includes(lowerQuery) ||
          user.username.toLowerCase().includes(lowerQuery) ||
          (user.displayName && user.displayName.toLowerCase().includes(lowerQuery))
        )
      );
      
      // Combine both result sets with exact matches first
      return [...exactMatches, ...partialMatches];
    } catch (error) {
      console.error("Error in searchUsers:", error);
      return [];
    }
  }

  // Connection request methods
  async createConnectionRequest(request: InsertConnectionRequest): Promise<ConnectionRequest> {
    const [newRequest] = await db
      .insert(connectionRequests)
      .values(request)
      .returning();
    return newRequest;
  }

  async getConnectionRequest(id: number): Promise<ConnectionRequest | undefined> {
    const [request] = await db
      .select()
      .from(connectionRequests)
      .where(eq(connectionRequests.id, id));
    return request;
  }

  async getConnectionRequestByUsers(senderId: number, receiverId: number): Promise<ConnectionRequest | undefined> {
    const [request] = await db
      .select()
      .from(connectionRequests)
      .where(
        and(
          eq(connectionRequests.senderId, senderId),
          eq(connectionRequests.receiverId, receiverId)
        )
      );
    return request;
  }

  async getReceivedConnectionRequests(userId: number): Promise<(ConnectionRequest & { sender: User })[]> {
    const requests = await db
      .select()
      .from(connectionRequests)
      .where(
        and(
          eq(connectionRequests.receiverId, userId),
          eq(connectionRequests.status, "pending")
        )
      );

    // If no requests, return empty array
    if (requests.length === 0) {
      return [];
    }

    // Get senders for each request
    const result = [];
    for (const request of requests) {
      const [sender] = await db
        .select()
        .from(users)
        .where(eq(users.id, request.senderId));
      
      if (sender) {
        result.push({
          ...request,
          sender
        });
      }
    }

    return result;
  }

  async getSentConnectionRequests(userId: number): Promise<(ConnectionRequest & { receiver: User })[]> {
    const requests = await db
      .select()
      .from(connectionRequests)
      .where(eq(connectionRequests.senderId, userId));

    // If no requests, return empty array
    if (requests.length === 0) {
      return [];
    }

    // Get receivers for each request
    const result = [];
    for (const request of requests) {
      const [receiver] = await db
        .select()
        .from(users)
        .where(eq(users.id, request.receiverId));
      
      if (receiver) {
        result.push({
          ...request,
          receiver
        });
      }
    }

    return result;
  }

  async updateConnectionRequestStatus(requestId: number, status: string): Promise<ConnectionRequest | undefined> {
    const [updatedRequest] = await db
      .update(connectionRequests)
      .set({ 
        status, 
        updatedAt: new Date() 
      })
      .where(eq(connectionRequests.id, requestId))
      .returning();
    return updatedRequest;
  }

  async getConnectedUsers(userId: number): Promise<User[]> {
    // Get user IDs who have accepted connection requests with the current user
    const acceptedRequestsAsSender = await db
      .select({ otherUserId: connectionRequests.receiverId })
      .from(connectionRequests)
      .where(
        and(
          eq(connectionRequests.senderId, userId),
          eq(connectionRequests.status, "accepted")
        )
      );

    const acceptedRequestsAsReceiver = await db
      .select({ otherUserId: connectionRequests.senderId })
      .from(connectionRequests)
      .where(
        and(
          eq(connectionRequests.receiverId, userId),
          eq(connectionRequests.status, "accepted")
        )
      );

    // Combine the two sets of user IDs
    const connectedUserIds = [
      ...acceptedRequestsAsSender.map(r => r.otherUserId),
      ...acceptedRequestsAsReceiver.map(r => r.otherUserId)
    ];

    if (connectedUserIds.length === 0) {
      return [];
    }

    // Get user details for the connected users
    return await db
      .select()
      .from(users)
      .where(inArray(users.id, connectedUserIds));
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