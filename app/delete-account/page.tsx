'use client';

import {FormEvent,useState} from 'react';
import {supabase} from '@/lib/supabase';
import styles from '../public-info.module.css';

export default function DeleteAccountPage(){
 const [email,setEmail]=useState('');
 const [note,setNote]=useState('');
 const [companyWebsite,setCompanyWebsite]=useState('');
 const [busy,setBusy]=useState(false);
 const [status,setStatus]=useState<'idle'|'success'|'error'>('idle');

 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();
  if(busy)return;
  setBusy(true);setStatus('idle');
  const {error}=await supabase.rpc('request_account_deletion_external',{
   p_email:email.trim().toLowerCase(),
   p_note:note.trim()||null,
   p_company_website:companyWebsite||null,
  });
  setBusy(false);
  if(error){setStatus('error');return}
  setEmail('');setNote('');setCompanyWebsite('');setStatus('success');
 }

 return <main className={styles.shell}><div className={styles.wrap}>
  <section className={styles.hero}>
   <p className={styles.eyebrow}>El Molino Ops · Account control</p>
   <h1 className={styles.title}>Delete account<br/><span lang="es-MX">Eliminar cuenta</span></h1>
   <p className={styles.lead}>Submit a deletion request even if you no longer have the app installed. <span lang="es-MX">Envía una solicitud aunque ya no tengas instalada la aplicación.</span></p>
  </section>
  <nav className={styles.nav} aria-label="Public information"><a href="/privacy">Privacy / Privacidad</a><a href="/support">Support / Soporte</a><a href="/">Open app / Abrir app</a></nav>

  <section className={styles.card}>
   <h2>Request account deletion / Solicitar eliminación de cuenta</h2>
   <p>Enter the email used for your El Molino Ops account. For privacy, this page always gives the same confirmation and does not reveal whether an email is registered.</p>
   <p lang="es-MX">Ingresa el correo que usas en tu cuenta de El Molino Ops. Para proteger tu privacidad, esta página siempre muestra la misma confirmación y no revela si un correo está registrado.</p>
   <form className={styles.form} onSubmit={submit}>
    <label className={styles.label}>Account email / Correo de la cuenta
     <input className={styles.input} type="email" autoComplete="email" maxLength={320} required value={email} onChange={e=>setEmail(e.target.value)}/>
    </label>
    <label className={styles.label}>Optional note / Nota opcional
     <textarea className={styles.textarea} maxLength={2000} value={note} onChange={e=>setNote(e.target.value)} placeholder="Anything support should know / Información que deba conocer soporte"/>
    </label>
    <label className={styles.trap} aria-hidden="true">Company website<input tabIndex={-1} autoComplete="off" value={companyWebsite} onChange={e=>setCompanyWebsite(e.target.value)}/></label>
    <button className={`${styles.button} ${styles.primary}`} type="submit" disabled={busy}>{busy?'Submitting / Enviando…':'Request deletion / Solicitar eliminación'}</button>
   </form>
   {status==='success'&&<p className={styles.status} role="status">Your request has been received if the account exists. / <span lang="es-MX">Tu solicitud fue recibida si la cuenta existe.</span></p>}
   {status==='error'&&<p className={`${styles.status} ${styles.error}`} role="alert">The request could not be submitted right now. Try again later or contact support. / <span lang="es-MX">No se pudo enviar la solicitud en este momento. Inténtalo más tarde o comunícate con soporte.</span></p>}
  </section>

  <section className={styles.card}>
   <h2>What happens next / Qué sucede después</h2>
   <p>The request is placed in a restricted server-side queue for review and identity-safe processing. Account and associated personal data are deleted as applicable, while records that must legitimately be retained for security, payroll, employment, tax, legal, or regulatory obligations may be retained or de-identified as described in the <a href="/privacy">privacy policy</a>.</p>
   <p lang="es-MX">La solicitud se coloca en una cola restringida del servidor para revisión y procesamiento seguro de identidad. La cuenta y los datos personales asociados se eliminan según corresponda; los registros que deban conservarse legítimamente por motivos de seguridad, nómina, empleo, impuestos, obligaciones legales o regulatorias pueden conservarse o desidentificarse como se explica en la <a href="/privacy">política de privacidad</a>.</p>
   <div className={styles.notice}><b>Already signed in? / ¿Ya iniciaste sesión?</b><br/>You can also request deletion from Account inside El Molino Ops. / <span lang="es-MX">También puedes solicitar la eliminación desde Cuenta dentro de El Molino Ops.</span></div>
  </section>

  <section className={styles.card}>
   <h2>Need help? / ¿Necesitas ayuda?</h2>
   <p>Email <a href="mailto:theitaliancouplellc@gmail.com?subject=El%20Molino%20Ops%20Account%20Deletion">theitaliancouplellc@gmail.com</a>. Never send your password or MFA code.</p>
   <p lang="es-MX">Escribe a <a href="mailto:theitaliancouplellc@gmail.com?subject=Eliminaci%C3%B3n%20de%20cuenta%20El%20Molino%20Ops">theitaliancouplellc@gmail.com</a>. Nunca envíes tu contraseña ni tu código de autenticación de dos factores.</p>
  </section>
  <p className={styles.footer}>El Molino Ops · <a href="/privacy">Privacy / Privacidad</a> · <a href="/support">Support / Soporte</a></p>
 </div></main>
}
