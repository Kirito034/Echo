import React from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { 
  Image, 
  Video, 
  FileText, 
  MapPin, 
  Mic, 
  User,
  X
} from 'lucide-react';

interface AttachmentOption {
  icon: React.ReactNode;
  label: string;
  color: string;
  onClick: () => void;
}

interface AttachmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAttachment: (type: string) => void;
}

const AttachmentModal: React.FC<AttachmentModalProps> = ({
  isOpen,
  onClose,
  onSelectAttachment
}) => {
  const attachmentOptions: AttachmentOption[] = [
    {
      icon: <Image className="h-5 w-5" />,
      label: 'Photos',
      color: 'bg-blue-100 dark:bg-blue-900 text-blue-500',
      onClick: () => onSelectAttachment('image')
    },
    {
      icon: <Video className="h-5 w-5" />,
      label: 'Video',
      color: 'bg-purple-100 dark:bg-purple-900 text-purple-500',
      onClick: () => onSelectAttachment('video')
    },
    {
      icon: <FileText className="h-5 w-5" />,
      label: 'Document',
      color: 'bg-green-100 dark:bg-green-900 text-green-500',
      onClick: () => onSelectAttachment('document')
    },
    {
      icon: <MapPin className="h-5 w-5" />,
      label: 'Location',
      color: 'bg-yellow-100 dark:bg-yellow-900 text-yellow-500',
      onClick: () => onSelectAttachment('location')
    },
    {
      icon: <Mic className="h-5 w-5" />,
      label: 'Voice',
      color: 'bg-red-100 dark:bg-red-900 text-red-500',
      onClick: () => onSelectAttachment('voice')
    },
    {
      icon: <User className="h-5 w-5" />,
      label: 'Contact',
      color: 'bg-indigo-100 dark:bg-indigo-900 text-indigo-500',
      onClick: () => onSelectAttachment('contact')
    }
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="flex justify-between items-center mb-4">
          <DialogTitle className="text-lg font-semibold">Add Attachment</DialogTitle>
          <button 
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </DialogHeader>
        
        <div className="grid grid-cols-3 gap-4">
          {attachmentOptions.map((option, index) => (
            <button
              key={index}
              className="flex flex-col items-center justify-center p-4 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              onClick={option.onClick}
            >
              <div className={`w-12 h-12 rounded-full ${option.color} flex items-center justify-center mb-2`}>
                {option.icon}
              </div>
              <span className="text-xs">{option.label}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AttachmentModal;
