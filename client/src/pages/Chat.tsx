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
      queryClient.invalidateQueries({ queryKey: ['/api/chats'] });
      if (selectedChatId === message.chatId) {
        queryClient.invalidateQueries({ queryKey: ['/api/chats', selectedChatId, 'messages'] });
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
      queryClient.invalidateQueries({ queryKey: ['/api/chats'] });
      if (selectedChatId) {
        queryClient.invalidateQueries({ queryKey: ['/api/chats', selectedChatId, 'messages'] });
      }
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
          sentAt: new Date()
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
          mediaType
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
