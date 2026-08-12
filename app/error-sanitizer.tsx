'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';

const RAW_ERROR_PATTERNS=[
  /jwt issued at future/i,/jwt expired/i,/invalid jwt/i,/invalid claim/i,/token.*expired/i,
  /permission denied/i,/row-level security/i,/violates row-level security/i,/postgres/i,/postgrest/i,
  /duplicate key/i,/violates unique constraint/i,/foreign key constraint/i,/invalid input syntax/i,
  /relation .* does not exist/i,/column .* does not exist/i,/schema cache/i,/42501|23505|23503|22p02/i,
  /failed to fetch/i,/networkerror/i,/load failed/i,/fetch failed/i,
];

export function friendlyErrorText(raw:string){
  const s=String(raw||'').trim();
  if(!s)return s;
  if(/jwt issued at future|invalid jwt|jwt expired|token.*expired|invalid claim/i.test(s))return 'Your session is syncing. Please wait a moment and try again.';
  if(/permission denied|row-level security|42501/i.test(s))return 'You do not have permission to do that.';
  if(/duplicate key|unique constraint|23505/i.test(s))return 'That record already exists.';
  if(/foreign key constraint|23503/i.test(s))return 'That item is still connected to other restaurant records.';
  if(/invalid input syntax|22p02/i.test(s))return 'One of the values entered is not valid.';
  if(/relation .* does not exist|column .* does not exist|schema cache|postgres|postgrest/i.test(s))return 'The app could not load that information right now. Please try again.';
  if(/failed to fetch|networkerror|load failed|fetch failed/i.test(s))return 'The connection was interrupted. Please try again.';
  return RAW_ERROR_PATTERNS.some(p=>p.test(s))?'Something went wrong. Please try again.':s;
}

export default function ErrorSanitizer(){
  useEffect(()=>{
    let refreshing=false;
    const sanitize=()=>{
      const nodes=document.querySelectorAll<HTMLElement>('.toast-message,[role="alert"],.error-message,.status.error,.auth-error');
      nodes.forEach(node=>{
        const raw=node.textContent||'';const safe=friendlyErrorText(raw);
        if(safe!==raw)node.textContent=safe;
        if(!refreshing&&/jwt issued at future|invalid jwt|jwt expired|token.*expired/i.test(raw)){
          const last=Number(sessionStorage.getItem('elmolino_session_recovery_at')||0);
          if(Date.now()-last>60_000){
            refreshing=true;sessionStorage.setItem('elmolino_session_recovery_at',String(Date.now()));
            void supabase.auth.refreshSession().finally(()=>{refreshing=false;});
          }
        }
      });
    };
    sanitize();
    const observer=new MutationObserver(sanitize);observer.observe(document.body,{subtree:true,childList:true,characterData:true});
    return()=>observer.disconnect();
  },[]);
  return null;
}
