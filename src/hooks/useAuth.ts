import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Session } from '@supabase/supabase-js';
import type { Database } from '../types/database';

type UserRow = Database['public']['Tables']['users']['Row'];

interface AuthState {
  session: Session | null;
  user: UserRow | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

export function useAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<UserRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    console.log('[useAuth] Initializing…');
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      console.log('[useAuth] getSession result:', !!s);
      setSession(s);
      if (s) {
        fetchOrCreateProfile(s);
      } else {
        setIsLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, s) => {
        console.log('[useAuth] onAuthStateChange:', event, 'session:', !!s);
        setSession(s);
        if (s) {
          fetchOrCreateProfile(s);
        } else {
          setUser(null);
          setIsLoading(false);
        }
      },
    );

    return () => subscription.unsubscribe();
  }, []);

  /**
   * Fetch the user profile from public.users.
   * If the auth trigger (03_auth_trigger.sql) wasn't applied, the profile
   * won't exist — in that case, create one on-the-fly so the app still works.
   */
  async function fetchOrCreateProfile(s: Session) {
    const userId = s.user.id;
    console.log('[useAuth] fetchOrCreateProfile for', userId);

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (data) {
      console.log(
        '[useAuth] profile loaded:',
        data.display_name,
        'household_id:',
        data.household_id,
      );
      setUser(data);
      setIsLoading(false);
      return;
    }

    // Profile doesn't exist → create household + profile as fallback
    console.warn(
      '[useAuth] No profile found — creating household + profile as fallback.',
      'Run 03_auth_trigger.sql in Supabase to avoid this.',
    );

    try {
      // 1. Create a household
      const { data: household, error: hhErr } = await supabase
        .from('households')
        .insert({ created_at: new Date().toISOString() })
        .select('id')
        .single();

      if (hhErr || !household) {
        console.error('[useAuth] Failed to create household:', hhErr?.message);
        setIsLoading(false);
        return;
      }

      // 2. Create the user profile
      const displayName =
        s.user.user_metadata?.display_name ??
        s.user.email?.split('@')[0] ??
        '';

      const { data: newUser, error: userErr } = await supabase
        .from('users')
        .insert({
          id: userId,
          household_id: household.id,
          email: s.user.email ?? '',
          display_name: displayName,
          created_at: new Date().toISOString(),
        })
        .select('*')
        .single();

      if (userErr) {
        console.error('[useAuth] Failed to create user profile:', userErr.message);
      } else {
        console.log('[useAuth] Fallback profile created:', newUser?.display_name);
        setUser(newUser);
      }
    } catch (e) {
      console.error('[useAuth] Fallback profile creation error:', e);
    }

    setIsLoading(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
  }

  async function refreshProfile() {
    if (session) {
      await fetchOrCreateProfile(session);
    }
  }

  return { session, user, isLoading, signOut, refreshProfile };
}
