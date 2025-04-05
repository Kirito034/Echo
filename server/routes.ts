import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { 
  insertUserSchema, 
  insertChatSchema, 
  insertChatParticipantSchema, 
  insertMessageSchema,
  insertConnectionRequestSchema,
  type WSMessage,
  type User,
  type ConnectionRequest
} from "@shared/schema";
import { ZodError } from "zod";

// Store connected clients with their user ID
const connectedClients = new Map<number, WebSocket>();

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup authentication
  setupAuth(app);
  
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
            // Handle call requests
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
            // Handle call responses
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

          case 'connection_request':
            // Handle connection requests
            if (userId && data.payload.receiverId) {
              const receiverId = data.payload.receiverId;
              const message = data.payload.message || '';
              
              // Create connection request in database
              try {
                const connectionRequest = await storage.createConnectionRequest({
                  senderId: userId,
                  receiverId,
                  message
                });
                
                // Notify receiver if they're online
                if (isUserConnected(receiverId)) {
                  const client = connectedClients.get(receiverId);
                  const sender = await storage.getUser(userId);
                  
                  if (sender) {
                    client?.send(JSON.stringify({
                      type: 'connection_request',
                      payload: {
                        request: {
                          ...connectionRequest,
                          sender
                        }
                      }
                    }));
                  }
                }
              } catch (error) {
                ws.send(JSON.stringify({
                  type: 'error',
                  payload: { message: 'Failed to create connection request' }
                }));
              }
            }
            break;
            
          case 'connection_response':
            // Handle connection request responses
            if (userId && data.payload.requestId && data.payload.accepted !== undefined) {
              const requestId = data.payload.requestId;
              const accepted = data.payload.accepted;
              
              try {
                // Update connection request in database
                const request = await storage.updateConnectionRequestStatus(
                  requestId, 
                  accepted ? 'accepted' : 'rejected'
                );
                
                if (request && isUserConnected(request.senderId)) {
                  // Notify the original sender of the connection request
                  const client = connectedClients.get(request.senderId);
                  const responder = await storage.getUser(userId);
                  
                  client?.send(JSON.stringify({
                    type: 'connection_response',
                    payload: {
                      requestId,
                      accepted,
                      responder
                    }
                  }));
                  
                  // If accepted, create a chat between the users
                  if (accepted) {
                    // Check if there's already a chat between these users
                    const userChats = await storage.getChatsByUserId(userId);
                    const existingChat = userChats.find(async (chat) => {
                      const participants = await storage.getChatParticipants(chat.id);
                      return participants.some(p => p.id === request.senderId);
                    });
                    
                    if (!existingChat) {
                      // Create a new chat
                      const newChat = await storage.createChat({});
                      
                      // Add both users as participants
                      await storage.addParticipantToChat({
                        chatId: newChat.id,
                        userId: userId
                      });
                      
                      await storage.addParticipantToChat({
                        chatId: newChat.id,
                        userId: request.senderId
                      });
                      
                      // Notify both users of the new chat
                      const participants = await storage.getChatParticipants(newChat.id);
                      const enhancedChat = {
                        ...newChat,
                        participants,
                        lastMessage: null
                      };
                      
                      if (isUserConnected(userId)) {
                        connectedClients.get(userId)?.send(JSON.stringify({
                          type: 'chat_created',
                          payload: { chat: enhancedChat }
                        }));
                      }
                      
                      if (isUserConnected(request.senderId)) {
                        connectedClients.get(request.senderId)?.send(JSON.stringify({
                          type: 'chat_created',
                          payload: { chat: enhancedChat }
                        }));
                      }
                    }
                  }
                }
              } catch (error) {
                ws.send(JSON.stringify({
                  type: 'error',
                  payload: { message: 'Failed to process connection response' }
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
  // Current user route is handled by the auth system
  
  // Middleware to check if user is authenticated
  const isAuthenticated = (req: Request, res: Response, next: Function) => {
    if (req.isAuthenticated()) {
      return next();
    }
    res.status(401).json({ message: 'Unauthorized' });
  };

  // Current user endpoint must come before wildcard routes
  app.get('/api/users/current', isAuthenticated, (req, res) => {
    // The user is already attached to the request by Passport
    const { password, ...userWithoutPassword } = req.user as User;
    res.json(userWithoutPassword);
  });

  app.get('/api/users', isAuthenticated, async (_req, res) => {
    const users = await storage.getAllUsers();
    res.json(users);
  });

  app.get('/api/users/search', isAuthenticated, async (req, res) => {
    const query = req.query.q as string;
    const currentUserId = (req.user as User).id;
    
    if (!query) {
      return res.status(400).json({ message: 'Search query is required' });
    }
    
    try {
      // Support searching by email, username, or display name
      const users = await storage.searchUsers(query, currentUserId);
      
      // Don't return password in the response
      const usersWithoutPassword = users.map(user => {
        const { password, ...userWithoutPassword } = user;
        return userWithoutPassword;
      });
      
      res.json(usersWithoutPassword);
    } catch (error) {
      res.status(500).json({ message: 'Error searching users' });
    }
  });

  app.get('/api/users/:id', isAuthenticated, async (req, res) => {
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

  // Connection requests endpoints
  app.post('/api/connection-requests', isAuthenticated, async (req, res) => {
    try {
      const currentUser = req.user as User;
      
      // Add sender ID from authenticated user
      const requestData = {
        ...req.body,
        senderId: currentUser.id
      };
      
      const validRequest = insertConnectionRequestSchema.parse(requestData);
      
      // Check if request already exists
      const existingRequest = await storage.getConnectionRequestByUsers(
        validRequest.senderId,
        validRequest.receiverId
      );
      
      if (existingRequest) {
        return res.status(400).json({ 
          message: 'Connection request already exists',
          request: existingRequest
        });
      }
      
      // Create new request
      const newRequest = await storage.createConnectionRequest(validRequest);
      res.status(201).json(newRequest);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: 'Invalid request data', details: error.format() });
      } else {
        res.status(500).json({ message: 'Error creating connection request' });
      }
    }
  });

  app.get('/api/connection-requests/received', isAuthenticated, async (req, res) => {
    const currentUser = req.user as User;
    const requests = await storage.getReceivedConnectionRequests(currentUser.id);
    res.json(requests);
  });

  app.get('/api/connection-requests/sent', isAuthenticated, async (req, res) => {
    const currentUser = req.user as User;
    const requests = await storage.getSentConnectionRequests(currentUser.id);
    res.json(requests);
  });

  app.patch('/api/connection-requests/:id', isAuthenticated, async (req, res) => {
    const requestId = parseInt(req.params.id);
    const { status } = req.body;
    
    if (isNaN(requestId)) {
      return res.status(400).json({ message: 'Invalid request ID' });
    }
    
    if (status !== 'accepted' && status !== 'rejected') {
      return res.status(400).json({ message: 'Status must be "accepted" or "rejected"' });
    }
    
    try {
      const updatedRequest = await storage.updateConnectionRequestStatus(requestId, status);
      
      if (!updatedRequest) {
        return res.status(404).json({ message: 'Connection request not found' });
      }
      
      // If request was accepted, create a chat between the users
      if (status === 'accepted') {
        const currentUser = req.user as User;
        
        // Check if there's already a chat between these users
        const userChats = await storage.getChatsByUserId(currentUser.id);
        let existingChat = false;
        
        for (const chat of userChats) {
          const participants = await storage.getChatParticipants(chat.id);
          if (participants.some(p => p.id === updatedRequest.senderId)) {
            existingChat = true;
            break;
          }
        }
        
        if (!existingChat) {
          // Create a new chat
          const newChat = await storage.createChat({});
          
          // Add both users as participants
          await storage.addParticipantToChat({
            chatId: newChat.id,
            userId: currentUser.id
          });
          
          await storage.addParticipantToChat({
            chatId: newChat.id,
            userId: updatedRequest.senderId
          });
          
          res.json({ 
            request: updatedRequest,
            chat: newChat
          });
        } else {
          res.json({ 
            request: updatedRequest
          });
        }
      } else {
        res.json({ request: updatedRequest });
      }
    } catch (error) {
      res.status(500).json({ message: 'Error updating connection request' });
    }
  });

  app.get('/api/connections', isAuthenticated, async (req, res) => {
    const currentUser = req.user as User;
    const connectedUsers = await storage.getConnectedUsers(currentUser.id);
    res.json(connectedUsers);
  });

  app.get('/api/chats', isAuthenticated, async (req, res) => {
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

  app.post('/api/chats', isAuthenticated, async (req, res) => {
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

  app.get('/api/chats/:id', isAuthenticated, async (req, res) => {
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

  app.post('/api/chats/:id/pin', isAuthenticated, async (req, res) => {
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

  app.get('/api/chats/:id/messages', isAuthenticated, async (req, res) => {
    const chatId = parseInt(req.params.id);
    if (isNaN(chatId)) {
      return res.status(400).json({ message: 'Invalid chat ID' });
    }
    
    const messages = await storage.getMessagesByChatId(chatId);
    res.json(messages);
  });

  app.post('/api/messages', isAuthenticated, async (req, res) => {
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
