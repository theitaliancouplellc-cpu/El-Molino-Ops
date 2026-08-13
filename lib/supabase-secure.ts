import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) throw new Error('Supabase public configuration is missing.');

const client = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

async function compromisedPassword(password: string): Promise<boolean> {
  const bytes = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest('SHA-1', bytes);
  const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);
  const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, { cache: 'no-store' });
  if (!response.ok) throw new Error('Password security check unavailable.');
  const body = await response.text();
  return body.split(/\r?\n/).some(line => line.startsWith(`${suffix}:`));
}

async function validateChosenPassword(password: unknown) {
  if (typeof password !== 'string') return;
  if (password.length < 10 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new Error('Use at least 10 characters with letters and a number.');
  }
  if (await compromisedPassword(password)) {
    throw new Error('That password has appeared in a known data breach. Choose a different password.');
  }
}

const auth = client.auth as any;
const originalSignUp = auth.signUp.bind(auth);
const originalUpdateUser = auth.updateUser.bind(auth);

auth.signUp = async (credentials: any) => {
  try {
    await validateChosenPassword(credentials?.password);
    return await originalSignUp(credentials);
  } catch (error) {
    return { data: { user: null, session: null }, error };
  }
};

auth.updateUser = async (attributes: any, options?: any) => {
  try {
    await validateChosenPassword(attributes?.password);
    return await originalUpdateUser(attributes, options);
  } catch (error) {
    return { data: { user: null }, error };
  }
};

export const supabase = client;
