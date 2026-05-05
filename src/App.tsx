/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { supabase } from '@/src/lib/supabase';
import { Profile } from '@/src/types';
import Login from '@/src/components/Login';
import Sidebar from '@/src/components/Sidebar';
import Dashboard from '@/src/components/Dashboard';
import TargetPlanning from '@/src/components/TargetPlanning';
import ActualEntry from '@/src/components/ActualEntry';

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // Persistent States for Tabs
  const [targetRows, setTargetRows] = useState<any[]>([]);
  const [targetFilters, setTargetFilters] = useState<any>(null);
  const [actualEntries, setActualEntries] = useState<any[]>([]);
  const [actualFilters, setActualFilters] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (error) throw error;
      setProfile(data);
    } catch (err) {
      console.error('Error fetching profile:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 border-4 border-black border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs font-black uppercase tracking-widest text-zinc-400">Loading SalesPulse...</p>
        </div>
      </div>
    );
  }

  if (!session || !profile) {
    return (
      <>
        <Login />
        <Toaster position="top-center" richColors />
      </>
    );
  }

  return (
    <BrowserRouter>
      <div className="flex min-h-screen bg-zinc-50 font-sans text-zinc-900">
        <Sidebar user={profile} />
        <main className="flex-1 p-8 max-w-7xl mx-auto w-full">
          <Routes>
            <Route path="/" element={<Dashboard user={profile} />} />
            <Route 
              path="/targets" 
              element={
                <TargetPlanning 
                  user={profile} 
                  rows={targetRows} 
                  setRows={setTargetRows} 
                  filters={targetFilters}
                  setFilters={setTargetFilters}
                />
              } 
            />
            <Route 
              path="/actuals" 
              element={
                <ActualEntry 
                  user={profile} 
                  entries={actualEntries} 
                  setEntries={setActualEntries} 
                  filters={actualFilters}
                  setFilters={setActualFilters}
                />
              } 
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
      <Toaster position="top-right" richColors />
    </BrowserRouter>
  );
}
