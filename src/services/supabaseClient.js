import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Fail-safe initialization in case credentials are not yet updated by the user
export const supabase = createClient(
  supabaseUrl || 'https://qokkvtamjwqbwmstvfrh.supabase.co',
  supabaseAnonKey && supabaseAnonKey !== 'YOUR_SUPABASE_ANON_KEY_HERE' ? supabaseAnonKey : 'placeholder-key'
);
