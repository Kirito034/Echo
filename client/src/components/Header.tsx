import React from 'react';
import { Moon, Sun, Bell, LogOut } from 'lucide-react';
import { AvatarWithStatus } from './ui/avatar-with-status';
import { useTheme } from '@/lib/theme';
import { Button } from '@/components/ui/button';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { User } from '@shared/schema';

interface HeaderProps {
  currentUser: User;
  onLogout?: () => void;
}

const Header: React.FC<HeaderProps> = ({ currentUser, onLogout }) => {
  const { theme, toggleTheme } = useTheme();
  
  return (
    <header className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <div className="flex items-center">
        <h1 className="text-xl font-semibold ml-2">Echo</h1>
      </div>
      
      <div className="flex items-center space-x-4">
        <Button 
          variant="ghost" 
          size="icon" 
          className="rounded-full relative overflow-hidden" 
          onClick={toggleTheme}
        >
          <div className="absolute inset-0 flex items-center justify-center transition-opacity duration-300 ease-in-out"
              style={{ opacity: theme === 'dark' ? 1 : 0 }}>
            <Sun className="h-5 w-5 transition-transform duration-300 ease-in-out" 
                style={{ transform: theme === 'dark' ? 'rotate(0deg) scale(1)' : 'rotate(-90deg) scale(0.5)' }} />
          </div>
          <div className="absolute inset-0 flex items-center justify-center transition-opacity duration-300 ease-in-out"
              style={{ opacity: theme === 'light' ? 1 : 0 }}>
            <Moon className="h-5 w-5 transition-transform duration-300 ease-in-out" 
                style={{ transform: theme === 'light' ? 'rotate(0deg) scale(1)' : 'rotate(90deg) scale(0.5)' }} />
          </div>
        </Button>
        
        <Button 
          variant="ghost" 
          size="icon" 
          className="rounded-full relative"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute top-0 right-0 h-2 w-2 bg-green-500 rounded-full"></span>
        </Button>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative p-0">
              <AvatarWithStatus 
                src={currentUser.avatarUrl || ''} 
                alt={currentUser.displayName} 
                status={currentUser.status as 'online' | 'offline'}
                size="sm"
              />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="cursor-pointer" onClick={onLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};

export default Header;
