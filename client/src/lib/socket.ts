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
export const useTypingIndicator = (sendMessage: (message: WSMessage) => void, chatId?: number) => {
  const sendTypingIndicator = useCallback(() => {
    if (!chatId) return;
    
    sendMessage({
      type: 'typing',
      payload: { chatId }
    });
  }, [sendMessage, chatId]);
  
  return { sendTypingIndicator };
};

export const useMessageListener = (
  addMessageListener: (listener: (message: WSMessage) => void) => () => void,
  onNewMessage?: (message: any) => void,
  onTypingIndicator?: (userId: number, chatId: number) => void,
  onReadReceipt?: (messageId: number) => void,
  onUserStatusChange?: (userId: number, status: string) => void
) => {
  useEffect(() => {
    const removeListener = addMessageListener((message: WSMessage) => {
      switch (message.type) {
        case 'message':
          onNewMessage?.(message.payload.message);
          break;
        case 'typing':
          if (message.payload.userId && message.payload.chatId) {
            onTypingIndicator?.(message.payload.userId, message.payload.chatId);
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
      }
    });
    
    return removeListener;
  }, [addMessageListener, onNewMessage, onTypingIndicator, onReadReceipt, onUserStatusChange]);
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
