import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, 
  Phone, 
  Video, 
  Info, 
  Smile, 
  Plus,
  Mic,
  Menu, 
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { AvatarWithStatus } from './ui/avatar-with-status';
import MessageItem from './ui/message-item';
import { User, Message, Chat } from '@shared/schema';
import { format } from 'date-fns';
import AttachmentModal from './ui/attachment-modal';
import CallModal from './ui/call-modal';

interface ChatAreaProps {
  selectedChat: Chat | null;
  messages: Message[];
  participants: User[];
  currentUser: User;
  onSendMessage: (content: string, mediaUrl?: string, mediaType?: string) => void;
  onInitiateCall: (recipientId: number, callType: 'voice' | 'video') => void;
  onToggleSidebar: () => void;
  typingUsers: { [userId: number]: boolean };
}

const ChatArea: React.FC<ChatAreaProps> = ({ 
  selectedChat, 
  messages, 
  participants,
  currentUser,
  onSendMessage,
  onInitiateCall,
  onToggleSidebar,
  typingUsers
}) => {
  const [messageInput, setMessageInput] = useState('');
  const [isAttachmentModalOpen, setIsAttachmentModalOpen] = useState(false);
  const [isCallModalOpen, setIsCallModalOpen] = useState(false);
  const [activeCallType, setActiveCallType] = useState<'voice' | 'video'>('voice');
  const [callStatus, setCallStatus] = useState<'calling' | 'connected' | 'ended'>('calling');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);
  
  // Get other participant for 1:1 chat
  const otherParticipant = participants.find(p => p.id !== currentUser.id);
  
  const handleSendMessage = () => {
    if (messageInput.trim() !== '') {
      onSendMessage(messageInput);
      setMessageInput('');
    }
  };
  
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };
  
  const handleSelectAttachment = (type: string) => {
    setIsAttachmentModalOpen(false);
    
    if (type === 'image') {
      // Mock image upload for demo
      onSendMessage(
        'Here\'s a screenshot of my notes from our last meeting.', 
        'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=500&q=80',
        'image'
      );
    } else if (type === 'voice') {
      // Mock voice recording for demo
      onSendMessage(
        '', 
        '/api/media/voice-message-1.mp3',
        'voice'
      );
    }
  };
  
  const handleInitiateCall = (callType: 'voice' | 'video') => {
    if (!otherParticipant) return;
    
    setActiveCallType(callType);
    setCallStatus('calling');
    setIsCallModalOpen(true);
    onInitiateCall(otherParticipant.id, callType);
  };
  
  const handleAcceptCall = () => {
    setCallStatus('connected');
  };
  
  const handleDeclineCall = () => {
    setCallStatus('ended');
    setIsCallModalOpen(false);
  };
  
  // Group messages by date
  const messagesByDate: { [date: string]: Message[] } = {};
  messages.forEach(message => {
    const date = format(new Date(message.sentAt), 'yyyy-MM-dd');
    if (!messagesByDate[date]) {
      messagesByDate[date] = [];
    }
    messagesByDate[date].push(message);
  });
  
  // Get typing users except current user
  const typingUsersList = participants.filter(
    p => p.id !== currentUser.id && typingUsers[p.id]
  );
  
  return (
    <section className="flex-1 flex flex-col bg-white dark:bg-gray-900 relative">
      {selectedChat ? (
        <>
          {/* Chat header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
            <div className="flex items-center">
              <Button 
                variant="ghost" 
                size="icon" 
                className="md:hidden rounded-full mr-2"
                onClick={onToggleSidebar}
              >
                <Menu className="h-5 w-5" />
              </Button>
              
              <div className="flex items-center">
                <AvatarWithStatus 
                  src={otherParticipant?.avatarUrl || ''} 
                  alt={selectedChat.name || otherParticipant?.displayName || 'Chat'} 
                  status={otherParticipant?.status as 'online' | 'offline'}
                  size="md"
                />
                <div className="ml-3">
                  <h2 className="font-medium text-sm">
                    {selectedChat.name || otherParticipant?.displayName || 'Chat'}
                  </h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {otherParticipant?.status === 'online' ? 'Online' : 'Offline'}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <Button 
                variant="ghost" 
                size="icon" 
                className="rounded-full"
                onClick={() => handleInitiateCall('voice')}
              >
                <Phone className="h-5 w-5" />
              </Button>
              
              <Button 
                variant="ghost" 
                size="icon" 
                className="rounded-full"
                onClick={() => handleInitiateCall('video')}
              >
                <Video className="h-5 w-5" />
              </Button>
              
              <Button 
                variant="ghost" 
                size="icon" 
                className="rounded-full"
              >
                <Info className="h-5 w-5" />
              </Button>
            </div>
          </div>
          
          {/* Messages area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-gray-900">
            {Object.keys(messagesByDate).map(date => {
              const formattedDate = format(new Date(date), 'MMMM d, yyyy');
              const isToday = format(new Date(), 'yyyy-MM-dd') === date;
              const isYesterday = format(new Date(Date.now() - 86400000), 'yyyy-MM-dd') === date;
              
              const displayDate = isToday 
                ? 'Today' 
                : isYesterday 
                  ? 'Yesterday' 
                  : formattedDate;
              
              return (
                <div key={date}>
                  {/* Date separator */}
                  <div className="flex justify-center mb-4">
                    <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-full">
                      {displayDate}
                    </span>
                  </div>
                  
                  {/* Messages for this date */}
                  <div className="space-y-4">
                    {messagesByDate[date].map((message, index) => {
                      const isSender = message.senderId === currentUser.id;
                      const sender = participants.find(p => p.id === message.senderId);
                      
                      // Determine if we should show the avatar
                      // Only show avatar for first consecutive message from the same sender
                      const prevMessage = index > 0 ? messagesByDate[date][index - 1] : null;
                      const showAvatar = !isSender && (!prevMessage || prevMessage.senderId !== message.senderId);
                      
                      return (
                        <MessageItem 
                          key={message.id} 
                          message={message} 
                          isSender={isSender} 
                          sender={sender}
                          showAvatar={showAvatar}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
            
            {/* Typing indicator */}
            {typingUsersList.length > 0 && (
              <div className="flex items-end">
                <AvatarWithStatus 
                  src={typingUsersList[0].avatarUrl || ''} 
                  alt={typingUsersList[0].displayName} 
                  size="sm" 
                  className="mr-2"
                />
                <div className="max-w-xs md:max-w-md bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm">
                  <div className="flex space-x-1">
                    <div className="h-2 w-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce"></div>
                    <div className="h-2 w-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                    <div className="h-2 w-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  </div>
                </div>
              </div>
            )}
            
            {/* This empty div is used for scrolling to the bottom */}
            <div ref={messagesEndRef} />
          </div>
          
          {/* Message input area */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
            <div className="flex items-end">
              <Button 
                variant="ghost" 
                size="icon" 
                className="rounded-full mr-2"
                onClick={() => setIsAttachmentModalOpen(true)}
              >
                <Plus className="h-5 w-5" />
              </Button>
              
              <div className="flex-1 relative">
                <Textarea
                  placeholder="Type a message..."
                  className="min-h-[40px] max-h-[200px] border-0 bg-gray-100 dark:bg-gray-800 rounded-2xl resize-none pr-16"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyDown={handleKeyPress}
                />
                <div className="absolute right-2 bottom-2 flex space-x-1">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 rounded-full"
                    onClick={() => handleSelectAttachment('voice')}
                  >
                    <Mic className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 rounded-full"
                  >
                    <Smile className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              <Button 
                size="icon" 
                className="rounded-full ml-2"
                onClick={handleSendMessage}
              >
                <Send className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center p-4">
            <h2 className="text-xl font-semibold mb-2">Select a Conversation</h2>
            <p className="text-gray-500 dark:text-gray-400">
              Choose a chat from the sidebar or start a new conversation
            </p>
          </div>
        </div>
      )}
      
      {/* Attachment Modal */}
      <AttachmentModal 
        isOpen={isAttachmentModalOpen}
        onClose={() => setIsAttachmentModalOpen(false)}
        onSelectAttachment={handleSelectAttachment}
      />
      
      {/* Call Modal */}
      {isCallModalOpen && (
        <CallModal 
          isOpen={isCallModalOpen}
          onClose={() => setIsCallModalOpen(false)}
          callType={activeCallType}
          callerName={otherParticipant?.displayName || 'Unknown'}
          callerAvatar={otherParticipant?.avatarUrl || ''}
          callerStatus={callStatus}
          onAccept={handleAcceptCall}
          onDecline={handleDeclineCall}
        />
      )}
    </section>
  );
};

export default ChatArea;
