'use client';

import {ReactNode,useCallback,useEffect,useState} from 'react';
import {usePathname} from 'next/navigation';
import {supabase} from '@/lib/supabase';
import {isStaffProductPathAllowed} from '@/lib/staff-features';
import {useI18n} from '@/lib/i18n';

const PUBLIC_INFORMATION_PATHS=['/privacy','/support','/delete-account'] as const;
const publicInformationPath=(pathname:string)=>PUBLIC_INFORMATION_PATHS.some(prefix=>pathname===prefix||pathname.startsWith(`${prefix}/`));
const setupException=(pathname:string)=>pathname==='/account'||pathname.startsWith('/delete-account');
const lifecycleException=(pathname:string)=>pathname==='/employee/access'||setupException(pathname);

type SetupState={status:string;employment_status?:'active'|'suspended'|'inactive'|null;access_allowed?:boolean};
type GateMode='checking'|'pass'|'redirecting'|'error';

export default function EmployeeRootRedirect({children}:{children:ReactNode}){
 const pathname=usePathname();
 const {locale}=useI18n();
 const [mode,setMode]=useState<GateMode>(publicInformationPath(pathname)?'pass':'checking');
 const [retryKey,setRetryKey]=useState(0);
 const evaluate=useCallback(async()=>{
  if(publicInformationPath(pathname)){setMode('pass');return}
  setMode('checking');
  const sessionResult=await supabase.auth.getSession();
  if(sessionResult.error){setMode('error');return}
  if(!sessionResult.data.session){setMode('pass');return}
  const userResult=await supabase.auth.getUser();
  if(userResult.error||!userResult.data.user){setMode('error');return}
  const profileResult=await supabase.from('profiles').select('app_role').eq('id',userResult.data.user.id).maybeSingle();
  if(profileResult.error||!profileResult.data){setMode('error');return}
  if(profileResult.data.app_role!=='employee'){setMode('pass');return}
  const setupResult=await supabase.rpc('employee_self_setup_status',{});
  if(setupResult.error){setMode('error');return}
  const setup=(setupResult.data||{status:'not_started',access_allowed:false}) as SetupState;
  let target:string|null=null;
  if(setup.status!=='approved'){
   if(pathname!=='/employee/setup'&&!setupException(pathname))target='/employee/setup';
  }else if(setup.employment_status!=='active'||setup.access_allowed===false){
   if(!lifecycleException(pathname))target='/employee/access';
  }else if(pathname==='/employee/access'||pathname==='/employee/setup'||pathname==='/'||!isStaffProductPathAllowed(pathname)){
   target='/employee';
  }
  if(target&&target!==pathname){setMode('redirecting');window.location.replace(target);return}
  setMode('pass');
 },[pathname,retryKey]);
 useEffect(()=>{void evaluate()},[evaluate]);
 if(mode==='pass')return <>{children}</>;
 if(mode==='error')return <main className="page" style={{maxWidth:560,margin:'0 auto',paddingTop:'8vh'}}><section className="card"><h2>{locale==='es'?'No pudimos verificar tu acceso':'We could not verify your access'}</h2><p className="muted">{locale==='es'?'No se abrió ninguna pantalla restringida. Revisa tu conexión e inténtalo de nuevo.':'No restricted screen was opened. Check your connection and try again.'}</p><button className="btn" onClick={()=>setRetryKey(v=>v+1)}>{locale==='es'?'Intentar de nuevo':'Try again'}</button></section></main>;
 return <div className="full-loader" aria-live="polite">{locale==='es'?'Verificando acceso…':'Checking access…'}</div>;
}
