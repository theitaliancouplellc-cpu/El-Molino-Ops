'use client';

import {useEffect,useState} from 'react';

export default function EmployeeConnectionState(){
 const [online,setOnline]=useState(true);
 useEffect(()=>{const sync=()=>setOnline(navigator.onLine);sync();addEventListener('online',sync);addEventListener('offline',sync);return()=>{removeEventListener('online',sync);removeEventListener('offline',sync)}},[]);
 if(online)return null;
 return <div className="employee-offline-banner" role="status" aria-live="polite"><b>Offline</b><span>You can view cached schedule information. Changes require a connection.</span></div>;
}
