import React, { useState } from 'react';
import { supabase } from '@/src/lib/supabase';
import { Button, Input, Card, CardContent, CardDescription, CardHeader, CardTitle, Label } from '@/src/components/ui';
import { KeyRound, Lock, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

interface ResetPasswordProps {
  onComplete: () => void;
}

export default function ResetPassword({ onComplete }: ResetPasswordProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!password) {
      toast.error('Please enter a new password');
      return;
    }
    
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters long');
      return;
    }

    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: password
      });

      if (error) throw error;

      toast.success('Password updated successfully! Logging you in...');
      
      // Clear the url hash containing recovery tokens so the user doesn't get stuck in recovery mode
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      
      setTimeout(() => {
        onComplete();
      }, 1500);
    } catch (error: any) {
      console.error('Reset password error:', error);
      toast.error(error.message || 'Error updating password. The recovery link may be expired or invalid.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 p-4 md:p-6 font-sans">
      <Card className="w-full max-w-xl shadow-2xl border-none rounded-3xl overflow-hidden bg-white">
        <CardHeader className="space-y-4 text-center bg-zinc-50 pb-6 pt-8 md:pb-8 md:pt-10 border-b border-zinc-100">
          <div className="mx-auto mb-2 flex items-center justify-center h-12 w-12 rounded-2xl bg-black text-white">
            <KeyRound className="h-6 w-6" />
          </div>
          <CardTitle className="text-xl md:text-2xl font-black tracking-tighter text-zinc-900">
            Create New Password
          </CardTitle>
          <CardDescription className="text-xs md:text-sm text-zinc-500 font-medium px-4">
            Enter a strong and secure password for your SalesPulse account.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5 md:p-8 space-y-6">
          <form onSubmit={handleReset} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password" className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 ml-1">
                New Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3.5 h-4 w-4 text-zinc-400" />
                <Input
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="At least 6 characters"
                  className="pl-11 pr-11 h-12 bg-zinc-50 border-zinc-200 rounded-xl"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-3.5 text-zinc-400 hover:text-zinc-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password" className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 ml-1">
                Confirm Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3.5 h-4 w-4 text-zinc-400" />
                <Input
                  id="confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Repeat new password"
                  className="pl-11 h-12 bg-zinc-50 border-zinc-200 rounded-xl"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>
            </div>

            <Button 
              type="submit" 
              className="w-full h-12 bg-black hover:bg-zinc-800 text-white font-black rounded-xl shadow-lg mt-4 disabled:opacity-50 transition-all active:scale-[0.98]" 
              disabled={loading}
            >
              {loading ? 'Updating Password...' : 'Save & Log In'}
            </Button>
          </form>

          <div className="text-center pt-2">
            <button
              onClick={() => {
                // Return home/signout
                supabase.auth.signOut();
                window.location.href = window.location.origin;
              }}
              className="text-xs font-bold text-zinc-400 hover:text-black hover:underline underline-offset-4"
              type="button"
            >
              Cancel & Sign Out
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
