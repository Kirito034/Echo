import React from 'react';
import { Link, useLocation } from 'wouter';
import { Home, User, LogOut } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';

export default function MobileNav() {
  const [location] = useLocation();
  const { logoutMutation } = useAuth();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-background border-t border-border p-2 z-50">
      <div className="grid grid-cols-3 gap-2">
        <Link href="/">
          <a className={`flex flex-col items-center justify-center py-2 ${location === '/' ? 'text-primary' : 'text-muted-foreground'}`}>
            <Home className="h-5 w-5" />
            <span className="text-xs mt-1">Home</span>
          </a>
        </Link>
        
        <Link href="/profile">
          <a className={`flex flex-col items-center justify-center py-2 ${location === '/profile' ? 'text-primary' : 'text-muted-foreground'}`}>
            <User className="h-5 w-5" />
            <span className="text-xs mt-1">Profile</span>
          </a>
        </Link>
        
        <button
          onClick={() => logoutMutation.mutate()}
          className="flex flex-col items-center justify-center py-2 text-muted-foreground"
        >
          <LogOut className="h-5 w-5" />
          <span className="text-xs mt-1">Logout</span>
        </button>
      </div>
    </nav>
  );
}