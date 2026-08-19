'use client';

import {useEffect} from 'react';
import {usePathname} from 'next/navigation';
import {isStaffRouteReleased} from '@/lib/staff-features';

export default function StaffReleaseBoundary({children}:{children:React.ReactNode}){
  const pathname=usePathname();
  const released=isStaffRouteReleased(pathname);
  useEffect(()=>{
    if(!released)window.location.replace('/employee');
  },[released]);
  if(!released)return null;
  return children;
}
