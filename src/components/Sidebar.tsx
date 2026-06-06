import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Target, 
  FileOutput, 
  LogOut, 
  BarChart3,
  User,
  Building2,
  X
} from 'lucide-react';
import { supabase } from '@/src/lib/supabase';
import { Profile } from '@/src/types';
import { cn } from '@/src/lib/utils';

interface SidebarProps {
  user: Profile;
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ user, isOpen, onClose }: SidebarProps) {
  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Target Planning', path: '/targets', icon: Target },
    { name: 'Actual Entry', path: '/actuals', icon: FileOutput },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/40 backdrop-blur-xs z-40 md:hidden"
          onClick={onClose}
        />
      )}

      <aside className={cn(
        "w-64 bg-white border-r border-zinc-100 flex flex-col h-screen fixed inset-y-0 left-0 z-50 md:sticky top-0 transition-transform duration-300 ease-in-out",
        isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
        {/* Close Button - Mobile Only */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-lg text-zinc-400 hover:text-black hover:bg-zinc-100 md:hidden"
          title="Close Navigation"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="p-4 flex flex-col items-center justify-center gap-3.5 border-b border-zinc-100 bg-zinc-50/50">
        <img 
          src="https://www.ginzalimited.com/cdn/shop/files/Ginza_logo.jpg?v=1668509673&width=800" 
          alt="GINZA Logo" 
          className="w-52 h-24 object-contain rounded-xl shadow-sm border border-zinc-200 bg-white p-1.5"
          referrerPolicy="no-referrer"
        />
        <div className="text-center">
          <h1 className="font-black text-xl tracking-tighter text-zinc-900 leading-none">Sales Pulse</h1>
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 mt-1.5 block">Ginza Ltd.</span>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-2 mt-4">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            onClick={onClose}
            className={({ isActive }) => cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all",
              isActive 
                ? "bg-black text-white shadow-lg shadow-black/10" 
                : "text-zinc-500 hover:bg-zinc-50 hover:text-black"
            )}
          >
            <item.icon className="h-5 w-5" />
            {item.name}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 mt-auto">
        <div className="bg-zinc-50 rounded-2xl p-4 mb-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-8 w-8 bg-white border border-zinc-200 rounded-full flex items-center justify-center">
              <User className="h-4 w-4 text-zinc-600" />
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-black truncate">{user.full_name}</p>
              <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">{user.role}</p>
            </div>
          </div>
          {user.role !== 'Admin' && (
            <div className="flex items-start gap-2">
              <Building2 className="h-3 w-3 text-zinc-400 mt-0.5" />
              <p className="text-[9px] text-zinc-500 font-medium leading-tight">
                {user.branch_ids.join(', ')}
              </p>
            </div>
          )}
        </div>
        
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-black text-red-500 hover:bg-red-50 transition-colors border border-transparent hover:border-red-100"
        >
          <LogOut className="h-4 w-4" />
          LOGOUT SYSTEM
        </button>
      </div>
    </aside>
    </>
  );
}
