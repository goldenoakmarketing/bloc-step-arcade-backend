import { createClient, SupabaseClient as SupabaseClientType } from '@supabase/supabase-js';
import { config } from './index.js';

// Using untyped client - generate types with `supabase gen types typescript` after DB setup
export const supabase = createClient(
  config.supabase.url,
  config.supabase.serviceKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

export type SupabaseClient = SupabaseClientType;
