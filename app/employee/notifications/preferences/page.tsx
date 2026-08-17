'use client';

import {useEffect,useState} from 'react';
import {ArrowLeft,BellRing,Mail,MessageSquareText,Save,Smartphone} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import {type EmployeeNotificationCategory} from '@/lib/employee-notifications';
import {disablePushOnThisDevice,enablePushOnThisDevice,getPushDeviceState,isIosLike,isStandaloneApp,type PushDeviceState} from '@/lib/employee-push';
import {useI18n} from '@/lib/i18n';
import styles from '../../employee.module.css';

type Preference={category:EmployeeNotificationCategory;in_app:boolean;push:boolean;email:boolean;sms:boolean;settings:Record<string,unknown>};

const labels={
 en:{schedule:'Schedule',requests:'Requests',shift_pool:'Shift Pool',team:'Team',training:'Training',time_clock:'Time Clock',tips:'Tips',account:'Account',general:'General'},
 es:{schedule:'Horario',requests:'Solicitudes',shift_pool:'Bolsa de Turnos',team:'Equipo',training:'Capacitación',time_clock:'Reloj de tiempo',tips:'Propinas',account:'Cuenta',general:'General'}
} as const;

export default function EmployeeNotificationPreferences(){
 const {locale}=useI18n();
 const c=locale==='es'?{
  opening:'Abriendo configuración de notificaciones…',back:'Volver a notificaciones',staff:'Personal de El Molino',title:'Preferencias de Notificaciones',loadError:'No se pudieron cargar las preferencias de notificaciones.',saveError:'No se pudo guardar esa preferencia.',saved:'preferencias guardadas.',how:'Cómo quieres recibir novedades',intro:'El historial importante dentro de la aplicación siempre permanece disponible. Elige qué tipos de novedades pueden usar notificaciones push, correo electrónico o mensajes de texto, y luego activa push en cada teléfono o navegador donde quieras recibir alertas.',device:'Alertas en este dispositivo',ios:'En iPhone, agrega El Molino a la pantalla de inicio y abre la aplicación instalada antes de activar las alertas push.',updating:'Actualizando…',off:'Desactivar alertas en este dispositivo',enabling:'Activando…',on:'Activar alertas en este dispositivo',inApp:'Dentro de la aplicación siempre activo',push:'Push',pushHelp:'Alerta los dispositivos que hayas activado arriba.',email:'Correo',emailHelp:'Envía novedades compatibles al correo de tu cuenta.',text:'Texto',textHelp:'SMS cuando la mensajería del restaurante esté habilitada.',lead:'Anticipación del recordatorio de turno',hour1:'1 hora antes',hour2:'2 horas antes',hour3:'3 horas antes',hour12:'12 horas antes',day1:'1 día antes',save:'Guardar',iphoneHelp:'En iPhone, agrega El Molino a la pantalla de inicio, abre la aplicación instalada y luego activa las alertas aquí.',enableSuccess:'Las alertas push están activadas en este dispositivo.',enableError:'No se pudieron activar las alertas push en este dispositivo. Inténtalo de nuevo después de reconectarte.',disableSuccess:'Las alertas push están desactivadas en este dispositivo.',disableError:'No se pudieron desactivar las alertas push en este dispositivo. Inténtalo de nuevo después de reconectarte.',deviceLabels:{unsupported:'Las alertas push no están disponibles en este navegador.',default:'Las alertas no están activadas en este dispositivo.',denied:'Las notificaciones están bloqueadas en la configuración de este dispositivo o navegador.',enabled:'Las alertas push están activadas en este dispositivo.',disabled:'Las alertas push están desactivadas en este dispositivo.'}
 }:{
  opening:'Opening notification settings…',back:'Back to notifications',staff:'El Molino Staff',title:'Notification Preferences',loadError:'Could not load notification preferences.',saveError:'Could not save that preference.',saved:'preferences saved.',how:'How you want updates',intro:'Important in-app history always stays available. Choose which types of updates may use push, email, or text, then enable push on each phone or browser where you want alerts.',device:'Alerts on this device',ios:'On iPhone, install El Molino to the Home Screen and open that installed app before enabling push alerts.',updating:'Updating…',off:'Turn off alerts on this device',enabling:'Enabling…',on:'Enable alerts on this device',inApp:'In-app always on',push:'Push',pushHelp:'Alert devices you have enabled above.',email:'Email',emailHelp:'Send supported updates to your account email.',text:'Text',textHelp:'SMS when restaurant messaging is enabled.',lead:'Shift reminder lead time',hour1:'1 hour before',hour2:'2 hours before',hour3:'3 hours before',hour12:'12 hours before',day1:'1 day before',save:'Save',iphoneHelp:'On iPhone, add El Molino to your Home Screen, open the installed app, then enable alerts here.',enableSuccess:'Push alerts are enabled on this device.',enableError:'Could not enable push alerts on this device. Try again after reconnecting.',disableSuccess:'Push alerts are turned off on this device.',disableError:'Could not turn off push alerts on this device. Try again after reconnecting.',deviceLabels:{unsupported:'Push alerts are not available in this browser.',default:'Alerts are not enabled on this device.',denied:'Notifications are blocked in this device or browser settings.',enabled:'Push alerts are enabled on this device.',disabled:'Push alerts are turned off on this device.'}
 };
 const categoryLabels=labels[locale];
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[pushBusy,setPushBusy]=useState(false),[message,setMessage]=useState(''),[prefs,setPrefs]=useState<Preference[]>([]),[deviceState,setDeviceState]=useState<PushDeviceState>('default');
 useEffect(()=>{void load()},[]);
 async function refreshDeviceState(){try{setDeviceState(await getPushDeviceState())}catch{setDeviceState('unsupported')}}
 async function load(){
  setBusy(true);setMessage('');
  const {data:u}=await supabase.auth.getUser();if(!u.user){location.href='/';return}
  const p=await supabase.from('profiles').select('app_role').eq('id',u.user.id).single();if(p.error||p.data?.app_role!=='employee'){location.href=p.data?'/manager':'/';return}
  const st=await supabase.rpc('employee_self_setup_status',{});if(st.error||st.data?.status!=='approved'){location.href='/employee/setup';return}
  const r=await supabase.rpc('get_my_notification_preferences',{});if(r.error)setMessage(c.loadError);setPrefs((Array.isArray(r.data)?r.data:[]) as Preference[]);await refreshDeviceState();setReady(true);setBusy(false)
 }
 function patch(category:EmployeeNotificationCategory,key:'push'|'email'|'sms',value:boolean){setPrefs(list=>list.map(p=>p.category===category?{...p,[key]:value}:p))}
 function patchSettings(category:EmployeeNotificationCategory,settings:Record<string,unknown>){setPrefs(list=>list.map(p=>p.category===category?{...p,settings}:p))}
 async function save(p:Preference){
  if(busy)return;setBusy(true);setMessage('');const {error}=await supabase.rpc('set_my_notification_preference',{p_category:p.category,p_push:p.push,p_email:p.email,p_sms:p.sms,p_settings:p.settings||{}});setMessage(error?c.saveError:`${categoryLabels[p.category]} ${c.saved}`);if(!error)await load();setBusy(false)
 }
 async function enableDevicePush(){
  if(pushBusy)return;
  if(isIosLike()&&!isStandaloneApp()){setMessage(c.iphoneHelp);return}
  setPushBusy(true);setMessage('');
  try{const state=await enablePushOnThisDevice();setDeviceState(state);setMessage(state==='enabled'?c.enableSuccess:c.deviceLabels[state])}catch{setMessage(c.enableError)}
  finally{setPushBusy(false)}
 }
 async function disableDevicePush(){
  if(pushBusy)return;setPushBusy(true);setMessage('');
  try{const state=await disablePushOnThisDevice();setDeviceState(state);setMessage(c.disableSuccess)}catch{setMessage(c.disableError)}
  finally{setPushBusy(false)}
 }
 if(!ready)return <main className={styles.page}>{c.opening}</main>;
 return <main className={styles.page}>
  <header className={styles.header}><a className={styles.iconButton} href="/employee/notifications" aria-label={c.back}><ArrowLeft size={20}/></a><div className={styles.brand}><small>{c.staff}</small><strong>{c.title}</strong></div><span/></header>
  {message&&<div className={message.startsWith('Could not')||message.startsWith('No se pudo')?styles.error:styles.notice} role="status">{message}</div>}
  <section className={styles.setupCard}><h2>{c.how}</h2><p className={styles.muted}>{c.intro}</p></section>
  <section className={styles.setupCard} aria-labelledby="device-alerts-heading"><div className={styles.sectionHead}><div><h2 id="device-alerts-heading"><BellRing size={18}/> {c.device}</h2><span>{c.deviceLabels[deviceState]}</span></div></div>{isIosLike()&&!isStandaloneApp()&&<p className={styles.muted}>{c.ios}</p>}<div className={styles.actions}>{deviceState==='enabled'?<button className={styles.button} disabled={pushBusy} onClick={disableDevicePush}>{pushBusy?c.updating:c.off}</button>:<button className={styles.button} disabled={pushBusy||deviceState==='denied'||deviceState==='unsupported'} onClick={enableDevicePush}>{pushBusy?c.enabling:c.on}</button>}</div></section>
  <section className={styles.section}><div className={styles.list}>{prefs.map(p=><article className={styles.preferenceRow} key={p.category}><div className={styles.sectionHead}><div><h2>{categoryLabels[p.category]}</h2><span>{c.inApp}</span></div></div><div className={styles.preferenceChannels}><label><Smartphone size={17}/><span><b>{c.push}</b><small>{c.pushHelp}</small></span><input type="checkbox" checked={p.push} onChange={e=>patch(p.category,'push',e.target.checked)}/></label><label><Mail size={17}/><span><b>{c.email}</b><small>{c.emailHelp}</small></span><input type="checkbox" checked={p.email} onChange={e=>patch(p.category,'email',e.target.checked)}/></label><label><MessageSquareText size={17}/><span><b>{c.text}</b><small>{c.textHelp}</small></span><input type="checkbox" checked={p.sms} onChange={e=>patch(p.category,'sms',e.target.checked)}/></label></div>{p.category==='schedule'&&<label className={styles.field}><span>{c.lead}</span><select value={String((p.settings?.shift_reminder_minutes as number|undefined)??120)} onChange={e=>patchSettings(p.category,{...p.settings,shift_reminder_minutes:Number(e.target.value)})}><option value="60">{c.hour1}</option><option value="120">{c.hour2}</option><option value="180">{c.hour3}</option><option value="720">{c.hour12}</option><option value="1440">{c.day1}</option></select></label>}<div className={styles.actions}><button className={styles.button} disabled={busy} onClick={()=>save(p)}><Save size={16}/> {c.save} {categoryLabels[p.category]}</button></div></article>)}</div></section>
 </main>
}
