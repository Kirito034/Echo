import React from 'react';
import { 
  Dialog, 
  DialogContent 
} from '@/components/ui/dialog';
import { Phone, PhoneOff, Video, Mic, MicOff, Camera, CameraOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AvatarWithStatus } from './avatar-with-status';

interface CallModalProps {
  isOpen: boolean;
  onClose: () => void;
  callType: 'voice' | 'video';
  callerName: string;
  callerAvatar: string;
  callerStatus: 'calling' | 'connected' | 'ended';
  onAccept: () => void;
  onDecline: () => void;
}

const CallModal: React.FC<CallModalProps> = ({
  isOpen,
  onClose,
  callType,
  callerName,
  callerAvatar,
  callerStatus,
  onAccept,
  onDecline
}) => {
  const [isMuted, setIsMuted] = React.useState(false);
  const [isVideoOff, setIsVideoOff] = React.useState(false);
  const isConnected = callerStatus === 'connected';
  
  const handleAccept = () => {
    onAccept();
  };
  
  const handleDecline = () => {
    onDecline();
    onClose();
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="p-0 max-w-lg overflow-hidden rounded-xl">
        <div className="relative h-96 bg-gray-800">
          {/* Remote video (full size) */}
          <div className="absolute inset-0 bg-gray-900 flex items-center justify-center">
            {callType === 'video' && isConnected && !isVideoOff ? (
              <img 
                src={callerAvatar} 
                alt={callerName} 
                className="w-full h-full object-cover opacity-80"
              />
            ) : (
              <div className="text-center">
                <AvatarWithStatus 
                  src={callerAvatar} 
                  alt={callerName} 
                  size="lg" 
                  className="mx-auto mb-4 h-20 w-20"
                />
                <h3 className="text-2xl font-semibold text-white mb-2">{callerName}</h3>
                <p className="text-gray-300">
                  {callerStatus === 'calling' ? 'Calling...' : 
                   callerStatus === 'connected' ? 'Connected' : 
                   'Call ended'}
                </p>
              </div>
            )}
          </div>
          
          {/* Local video (small overlay) */}
          {callType === 'video' && isConnected && (
            <div className="absolute bottom-4 right-4 h-32 w-24 bg-gray-700 rounded overflow-hidden border-2 border-gray-600">
              <img 
                src="https://images.unsplash.com/photo-1517841905240-472988babdf9?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=120&q=80" 
                alt="You" 
                className="w-full h-full object-cover"
              />
            </div>
          )}
        </div>
        
        <div className="bg-white dark:bg-gray-900 p-4">
          {callerStatus === 'calling' ? (
            <div className="flex justify-center items-center space-x-4">
              <Button 
                variant="destructive" 
                size="icon" 
                className="h-12 w-12 rounded-full"
                onClick={handleDecline}
              >
                <PhoneOff className="h-5 w-5" />
              </Button>
              
              <Button 
                variant="default" 
                size="icon" 
                className="h-12 w-12 rounded-full bg-green-500 hover:bg-green-600"
                onClick={handleAccept}
              >
                {callType === 'voice' ? (
                  <Phone className="h-5 w-5" />
                ) : (
                  <Video className="h-5 w-5" />
                )}
              </Button>
            </div>
          ) : (
            <div className="flex justify-center items-center space-x-4">
              {callType === 'video' && (
                <Button 
                  variant="outline" 
                  size="icon" 
                  className="h-10 w-10 rounded-full"
                  onClick={() => setIsVideoOff(!isVideoOff)}
                >
                  {isVideoOff ? (
                    <CameraOff className="h-4 w-4" />
                  ) : (
                    <Camera className="h-4 w-4" />
                  )}
                </Button>
              )}
              
              <Button 
                variant="outline" 
                size="icon" 
                className="h-10 w-10 rounded-full"
                onClick={() => setIsMuted(!isMuted)}
              >
                {isMuted ? (
                  <MicOff className="h-4 w-4" />
                ) : (
                  <Mic className="h-4 w-4" />
                )}
              </Button>
              
              <Button 
                variant="destructive" 
                size="icon" 
                className="h-12 w-12 rounded-full"
                onClick={handleDecline}
              >
                <PhoneOff className="h-5 w-5" />
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CallModal;
