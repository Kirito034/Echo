import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { User } from '@shared/schema';
import { useConnectionRequests } from '@/lib/socket';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { UserPlus, Loader2, Search } from 'lucide-react';
import { AvatarWithStatus } from '@/components/ui/avatar-with-status';

interface AddUserDialogProps {
  trigger?: React.ReactNode;
  onUserAdded?: () => void;
  addMessageListener: (listener: (message: any) => void) => () => void;
  sendMessage: (message: any) => void;
}

const formSchema = z.object({
  email: z.string().email({ message: "Please enter a valid email address" }),
  message: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export function AddUserDialog({ trigger, onUserAdded, addMessageListener, sendMessage }: AddUserDialogProps) {
  const [open, setOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<User | null>(null);
  const [isRequestSent, setIsRequestSent] = useState(false);
  const { toast } = useToast();

  const connectionRequests = useConnectionRequests(
    addMessageListener,
    sendMessage,
    undefined,
    (requestId, accepted) => {
      if (accepted) {
        toast({
          title: 'Connection Accepted',
          description: 'Your connection request was accepted',
        });
        setOpen(false);
        onUserAdded?.();
      }
    }
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
      message: '',
    },
  });

  const { mutate: searchUser, isPending: isSearchPending } = useMutation({
    mutationFn: async (email: string) => {
      const response = await fetch(`/api/users/search?q=${encodeURIComponent(email)}`);
      if (!response.ok) {
        throw new Error('User search failed');
      }
      const users = await response.json();
      return users.length > 0 ? users[0] : null;
    },
    onSuccess: (user) => {
      setSearchResult(user);
      setIsSearching(false);
      setIsRequestSent(false);
      
      if (!user) {
        toast({
          title: 'User not found',
          description: 'No user found with that email address',
          variant: 'destructive',
        });
      }
    },
    onError: (error) => {
      setIsSearching(false);
      toast({
        title: 'Search failed',
        description: error instanceof Error ? error.message : 'Something went wrong',
        variant: 'destructive',
      });
    },
  });

  const { mutate: sendConnectionRequest, isPending: isSendingRequest } = useMutation({
    mutationFn: async ({ receiverId, message }: { receiverId: number; message?: string }) => {
      // Check for existing connection requests or connections first
      try {
        const checkResponse = await fetch(`/api/connection-requests/check/${receiverId}`);
        if (checkResponse.ok) {
          const existingRequest = await checkResponse.json();
          if (existingRequest) {
            // Connection or request already exists
            throw new Error('Connection request already exists');
          }
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('already exists')) {
          throw { status: 400, data: { message: 'Connection request already exists' } };
        }
      }
      
      // Send connection request via HTTP API only
      // WebSocket notification will be triggered on the server after DB insert
      return apiRequest('POST', '/api/connection-requests', {
        receiverId,
        message,
      });
    },
    onSuccess: () => {
      setIsRequestSent(true);
      toast({
        title: 'Request sent',
        description: 'Connection request sent successfully',
      });
      
      // We no longer send a duplicate request via WebSocket
      // The server handles real-time notifications after the DB insert
    },
    onError: (error: any) => {
      if (error.status === 400 && error.data?.message?.includes('already exists')) {
        toast({
          title: 'Already connected',
          description: 'You already have a pending or active connection with this user',
        });
      } else {
        toast({
          title: 'Request failed',
          description: 'Failed to send connection request',
          variant: 'destructive',
        });
      }
    },
  });

  const handleSearch = (values: FormValues) => {
    setIsSearching(true);
    searchUser(values.email);
  };

  const handleSendRequest = () => {
    if (searchResult) {
      sendConnectionRequest({
        receiverId: searchResult.id,
        message: form.getValues('message'),
      });
    }
  };

  const handleReset = () => {
    form.reset();
    setSearchResult(null);
    setIsRequestSent(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || <Button variant="outline" size="sm"><UserPlus className="mr-2 h-4 w-4" /> Add User</Button>}
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add User by Email</DialogTitle>
          <DialogDescription>
            Send a connection request to another user with their email address.
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSearch)} className="space-y-4 pt-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email address</FormLabel>
                  <div className="flex space-x-2">
                    <FormControl>
                      <Input 
                        placeholder="user@example.com" 
                        {...field}
                        disabled={isSearchPending || !!searchResult} 
                      />
                    </FormControl>
                    {!searchResult && (
                      <Button type="submit" disabled={isSearchPending}>
                        {isSearchPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Search className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {searchResult && (
              <>
                <div className="bg-muted/50 rounded-lg p-4 flex items-center space-x-4">
                  <AvatarWithStatus
                    src={searchResult.avatarUrl || ''}
                    alt={searchResult.displayName}
                    status={searchResult.status as 'online' | 'offline'}
                  />
                  <div>
                    <h4 className="font-medium">{searchResult.displayName}</h4>
                    <p className="text-sm text-muted-foreground">@{searchResult.username}</p>
                  </div>
                </div>
                
                <FormField
                  control={form.control}
                  name="message"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Add a message (optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="I'd like to connect with you"
                          {...field}
                          disabled={isRequestSent}
                        />
                      </FormControl>
                      <FormDescription>
                        This message will be included with your connection request.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}
          </form>
        </Form>
        
        <DialogFooter className="flex items-center justify-between sm:justify-between">
          {searchResult ? (
            <div className="flex gap-2">
              <Button 
                variant="secondary" 
                onClick={handleReset}
              >
                New Search
              </Button>
              <Button
                type="button"
                onClick={handleSendRequest}
                disabled={isSendingRequest || isRequestSent}
              >
                {isSendingRequest ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : isRequestSent ? (
                  'Request Sent'
                ) : (
                  'Send Request'
                )}
              </Button>
            </div>
          ) : (
            <Button 
              variant="ghost" 
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}