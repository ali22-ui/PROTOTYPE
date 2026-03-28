/**
 * Supabase client configuration.
 * Provides client instance for database operations and real-time subscriptions.
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

/**
 * Check if Supabase is configured.
 */
export const isSupabaseConfigured = () => {
  return Boolean(supabaseUrl && supabaseAnonKey);
};

/**
 * Supabase client instance.
 * Returns null if not configured.
 */
export const supabase = isSupabaseConfigured()
  ? createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  })
  : null;

/**
 * Subscribe to real-time changes on a table.
 * @param {string} table - Table name to subscribe to
 * @param {function} callback - Callback function for changes
 * @param {object} filter - Optional filter for subscription
 * @returns {function} Unsubscribe function
 */
export const subscribeToTable = (table, callback, filter = {}) => {
  if (!supabase) {
    console.warn('Supabase not configured, skipping subscription');
    return () => { };
  }

  const channel = supabase
    .channel(`${table}-changes`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table,
        ...filter,
      },
      callback
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};

export default supabase;
