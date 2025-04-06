import React from 'react';
import { format } from 'date-fns';
import { Check, CheckCheck, Clock, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Message, User } from '@shared/schema';
import VoiceMessage from './voice-message';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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
  const hasMedia = message.mediaUrl && message.mediaType;
  const isImage = message.mediaType === 'image';
  const isVoice = message.mediaType === 'voice';
  
  // Format timestamp
  const messageDate = message.sentAt ? 
    (typeof message.sentAt === 'string' ? new Date(message.sentAt) : message.sentAt) : 
    new Date();
  const timestamp = format(messageDate, 'h:mm a');

  // Get message status
  const status = message.status || (message.isRead ? 'read' : 'sent');
  
  // Render appropriate status icon
  const renderStatusIcon = () => {
    if (!isSender) return null;
    
    switch (status) {
      case 'sending':
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Clock className="h-3 w-3 text-gray-400" />
              </TooltipTrigger>
              <TooltipContent>
                <p>Sending</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      case 'sent':
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Check className="h-3 w-3 text-gray-400" />
              </TooltipTrigger>
              <TooltipContent>
                <p>Sent</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      case 'delivered':
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <CheckCheck className="h-3 w-3 text-blue-500" />
              </TooltipTrigger>
              <TooltipContent>
                <p>Delivered</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      case 'read':
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <CheckCheck className="h-3 w-3 text-green-500" />
              </TooltipTrigger>
              <TooltipContent>
                <p>Read</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      case 'error':
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <AlertCircle className="h-3 w-3 text-red-500" />
              </TooltipTrigger>
              <TooltipContent>
                <p>Failed to send</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      default:
        return <Check className="h-3 w-3 text-gray-400" />;
    }
  };
  
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
          {renderStatusIcon()}
        </div>
      )}
      
      {!isSender && (
        <span className="text-xs text-gray-500 dark:text-gray-400 self-end">{timestamp}</span>
      )}
    </div>
  );
};

export default MessageItem;
