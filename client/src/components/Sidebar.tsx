import React, { useState } from 'react';
import { Search, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AvatarWithStatus } from './ui/avatar-with-status';
import { Check, CheckCheck } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { User, Chat, Message } from '@shared/schema';

interface EnhancedChat extends Chat {
  participants: User[];
  lastMessage: Message | null;
}

interface SidebarProps {
  chats: EnhancedChat[];
  selectedChatId: number | null;
  onChatSelect: (chatId: number) => void;
  onNewChat: () => void;
  currentUserId: number;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  chats, 
  selectedChatId, 
  onChatSelect, 
  onNewChat,
  currentUserId
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  
  const filteredChats = chats.filter(chat => {
    // Get the other participant(s) in the chat
    const chatName = chat.name;
    const otherParticipants = chat.participants.filter(p => p.id !== currentUserId);
    
    // For chats without a name, use the other participant's name
    const displayName = chatName || (otherParticipants.length > 0 ? otherParticipants[0].displayName : 'Unknown');
    
    return displayName.toLowerCase().includes(searchQuery.toLowerCase());
  });
  
  const pinnedChats = filteredChats.filter(chat => chat.isPinned);
  const recentChats = filteredChats.filter(chat => !chat.isPinned);
  
  // Helper to format time
  const formatTime = (date: Date) => {
    const now = new Date();
    const messageDate = new Date(date);
    
    if (
      messageDate.getDate() === now.getDate() &&
      messageDate.getMonth() === now.getMonth() &&
      messageDate.getFullYear() === now.getFullYear()
    ) {
      // Today - show time
      return format(messageDate, 'h:mm a');
    } else if (
      now.getTime() - messageDate.getTime() < 7 * 24 * 60 * 60 * 1000
    ) {
      // Within the last week - show day name
      return format(messageDate, 'EEEE');
    } else {
      // More than a week ago - show date
      return format(messageDate, 'MMM d');
    }
  };
  
  const renderChatItem = (chat: EnhancedChat) => {
    const isSelected = chat.id === selectedChatId;
    const otherParticipants = chat.participants.filter(p => p.id !== currentUserId);
    
    // Get the chat display info (either use group name or other participant's info)
    const isGroup = !!chat.name;
    const displayName = isGroup ? chat.name! : (otherParticipants.length > 0 ? otherParticipants[0].displayName : 'Unknown');
    const avatarUrl = isGroup ? 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=120&q=80' : (otherParticipants.length > 0 ? otherParticipants[0].avatarUrl : '');
    const status = isGroup ? undefined : (otherParticipants.length > 0 ? otherParticipants[0].status as 'online' | 'offline' : undefined);
    
    // Last message info
    const lastMessage = chat.lastMessage;
    const lastMessageTime = lastMessage ? formatTime(new Date(lastMessage.sentAt)) : '';
    const isSender = lastMessage ? lastMessage.senderId === currentUserId : false;
    const isRead = lastMessage ? lastMessage.isRead : true;
    
    return (
      <div 
        key={chat.id}
        className={cn(
          "flex items-center p-2 rounded-lg cursor-pointer transition-colors",
          isSelected 
            ? "bg-gray-100 dark:bg-gray-800" 
            : "hover:bg-gray-100 dark:hover:bg-gray-800"
        )}
        onClick={() => onChatSelect(chat.id)}
      >
        <AvatarWithStatus 
          src={avatarUrl || ''} 
          alt={displayName} 
          status={status}
          size="lg"
        />
        
        <div className="ml-3 flex-1 overflow-hidden">
          <div className="flex justify-between items-center">
            <h3 className="font-medium text-sm">{displayName}</h3>
            <span className="text-xs text-gray-500 dark:text-gray-400">{lastMessageTime}</span>
          </div>
          
          {lastMessage && (
            <div className="flex items-center">
              <p className="text-sm text-gray-600 dark:text-gray-300 truncate">
                {isSender && (
                  <>
                    {isRead ? (
                      <CheckCheck className="inline h-3 w-3 text-green-500 mr-1" />
                    ) : (
                      <Check className="inline h-3 w-3 text-gray-400 mr-1" />
                    )}
                  </>
                )}
                
                {lastMessage.mediaType === 'image' && (
                  <span className="text-gray-400 mr-1">
                    <svg className="inline h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                    </svg>
                    {" Photo"}
                  </span>
                )}
                
                {lastMessage.mediaType === 'voice' && (
                  <span className="text-gray-400 mr-1">
                    <svg className="inline h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
                    </svg>
                    {" Voice message"}
                  </span>
                )}
                
                {lastMessage.content || ''}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  };
  
  return (
    <aside className="hidden md:flex md:w-80 lg:w-96 flex-col border-r border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
      <div className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            type="text"
            placeholder="Search conversations..."
            className="pl-10 bg-gray-100 dark:bg-gray-800 border-0 rounded-full"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>
      
      <div className="overflow-y-auto flex-1">
        {/* Pinned chats section */}
        {pinnedChats.length > 0 && (
          <div className="px-4 py-2">
            <h2 className="text-xs uppercase font-semibold text-gray-500 dark:text-gray-400 mb-2">Pinned</h2>
            <div className="space-y-1">
              {pinnedChats.map(renderChatItem)}
            </div>
          </div>
        )}
        
        {/* Recent chats section */}
        <div className="px-4 py-2">
          <h2 className="text-xs uppercase font-semibold text-gray-500 dark:text-gray-400 mb-2">Recent</h2>
          <div className="space-y-1">
            {recentChats.map(renderChatItem)}
          </div>
        </div>
      </div>
      
      <div className="p-4 border-t border-gray-200 dark:border-gray-800">
        <Button 
          onClick={onNewChat}
          variant="outline" 
          className="flex items-center justify-center w-full"
        >
          <Plus className="h-4 w-4 mr-2" />
          <span className="text-sm font-medium">New Conversation</span>
        </Button>
      </div>
    </aside>
  );
};

export default Sidebar;
