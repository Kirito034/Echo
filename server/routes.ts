import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { 
  insertUserSchema, 
  insertChatSchema, 
  insertChatParticipantSchema, 
  insertMessageSchema,
  insertConnectionRequestSchema,
  messages,
  type WSMessage,
  type User,
  type ConnectionRequest
} from "@shared/schema";
import { ZodError } from "zod";

// Store connected clients with their user ID and client ID
const connectedClients = new Map<number, { ws: WebSocket, clientId: string }>();
// Track client IDs to prevent duplicate connections
const clientIdMap = new Map<string, number>();

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup authentication
  setupAuth(app);
  
  const httpServer = createServer(app);

  // WebSocket server setup
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  // WebSocket connection handler
  wss.on('connection', (ws: WebSocket, req) => {
    // Extract client ID from URL if available
    const clientId = new URL(req.url || '', 'http://localhost').searchParams.get('clientId') || '';
    console.log(`Client connected to WebSocket with clientId: ${clientId}`);
    let userId: number | null = null;

    // Heartbeat to keep connection alive
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, 30000);

    ws.on('message', async (message: string) => {
      try {
        const data = JSON.parse(message) as WSMessage;
        console.log(`WebSocket message received: ${data.type}`, data.payload);
        
        switch (data.type) {
          case 'user_status':
            // Associate this connection with a user ID
            userId = data.payload.userId;
            const messageClientId = data.payload.clientId || clientId;
            
            if (userId) {
              // Check if user already has a connection
              const existingConnection = connectedClients.get(userId);
              
              // If there's an existing connection with a different client ID, close it
              if (existingConnection && existingConnection.clientId !== messageClientId) {
                console.log(`User ${userId} already has a connection with different client ID. Closing old connection.`);
                if (existingConnection.ws.readyState === WebSocket.OPEN) {
                  existingConnection.ws.close();
                }
                
                // Clean up any clientId mapping
                if (clientIdMap.has(existingConnection.clientId)) {
                  clientIdMap.delete(existingConnection.clientId);
                }
              }
              
              // Register this connection
              connectedClients.set(userId, { ws, clientId: messageClientId });
              clientIdMap.set(messageClientId, userId);
              
              console.log(`User ${userId} registered with WebSocket (client ID: ${messageClientId}). Total connected: ${connectedClients.size}`);
              
              // Update user status to online
              await storage.updateUserStatus(userId, 'online');
              
              // Broadcast user status change to all connected clients
              broadcastUserStatus(userId, 'online');
            }
            break;
            
          case 'message':
            // Handle new message
            if (userId && data.payload.message) {
              try {
                console.log(`Processing message from user ${userId} to chat ${data.payload.message.chatId}`);
                const validMessage = insertMessageSchema.parse(data.payload.message);
                const savedMessage = await storage.createMessage(validMessage);
                
                console.log(`Message saved to database, id: ${savedMessage.id}, chatId: ${savedMessage.chatId}`);
                
                // Get chat participants to notify
                const participants = await storage.getChatParticipants(savedMessage.chatId);
                console.log(`Chat ${savedMessage.chatId} has ${participants.length} participants`);
                
                // Send the message to all participants in the chat
                let notifiedCount = 0;
                participants.forEach(participant => {
                  // Don't send the message back to the sender
                  if (participant.id !== userId && isUserConnected(participant.id)) {
                    const client = connectedClients.get(participant.id);
                    if (client && client.ws.readyState === WebSocket.OPEN) {
                      // Create message with updated status for delivery to other participants
                      const messageToSend = {
                        ...savedMessage,
                        status: 'delivered' // Mark as delivered for recipients
                      };
                      
                      client.ws.send(JSON.stringify({
                        type: 'message',
                        payload: { message: messageToSend }
                      }));
                      
                      notifiedCount++;
                      console.log(`Sent message to participant ${participant.id}`);
                    } else {
                      console.log(`Participant ${participant.id} is not connected or WebSocket not open`);
                    }
                  }
                });
                
                console.log(`Notified ${notifiedCount} participants about new message`);
                
                // Update message status to delivered if there are recipients online
                let messageStatus = 'sent';
                if (participants.some(p => p.id !== userId && isUserConnected(p.id))) {
                  messageStatus = 'delivered';
                  
                  // Update message status in database
                  await db
                    .update(messages)
                    .set({ status: messageStatus })
                    .where(eq(messages.id, savedMessage.id));
                    
                  // Update the savedMessage object
                  savedMessage.status = messageStatus;
                }
                
                // Confirm receipt to sender - only if the WebSocket is still open
                if (ws.readyState === WebSocket.OPEN) {
                  console.log(`Confirming message receipt to sender: ID ${savedMessage.id}, status ${messageStatus}`);
                  try {
                    ws.send(JSON.stringify({
                      type: 'message_sent',
                      payload: { 
                        messageId: savedMessage.id,
                        status: messageStatus
                      }
                    }));
                    console.log(`Successfully sent confirmation to sender ${userId}`);
                  } catch (confirmError) {
                    console.error(`Failed to send confirmation to sender ${userId}:`, confirmError);
                  }
                } else {
                  console.warn(`Cannot confirm message receipt: WebSocket for user ${userId} is no longer open`);
                }
              } catch (error) {
                console.error('Error processing message:', error);
                if (error instanceof ZodError) {
                  ws.send(JSON.stringify({ 
                    type: 'error', 
                    payload: { message: 'Invalid message format', details: error.format() } 
                  }));
                } else {
                  ws.send(JSON.stringify({ 
                    type: 'error', 
                    payload: { message: 'Failed to process message' } 
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
                  client?.ws.send(JSON.stringify({
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
              console.log(`Processing read receipt for message ${messageId} from user ${userId}`);
              
              try {
                const updatedMessage = await storage.markMessageAsRead(messageId);
                
                if (updatedMessage) {
                  // Update message status to read
                  await db
                    .update(messages)
                    .set({ status: 'read' })
                    .where(eq(messages.id, messageId));
                  
                  console.log(`WebSocket: Updated message ${messageId} status to 'read'`);
                  
                  // Get the sender to notify them that their message was read
                  const sender = await storage.getUser(updatedMessage.senderId);
                  if (sender && sender.id !== userId) { // Don't notify if sender is marking their own message as read
                    console.log(`Notifying sender ${sender.id} that message ${messageId} was read by ${userId}`);
                    
                    if (isUserConnected(sender.id)) {
                      const client = connectedClients.get(sender.id);
                      client?.ws.send(JSON.stringify({
                        type: 'read',
                        payload: { messageId, status: 'read' }
                      }));
                      console.log(`Successfully sent read receipt to sender ${sender.id}`);
                    } else {
                      console.log(`Sender ${sender.id} is not connected, cannot send read receipt`);
                    }
                  } else {
                    console.log(`Skipping read receipt notification: sender is ${sender?.id}, reader is ${userId}`);
                  }
                } else {
                  console.log(`Could not find message ${messageId} to mark as read`);
                }
              } catch (error) {
                console.error(`Error processing read receipt for message ${messageId}:`, error);
                ws.send(JSON.stringify({
                  type: 'error',
                  payload: { message: 'Failed to mark message as read' }
                }));
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
                  client?.ws.send(JSON.stringify({
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
                client?.ws.send(JSON.stringify({
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
            // We now handle this in the HTTP API endpoint, so this WebSocket handler
            // is only for handling direct WebSocket connection requests
            // This case is now deprecated and should be removed in future updates
            console.log('Deprecated: Received connection_request via WebSocket. This should use the HTTP API instead.');
            break;
            
          case 'connection_response':
            // We now handle this in the HTTP API endpoint
            // This case is now deprecated and should be removed in future updates
            console.log('Deprecated: Received connection_response via WebSocket. Use the HTTP PATCH endpoint instead.');
            
            // Automatically redirect to HTTP API
            if (userId && data.payload.requestId && data.payload.accepted !== undefined) {
              try {
                // This provides backward compatibility during the transition
                const requestId = data.payload.requestId;
                const status = data.payload.accepted ? 'accepted' : 'rejected';
                
                // Make a request to the HTTP API
                await fetch(`/api/connection-requests/${requestId}`, {
                  method: 'PATCH',
                  headers: {
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({ status }),
                  credentials: 'include' // Include cookies for auth
                });
                
                // Acknowledge to the client
                ws.send(JSON.stringify({
                  type: 'notification',
                  payload: { 
                    message: 'Connection request processed. This approach is deprecated, please update your client.' 
                  }
                }));
              } catch (error) {
                console.error('Error redirecting WebSocket connection_response to HTTP API:', error);
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
      
      // Clear the ping interval
      clearInterval(pingInterval);
      
      // Update user status to offline
      if (userId) {
        console.log(`User ${userId} disconnected from WebSocket`);
        await storage.updateUserStatus(userId, 'offline');
        connectedClients.delete(userId);
        
        // Broadcast user status change to all connected clients
        broadcastUserStatus(userId, 'offline');
        console.log(`Broadcasted 'offline' status for user ${userId}`);
      }
    });
  });

  // Helper function to check if a user is connected
  function isUserConnected(userId: number): boolean {
    const client = connectedClients.get(userId);
    return !!client && client.ws.readyState === WebSocket.OPEN;
  }

  // Helper function to broadcast user status changes
  function broadcastUserStatus(userId: number, status: string) {
    connectedClients.forEach((client) => {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify({
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
  
  // Check if a connection request already exists
  app.get('/api/connection-requests/check/:receiverId', isAuthenticated, async (req, res) => {
    try {
      const currentUser = req.user as User;
      const receiverId = parseInt(req.params.receiverId);
      
      if (isNaN(receiverId)) {
        return res.status(400).json({ message: 'Invalid receiver ID' });
      }
      
      // Check for existing connection request in either direction
      const existingRequest = await storage.getConnectionRequestByUsers(
        currentUser.id,
        receiverId
      );
      
      // Also check in reverse direction
      const reverseRequest = await storage.getConnectionRequestByUsers(
        receiverId,
        currentUser.id
      );
      
      if (existingRequest || reverseRequest) {
        return res.json(existingRequest || reverseRequest);
      }
      
      // No existing request found
      return res.json(null);
    } catch (error) {
      console.error('Error checking connection request:', error);
      res.status(500).json({ message: 'Failed to check for existing connection request' });
    }
  });
  
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
      
      // Notify receiver via WebSocket if they're connected
      if (isUserConnected(validRequest.receiverId)) {
        console.log(`Sending connection request notification to user ${validRequest.receiverId} from HTTP endpoint`);
        
        // Get the sender information
        const sender = await storage.getUser(currentUser.id);
        
        if (sender) {
          // Prepare the full request object with sender info
          const fullRequest = {
            ...newRequest,
            sender: {
              id: sender.id,
              username: sender.username,
              email: sender.email,
              displayName: sender.displayName,
              avatarUrl: sender.avatarUrl,
              status: sender.status
            }
          };
          
          // Send WebSocket notification to receiver
          const receiverClient = connectedClients.get(validRequest.receiverId);
          receiverClient?.ws.send(JSON.stringify({
            type: 'connection_request',
            payload: {
              request: fullRequest
            }
          }));
        }
      }
      
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
      
      const currentUser = req.user as User;
      const accepted = status === 'accepted';
      
      // Notify the sender of the request via WebSocket
      if (isUserConnected(updatedRequest.senderId)) {
        console.log(`Sending connection response to user ${updatedRequest.senderId} from HTTP endpoint: ${accepted ? 'accepted' : 'rejected'}`);
        
        // Prepare the responder information
        const safeResponder = {
          id: currentUser.id,
          username: currentUser.username,
          email: currentUser.email,
          displayName: currentUser.displayName,
          avatarUrl: currentUser.avatarUrl,
          status: currentUser.status
        };
        
        // Send WebSocket notification to the original sender
        const senderClient = connectedClients.get(updatedRequest.senderId);
        senderClient?.ws.send(JSON.stringify({
          type: 'connection_response',
          payload: {
            requestId,
            accepted,
            responder: safeResponder
          }
        }));
      }
      
      let newChatCreated = null;
      
      // If request was accepted, create a chat between the users
      if (accepted) {
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
          
          // Get all participants
          const participants = await storage.getChatParticipants(newChat.id);
          
          // Create enhanced chat object
          const enhancedChat = {
            ...newChat,
            participants,
            lastMessage: null
          };
          
          // Store for response
          newChatCreated = newChat;
          
          // Notify both users of the new chat via WebSocket
          if (isUserConnected(currentUser.id)) {
            connectedClients.get(currentUser.id)?.ws.send(JSON.stringify({
              type: 'chat_created',
              payload: { chat: enhancedChat }
            }));
          }
          
          if (isUserConnected(updatedRequest.senderId)) {
            connectedClients.get(updatedRequest.senderId)?.ws.send(JSON.stringify({
              type: 'chat_created',
              payload: { chat: enhancedChat }
            }));
          }
        }
      }
      
      if (newChatCreated) {
        res.json({ 
          request: updatedRequest,
          chat: newChatCreated
        });
      } else {
        res.json({ request: updatedRequest });
      }
    } catch (error) {
      console.error('Error updating connection request:', error);
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
      const currentUser = req.user as User;
      
      // Ensure the sender ID matches the authenticated user
      const messageData = {
        ...req.body,
        senderId: currentUser.id
      };
      
      const validMessage = insertMessageSchema.parse(messageData);
      const newMessage = await storage.createMessage(validMessage);
      
      console.log(`HTTP endpoint: Message saved to database, id: ${newMessage.id}, chatId: ${newMessage.chatId}`);
      
      // Get chat participants to notify via WebSocket
      const participants = await storage.getChatParticipants(newMessage.chatId);
      console.log(`HTTP endpoint: Chat ${newMessage.chatId} has ${participants.length} participants`);
      
      // Update message status to delivered if there are connected recipients
      let messageStatus = 'sent';
      let shouldUpdateStatus = false;
      
      // Check if any recipients are online to update status to 'delivered'
      if (participants.some(p => p.id !== currentUser.id && isUserConnected(p.id))) {
        messageStatus = 'delivered';
        shouldUpdateStatus = true;
      }
      
      // Update message status in database if needed
      if (shouldUpdateStatus) {
        await db
          .update(messages)
          .set({ status: messageStatus })
          .where(eq(messages.id, newMessage.id));
        
        // Update the message object to be sent to clients
        newMessage.status = messageStatus;
        console.log(`HTTP endpoint: Updated message ${newMessage.id} status to ${messageStatus}`);
      }
      
      // Send the message to all participants in the chat via WebSocket
      let notifiedCount = 0;
      participants.forEach(participant => {
        if (participant.id !== currentUser.id && isUserConnected(participant.id)) {
          const client = connectedClients.get(participant.id);
          if (client && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(JSON.stringify({
              type: 'message',
              payload: { message: newMessage }
            }));
            notifiedCount++;
            console.log(`HTTP endpoint: Sent message to participant ${participant.id}`);
          }
        }
      });
      
      console.log(`HTTP endpoint: Notified ${notifiedCount} participants about new message. Status: ${messageStatus}`);
      
      res.status(201).json(newMessage);
    } catch (error) {
      console.error('Error creating message via HTTP:', error);
      if (error instanceof ZodError) {
        res.status(400).json({ message: 'Invalid message data', details: error.format() });
      } else {
        res.status(500).json({ message: 'Error creating message' });
      }
    }
  });

  return httpServer;
}
