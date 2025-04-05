import React from 'react';
import { Link, useLocation } from 'wouter';
import { MessageSquare, Phone, Users, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

const MobileNav: React.FC = () => {
  const [location] = useLocation();
  
  const navItems = [
    {
      icon: MessageSquare,
      label: 'Chats',
      href: '/',
      isActive: location === '/'
    },
    {
      icon: Phone,
      label: 'Calls',
      href: '/calls',
      isActive: location === '/calls'
    },
    {
      icon: Users,
      label: 'Contacts',
      href: '/contacts',
      isActive: location === '/contacts'
    },
    {
      icon: Settings,
      label: 'Settings',
      href: '/settings',
      isActive: location === '/settings'
    }
  ];
  
  return (
    <nav className="md:hidden flex justify-around items-center p-3 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      {navItems.map((item, index) => {
        const Icon = item.icon;
        return (
          <Link key={index} href={item.href}>
            <a className={cn(
              "p-2 flex flex-col items-center",
              item.isActive 
                ? "text-primary" 
                : "text-gray-500 dark:text-gray-400"
            )}>
              <Icon className="h-5 w-5" />
              <span className="text-xs mt-1">{item.label}</span>
            </a>
          </Link>
        );
      })}
    </nav>
  );
};

export default MobileNav;
