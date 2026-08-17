'use client';

import {useEffect,useState} from 'react';
import {ArrowLeft,BellRing,Mail,MessageSquareText,Save,Smartphone} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import {EMPLOYEE_NOTIFICATION_CATEGORY_LABELS,type EmployeeNotificationCategory} from '@/lib/employee-notifications';
import {disablePushOnThisDevice,enablePushOnThisDevice,getPushDeviceState,isIosLike,isStandaloneApp,type PushDeviceState} from '@/lib/employee-push';
import styles from '../../employee.module.css';

type Preference={category:EmployeeNotificationCategory;in_app:boolean;push:boolean;email:boolean;sms:boolean;settings:Record<string,unknown>};

const DEVICE_LABEL:Record<PushDeviceState,string>={unsupported:'Push alerts are not available in this browser.',default:'Alerts are not enabled on this device.',denied:'Notifications are blocked in this device or browser settings.',enabled:'Push alerts are enabled on this device.',disabled:'Push alerts are turned off on this device.'};

export default function EmployeeNotificationPreferences(){
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[pushBusy,setPushBusy]=useState(false),[message,setMessage]=useState(''),[prefs,setPrefs]=useState<Preference[]>([]),[deviceState,setDeviceState]=useState<PushDeviceState>('default');
 useEffect(()=>{void load()},[]);
 async function refreshDeviceState(){try{setDeviceState(await getPushDeviceState())}catch{setDeviceState('unsupported')}}
 async function load(){
  setBusy(true);setMessage('');
  const {data:u}=await supabase.auth.getUser();if(!u.user){location.href='/';return}
  const p=await supabase.from('profiles').select('app_role').eq('id',u.user.id).single();if(p.error||p.data?.app_role!=='employee'){location.href=p.data?'/manager':'/';return}
  const st=await supabase.rpc('employee_self_setup_status',{});if(st.error||st.data?.status!=='approved'){location.href='/employee/setup';return}
  const r=await supabase.rpc('get_my_notification_preferences',{});if(r.error)setMessage('Could not load notification preferences.');setPrefs((Array.isArray(r.data)?r.data:[]) as Preference[]);await refreshDeviceState();setReady(true);setBusy(false)
 }
 function patch(category:EmployeeNotificationCategory,key:'push'|'email'|'sms',value:boolean){setPrefs(list=>list.map(p=>p.category===category?{...p,[key]:value}:p))}
 function patchSettings(category:EmployeeNotificationCategory,settings:Record<string,unknown>){setPrefs(list=>list.map(p=>p.category===category?{...p,settings}:p))}
 async function save(p:Preference){
  if(busy)return;setBusy(true);setMessage('');const {error}=await supabase.rpc('set_my_notification_preference',{p_category:p.category,p_push:p.push,p_email:p.email,p_sms:p.sms,p_settings:p.settings||{}});setMessage(error?'Could not save that preference.':`${EMPLOYEE_NOTIFICATION_CATEGORY_LABELS[p.category]} preferences saved.`);if(!error)await load();setBusy(false)
 }
 async function enableDevicePush(){
  if(pushBusy)return;
  if(isIosLike()&&!isStandaloneApp()){setMessage('On iPhone, add El Molino to your Home Screen, open the installed app, then enable alerts here.');return}
  setPushBusy(true);setMessage('');
  try{const state=await enablePushOnThisDevice();setDeviceState(state);setMessage(state==='enabled'?'Push alerts are enabled on this device.':DEVICE_LABEL[state])}catch{setMessage('Could not enable push alerts on this device. Try again after reconnecting.')}
  finally{setPushBusy(false)}
 }
 async function disableDevicePush(){
  if(pushBusy)return;setPushBusy(true);setMessage('');
  try{const state=await disablePushOnThisDevice();setDeviceState(state);setMessage('Push alerts are turned off on this device.')}catch{setMessage('Could not turn off push alerts on this device. Try again after reconnecting.')}
  finally{setPushBusy(false)}
 }
 if(!ready)return <main className={styles.page}>Opening notification settings…</main>;
 return <main className={styles.page}>
  <header className={styles.header}><a className={styles.iconButton} href="/employee/notifications" aria-label="Back to notifications"><ArrowLeft size={20}/></a><div className={styles.brand}><small>El Molino Staff</small><strong>Notification Preferences</strong></div><span/></header>
  {message&&<div className={message.startsWith('Could not')?styles.error:styles.notice} role="status">{message}</div>}
  <section className={styles.setupCard}><h2>How you want updates</h2><p className={styles.muted}>Important in-app history always stays available. Choose which types of updates may use push, email, or text, then enable push on each phone or browser where you want alerts.</p></section>
  <section className={styles.setupCard} aria-labelledby="device-alerts-heading"><div className={styles.sectionHead}><div><h2 id="device-alerts-heading"><BellRing size={18}/> Alerts on this device</h2><span>{DEVICE_LABEL[deviceState]}</span></div></div>{isIosLike()&&!isStandaloneApp()&&<p className={styles.muted}>On iPhone, install El Molino to the Home Screen and open that installed app before enabling push alerts.</p>}<div className={styles.actions}>{deviceState==='enabled'?<button className={styles.button} disabled={pushBusy} onClick={disableDevicePush}>{pushBusy?'Updating…':'Turn off alerts on this device'}</button>:<button className={styles.button} disabled={pushBusy||deviceState==='denied'||deviceState==='unsupported'} onClick={enableDevicePush}>{pushBusy?'Enabling…':'Enable alerts on this device'}</button>}</div></section>
  <section className={styles.section}><div className={styles.list}>{prefs.map(p=><article className={styles.preferenceRow} key={p.category}><div className={styles.sectionHead}><div><h2>{EMPLOYEE_NOTIFICATION_CATEGORY_LABELS[p.category]}</h2><span>In-app always on</span></div></div><div className={styles.preferenceChannels}><label><Smartphone size={17}/><span><b>Push</b><small>Alert devices you have enabled above.</small></span><input type="checkbox" checked={p.push} onChange={e=>patch(p.category,'push',e.target.checked)}/></label><label><Mail size={17}/><span><b>Email</b><small>Send supported updates to your account email.</small></span><input type="checkbox" checked={p.email} onChange={e=>patch(p.category,'email',e.target.checked)}/></label><label><MessageSquareText size={17}/><span><b>Text</b><small>SMS when restaurant messaging is enabled.</small></span><input type="checkbox" checked={p.sms} onChange={e=>patch(p.category,'sms',e.target.checked)}/></label></div>{p.category==='schedule'&&<label className={styles.field}><span>Shift reminder lead time</span><select value={String((p.settings?.shift_reminder_minutes as number|undefined)??120)} onChange={e=>patchSettings(p.category,{...p.settings,shift_reminder_minutes:Number(e.target.value)})}><option value="60">1 hour before</option><option value="120">2 hours before</option><option value="180">3 hours before</option><option value="720">12 hours before</option><option value="1440">1 day before</option></select></label>}<div className={styles.actions}><button className={styles.button} disabled={busy} onClick={()=>save(p)}><Save size={16}/> Save {EMPLOYEE_NOTIFICATION_CATEGORY_LABELS[p.category]}</button></div></article>)}</div></section>
 </main>
}
