import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

const isPlaceholder = (value: string): boolean => {
  if (!value) {
    return true;
  }

  const normalized = value.toLowerCase();
  return (
    normalized.includes('your-project.supabase.co')
    || normalized.startsWith('your_')
    || normalized.includes('supabase_anon_key_here')
  );
};

export const isSupabaseBrowserConfigured =
  !isPlaceholder(supabaseUrl) && !isPlaceholder(supabaseAnonKey);

export const supabase: SupabaseClient | null = isSupabaseBrowserConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
  : null;
