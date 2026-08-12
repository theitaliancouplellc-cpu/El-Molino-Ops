import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://asuvgjxdmxizbnjrccsz.supabase.co';
const supabasePublishableKey = 'sb_publishable_gtR8VfsQ5n-FPPbypnYKTw_f2k3Xyrk';

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
