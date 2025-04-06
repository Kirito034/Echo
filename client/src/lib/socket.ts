import { useEffect, useState, useCallback, useRef } from 'react';
import { WSMessage } from '@shared/schema';

// Generate a unique client ID for this browser session
const CLIENT_ID = `ws-client-${Math.random().toString(36).substring(2, 15)}`;

// Create a singleton WebSocket instance
let socketInstance: WebSocket | null = null;
let isSocketConnecting = false;
let currentUserId: number | null = null;
const messageListeners: ((message: WSMessage) => void)[] = [];

// Create a WebSocket instance
const createWebSocket = () => {
  if (socketInstance && (socketInstance.readyState === WebSocket.OPEN || socketInstance.readyState === WebSocket.CONNECTING)) {
    return socketInstance;
  }
  
  if (isSocketConnecting) {
    return null;
  }
  
  isSocketConnecting = true;
  
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/ws?clientId=${CLIENT_ID}`;
  
  socketInstance = new WebSocket(wsUrl);
  
  socketInstance.onopen = () => {
    console.log('WebSocket connected');
    isSocketConnecting = false;
    
    // Reset reconnection attempts on successful connection
    sessionStorage.setItem('ws-reconnect-attempt', '0');
    
    // Process any queued messages from local storage
    try {
      const pendingMessages = JSON.parse(localStorage.getItem('pendingMessages') || '[]');
      
      if (pendingMessages.length > 0) {
        console.log(`Found ${pendingMessages.length} pending messages to send`);
        
        // Process messages newer than 10 minutes (600000ms)
        const now = Date.now();
        const maxAge = 10 * 60 * 1000; // 10 minutes
        const validMessages = pendingMessages.filter((item: any) => now - item.timestamp < maxAge);
        
        // Send valid messages
        validMessages.forEach((item: any, index: number) => {
          setTimeout(() => {
            if (socketInstance?.readyState === WebSocket.OPEN) {
              console.log(`Sending queued message ${index + 1}/${validMessages.length}`);
              try {
                socketInstance.send(JSON.stringify(item.message));
              } catch (e) {
                console.error('Failed to send queued message:', e);
              }
            }
          }, index * 100); // Stagger sends to avoid overloading
        });
        
        // Clear processed messages
        localStorage.setItem('pendingMessages', JSON.stringify([]));
      }
    } catch (e) {
      console.error('Error processing queued messages:', e);
      // Clear potentially corrupted data
      localStorage.removeItem('pendingMessages');
    }
    
    // Notify all components that the connection is established
    document.dispatchEvent(new CustomEvent('ws-connected'));
  };
  
  socketInstance.onclose = (event) => {
    console.log(`WebSocket disconnected. Code: ${event.code}, Reason: ${event.reason || 'No reason provided'}`);
    isSocketConnecting = false;
    socketInstance = null;
    
    // Notify all components that the connection is closed
    document.dispatchEvent(new CustomEvent('ws-disconnected', { 
      detail: { code: event.code, reason: event.reason } 
    }));
    
    // Implement exponential backoff for reconnection attempts
    // Store reconnection attempt count in sessionStorage to persist across page refreshes
    const currentAttempt = parseInt(sessionStorage.getItem('ws-reconnect-attempt') || '0');
    const nextAttempt = currentAttempt + 1;
    sessionStorage.setItem('ws-reconnect-attempt', nextAttempt.toString());
    
    // Calculate delay with exponential backoff (1s, 2s, 4s, 8s, etc.) with a max of 30s
    const baseDelay = 1000;
    const maxDelay = 30000;
    const exponentialDelay = Math.min(baseDelay * Math.pow(2, currentAttempt), maxDelay);
    
    // For certain closure codes, try to reconnect immediately
    // 1000: Normal closure
    // 1001: Going away (page navigation)
    // 1006: Abnormal closure (likely network issue)
    const urgentReconnectCodes = [1006];
    const normalClosureCodes = [1000, 1001];
    
    let reconnectDelay = exponentialDelay;
    
    if (urgentReconnectCodes.includes(event.code)) {
      // For network issues, try a faster reconnect
      reconnectDelay = Math.min(1000, exponentialDelay); 
      console.log(`Urgent reconnect scheduled in ${reconnectDelay}ms`);
    } else if (normalClosureCodes.includes(event.code)) {
      // For normal closures, use a bit longer delay
      reconnectDelay = Math.max(2000, exponentialDelay);
      console.log(`Normal reconnect scheduled in ${reconnectDelay}ms`);
    } else {
      console.log(`Standard reconnect scheduled in ${reconnectDelay}ms`);
    }
    
    // Schedule reconnection
    setTimeout(() => {
      createWebSocket();
    }, reconnectDelay);
  };
  
  socketInstance.onerror = (error) => {
    console.error('WebSocket error:', error);
    isSocketConnecting = false;
    
    // Notify all components of the error
    document.dispatchEvent(new CustomEvent('ws-error', { detail: error }));
  };
  
  socketInstance.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data) as WSMessage;
      // Log for debugging
      console.log(`WebSocket received: ${message.type}`, message.payload);
      // Notify all registered message listeners
      messageListeners.forEach(listener => listener(message));
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  };
  
  return socketInstance;
};

// Socket state management
export const useSocket = (userId: number | null) => {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messageListenersRef = useRef<((message: WSMessage) => void)[]>([]);

  // Initialize WebSocket connection
  useEffect(() => {
    if (!userId) return;

    // Create or get the socket instance
    const socket = createWebSocket();
    
    // Set connection status based on current socket state
    if (socket?.readyState === WebSocket.OPEN) {
      setIsConnected(true);
      setError(null);
      
      // Send user status since we're already connected
      socket.send(JSON.stringify({
        type: 'user_status',
        payload: { 
          userId,
          clientId: CLIENT_ID
        }
      }));
      
      // Store current user ID for later use
      currentUserId = userId;
    }
    
    // Setup event listeners for connection status changes
    const handleConnected = () => {
      setIsConnected(true);
      setError(null);
      
      // Send user status once connected
      if (socketInstance?.readyState === WebSocket.OPEN) {
        socketInstance.send(JSON.stringify({
          type: 'user_status',
          payload: { 
            userId,
            clientId: CLIENT_ID
          }
        }));
        
        // Store current user ID for later use
        currentUserId = userId;
      }
    };
    
    const handleDisconnected = () => {
      setIsConnected(false);
    };
    
    const handleError = (e: CustomEvent) => {
      setError('Failed to connect to chat server');
    };
    
    // Register document event listeners
    document.addEventListener('ws-connected', handleConnected);
    document.addEventListener('ws-disconnected', handleDisconnected);
    document.addEventListener('ws-error', handleError as EventListener);
    
    // Cleanup on unmount
    return () => {
      document.removeEventListener('ws-connected', handleConnected);
      document.removeEventListener('ws-disconnected', handleDisconnected);
      document.removeEventListener('ws-error', handleError as EventListener);
    };
  }, [userId]);

  // Add message listener
  const addMessageListener = useCallback((listener: (message: WSMessage) => void) => {
    // Add to local ref
    messageListenersRef.current.push(listener);
    // Add to global listeners
    messageListeners.push(listener);
    
    // Return cleanup function
    return () => {
      messageListenersRef.current = messageListenersRef.current.filter(l => l !== listener);
      const index = messageListeners.indexOf(listener);
      if (index !== -1) {
        messageListeners.splice(index, 1);
      }
    };
  }, []);

  // Send message to server with retry capabilities
  const sendMessage = useCallback((message: WSMessage) => {
    const attemptSend = (socket: WebSocket | null, attempt = 0) => {
      if (socket?.readyState === WebSocket.OPEN) {
        try {
          socket.send(JSON.stringify(message));
          return true;
        } catch (e) {
          console.error(`Error sending message (attempt ${attempt}):`, e);
          return false;
        }
      }
      return false;
    };
    
    // Try to send with current socket
    const sent = attemptSend(socketInstance, 0);
    
    if (!sent) {
      setError('Connection to chat server lost. Attempting to reconnect...');
      
      // Message couldn't be sent - store for retry if it's important
      if (['message', 'read', 'call_request', 'call_response'].includes(message.type)) {
        // For important messages, try a few more times with increasing delays
        const maxRetries = 3;
        
        // Create a queue of retry attempts
        for (let i = 0; i < maxRetries; i++) {
          setTimeout(() => {
            // Get the most current socket instance
            const currentSocket = socketInstance;
            
            if (currentSocket?.readyState === WebSocket.OPEN) {
              console.log(`Retrying message send, attempt ${i + 1}...`);
              if (attemptSend(currentSocket, i + 1)) {
                console.log(`Successfully sent message on retry ${i + 1}`);
              }
            } else if (i === maxRetries - 1) {
              // Last retry attempt failed, queue for later after reconnection
              console.log('Maximum retries reached, will try after reconnection');
              
              // Use local storage to queue critical messages
              if (message.type === 'message') {
                try {
                  const pendingMessages = JSON.parse(localStorage.getItem('pendingMessages') || '[]');
                  pendingMessages.push({
                    message,
                    timestamp: Date.now()
                  });
                  // Only keep last 50 messages to avoid storage issues
                  if (pendingMessages.length > 50) {
                    pendingMessages.shift();
                  }
                  localStorage.setItem('pendingMessages', JSON.stringify(pendingMessages));
                  console.log('Message queued for delivery after reconnection');
                } catch (e) {
                  console.error('Failed to queue message for later:', e);
                }
              }
            }
          }, Math.pow(2, i) * 500); // Exponential backoff: 500ms, 1000ms, 2000ms
        }
      }
      
      // Attempt to reconnect if not already trying
      if (!isSocketConnecting) {
        createWebSocket();
      }
    }
  }, []);

  return {
    isConnected,
    error,
    addMessageListener,
    sendMessage
  };
};

// Hook for specific WebSocket message types
export const useTypingIndicator = (
  sendMessage: (message: WSMessage) => void, 
  chatId?: number,
  isTyping?: boolean
) => {
  const [typingState, setTypingState] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Send typing indicator to server
  const startTyping = useCallback(() => {
    if (!chatId) return;
    
    if (!typingState) {
      setTypingState(true);
      
      // Send typing start event
      sendMessage({
        type: 'typing',
        payload: { 
          chatId, 
          isTyping: true 
        }
      });
    }
    
    // Reset timeout if already set
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    // Set new timeout to stop typing after 2 seconds of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      setTypingState(false);
      
      // Send typing stop event
      sendMessage({
        type: 'typing',
        payload: { 
          chatId, 
          isTyping: false 
        }
      });
    }, 2000);
  }, [sendMessage, chatId, typingState]);
  
  // Manually stop typing
  const stopTyping = useCallback(() => {
    if (!chatId) return;
    
    if (typingState) {
      setTypingState(false);
      
      // Clear timeout if set
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      
      // Send typing stop event
      sendMessage({
        type: 'typing',
        payload: { 
          chatId, 
          isTyping: false 
        }
      });
    }
  }, [sendMessage, chatId, typingState]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);
  
  return { 
    isTyping: typingState,
    startTyping,
    stopTyping
  };
};

export const useMessageListener = (
  addMessageListener: (listener: (message: WSMessage) => void) => () => void,
  onNewMessage?: (message: any) => void,
  onTypingIndicator?: (userId: number, chatId: number, isTyping: boolean) => void,
  onReadReceipt?: (messageId: number) => void,
  onUserStatusChange?: (userId: number, status: string) => void,
  onConnectionRequest?: (request: any) => void,
  onConnectionResponse?: (requestId: number, accepted: boolean, responder: any) => void,
  onChatCreated?: (chat: any) => void,
  onMessageSent?: (messageId: number, status: string) => void
) => {
  useEffect(() => {
    const removeListener = addMessageListener((message: WSMessage) => {
      switch (message.type) {
        case 'message':
          console.log('Received new message from WebSocket:', message.payload.message);
          onNewMessage?.(message.payload.message);
          break;
        case 'message_sent':
          if (message.payload.messageId && message.payload.status) {
            console.log(`Message ${message.payload.messageId} status: ${message.payload.status}`);
            onMessageSent?.(message.payload.messageId, message.payload.status);
          }
          break;
        case 'typing':
          if (message.payload.userId && message.payload.chatId) {
            const isTyping = message.payload.isTyping === undefined ? true : !!message.payload.isTyping;
            onTypingIndicator?.(message.payload.userId, message.payload.chatId, isTyping);
          }
          break;
        case 'read':
          if (message.payload.messageId) {
            const status = message.payload.status || 'read';
            onReadReceipt?.(message.payload.messageId);
            console.log(`Message ${message.payload.messageId} marked as ${status}`);
          }
          break;
        case 'user_status':
          if (message.payload.userId && message.payload.status) {
            console.log(`User ${message.payload.userId} status changed to ${message.payload.status}`);
            onUserStatusChange?.(message.payload.userId, message.payload.status);
          }
          break;
        case 'connection_request':
          if (message.payload.request) {
            console.log('Received connection request:', message.payload.request);
            onConnectionRequest?.(message.payload.request);
          }
          break;
        case 'connection_response':
          if (message.payload.requestId !== undefined && 
              message.payload.accepted !== undefined && 
              message.payload.responder) {
            console.log(`Connection response for request ${message.payload.requestId}: ${message.payload.accepted ? 'accepted' : 'rejected'}`);
            onConnectionResponse?.(
              message.payload.requestId, 
              message.payload.accepted, 
              message.payload.responder
            );
          }
          break;
        case 'chat_created':
          if (message.payload.chat) {
            console.log('New chat created:', message.payload.chat);
            onChatCreated?.(message.payload.chat);
          }
          break;
        case 'error':
          console.error('WebSocket error message:', message.payload);
          break;
      }
    });
    
    return removeListener;
  }, [
    addMessageListener, 
    onNewMessage, 
    onTypingIndicator, 
    onReadReceipt, 
    onUserStatusChange,
    onConnectionRequest,
    onConnectionResponse,
    onChatCreated,
    onMessageSent
  ]);
};

// Connection request related hooks
export const useConnectionRequests = (
  addMessageListener: (listener: (message: WSMessage) => void) => () => void,
  sendMessage: (message: WSMessage) => void,
  onNewConnectionRequest?: (request: any) => void,
  onConnectionResponse?: (requestId: number, accepted: boolean, responder: any) => void,
  onNewChat?: (chat: any) => void
) => {
  useEffect(() => {
    const removeListener = addMessageListener((message: WSMessage) => {
      switch (message.type) {
        case 'connection_request':
          if (message.payload.request) {
            onNewConnectionRequest?.(message.payload.request);
          }
          break;
        case 'connection_response':
          if (message.payload.requestId !== undefined && 
              message.payload.accepted !== undefined && 
              message.payload.responder) {
            onConnectionResponse?.(
              message.payload.requestId, 
              message.payload.accepted, 
              message.payload.responder
            );
          }
          break;
        case 'chat_created':
          if (message.payload.chat) {
            onNewChat?.(message.payload.chat);
          }
          break;
      }
    });
    
    return removeListener;
  }, [addMessageListener, onNewConnectionRequest, onConnectionResponse, onNewChat]);

  // Send a connection request
  const sendConnectionRequest = useCallback((receiverId: number, message?: string) => {
    sendMessage({
      type: 'connection_request',
      payload: { 
        receiverId,
        message 
      }
    });
  }, [sendMessage]);

  // Respond to a connection request
  const respondToConnectionRequest = useCallback((requestId: number, accepted: boolean) => {
    sendMessage({
      type: 'connection_response',
      payload: { 
        requestId, 
        accepted 
      }
    });
  }, [sendMessage]);

  return { 
    sendConnectionRequest, 
    respondToConnectionRequest 
  };
};

// Call-related hooks
export const useCallHandling = (
  addMessageListener: (listener: (message: WSMessage) => void) => () => void,
  sendMessage: (message: WSMessage) => void,
  onIncomingCall?: (callerId: number, callerName: string, callerAvatar: string, callType: string) => void,
  onCallResponse?: (userId: number, accepted: boolean) => void
) => {
  useEffect(() => {
    const removeListener = addMessageListener((message: WSMessage) => {
      switch (message.type) {
        case 'call_request':
          if (message.payload.callerId && message.payload.callerName && message.payload.callType) {
            onIncomingCall?.(
              message.payload.callerId, 
              message.payload.callerName, 
              message.payload.callerAvatar,
              message.payload.callType
            );
          }
          break;
        case 'call_response':
          if (message.payload.userId !== undefined && message.payload.accepted !== undefined) {
            onCallResponse?.(message.payload.userId, message.payload.accepted);
          }
          break;
      }
    });
    
    return removeListener;
  }, [addMessageListener, onIncomingCall, onCallResponse]);

  const initiateCall = useCallback((recipientId: number, callType: 'voice' | 'video') => {
    sendMessage({
      type: 'call_request',
      payload: { recipientId, callType }
    });
  }, [sendMessage]);

  const respondToCall = useCallback((callerId: number, accepted: boolean) => {
    sendMessage({
      type: 'call_response',
      payload: { callerId, accepted }
    });
  }, [sendMessage]);

  return { initiateCall, respondToCall };
};
