import React, { useEffect, useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, UserPlus, Users } from 'lucide-react';
import { useSocket, useMessageListener } from '@/lib/socket';
import { User, Chat, Message } from '@shared/schema';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import ChatArea from '@/components/ChatArea';
import MobileNav from '@/components/ui/mobile-nav';

interface EnhancedChat extends Chat {
  participants: User[];
  lastMessage: Message | null;
}

const ChatPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [selectedChatId, setSelectedChatId] = useState<number | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [typingUsers, setTypingUsers] = useState<{ [userId: number]: boolean }>({});
  
  // Fetch current user
  const { data: currentUser, isLoading: isUserLoading } = useQuery<User>({
    queryKey: ['/api/users/current'],
    staleTime: Infinity,
    retry: 1,
    refetchOnWindowFocus: false
  });
  
  // Initialize socket connection
  const { 
    isConnected, 
    error: socketError, 
    addMessageListener, 
    sendMessage 
  } = useSocket(currentUser?.id || null);
  
  // Listen for WebSocket messages
  useMessageListener(
    addMessageListener,
    (message) => {
      // On new message received
      console.log('Message received in Chat.tsx:', message);
      
      // Immediately update the messages list if the chat is currently selected
      if (selectedChatId === message.chatId) {
        console.log('Updating current chat messages');
        
        // Add the message to the current messages list
        queryClient.setQueryData<Message[]>(
          ['/api/chats', message.chatId, 'messages'],
          (oldMessages = []) => {
            // Check if message already exists in the list
            const messageExists = oldMessages.some(m => m.id === message.id);
            if (messageExists) {
              return oldMessages;
            }
            return [...oldMessages, message];
          }
        );
      }
      
      // Also update the chats list to show latest message
      queryClient.invalidateQueries({ queryKey: ['/api/chats'] });
      
      // If it's a message from a different chat, indicate it as new message
      if (selectedChatId !== message.chatId) {
        toast({
          title: 'New message',
          description: `You have a new message in a different chat`,
          duration: 3000,
        });
      }
    },
    (userId, chatId) => {
      // On typing indicator
      if (chatId === selectedChatId) {
        setTypingUsers(prev => ({ ...prev, [userId]: true }));
        
        // Clear typing indicator after 3 seconds
        setTimeout(() => {
          setTypingUsers(prev => ({ ...prev, [userId]: false }));
        }, 3000);
      }
    },
    (messageId) => {
      // On read receipt
      console.log(`Message marked as read: ${messageId}`);
      
      // Update the specific message status in the cache
      if (selectedChatId) {
        queryClient.setQueryData(
          ['/api/chats', selectedChatId, 'messages'],
          (oldMessages: any[] = []) => {
            return oldMessages.map(msg => 
              msg.id === messageId ? { ...msg, status: 'read', isRead: true } : msg
            );
          }
        );
      }
      
      // Refresh chat list to update unread counts
      queryClient.invalidateQueries({ queryKey: ['/api/chats'] });
    },
    (userId, status) => {
      // On user status change
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
    },
    // Handle new connection requests
    (request) => {
      queryClient.invalidateQueries({ queryKey: ['/api/connection-requests/received'] });
      toast({
        title: 'New connection request',
        description: `${request.sender.username} wants to connect with you`,
      });
    },
    // Handle connection request responses
    (requestId, accepted, responder) => {
      queryClient.invalidateQueries({ queryKey: ['/api/connection-requests/sent'] });
      
      if (accepted) {
        toast({
          title: 'Connection accepted',
          description: `${responder.username} accepted your connection request`,
        });
      } else {
        toast({
          title: 'Connection rejected',
          description: `${responder.username} rejected your connection request`,
        });
      }
    },
    // Handle new chat creation
    (chat) => {
      queryClient.invalidateQueries({ queryKey: ['/api/chats'] });
      toast({
        title: 'New chat created',
        description: 'You can now start messaging',
      });
    },
    // Message sent confirmation
    (messageId, status) => {
      console.log(`Message ${messageId} status: ${status}`);
      
      if (selectedChatId) {
        // Find and update the message in the current chat
        queryClient.setQueryData<Message[]>(
          ['/api/chats', selectedChatId, 'messages'],
          (oldMessages = []) => {
            return oldMessages.map(msg => {
              // Match either by ID or find temporary messages with high timestamps
              const isTargetMessage = 
                msg.id === messageId || 
                (status === 'sent' && typeof msg.id === 'number' && msg.id > Date.now() - 10000);
                
              if (isTargetMessage) {
                return { 
                  ...msg, 
                  id: messageId, // Ensure we have the real ID from server
                  status
                };
              }
              return msg;
            });
          }
        );
        
        // Also update the chat list to show the latest message status
        if (status === 'delivered' || status === 'read') {
          queryClient.invalidateQueries({ queryKey: ['/api/chats'] });
        }
      }
    }
  );
  
  // Fetch all chats
  const { data: chats = [], isLoading: isChatsLoading } = useQuery<EnhancedChat[]>({
    queryKey: ['/api/chats', currentUser?.id],
    enabled: !!currentUser,
    queryFn: async () => {
      const res = await fetch(`/api/chats?userId=${currentUser!.id}`);
      if (!res.ok) throw new Error('Failed to fetch chats');
      return res.json();
    }
  });
  
  // Select first chat on initial load
  useEffect(() => {
    if (chats.length > 0 && !selectedChatId) {
      setSelectedChatId(chats[0].id);
    }
  }, [chats, selectedChatId]);
  
  // Fetch messages for selected chat
  const { data: messages = [], isLoading: isMessagesLoading } = useQuery<Message[]>({
    queryKey: ['/api/chats', selectedChatId, 'messages'],
    enabled: !!selectedChatId,
    queryFn: async () => {
      const res = await fetch(`/api/chats/${selectedChatId}/messages`);
      if (!res.ok) throw new Error('Failed to fetch messages');
      return res.json();
    }
  });
  
  // Fetch participants for selected chat
  const { data: participants = [], isLoading: isParticipantsLoading } = useQuery<User[]>({
    queryKey: ['/api/chats', selectedChatId, 'participants'],
    enabled: !!selectedChatId,
    queryFn: async () => {
      const selectedChat = chats.find(chat => chat.id === selectedChatId);
      return selectedChat?.participants || [];
    }
  });
  
  // Send message mutation
  const { mutate: sendMessageMutation } = useMutation({
    mutationFn: async (
      { chatId, content, mediaUrl, mediaType }: 
      { chatId: number; content: string; mediaUrl?: string; mediaType?: string }
    ) => {
      const response = await apiRequest('POST', '/api/messages', {
        chatId,
        senderId: currentUser!.id,
        content,
        mediaUrl,
        mediaType
      });
      return response.json();
    },
    onSuccess: (data) => {
      // Update messages cache with new message
      queryClient.invalidateQueries({ queryKey: ['/api/chats', selectedChatId, 'messages'] });
      queryClient.invalidateQueries({ queryKey: ['/api/chats'] });
    }
  });
  
  // Handler for sending messages
  const handleSendMessage = useCallback((content: string, mediaUrl?: string, mediaType?: string) => {
    if (!selectedChatId || !currentUser) return;
    
    // Optimistic update for smooth UI
    queryClient.setQueryData<Message[]>(
      ['/api/chats', selectedChatId, 'messages'], 
      (oldMessages = []) => {
        const newMessage: Message = {
          id: Date.now(), // Temporary ID
          chatId: selectedChatId,
          senderId: currentUser.id,
          content: content || null,
          mediaUrl: mediaUrl || null,
          mediaType: mediaType || null,
          isRead: false,
          sentAt: new Date(),
          status: 'sending' // Initial status before it's confirmed by the server
        };
        
        return [...oldMessages, newMessage];
      }
    );
    
    // Send via API
    sendMessageMutation({ chatId: selectedChatId, content, mediaUrl, mediaType });
    
    // Also send via WebSocket for real-time
    sendMessage({
      type: 'message',
      payload: {
        message: {
          chatId: selectedChatId,
          senderId: currentUser.id,
          content,
          mediaUrl,
          mediaType,
          status: 'sent'
        }
      }
    });
  }, [selectedChatId, currentUser, queryClient, sendMessageMutation, sendMessage]);
  
  // Handler for initiating calls
  const handleInitiateCall = useCallback((recipientId: number, callType: 'voice' | 'video') => {
    sendMessage({
      type: 'call_request',
      payload: { recipientId, callType }
    });
  }, [sendMessage]);
  
  // Handler for toggling sidebar (mobile)
  const handleToggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };
  
  // Handler for selecting a chat
  const handleSelectChat = (chatId: number) => {
    setSelectedChatId(chatId);
    setIsSidebarOpen(false); // Close mobile sidebar after selection
  };
  
  if (isUserLoading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }
  
  if (!currentUser) {
    return <div className="flex items-center justify-center h-screen">User not found</div>;
  }
  
  const selectedChat = chats.find(chat => chat.id === selectedChatId) || null;
  
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Header currentUser={currentUser} />
      
      <main className="flex flex-1 overflow-hidden">
        {/* Sidebar (desktop: visible, mobile: hidden by default) */}
        <div className={`${isSidebarOpen ? 'block' : 'hidden'} md:block absolute inset-0 z-30 md:relative md:z-auto bg-white dark:bg-gray-900`}>
          {isSidebarOpen && (
            <button 
              className="absolute top-4 right-4 p-2 rounded-full bg-gray-200 dark:bg-gray-800 md:hidden"
              onClick={handleToggleSidebar}
            >
              <X className="h-5 w-5" />
            </button>
          )}
          
          <Sidebar 
            chats={chats} 
            selectedChatId={selectedChatId} 
            onChatSelect={handleSelectChat}
            onNewChat={() => {/* Will be implemented later */}}
            currentUserId={currentUser.id}
          />
        </div>
        
        {/* Chat Area */}
        <ChatArea 
          selectedChat={selectedChat}
          messages={messages}
          participants={participants}
          currentUser={currentUser}
          onSendMessage={handleSendMessage}
          onInitiateCall={handleInitiateCall}
          onToggleSidebar={handleToggleSidebar}
          typingUsers={typingUsers}
        />
      </main>
      
      {/* Mobile Navigation */}
      <MobileNav />
    </div>
  );
};

export default ChatPage;
