import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder';

if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
    console.warn('⚠️ Credenziali Supabase mancanti! Assicurati di aver impostato VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY su Vercel.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
