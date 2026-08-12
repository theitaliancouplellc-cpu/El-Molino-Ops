'use client';

import { useEffect } from 'react';
import { safeFetchWithRetry } from '@/lib/retry';

export default function NetworkResilience(){
  useEffect(()=>{
    const underlying=window.fetch.bind(window);
    const wrapped=async(input:RequestInfo|URL,init?:RequestInit)=>safeFetchWithRetry(input,init||{},underlying as typeof fetch);
    window.fetch=wrapped;
    return()=>{if(window.fetch===wrapped)window.fetch=underlying};
  },[]);
  return null;
}
