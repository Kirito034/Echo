import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { 
  insertUserSchema, 
  insertChatSchema, 
  insertChatParticipantSchema, 
  insertMessageSchema,
  type WSMessage,
  type User
} from "@shared/schema";
import { ZodError } from "zod";

// Store connected clients with their user ID
const connectedClients = new Map<number, WebSocket>();

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // WebSocket server setup
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  // WebSocket connection handler
  wss.on('connection', (ws: WebSocket) => {
    console.log('Client connected to WebSocket');
    let userId: number | null = null;

    ws.on('message', async (message: string) => {
      try {
        const data = JSON.parse(message) as WSMessage;
        
        switch (data.type) {
          case 'user_status':
            // Associate this connection with a user ID
            userId = data.payload.userId;
            if (userId) {
              connectedClients.set(userId, ws);
              await storage.updateUserStatus(userId, 'online');
              
              // Broadcast user status change to all connected clients
              broadcastUserStatus(userId, 'online');
            }
            break;
            
          case 'message':
            // Handle new message
            if (userId && data.payload.message) {
              try {
                const validMessage = insertMessageSchema.parse(data.payload.message);
                const savedMessage = await storage.createMessage(validMessage);
                
                // Get chat participants to notify
                const participants = await storage.getChatParticipants(savedMessage.chatId);
                
                // Send the message to all participants in the chat
                participants.forEach(participant => {
                  if (participant.id !== userId && isUserConnected(participant.id)) {
                    const client = connectedClients.get(participant.id);
                    client?.send(JSON.stringify({
                      type: 'message',
                      payload: { message: savedMessage }
                    }));
                  }
                });
              } catch (error) {
                if (error instanceof ZodError) {
                  ws.send(JSON.stringify({ 
                    type: 'error', 
                    payload: { message: 'Invalid message format', details: error.format() } 
                  }));
                }
              }
            }
            break;
            
          case 'typing':
            // Handle typing indicator
            if (userId && data.payload.chatId) {
              const chatId = data.payload.chatId;
              const participants = await storage.getChatParticipants(chatId);
              
              // Notify all participants that this user is typing
              participants.forEach(participant => {
                if (participant.id !== userId && isUserConnected(participant.id)) {
                  const client = connectedClients.get(participant.id);
                  client?.send(JSON.stringify({
                    type: 'typing',
                    payload: { userId, chatId }
                  }));
                }
              });
            }
            break;
            
          case 'read':
            // Handle read receipts
            if (userId && data.payload.messageId) {
              const messageId = data.payload.messageId;
              const updatedMessage = await storage.markMessageAsRead(messageId);
              
              if (updatedMessage) {
                // Get the sender to notify them that their message was read
                const sender = await storage.getUser(updatedMessage.senderId);
                if (sender && isUserConnected(sender.id)) {
                  const client = connectedClients.get(sender.id);
                  client?.send(JSON.stringify({
                    type: 'read',
                    payload: { messageId }
                  }));
                }
              }
            }
            break;
            
          case 'call_request':
            // Handle call requests (mocked)
            if (userId && data.payload.recipientId && data.payload.callType) {
              const recipientId = data.payload.recipientId;
              const callType = data.payload.callType;
              
              // Check if recipient is connected
              if (isUserConnected(recipientId)) {
                const client = connectedClients.get(recipientId);
                const caller = await storage.getUser(userId);
                
                if (caller) {
                  client?.send(JSON.stringify({
                    type: 'call_request',
                    payload: { 
                      callerId: userId, 
                      callerName: caller.displayName,
                      callerAvatar: caller.avatarUrl,
                      callType 
                    }
                  }));
                }
              }
            }
            break;
            
          case 'call_response':
            // Handle call responses (mocked)
            if (userId && data.payload.callerId && data.payload.accepted !== undefined) {
              const callerId = data.payload.callerId;
              const accepted = data.payload.accepted;
              
              // Notify the caller of the response
              if (isUserConnected(callerId)) {
                const client = connectedClients.get(callerId);
                client?.send(JSON.stringify({
                  type: 'call_response',
                  payload: { 
                    userId,
                    accepted 
                  }
                }));
              }
            }
            break;
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
        ws.send(JSON.stringify({
          type: 'error',
          payload: { message: 'Error processing message' }
        }));
      }
    });

    ws.on('close', async () => {
      console.log('Client disconnected from WebSocket');
      
      // Update user status to offline
      if (userId) {
        await storage.updateUserStatus(userId, 'offline');
        connectedClients.delete(userId);
        
        // Broadcast user status change to all connected clients
        broadcastUserStatus(userId, 'offline');
      }
    });
  });

  // Helper function to check if a user is connected
  function isUserConnected(userId: number): boolean {
    return connectedClients.has(userId) && 
      connectedClients.get(userId)?.readyState === WebSocket.OPEN;
  }

  // Helper function to broadcast user status changes
  function broadcastUserStatus(userId: number, status: string) {
    connectedClients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'user_status',
          payload: { userId, status }
        }));
      }
    });
  }

  // API Routes
  app.get('/api/users/current', async (req, res) => {
    // In a real app, this would use authentication
    // For demo, return the last user (current user)
    const users = await storage.getAllUsers();
    const currentUser = users[users.length - 1];
    
    if (currentUser) {
      res.json(currentUser);
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  });

  app.get('/api/users', async (_req, res) => {
    const users = await storage.getAllUsers();
    res.json(users);
  });

  app.get('/api/users/:id', async (req, res) => {
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }
    
    const user = await storage.getUser(userId);
    if (user) {
      res.json(user);
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  });

  app.post('/api/users', async (req, res) => {
    try {
      const userData = insertUserSchema.parse(req.body);
      const newUser = await storage.createUser(userData);
      res.status(201).json(newUser);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: 'Invalid user data', details: error.format() });
      } else {
        res.status(500).json({ message: 'Error creating user' });
      }
    }
  });

  app.get('/api/chats', async (req, res) => {
    const userId = req.query.userId ? parseInt(req.query.userId as string) : undefined;
    
    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }
    
    const chats = await storage.getChatsByUserId(userId);
    
    // Enhance chats with additional information
    const enhancedChats = await Promise.all(chats.map(async (chat) => {
      const participants = await storage.getChatParticipants(chat.id);
      const messages = await storage.getMessagesByChatId(chat.id);
      const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
      
      return {
        ...chat,
        participants,
        lastMessage
      };
    }));
    
    res.json(enhancedChats);
  });

  app.post('/api/chats', async (req, res) => {
    try {
      const chatData = insertChatSchema.parse(req.body);
      const newChat = await storage.createChat(chatData);
      
      // Add participants if included in request
      if (req.body.participants && Array.isArray(req.body.participants)) {
        for (const userId of req.body.participants) {
          await storage.addParticipantToChat({
            chatId: newChat.id,
            userId
          });
        }
      }
      
      res.status(201).json(newChat);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: 'Invalid chat data', details: error.format() });
      } else {
        res.status(500).json({ message: 'Error creating chat' });
      }
    }
  });

  app.get('/api/chats/:id', async (req, res) => {
    const chatId = parseInt(req.params.id);
    if (isNaN(chatId)) {
      return res.status(400).json({ message: 'Invalid chat ID' });
    }
    
    const chat = await storage.getChat(chatId);
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }
    
    const participants = await storage.getChatParticipants(chat.id);
    
    res.json({
      ...chat,
      participants
    });
  });

  app.post('/api/chats/:id/pin', async (req, res) => {
    const chatId = parseInt(req.params.id);
    if (isNaN(chatId)) {
      return res.status(400).json({ message: 'Invalid chat ID' });
    }
    
    const isPinned = req.body.isPinned === true;
    const updatedChat = await storage.pinChat(chatId, isPinned);
    
    if (updatedChat) {
      res.json(updatedChat);
    } else {
      res.status(404).json({ message: 'Chat not found' });
    }
  });

  app.get('/api/chats/:id/messages', async (req, res) => {
    const chatId = parseInt(req.params.id);
    if (isNaN(chatId)) {
      return res.status(400).json({ message: 'Invalid chat ID' });
    }
    
    const messages = await storage.getMessagesByChatId(chatId);
    res.json(messages);
  });

  app.post('/api/messages', async (req, res) => {
    try {
      const messageData = insertMessageSchema.parse(req.body);
      const newMessage = await storage.createMessage(messageData);
      res.status(201).json(newMessage);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: 'Invalid message data', details: error.format() });
      } else {
        res.status(500).json({ message: 'Error creating message' });
      }
    }
  });

  return httpServer;
}
