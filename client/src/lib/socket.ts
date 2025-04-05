import { useEffect, useState, useCallback, useRef } from 'react';
import { WSMessage } from '@shared/schema';

// Create a WebSocket instance
const createWebSocket = () => {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/ws`;
  return new WebSocket(wsUrl);
};

// Socket state management
export const useSocket = (userId: number | null) => {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const messageListenersRef = useRef<((message: WSMessage) => void)[]>([]);

  // Initialize WebSocket connection
  useEffect(() => {
    if (!userId) return;

    const socket = createWebSocket();
    socketRef.current = socket;
    
    socket.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
      setError(null);
      
      // Send user status once connected
      socket.send(JSON.stringify({
        type: 'user_status',
        payload: { userId }
      }));
    };
    
    socket.onclose = () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
      
      // Attempt to reconnect after a delay
      setTimeout(() => {
        if (socketRef.current?.readyState !== WebSocket.OPEN) {
          console.log('Attempting to reconnect WebSocket...');
          socketRef.current = createWebSocket();
        }
      }, 3000);
    };
    
    socket.onerror = (error) => {
      console.error('WebSocket error:', error);
      setError('Failed to connect to chat server');
    };
    
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as WSMessage;
        // Notify all registered message listeners
        messageListenersRef.current.forEach(listener => listener(message));
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };
    
    // Cleanup on unmount
    return () => {
      console.log('Closing WebSocket connection');
      socket.close();
    };
  }, [userId]);

  // Add message listener
  const addMessageListener = useCallback((listener: (message: WSMessage) => void) => {
    messageListenersRef.current.push(listener);
    return () => {
      messageListenersRef.current = messageListenersRef.current.filter(l => l !== listener);
    };
  }, []);

  // Send message to server
  const sendMessage = useCallback((message: WSMessage) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(message));
    } else {
      setError('Connection to chat server lost. Attempting to reconnect...');
      
      // Attempt to reconnect
      if (socketRef.current?.readyState !== WebSocket.CONNECTING) {
        socketRef.current = createWebSocket();
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
  onChatCreated?: (chat: any) => void
) => {
  useEffect(() => {
    const removeListener = addMessageListener((message: WSMessage) => {
      switch (message.type) {
        case 'message':
          onNewMessage?.(message.payload.message);
          break;
        case 'typing':
          if (message.payload.userId && message.payload.chatId) {
            const isTyping = message.payload.isTyping === undefined ? true : !!message.payload.isTyping;
            onTypingIndicator?.(message.payload.userId, message.payload.chatId, isTyping);
          }
          break;
        case 'read':
          if (message.payload.messageId) {
            onReadReceipt?.(message.payload.messageId);
          }
          break;
        case 'user_status':
          if (message.payload.userId && message.payload.status) {
            onUserStatusChange?.(message.payload.userId, message.payload.status);
          }
          break;
        case 'connection_request':
          if (message.payload.request) {
            onConnectionRequest?.(message.payload.request);
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
            onChatCreated?.(message.payload.chat);
          }
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
    onChatCreated
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
