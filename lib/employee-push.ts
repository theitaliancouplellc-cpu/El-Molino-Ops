'use client';

import { supabase } from '@/lib/supabase';
import {disableNativePush,enableNativePush,getNativePushState,nativePushSupported} from '@/lib/native-push';

export type PushDeviceState = 'unsupported' | 'default' | 'denied' | 'enabled' | 'disabled';

type PushPublicConfig = { public_key?: string; subject?: string };

function applicationServerKey(base64Url: string) {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export function webPushSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function isIosLike() {
  if(nativePushSupported()) return false;
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isStandaloneApp() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

async function registration() {
  if (!webPushSupported()) throw new Error('push_unsupported');
  const existing = await navigator.serviceWorker.getRegistration('/');
  return existing || navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
}

async function publicConfig() {
  const result = await supabase.rpc('get_web_push_public_config', {});
  if (result.error) throw new Error('push_config_unavailable');
  const config = (result.data || {}) as PushPublicConfig;
  if (!config.public_key) throw new Error('push_config_unavailable');
  return config;
}

async function persistSubscription(subscription: PushSubscription) {
  const result = await supabase.rpc('register_my_push_subscription', {
    p_subscription: subscription.toJSON(),
    p_user_agent: navigator.userAgent.slice(0, 500),
  });
  if (result.error) throw new Error('push_registration_failed');
}

export async function getPushDeviceState(): Promise<PushDeviceState> {
  if(nativePushSupported()) return getNativePushState();
  if (!webPushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await registration();
  const subscription = await reg.pushManager.getSubscription();
  if (subscription) return 'enabled';
  return Notification.permission === 'granted' ? 'disabled' : 'default';
}

export async function enablePushOnThisDevice(): Promise<PushDeviceState> {
  if(nativePushSupported()) return enableNativePush();
  if (!webPushSupported()) return 'unsupported';
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission === 'denied') return 'denied';
  if (permission !== 'granted') return 'default';

  const reg = await registration();
  let subscription = await reg.pushManager.getSubscription();
  let created = false;
  if (!subscription) {
    const config = await publicConfig();
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey(config.public_key!),
    });
    created = true;
  }
  try {
    await persistSubscription(subscription);
  } catch (error) {
    if (created) await subscription.unsubscribe().catch(() => false);
    throw error;
  }
  return 'enabled';
}

export async function disablePushOnThisDevice(): Promise<PushDeviceState> {
  if(nativePushSupported()) return disableNativePush();
  if (!webPushSupported()) return 'unsupported';
  const reg = await registration();
  const subscription = await reg.pushManager.getSubscription();
  if (!subscription) return Notification.permission === 'denied' ? 'denied' : 'disabled';

  const endpoint = subscription.endpoint;
  const removed = await supabase.rpc('remove_my_push_subscription', { p_endpoint: endpoint });
  const unsubscribed = await subscription.unsubscribe().catch(() => false);
  if (removed.error && !unsubscribed) throw new Error('push_disable_failed');
  return 'disabled';
}
