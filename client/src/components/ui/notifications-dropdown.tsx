import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { User, ConnectionRequest } from '@shared/schema';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Bell } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { toast } from '@/hooks/use-toast';
import { AvatarWithStatus } from '@/components/ui/avatar-with-status';
import { cn } from '@/lib/utils';

interface NotificationsDropdownProps {
  userId: number;
  onNewConnectionAccepted?: () => void;
}

export function NotificationsDropdown({ userId, onNewConnectionAccepted }: NotificationsDropdownProps) {
  const queryClient = useQueryClient();

  // Fetch connection requests
  const { data: connectionRequests = [], refetch } = useQuery<(ConnectionRequest & { sender: User })[]>({
    queryKey: ['/api/connection-requests/received'],
    queryFn: async () => {
      const res = await fetch('/api/connection-requests/received');
      if (!res.ok) {
        throw new Error('Failed to fetch connection requests');
      }
      return res.json();
    },
    refetchInterval: 10000, // Refetch every 10 seconds in the background
  });

  // Accept connection request mutation
  const { mutate: acceptConnectionRequest } = useMutation({
    mutationFn: async (requestId: number) => {
      return apiRequest('PATCH', `/api/connection-requests/${requestId}`, {
        status: 'accepted'
      });
    },
    onSuccess: async () => {
      toast({
        title: 'Connection accepted',
        description: 'You are now connected with this user',
      });
      
      // Invalidate queries to refresh the data
      await queryClient.invalidateQueries({ queryKey: ['/api/connection-requests/received'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/chats'] });
      
      // Notify parent component
      if (onNewConnectionAccepted) {
        onNewConnectionAccepted();
      }
    },
    onError: (error) => {
      toast({
        title: 'Failed to accept connection',
        description: 'Please try again later',
        variant: 'destructive',
      });
    }
  });

  // Reject connection request mutation
  const { mutate: rejectConnectionRequest } = useMutation({
    mutationFn: async (requestId: number) => {
      return apiRequest('PATCH', `/api/connection-requests/${requestId}`, {
        status: 'rejected'
      });
    },
    onSuccess: async () => {
      toast({
        title: 'Connection rejected',
      });
      
      // Invalidate queries to refresh the data
      await queryClient.invalidateQueries({ queryKey: ['/api/connection-requests/received'] });
    },
    onError: (error) => {
      toast({
        title: 'Failed to reject connection',
        description: 'Please try again later',
        variant: 'destructive',
      });
    }
  });

  const hasNotifications = connectionRequests.length > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="rounded-full relative"
        >
          <Bell className="h-5 w-5" />
          {hasNotifications && (
            <Badge 
              variant="destructive" 
              className="absolute -top-2 -right-2 min-w-[18px] h-[18px] flex items-center justify-center px-1 py-0 text-xs font-bold rounded-full"
            >
              {connectionRequests.length}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex justify-between items-center px-4 py-2 border-b">
          <h3 className="font-medium">Notifications</h3>
          {hasNotifications && (
            <Badge variant="outline" className="ml-auto">
              {connectionRequests.length} new
            </Badge>
          )}
        </div>
        
        {connectionRequests.length === 0 ? (
          <div className="py-6 text-center text-muted-foreground">
            No new notifications
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            {connectionRequests.map((request) => (
              <div key={request.id} className="px-4 py-3 hover:bg-accent transition-colors">
                <div className="flex items-start gap-3">
                  <AvatarWithStatus
                    src={request.sender.avatarUrl || ''}
                    alt={request.sender.displayName}
                    status={request.sender.status as 'online' | 'offline'}
                    size="sm"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                      <p className="font-medium truncate">
                        {request.sender.displayName}
                      </p>
                      <span className="text-xs text-muted-foreground ml-2">
                        {typeof request.createdAt === 'string' 
                          ? new Date(request.createdAt).toLocaleDateString() 
                          : (request.createdAt instanceof Date 
                              ? request.createdAt.toLocaleDateString() 
                              : 'Just now')}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {request.message || `${request.sender.username} wants to connect with you`}
                    </p>
                    <div className="flex gap-2 mt-2">
                      <Button 
                        variant="secondary" 
                        size="sm" 
                        className="w-full h-8"
                        onClick={() => acceptConnectionRequest(request.id)}
                      >
                        Accept
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="w-full h-8"
                        onClick={() => rejectConnectionRequest(request.id)}
                      >
                        Decline
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}