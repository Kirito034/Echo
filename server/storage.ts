import { 
  users, type User, type InsertUser,
  chats, type Chat, type InsertChat,
  chatParticipants, type ChatParticipant, type InsertChatParticipant,
  messages, type Message, type InsertMessage
} from "@shared/schema";

export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
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
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private chats: Map<number, Chat>;
  private chatParticipants: Map<number, ChatParticipant>;
  private messages: Map<number, Message>;
  
  private userIdCounter: number;
  private chatIdCounter: number;
  private participantIdCounter: number;
  private messageIdCounter: number;

  constructor() {
    this.users = new Map();
    this.chats = new Map();
    this.chatParticipants = new Map();
    this.messages = new Map();
    
    this.userIdCounter = 1;
    this.chatIdCounter = 1;
    this.participantIdCounter = 1;
    this.messageIdCounter = 1;
    
    // Initialize with some demo users
    this.initializeDemoData();
  }

  private initializeDemoData() {
    // Create demo users
    const user1 = this.createUserInternal({
      username: "sophie",
      password: "password123",
      displayName: "Sophie Chen",
      status: "online",
      avatarUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=120&q=80"
    });
    
    const user2 = this.createUserInternal({
      username: "marcus",
      password: "password123",
      displayName: "Marcus Kim",
      status: "offline",
      avatarUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=120&q=80"
    });
    
    const user3 = this.createUserInternal({
      username: "elena",
      password: "password123",
      displayName: "Elena Walsh",
      status: "online",
      avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=120&q=80"
    });
    
    const user4 = this.createUserInternal({
      username: "david",
      password: "password123",
      displayName: "David Lin",
      status: "offline",
      avatarUrl: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=120&q=80"
    });
    
    // Create demo group
    const groupChat = this.createChatInternal({
      name: "Design Team",
      isPinned: false
    });
    
    // Create demo 1:1 chats
    const sophieChat = this.createChatInternal({
      isPinned: true
    });
    const marcusChat = this.createChatInternal({
      isPinned: false
    });
    const elenaChat = this.createChatInternal({
      isPinned: false
    });
    const davidChat = this.createChatInternal({
      isPinned: false
    });
    
    // Add participants to chats
    this.addParticipantToChatInternal({ chatId: sophieChat.id, userId: user1.id });
    this.addParticipantToChatInternal({ chatId: sophieChat.id, userId: this.userIdCounter });
    
    this.addParticipantToChatInternal({ chatId: marcusChat.id, userId: user2.id });
    this.addParticipantToChatInternal({ chatId: marcusChat.id, userId: this.userIdCounter });
    
    this.addParticipantToChatInternal({ chatId: elenaChat.id, userId: user3.id });
    this.addParticipantToChatInternal({ chatId: elenaChat.id, userId: this.userIdCounter });
    
    this.addParticipantToChatInternal({ chatId: davidChat.id, userId: user4.id });
    this.addParticipantToChatInternal({ chatId: davidChat.id, userId: this.userIdCounter });
    
    // Add participants to group chat
    this.addParticipantToChatInternal({ chatId: groupChat.id, userId: user1.id });
    this.addParticipantToChatInternal({ chatId: groupChat.id, userId: user2.id });
    this.addParticipantToChatInternal({ chatId: groupChat.id, userId: user3.id });
    this.addParticipantToChatInternal({ chatId: groupChat.id, userId: this.userIdCounter });
    
    // Add some messages to Sophie's chat
    this.createMessageInternal({
      chatId: sophieChat.id,
      senderId: user1.id,
      content: "Hi there! How's your day going?",
      sentAt: new Date(Date.now() - 3600000)
    });
    
    this.createMessageInternal({
      chatId: sophieChat.id,
      senderId: user1.id,
      content: "Did you get a chance to look at the documents I sent yesterday?",
      sentAt: new Date(Date.now() - 3500000)
    });
    
    this.createMessageInternal({
      chatId: sophieChat.id,
      senderId: this.userIdCounter,
      content: "Hey Sophie! My day's going well, thanks for asking.",
      sentAt: new Date(Date.now() - 3400000)
    });
    
    this.createMessageInternal({
      chatId: sophieChat.id,
      senderId: this.userIdCounter,
      content: "Yes, I've reviewed them. They look great! I just have a few questions about the timeline.",
      sentAt: new Date(Date.now() - 3300000)
    });
    
    this.createMessageInternal({
      chatId: sophieChat.id,
      senderId: user1.id,
      mediaType: "voice",
      mediaUrl: "/api/media/voice-message-1.mp3",
      sentAt: new Date(Date.now() - 3200000)
    });
    
    this.createMessageInternal({
      chatId: sophieChat.id,
      senderId: this.userIdCounter,
      mediaType: "image",
      mediaUrl: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=500&q=80",
      content: "Here's a screenshot of my notes from our last meeting.",
      sentAt: new Date(Date.now() - 3100000)
    });
    
    // Add messages to Marcus's chat
    this.createMessageInternal({
      chatId: marcusChat.id,
      senderId: user2.id,
      content: "Can you send me the project files?",
      sentAt: new Date(Date.now() - 86400000) // yesterday
    });
    
    // Add messages to Group chat
    this.createMessageInternal({
      chatId: groupChat.id,
      senderId: user3.id,
      content: "Let's finalize the UI tomorrow",
      sentAt: new Date(Date.now() - 86400000 * 3) // 3 days ago
    });
    
    // Add message to David's chat
    this.createMessageInternal({
      chatId: davidChat.id,
      senderId: user4.id,
      mediaType: "image",
      mediaUrl: "https://example.com/photo.jpg",
      sentAt: new Date(Date.now() - 86400000 * 4) // 4 days ago
    });
    
    // Create a "current user"
    this.createUserInternal({
      username: "currentuser",
      password: "password123",
      displayName: "You",
      status: "online",
      avatarUrl: "https://images.unsplash.com/photo-1517841905240-472988babdf9?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=120&q=80"
    });
  }

  private createUserInternal(user: Omit<InsertUser, "password"> & { password: string }): User {
    const id = this.userIdCounter++;
    const newUser: User = { ...user, id };
    this.users.set(id, newUser);
    return newUser;
  }

  private createChatInternal(chat: Partial<InsertChat>): Chat {
    const id = this.chatIdCounter++;
    const now = new Date();
    const newChat: Chat = {
      id,
      name: chat.name || null,
      isPinned: chat.isPinned || false,
      createdAt: now
    };
    this.chats.set(id, newChat);
    return newChat;
  }

  private addParticipantToChatInternal(participant: InsertChatParticipant): ChatParticipant {
    const id = this.participantIdCounter++;
    const newParticipant: ChatParticipant = { ...participant, id };
    this.chatParticipants.set(id, newParticipant);
    return newParticipant;
  }

  private createMessageInternal(message: Partial<InsertMessage> & { chatId: number; senderId: number; sentAt?: Date }): Message {
    const id = this.messageIdCounter++;
    const now = message.sentAt || new Date();
    const newMessage: Message = {
      id,
      chatId: message.chatId,
      senderId: message.senderId,
      content: message.content || null,
      mediaUrl: message.mediaUrl || null,
      mediaType: message.mediaType || null,
      isRead: false,
      sentAt: now
    };
    this.messages.set(id, newMessage);
    return newMessage;
  }

  // User operations
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(user: InsertUser): Promise<User> {
    const id = this.userIdCounter++;
    const newUser: User = { ...user, id, lastSeen: new Date() };
    this.users.set(id, newUser);
    return newUser;
  }

  async updateUserStatus(userId: number, status: string): Promise<User | undefined> {
    const user = this.users.get(userId);
    if (!user) return undefined;
    
    const updatedUser = { ...user, status, lastSeen: new Date() };
    this.users.set(userId, updatedUser);
    return updatedUser;
  }

  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  // Chat operations
  async getChat(id: number): Promise<Chat | undefined> {
    return this.chats.get(id);
  }

  async createChat(chat: InsertChat): Promise<Chat> {
    const id = this.chatIdCounter++;
    const newChat: Chat = { ...chat, id, createdAt: new Date() };
    this.chats.set(id, newChat);
    return newChat;
  }

  async getChatsByUserId(userId: number): Promise<Chat[]> {
    // Find all chat IDs where the user is a participant
    const chatIds = Array.from(this.chatParticipants.values())
      .filter(participant => participant.userId === userId)
      .map(participant => participant.chatId);
    
    // Get the unique chat IDs
    const uniqueChatIds = [...new Set(chatIds)];
    
    // Return all chats
    return uniqueChatIds
      .map(chatId => this.chats.get(chatId))
      .filter((chat): chat is Chat => chat !== undefined);
  }

  async pinChat(chatId: number, isPinned: boolean): Promise<Chat | undefined> {
    const chat = this.chats.get(chatId);
    if (!chat) return undefined;
    
    const updatedChat = { ...chat, isPinned };
    this.chats.set(chatId, updatedChat);
    return updatedChat;
  }

  // Chat participant operations
  async addParticipantToChat(participant: InsertChatParticipant): Promise<ChatParticipant> {
    const id = this.participantIdCounter++;
    const newParticipant: ChatParticipant = { ...participant, id };
    this.chatParticipants.set(id, newParticipant);
    return newParticipant;
  }

  async getChatParticipants(chatId: number): Promise<User[]> {
    // Find all users who are participants in the given chat
    const userIds = Array.from(this.chatParticipants.values())
      .filter(participant => participant.chatId === chatId)
      .map(participant => participant.userId);
    
    // Return all users
    return userIds
      .map(userId => this.users.get(userId))
      .filter((user): user is User => user !== undefined);
  }

  // Message operations
  async createMessage(message: InsertMessage): Promise<Message> {
    const id = this.messageIdCounter++;
    const newMessage: Message = { ...message, id, isRead: false, sentAt: new Date() };
    this.messages.set(id, newMessage);
    return newMessage;
  }

  async getMessagesByChatId(chatId: number): Promise<Message[]> {
    return Array.from(this.messages.values())
      .filter(message => message.chatId === chatId)
      .sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());
  }

  async markMessageAsRead(messageId: number): Promise<Message | undefined> {
    const message = this.messages.get(messageId);
    if (!message) return undefined;
    
    const updatedMessage = { ...message, isRead: true };
    this.messages.set(messageId, updatedMessage);
    return updatedMessage;
  }
}

export const storage = new MemStorage();
