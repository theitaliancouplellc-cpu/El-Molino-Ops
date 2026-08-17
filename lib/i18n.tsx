'use client';

import {createContext,useCallback,useContext,useEffect,useMemo,useState} from 'react';

export type Locale='en'|'es';
export const LOCALE_STORAGE_KEY='el-molino-locale';

const dictionaries={
 en:{
  'language.english':'English','language.spanish':'Spanish','language.label':'Language',
  'common.save':'Save','common.cancel':'Cancel','common.close':'Close','common.back':'Back','common.continue':'Continue','common.loading':'Loading…','common.refresh':'Refresh','common.search':'Search','common.submit':'Submit','common.approve':'Approve','common.reject':'Reject','common.edit':'Edit','common.delete':'Delete','common.yes':'Yes','common.no':'No','common.optional':'Optional','common.required':'Required','common.enabled':'Enabled','common.disabled':'Disabled','common.status':'Status','common.date':'Date','common.time':'Time','common.employee':'Employee','common.manager':'Manager','common.staff':'Staff',
  'nav.home':'Home','nav.schedule':'Schedule','nav.requests':'Requests','nav.timeClock':'Time Clock','nav.tips':'Tips','nav.team':'Team','nav.training':'Training','nav.notifications':'Notifications','nav.account':'Account','nav.manager':'Manager','nav.settings':'Settings',
  'account.title':'Account & Security','account.displayName':'Display name','account.accountAccess':'Account access','account.changeEmail':'Change email','account.changePassword':'Change password','account.newEmail':'New email','account.newPassword':'New password','account.confirmPassword':'Confirm password','account.requestDeletion':'Request account deletion','account.notificationPreferences':'Notification preferences','account.myTimeClock':'My time clock','account.myTips':'My tips','account.staffAccount':'Staff account','account.employmentStatus':'Employment status','account.verifiedPositions':'Verified positions','account.positionChange':'Request a position change','account.noteForManagement':'Note for management (optional)','account.submitPositionChange':'Submit position change','account.waitingReview':'Waiting for manager review.','account.cancelRequest':'Cancel request',
  'pilot.title':'Pilot Scorecard','pilot.releaseEvidence':'Release evidence','pilot.noEvidence':'No evidence yet',
  'brand.privateWorkspace':'Private Johns Island operations workspace'
 },
 es:{
  'language.english':'Inglés','language.spanish':'Español','language.label':'Idioma',
  'common.save':'Guardar','common.cancel':'Cancelar','common.close':'Cerrar','common.back':'Atrás','common.continue':'Continuar','common.loading':'Cargando…','common.refresh':'Actualizar','common.search':'Buscar','common.submit':'Enviar','common.approve':'Aprobar','common.reject':'Rechazar','common.edit':'Editar','common.delete':'Eliminar','common.yes':'Sí','common.no':'No','common.optional':'Opcional','common.required':'Obligatorio','common.enabled':'Activado','common.disabled':'Desactivado','common.status':'Estado','common.date':'Fecha','common.time':'Hora','common.employee':'Empleado','common.manager':'Gerente','common.staff':'Personal',
  'nav.home':'Inicio','nav.schedule':'Horario','nav.requests':'Solicitudes','nav.timeClock':'Reloj de tiempo','nav.tips':'Propinas','nav.team':'Equipo','nav.training':'Capacitación','nav.notifications':'Notificaciones','nav.account':'Cuenta','nav.manager':'Gerencia','nav.settings':'Configuración',
  'account.title':'Cuenta y seguridad','account.displayName':'Nombre visible','account.accountAccess':'Acceso a la cuenta','account.changeEmail':'Cambiar correo electrónico','account.changePassword':'Cambiar contraseña','account.newEmail':'Nuevo correo electrónico','account.newPassword':'Nueva contraseña','account.confirmPassword':'Confirmar contraseña','account.requestDeletion':'Solicitar eliminación de la cuenta','account.notificationPreferences':'Preferencias de notificaciones','account.myTimeClock':'Mi reloj de tiempo','account.myTips':'Mis propinas','account.staffAccount':'Cuenta del personal','account.employmentStatus':'Estado laboral','account.verifiedPositions':'Puestos verificados','account.positionChange':'Solicitar cambio de puesto','account.noteForManagement':'Nota para gerencia (opcional)','account.submitPositionChange':'Enviar cambio de puesto','account.waitingReview':'En espera de revisión de gerencia.','account.cancelRequest':'Cancelar solicitud',
  'pilot.title':'Panel del piloto','pilot.releaseEvidence':'Evidencia de lanzamiento','pilot.noEvidence':'Aún no hay evidencia',
  'brand.privateWorkspace':'Espacio privado de operaciones de Johns Island'
 }
} as const;

type Key=keyof typeof dictionaries.en;
type I18nValue={locale:Locale;setLocale:(locale:Locale)=>void;t:(key:Key)=>string};
const I18nContext=createContext<I18nValue|null>(null);

export function I18nProvider({children}:{children:React.ReactNode}){
 const [locale,setLocaleState]=useState<Locale>('en');
 useEffect(()=>{
  const saved=localStorage.getItem(LOCALE_STORAGE_KEY);
  const next:Locale=saved==='es'?'es':'en';
  setLocaleState(next);
  document.documentElement.lang=next;
  document.documentElement.dataset.locale=next;
 },[]);
 const setLocale=useCallback((next:Locale)=>{
  setLocaleState(next);
  localStorage.setItem(LOCALE_STORAGE_KEY,next);
  document.documentElement.lang=next;
  document.documentElement.dataset.locale=next;
 },[]);
 const t=useCallback((key:Key)=>dictionaries[locale][key]??dictionaries.en[key]??key,[locale]);
 const value=useMemo(()=>({locale,setLocale,t}),[locale,setLocale,t]);
 return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(){
 const value=useContext(I18nContext);
 if(!value)throw new Error('useI18n must be used inside I18nProvider');
 return value;
}

export function LanguageToggle({compact=false}:{compact?:boolean}){
 const {locale,setLocale}=useI18n();
 return <div className={compact?'language-toggle compact':'language-toggle'} role="group" aria-label="Language / Idioma">
  <button type="button" className={locale==='en'?'active':''} aria-pressed={locale==='en'} onClick={()=>setLocale('en')}>EN</button>
  <button type="button" className={locale==='es'?'active':''} aria-pressed={locale==='es'} onClick={()=>setLocale('es')}>ES</button>
 </div>;
}
