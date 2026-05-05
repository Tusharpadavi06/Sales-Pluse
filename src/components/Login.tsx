import React, { useState } from 'react';
import { supabase, isSupabaseConfigured } from '@/src/lib/supabase';
import { Button, Input, Card, CardContent, CardDescription, CardHeader, CardTitle, Label } from '@/src/components/ui';
import { Mail, Lock, RefreshCw, BarChart3, User as UserIcon } from 'lucide-react';
import { toast } from 'sonner';
import { UserRole } from '@/src/types';
import { BRANCHES } from '@/src/constants';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [surname, setSurname] = useState('');
  const [role, setRole] = useState<UserRole>('Sales Person');
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const BRANCH_LIST = BRANCHES;

  const clearSessionAndReset = async () => {
    try {
      await supabase.auth.signOut();
      localStorage.clear();
      sessionStorage.clear();
      const cookies = document.cookie.split(";");
      for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i];
        const eqPos = cookie.indexOf("=");
        const name = eqPos > -1 ? cookie.substring(0, eqPos) : cookie;
        document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
      }
      toast.success('Session cleared. Resetting...');
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (err) {
      window.location.reload();
    }
  };

  const toggleBranch = (branch: string) => {
    if (role === 'Sales Person') {
      setSelectedBranches([branch]);
    } else if (role === 'Branch Head') {
      setSelectedBranches(prev => 
        prev.includes(branch) 
          ? prev.filter(b => b !== branch) 
          : [...prev, branch]
      );
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!isSupabaseConfigured) {
        throw new Error('Database is not configured. Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your secrets.');
      }

      const fullName = `${firstName.trim()} ${surname.trim()}`.trim();

      if (isSignUp) {
        if (!firstName.trim() || !surname.trim()) throw new Error('First Name and Surname are required');
        if (password.length < 6) throw new Error('Password must be at least 6 characters long');
        
        let finalBranches: string[] = [];
        if (role === 'Admin') {
          finalBranches = BRANCH_LIST;
        } else {
          if (selectedBranches.length === 0) throw new Error('Please select at least one branch');
          finalBranches = selectedBranches;
        }
        
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              role: role,
              branch_ids: finalBranches
            }
          }
        });

        if (error) throw error;
        
        if (data.user) {
          const { error: profileError } = await supabase
            .from('profiles')
            .upsert({
              id: data.user.id,
              email: email.trim().toLowerCase(),
              role: role,
              full_name: fullName,
              branch_ids: finalBranches,
              updated_at: new Date().toISOString()
            });
          
          if (profileError) {
            console.error('Profile creation error:', profileError);
            toast.warning('Account created, but profile setup failed. Please contact support.');
          } else {
            toast.success('Account created successfully! Please sign in.');
          }
          
          setIsSignUp(false);
          setPassword('');
          setFirstName('');
          setSurname('');
          setSelectedBranches([]);
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        if (data.user) {
          const { data: existingProfile } = await supabase
            .from('profiles')
            .select('id')
            .eq('id', data.user.id)
            .maybeSingle();

          if (!existingProfile) {
            await supabase
              .from('profiles')
              .upsert({
                id: data.user.id,
                email: email,
                role: data.user.user_metadata?.role || 'Sales Person',
                full_name: data.user.user_metadata?.full_name || email.split('@')[0],
                branch_ids: data.user.user_metadata?.branch_ids || [],
                updated_at: new Date().toISOString()
              });
          }
        }
        toast.success('Logged in successfully');
      }
    } catch (error: any) {
      console.error('Auth error:', error);
      toast.error(error.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 p-4 md:p-6 font-sans">
      <Card className="w-full max-w-xl shadow-2xl border-none rounded-3xl overflow-hidden bg-white">
        <CardHeader className="space-y-4 text-center bg-zinc-50 pb-6 pt-8 md:pb-8 md:pt-10 border-b border-zinc-100">
          <div className="mx-auto mb-2">
            <img 
              src="https://www.ginzalimited.com/cdn/shop/files/Ginza_logo.png" 
              alt="GINZA Logo" 
              className="h-10 md:h-12 object-contain"
              referrerPolicy="no-referrer"
            />
          </div>
          <CardTitle className="text-xl md:text-2xl font-black tracking-tighter text-zinc-900 flex flex-col items-center gap-1">
            <div className="flex items-center gap-2 text-black italic">
              <BarChart3 className="h-6 w-6" />
              <span>SalesPulse</span>
            </div>
            <span className="text-[10px] md:text-sm font-bold uppercase tracking-[0.2em] text-zinc-400">Professional Portal</span>
          </CardTitle>
          <CardDescription className="text-xs md:text-sm text-zinc-500 font-medium px-4">
            {isSignUp ? 'Create your professional account' : 'Access your SalesPulse dashboard'}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5 md:p-8 space-y-6">
          <form onSubmit={handleAuth} className="space-y-4">
            {isSignUp && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName" className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 ml-1">First Name</Label>
                    <div className="relative">
                      <UserIcon className="absolute left-3.5 top-3.5 h-4 w-4 text-zinc-400" />
                      <Input
                        id="firstName"
                        type="text"
                        placeholder="John"
                        className="pl-11 h-12 bg-zinc-50 border-zinc-200 rounded-xl"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        required={isSignUp}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="surname" className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 ml-1">Surname</Label>
                    <Input
                      id="surname"
                      type="text"
                      placeholder="Doe"
                      className="h-12 bg-zinc-50 border-zinc-200 rounded-xl"
                      value={surname}
                      onChange={(e) => setSurname(e.target.value)}
                      required={isSignUp}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 ml-1">Account Role</Label>
                  <div className="grid grid-cols-3 gap-2 p-1 bg-zinc-50 rounded-xl">
                    {(['Sales Person', 'Branch Head', 'Admin'] as UserRole[]).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => {
                          setRole(r);
                          setSelectedBranches([]);
                        }}
                        className={`py-2 px-1 text-[10px] font-black uppercase tracking-tight rounded-lg transition-all ${
                          role === r ? 'bg-white shadow-sm text-black' : 'text-zinc-400 hover:bg-white/50'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                {role !== 'Admin' && (
                  <div className="space-y-2">
                    <Label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 ml-1">
                      {role === 'Sales Person' ? 'Assigned Branch' : 'Manage Branches'}
                    </Label>
                    <div className="flex flex-wrap gap-2 p-3 bg-zinc-50 rounded-xl max-h-32 overflow-y-auto border border-zinc-100">
                      {BRANCH_LIST.map((branch) => (
                        <button
                          key={branch}
                          type="button"
                          onClick={() => toggleBranch(branch)}
                          className={`px-3 py-1.5 text-[10px] font-bold rounded-full border transition-all ${
                            selectedBranches.includes(branch)
                              ? 'bg-black text-white border-black shadow-sm'
                              : 'bg-white text-zinc-500 border-zinc-200 hover:border-black/50'
                          }`}
                        >
                          {branch}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 ml-1">Email ID</Label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3.5 h-4 w-4 text-zinc-400" />
                <Input
                  id="email"
                  type="email"
                  placeholder="name@ginzalimited.com"
                  className="pl-11 h-12 bg-zinc-50 border-zinc-200 rounded-xl"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 ml-1">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3.5 h-4 w-4 text-zinc-400" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  className="pl-11 h-12 bg-zinc-50 border-zinc-200 rounded-xl"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <Button type="submit" className="w-full h-12 bg-black hover:bg-zinc-800 text-white font-black rounded-xl shadow-lg mt-4 disabled:opacity-50 transition-all active:scale-[0.98]" disabled={loading}>
              {loading ? (isSignUp ? 'Creating Account...' : 'Signing in...') : (isSignUp ? 'Create Account' : 'Sign In')}
            </Button>
          </form>

          <div className="text-center pt-2">
            <button
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-xs font-bold text-black hover:underline underline-offset-4"
              type="button"
            >
              {isSignUp ? 'Already have an account? Sign In' : 'Need an account? Create one'}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
