'use client';

import {ReactNode,useEffect,useState} from 'react';
import {usePathname} from 'next/navigation';
import {supabase} from '@/lib/supabase';
import {isStaffProductPathAllowed} from '@/lib/staff-features';
import {isManagerWorkspacePathAllowed,MANAGER_WORKSPACE_HOME} from '@/lib/manager-workspace';
import {useI18n} from '@/lib/i18n';

const PUBLIC_INFORMATION_PATHS=new Set<string>(['/privacy','/support','/delete-account']);
const publicInformationPath=(pathname:string)=>PUBLIC_INFORMATION_PATHS.has(pathname);
const setupException=(pathname:string)=>pathname==='/account'||pathname==='/delete-account';
const lifecycleException=(pathname:string)=>pathname==='/employee/access'||setupException(pathname);

type SetupState={status:string;employment_status?:'active'|'suspended'|'inactive'|null;access_allowed?:boolean};
type GateMode='checking'|'pass'|'redirecting'|'error';
type GateDecision={path:string;mode:GateMode};

export default function EmployeeRootRedirect({children}:{children:ReactNode}){
 const pathname=usePathname();
 const {locale}=useI18n();
 const [decision,setDecision]=useState<GateDecision>(()=>({path:pathname,mode:publicInformationPath(pathname)?'pass':'checking'}));
 const [retryKey,setRetryKey]=useState(0);
 useEffect(()=>{
  let cancelled=false;
  const decide=(mode:GateMode)=>{if(!cancelled)setDecision({path:pathname,mode})};
  const redirect=(target:string)=>{decide('redirecting');window.location.replace(target)};
  const evaluate=async()=>{
   if(publicInformationPath(pathname)){decide('pass');return}
   decide('checking');
   const sessionResult=await supabase.auth.getSession();
   if(sessionResult.error){decide('error');return}
   if(!sessionResult.data.session){decide('pass');return}
   const userResult=await supabase.auth.getUser();
   if(userResult.error||!userResult.data.user){decide('error');return}
   const profileResult=await supabase.from('profiles').select('app_role').eq('id',userResult.data.user.id).maybeSingle();
   if(profileResult.error||!profileResult.data){decide('error');return}
   const role=profileResult.data.app_role as 'admin'|'manager'|'employee';
   if(role==='admin'){decide('pass');return}
   if(role==='manager'){
    if(pathname==='/'||pathname==='/manager'||!isManagerWorkspacePathAllowed(pathname)){redirect(MANAGER_WORKSPACE_HOME);return}
    decide('pass');return;
   }
   const setupResult=await supabase.rpc('employee_self_setup_status',{});
   if(setupResult.error){decide('error');return}
   const setup=(setupResult.data||{status:'not_started',access_allowed:false}) as SetupState;
   let target:string|null=null;
   if(setup.status!=='approved'){
    if(pathname!=='/employee/setup'&&!setupException(pathname))target='/employee/setup';
   }else if(setup.employment_status!=='active'||setup.access_allowed===false){
    if(!lifecycleException(pathname))target='/employee/access';
   }else if(pathname==='/employee/access'||pathname==='/employee/setup'||pathname==='/'||!isStaffProductPathAllowed(pathname)){
    target='/employee';
   }
   if(cancelled)return;
   if(target&&target!==pathname){redirect(target);return}
   decide('pass');
  };
  void evaluate();
  return()=>{cancelled=true};
 },[pathname,retryKey]);
 const currentMode=decision.path===pathname?decision.mode:'checking';
 if(currentMode==='pass')return <>{children}</>;
 if(currentMode==='error')return <main className="page" style={{maxWidth:560,margin:'0 auto',paddingTop:'8vh'}}><section className="card"><h2>{locale==='es'?'No pudimos verificar tu acceso':'We could not verify your access'}</h2><p className="muted">{locale==='es'?'No se abrió ninguna pantalla restringida. Revisa tu conexión e inténtalo de nuevo.':'No restricted screen was opened. Check your connection and try again.'}</p><button className="btn" onClick={()=>setRetryKey(v=>v+1)}>{locale==='es'?'Intentar de nuevo':'Try again'}</button></section></main>;
 return <div className="full-loader" aria-live="polite">{locale==='es'?'Verificando acceso…':'Checking access…'}</div>;
}
