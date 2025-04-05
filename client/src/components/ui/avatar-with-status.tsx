import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

interface AvatarWithStatusProps {
  src: string;
  alt: string;
  status?: 'online' | 'offline' | 'away';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function AvatarWithStatus({ 
  src, 
  alt, 
  status, 
  size = 'md',
  className 
}: AvatarWithStatusProps) {
  
  const sizeMap = {
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-12 w-12'
  };
  
  const statusSizeMap = {
    sm: 'h-2 w-2',
    md: 'h-3 w-3',
    lg: 'h-3 w-3'
  };
  
  const getStatusColor = () => {
    switch (status) {
      case 'online':
        return 'bg-green-500';
      case 'away':
        return 'bg-yellow-500';
      case 'offline':
      default:
        return 'bg-gray-400';
    }
  };
  
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(part => part.charAt(0))
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };
  
  return (
    <div className={cn("relative", className)}>
      <Avatar className={cn(sizeMap[size])}>
        <AvatarImage src={src} alt={alt} />
        <AvatarFallback>{getInitials(alt)}</AvatarFallback>
      </Avatar>
      {status && (
        <span 
          className={cn(
            "absolute bottom-0 right-0 rounded-full border-2 border-white dark:border-gray-900",
            statusSizeMap[size],
            getStatusColor()
          )}
        />
      )}
    </div>
  );
}
