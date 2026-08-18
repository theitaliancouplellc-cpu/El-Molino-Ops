'use client';

import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Keyboard } from '@capacitor/keyboard';
import { Network } from '@capacitor/network';
import { StatusBar, Style } from '@capacitor/status-bar';
import { PushNotifications } from '@capacitor/push-notifications';
import { nativeRouteFromUrl } from '@/lib/native-navigation';
import { employeeNotificationHref } from '@/lib/employee-notifications';
import { SESSION_REFRESH_REQUEST_EVENT } from '@/lib/session-resilience';

export default function NativeRuntime() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    document.documentElement.dataset.platform = Capacitor.getPlatform();
    const removers: Array<() => Promise<void>> = [];
    const route = (url: string) => {
      const target = nativeRouteFromUrl(url);
      if (target && target !== `${location.pathname}${location.search}${location.hash}`) location.assign(target);
    };
    const setNetwork = (connected: boolean) => {
      document.documentElement.dataset.network = connected ? 'online' : 'offline';
      dispatchEvent(new Event(connected ? 'online' : 'offline'));
    };

    void StatusBar.setOverlaysWebView({ overlay: false });
    void StatusBar.setStyle({ style: Style.Light });
    void Network.getStatus().then((status) => setNetwork(status.connected));
    void App.getLaunchUrl().then((launch) => { if (launch?.url) route(launch.url); });
    void App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) dispatchEvent(new Event(SESSION_REFRESH_REQUEST_EVENT));
    }).then((handle) => removers.push(() => handle.remove()));
    void App.addListener('appUrlOpen', ({ url }) => route(url)).then((handle) => removers.push(() => handle.remove()));
    void App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) history.back();
      else if (location.pathname !== '/') location.assign('/');
    }).then((handle) => removers.push(() => handle.remove()));
    void Network.addListener('networkStatusChange', (status) => setNetwork(status.connected)).then((handle) => removers.push(() => handle.remove()));
    void PushNotifications.addListener('pushNotificationActionPerformed',({notification})=>{
      const data=notification.data||{};route(employeeNotificationHref(typeof data.href==='string'?data.href:null,typeof data.notification_id==='string'?data.notification_id:null));
    }).then((handle)=>removers.push(()=>handle.remove()));
    void Keyboard.addListener('keyboardWillShow', () => { document.documentElement.dataset.keyboard = 'open'; }).then((handle) => removers.push(() => handle.remove()));
    void Keyboard.addListener('keyboardWillHide', () => { delete document.documentElement.dataset.keyboard; }).then((handle) => removers.push(() => handle.remove()));
    return () => { for (const remove of removers) void remove(); };
  }, []);
  return null;
}
