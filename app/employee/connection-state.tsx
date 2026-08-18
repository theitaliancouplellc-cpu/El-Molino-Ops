'use client';

import {useEffect,useState} from 'react';
import {useI18n} from '@/lib/i18n';

export default function EmployeeConnectionState(){
 const {locale}=useI18n();
 const [online,setOnline]=useState(true);
 useEffect(()=>{const sync=()=>setOnline(navigator.onLine);sync();addEventListener('online',sync);addEventListener('offline',sync);return()=>{removeEventListener('online',sync);removeEventListener('offline',sync)}},[]);
 if(online)return null;
 return <div className="employee-offline-banner" role="status" aria-live="polite"><b>{locale==='es'?'Sin conexión':'Offline'}</b><span>{locale==='es'?'Puedes ver la información del horario guardada. Los cambios requieren conexión.':'You can view cached schedule information. Changes require a connection.'}</span></div>;
}
