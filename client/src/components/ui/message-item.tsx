import React from 'react';
import { format } from 'date-fns';
import { Check, CheckCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Message, User } from '@shared/schema';
import VoiceMessage from './voice-message';

interface MessageItemProps {
  message: Message;
  isSender: boolean;
  sender?: User;
  showAvatar?: boolean;
}

const MessageItem: React.FC<MessageItemProps> = ({ 
  message, 
  isSender, 
  sender,
  showAvatar = true
}) => {
  const isRead = message.isRead;
  const hasMedia = message.mediaUrl && message.mediaType;
  const isImage = message.mediaType === 'image';
  const isVoice = message.mediaType === 'voice';
  
  // Format timestamp
  const timestamp = format(new Date(message.sentAt), 'h:mm a');
  
  return (
    <div className={cn(
      "flex items-end gap-2",
      isSender ? "justify-end" : ""
    )}>
      {!isSender && showAvatar && sender && (
        <img 
          src={sender.avatarUrl || ''} 
          alt={sender.displayName}
          className="h-8 w-8 rounded-full object-cover"
        />
      )}
      
      {!isSender && !showAvatar && (
        <div className="w-8" /> // Spacer for alignment
      )}
      
      {isSender && (
        <span className="text-xs text-gray-500 dark:text-gray-400 self-end">{timestamp}</span>
      )}
      
      <div className={cn(
        "max-w-xs md:max-w-md lg:max-w-lg xl:max-w-xl rounded-lg p-3 shadow-sm",
        isSender 
          ? "bg-gray-200 dark:bg-gray-700" 
          : "bg-white dark:bg-gray-800"
      )}>
        {hasMedia && isImage && (
          <div className="mb-2">
            <img 
              src={message.mediaUrl!} 
              alt="Image attachment" 
              className="w-full rounded-lg object-cover"
              style={{ maxHeight: '200px' }}
            />
          </div>
        )}
        
        {hasMedia && isVoice && (
          <VoiceMessage audioUrl={message.mediaUrl!} />
        )}
        
        {message.content && (
          <p className="text-gray-800 dark:text-gray-200 text-sm">
            {message.content}
          </p>
        )}
      </div>
      
      {isSender && (
        <div className="text-xs self-end">
          {isRead ? (
            <CheckCheck className="h-3 w-3 text-green-500" />
          ) : (
            <Check className="h-3 w-3 text-gray-400" />
          )}
        </div>
      )}
      
      {!isSender && (
        <span className="text-xs text-gray-500 dark:text-gray-400 self-end">{timestamp}</span>
      )}
    </div>
  );
};

export default MessageItem;
