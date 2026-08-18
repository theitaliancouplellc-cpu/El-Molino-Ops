'use client';

import {ReactNode,useCallback,useEffect,useState} from 'react';
import {KeyRound,Loader2,LogOut,ShieldCheck} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import {useI18n} from '@/lib/i18n';

type GateMode='checking'|'pass'|'enroll'|'challenge'|'error';

type Enrollment={factorId:string;qr:string;secret:string};

export default function MfaGate({children}:{children:ReactNode}){
 const {locale}=useI18n();
 const es=locale==='es';
 const [mode,setMode]=useState<GateMode>('checking');
 const [factorId,setFactorId]=useState('');
 const [enrollment,setEnrollment]=useState<Enrollment|null>(null);
 const [code,setCode]=useState('');
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');

 const evaluate=useCallback(async()=>{
  setMessage('');
  const {data:{session}}=await supabase.auth.getSession();
  if(!session){setMode('pass');setFactorId('');setEnrollment(null);return}
  const aal=await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if(aal.error){setMessage(es?'No se pudo verificar la seguridad de la sesión.':'Could not verify session security.');setMode('error');return}
  if(aal.data.currentLevel==='aal2'){setMode('pass');setFactorId('');setEnrollment(null);setCode('');return}
  const factors=await supabase.auth.mfa.listFactors();
  if(factors.error){setMessage(es?'No se pudieron cargar los factores de seguridad.':'Could not load security factors.');setMode('error');return}
  const verified=factors.data.totp.find(f=>f.status==='verified');
  if(verified){setFactorId(verified.id);setMode('challenge');return}
  setMode('enroll');
 },[es]);

 useEffect(()=>{
  void evaluate();
  const {data}=supabase.auth.onAuthStateChange(()=>{queueMicrotask(()=>void evaluate())});
  return()=>data.subscription.unsubscribe();
 },[evaluate]);

 async function startEnrollment(){
  if(busy)return;setBusy(true);setMessage('');
  try{
   const existing=await supabase.auth.mfa.listFactors();
   if(!existing.error){
    for(const f of existing.data.totp.filter(x=>x.status!=='verified')){
     await supabase.auth.mfa.unenroll({factorId:f.id});
    }
   }
   const enrolled=await supabase.auth.mfa.enroll({factorType:'totp',friendlyName:'El Molino Ops'});
   if(enrolled.error)throw enrolled.error;
   setEnrollment({factorId:enrolled.data.id,qr:enrolled.data.totp.qr_code,secret:enrolled.data.totp.secret});
  }catch(err){setMessage(err instanceof Error?err.message:(es?'No se pudo iniciar la configuración.':'Could not start setup.'))}
  finally{setBusy(false)}
 }

 async function verify(factor:string){
  if(busy||!/^\d{6}$/.test(code.trim())){if(code.trim())setMessage(es?'Ingresa el código de 6 dígitos.':'Enter the 6-digit code.');return}
  setBusy(true);setMessage('');
  try{
   const challenge=await supabase.auth.mfa.challenge({factorId:factor});
   if(challenge.error)throw challenge.error;
   const verified=await supabase.auth.mfa.verify({factorId:factor,challengeId:challenge.data.id,code:code.trim()});
   if(verified.error)throw verified.error;
   await supabase.auth.refreshSession();
   await evaluate();
  }catch(err){setMessage(err instanceof Error?err.message:(es?'No se pudo verificar el código.':'Could not verify the code.'))}
  finally{setBusy(false)}
 }

 async function signOut(){await supabase.auth.signOut();setMode('pass')}

 if(mode==='pass')return <>{children}</>;
 if(mode==='checking')return <div className="full-loader"><Loader2 className="spin"/></div>;

 return <main className="page" style={{maxWidth:560,margin:'0 auto',paddingTop:'8vh'}}>
  <section className="card">
   <div style={{display:'flex',gap:12,alignItems:'center'}}><ShieldCheck/><div><h2 style={{margin:0}}>{es?'Protección de cuenta':'Account protection'}</h2><p className="muted" style={{marginBottom:0}}>{es?'El Molino Ops requiere autenticación de dos pasos para proteger los datos del restaurante.':'El Molino Ops requires two-step authentication to protect restaurant data.'}</p></div></div>
   {message&&<div className="notice" style={{marginTop:14}}>{message}</div>}
   {mode==='enroll'&&<div style={{marginTop:18}}>
    {!enrollment?<><p>{es?'Configura una aplicación de autenticación gratuita (Google Authenticator, Microsoft Authenticator, 1Password u otra compatible con TOTP).':'Set up any free authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, or another TOTP-compatible app).'}</p><button className="btn" disabled={busy} onClick={startEnrollment}><KeyRound/> {es?'Configurar autenticador':'Set up authenticator'}</button></>:<>
     <p>{es?'Escanea este código QR con tu aplicación de autenticación y luego escribe el código de 6 dígitos.':'Scan this QR code with your authenticator app, then enter the 6-digit code.'}</p>
     <img src={enrollment.qr} alt={es?'Código QR de autenticación':'Authenticator QR code'} style={{display:'block',width:220,maxWidth:'100%',background:'#fff',padding:10,borderRadius:12,margin:'16px auto'}}/>
     <details><summary>{es?'No puedo escanear el QR':'I cannot scan the QR'}</summary><p className="muted" style={{wordBreak:'break-all'}}>{enrollment.secret}</p></details>
     <div className="form" style={{marginTop:14}}><input className="input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,6))} aria-label={es?'Código de autenticación':'Authentication code'}/><button className="btn" disabled={busy||code.length!==6} onClick={()=>void verify(enrollment.factorId)}>{busy?<Loader2 className="spin"/>:<ShieldCheck/>} {es?'Activar protección':'Enable protection'}</button></div>
    </>}
   </div>}
   {mode==='challenge'&&<div className="form" style={{marginTop:18}}><p>{es?'Ingresa el código actual de tu aplicación de autenticación.':'Enter the current code from your authenticator app.'}</p><input className="input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,6))} aria-label={es?'Código de autenticación':'Authentication code'}/><button className="btn" disabled={busy||code.length!==6} onClick={()=>void verify(factorId)}>{busy?<Loader2 className="spin"/>:<ShieldCheck/>} {es?'Verificar':'Verify'}</button></div>}
   {mode==='error'&&<button className="btn" style={{marginTop:18}} onClick={()=>void evaluate()}>{es?'Intentar de nuevo':'Try again'}</button>}
   <button className="btn ghost" style={{marginTop:12}} onClick={()=>void signOut()}><LogOut/> {es?'Cerrar sesión':'Sign out'}</button>
  </section>
 </main>;
}
