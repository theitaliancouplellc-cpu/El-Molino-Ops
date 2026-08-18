import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabasePublishableKey) throw new Error('Supabase public configuration is missing.');

const rawSupabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

const PILOT_MUTATION_RPCS = new Set([
  'clock_in','clock_out','start_time_clock_break','end_time_clock_break','employee_attest_time_clock_punch',
  'manager_approve_time_clock_punch','manager_approve_all_time_clock_punches','manager_upsert_time_clock_punch',
  'close_time_clock_pay_period','reopen_time_clock_pay_period','set_my_weekly_availability','submit_availability_request',
  'submit_my_time_off_request','cancel_my_time_off_request','cancel_my_availability_request','submit_my_shift_change_request',
  'respond_to_my_shift_trade','cancel_my_shift_change_request','claim_open_shift','cancel_shift_claim','review_time_off_request',
  'review_availability_request','review_shift_change_request','review_shift_claim','publish_schedule_period_with_notifications',
  'publish_schedule_department','ensure_tip_pool_run','generate_tip_distributions','finalize_tip_pool_run'
]);

function gatewayError(body: any, fallback: string) {
  return {
    name: 'PostgrestError',
    message: String(body?.error?.message || fallback),
    details: '',
    hint: '',
    code: String(body?.error?.code || 'PILOT_GATEWAY_ERROR'),
  };
}

async function passwordSafetyError(password: unknown) {
  if (typeof password !== 'string' || password.length < 1 || password.length > 256) return new Error('Password is invalid.');
  const { data, error } = await rawSupabase.functions.invoke('password-risk-check', { body: { password } });
  if (error || !data?.ok) return new Error('Password safety check is temporarily unavailable. Try again before using a password.');
  if (data.compromised) return new Error('This password appears in known breach data and cannot be used. Choose a unique password or reset it.');
  return null;
}

const secureAuth = new Proxy(rawSupabase.auth as any, {
  get(target, prop) {
    if (prop === 'signInWithPassword') {
      return async (credentials: any) => {
        const safetyError = await passwordSafetyError(credentials?.password);
        if (safetyError) return { data: { user: null, session: null }, error: safetyError };
        return target.signInWithPassword(credentials);
      };
    }
    if (prop === 'signUp') {
      return async (credentials: any) => {
        const safetyError = await passwordSafetyError(credentials?.password);
        if (safetyError) return { data: { user: null, session: null }, error: safetyError };
        return target.signUp(credentials);
      };
    }
    if (prop === 'updateUser') {
      return async (attributes: any, options?: any) => {
        if (typeof attributes?.password === 'string') {
          const safetyError = await passwordSafetyError(attributes.password);
          if (safetyError) return { data: { user: null }, error: safetyError };
        }
        return target.updateUser(attributes, options);
      };
    }
    const value = Reflect.get(target, prop, target);
    return typeof value === 'function' ? value.bind(target) : value;
  },
}) as typeof rawSupabase.auth;

export const supabase = new Proxy(rawSupabase, {
  get(target, prop) {
    if (prop === 'auth') return secureAuth;
    if (prop === 'rpc') {
      return async (fn: string, args: Record<string, unknown> = {}, options?: Record<string, unknown>) => {
        if (!PILOT_MUTATION_RPCS.has(fn)) return target.rpc(fn as never, args as never, options as never);
        const { data: envelope, error: invokeError } = await target.functions.invoke('pilot-mutation-gateway', { body: { operation: fn, args } });
        if (invokeError) return { data: null, error: gatewayError(null, invokeError.message || 'Operation gateway could not be reached.'), count: null, status: 503, statusText: 'Service Unavailable' };
        if (!envelope?.ok) return { data: null, error: gatewayError(envelope, 'Operation could not be completed.'), count: null, status: 400, statusText: 'Bad Request' };
        return { data: envelope.data ?? null, error: null, count: null, status: 200, statusText: 'OK' };
      };
    }
    const value = Reflect.get(target, prop, target);
    return typeof value === 'function' ? value.bind(target) : value;
  },
}) as typeof rawSupabase;
