'use client';

import {CalendarDays,Clock3,Home,MessageSquare,UserRound} from 'lucide-react';
import {usePathname} from 'next/navigation';
import {useI18n} from '@/lib/i18n';
import {isStaffRouteReleased} from '@/lib/staff-features';
import styles from './employee.module.css';

type StaffTab='home'|'schedule'|'requests'|'messages'|'more';

function activeTab(pathname:string):StaffTab{
 if(pathname==='/employee')return 'home';
 if(pathname.startsWith('/employee/schedule')||pathname.startsWith('/employee/shift-pool'))return 'schedule';
 if(pathname.startsWith('/employee/requests'))return 'requests';
 if(pathname.startsWith('/employee/team'))return 'messages';
 return 'more';
}

export default function StaffBottomNav(){
 const pathname=usePathname();
 const {t}=useI18n();
 if(pathname==='/employee/setup'||pathname.startsWith('/employee/setup/')||pathname==='/employee/access'||pathname.startsWith('/employee/access/')||!isStaffRouteReleased(pathname))return null;
 const active=activeTab(pathname);
 const tab=(key:StaffTab,href:string,label:string,Icon:typeof Home,tour?:string)=><a className={`${styles.tab} ${active===key?styles.tabActive:''}`} href={href} aria-current={active===key?'page':undefined} data-tour={tour}><Icon size={19}/>{label}</a>;
 return <nav className={styles.tabs} aria-label={t('employee.staffNav')} data-staff-primary-nav>
  {tab('home','/employee',t('nav.home'),Home)}
  {tab('schedule','/employee/schedule',t('nav.schedule'),CalendarDays)}
  {tab('requests','/employee/requests',t('nav.requests'),Clock3)}
  {tab('messages','/employee/team',t('nav.messages'),MessageSquare)}
  {tab('more','/employee/more',t('common.more'),UserRound,'more')}
 </nav>;
}
