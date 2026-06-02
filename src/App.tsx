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
import ResetPassword from '@/src/components/ResetPassword';

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Initialize recovery mode synchronously to capture URL hash/query before Supabase client can clear it
  const [isRecoveryMode, setIsRecoveryMode] = useState<boolean>(() => {
    const hash = typeof window !== 'undefined' ? window.location.hash || '' : '';
    const search = typeof window !== 'undefined' ? window.location.search || '' : '';
    return hash.includes('type=recovery') || 
           search.includes('type=recovery') || 
           hash.includes('recovery_token=') ||
           search.includes('recovery_token=') || 
           search.includes('code='); // Safe fallback check for Supabase PKCE recovery code
  });

  // Persistent States for Tabs
  const [targetRows, setTargetRows] = useState<any[]>([]);
  const [actualEntries, setActualEntries] = useState<any[]>([]);
  
  // Shared Filter State - Interconnected across all tabs as requested
  const [globalFilters, setGlobalFilters] = useState<any>({
    branch: 'All', // Will be refined by profile fetch
    unit: 'All',
    year: '2026-2027',
    employee: 'All',
    month: 'All',
    customer: ''
  });

  useEffect(() => {
    // Check if the URL hash contains password recovery tokens
    const hash = window.location.hash || '';
    if (hash.includes('type=recovery') || window.location.search.includes('type=recovery')) {
      setIsRecoveryMode(true);
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecoveryMode(true);
      }
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
      const { data: profileData, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (error) throw error;
      
      // Normalize 'Banglore' to 'Bangalore' if it exists in branch_ids
      const normalizedProfile = {
        ...profileData,
        branch_ids: profileData.branch_ids?.map((b: string) => b === 'Banglore' ? 'Bangalore' : b)
      };
      
      setProfile(normalizedProfile);

      // Initialize global filters based on user role once profile is available
      setGlobalFilters((prev: any) => ({
        ...prev,
        branch: normalizedProfile.role === 'Admin' ? 'All' : (normalizedProfile.branch_ids?.[0] || 'Mumbai'),
        employee: normalizedProfile.role === 'Sales Person' ? normalizedProfile.id : 'All'
      }));
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

  if (isRecoveryMode) {
    return (
      <>
        <ResetPassword 
          onComplete={async () => {
            setIsRecoveryMode(false);
            const { data: { session } } = await supabase.auth.getSession();
            setSession(session);
            if (session?.user) {
              await fetchProfile(session.user.id);
            }
          }} 
        />
        <Toaster position="top-center" richColors />
      </>
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
            <Route 
              path="/" 
              element={
                <Dashboard 
                  user={profile} 
                  filters={globalFilters}
                  setFilters={setGlobalFilters}
                />
              } 
            />
            <Route 
              path="/targets" 
              element={
                <TargetPlanning 
                  user={profile} 
                  rows={targetRows} 
                  setRows={setTargetRows} 
                  filters={globalFilters}
                  setFilters={setGlobalFilters}
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
                  filters={globalFilters}
                  setFilters={setGlobalFilters}
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
