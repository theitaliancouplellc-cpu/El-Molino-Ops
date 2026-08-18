'use client';

import {useEffect,useRef} from 'react';
import {usePathname} from 'next/navigation';
import {supabase} from '@/lib/supabase';
import {useI18n} from '@/lib/i18n';
import {capturePosthogProductEvent, type ProductTelemetryProperties} from '@/lib/posthog-public';
import {sanitizeTelemetryRoute} from '@/lib/client-telemetry';

declare global {
  interface Window {
    Capacitor?: {getPlatform?:()=>string;isNativePlatform?:()=>boolean};
  }
}

function runtime():Pick<ProductTelemetryProperties,'platform'|'install_mode'> {
  const native=window.Capacitor?.isNativePlatform?.()===true;
  const value=window.Capacitor?.getPlatform?.();
  const platform=value==='ios'||value==='android'?value:'web';
  const standalone=matchMedia('(display-mode: standalone)').matches;
  return {platform,install_mode:native?'native':standalone?'standalone':'browser'};
}

export default function ProductionTelemetry(){
  const pathname=usePathname();
  const {locale}=useI18n();
  const userId=useRef<string|null>(null);
  const opened=useRef(false);
  const lastRoute=useRef('');
  const pathRef=useRef(pathname);pathRef.current=pathname;
  const localeRef=useRef(locale);localeRef.current=locale;

  useEffect(()=>{
    let active=true;
    void supabase.auth.getUser().then(({data})=>{if(active)userId.current=data.user?.id??null});
    const {data}=supabase.auth.onAuthStateChange((event,session)=>{
      const previous=userId.current;
      userId.current=session?.user.id??null;
      const auth_state=event==='SIGNED_IN'?'signed_in':event==='SIGNED_OUT'?'signed_out':event==='TOKEN_REFRESHED'?'token_refreshed':null;
      const id=session?.user.id??previous;
      if(id&&auth_state)void send(id,'auth_state',{auth_state});
    });
    const network=()=>{const id=userId.current;if(id)void send(id,'network_state')};
    addEventListener('online',network);addEventListener('offline',network);
    return()=>{active=false;data.subscription.unsubscribe();removeEventListener('online',network);removeEventListener('offline',network)};
  },[]);

  useEffect(()=>{
    let active=true;
    void (async()=>{
      if(navigator.doNotTrack==='1')return;
      const existing=userId.current;
      const id=existing??(await supabase.auth.getUser()).data.user?.id??null;
      if(!active||!id)return;
      userId.current=id;
      if(!opened.current){opened.current=true;void send(id,'app_open')}
      if(lastRoute.current!==pathname){lastRoute.current=pathname;void send(id,'route_view')}
    })();
    return()=>{active=false};
  },[pathname,locale]);

  function send(id:string,event:'app_open'|'route_view'|'auth_state'|'network_state',extra:Partial<ProductTelemetryProperties>={}){
    if(navigator.doNotTrack==='1')return Promise.resolve(false);
    return capturePosthogProductEvent(id,event,{
      route:sanitizeTelemetryRoute(pathRef.current||'/'),
      release:process.env.EL_MOLINO_RELEASE_SHA||'unknown',
      ...runtime(),
      locale:localeRef.current,
      network:navigator.onLine?'online':'offline',
      ...extra,
    });
  }

  return null;
}
