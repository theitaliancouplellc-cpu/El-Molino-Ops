export const EMPLOYEE_NOTIFICATION_CATEGORIES=['schedule','requests','shift_pool','team','training','time_clock','tips','account','general'] as const;
export type EmployeeNotificationCategory=(typeof EMPLOYEE_NOTIFICATION_CATEGORIES)[number];

export const EMPLOYEE_NOTIFICATION_CATEGORY_LABELS:Record<EmployeeNotificationCategory,string>={
  schedule:'Schedule',requests:'Requests',shift_pool:'Shift Pool',team:'Team',training:'Training',time_clock:'Time Clock',tips:'Tips',account:'Account',general:'General'
};

const STAFF_SAFE_PREFIXES=[
  '/employee',
  '/schedule/pool',
  '/schedule/requests',
  '/schedule/feedback',
  '/team',
  '/training/courses',
  '/account'
] as const;

const LEGACY_EMPLOYEE_DESTINATIONS:Record<string,string>={
  '/schedule/pool':'/employee/shift-pool',
  '/schedule/requests':'/employee/requests',
  '/team':'/employee/team',
  '/training/courses':'/employee/training',
};

export function safeEmployeeNotificationHref(value:string|null|undefined){
  if(!value||!value.startsWith('/')||value.startsWith('//')||/[\\\u0000-\u001f\u007f]/.test(value))return '/employee';
  try{
    const url=new URL(value,'https://staff.elmolino.invalid');
    if(url.origin!=='https://staff.elmolino.invalid')return '/employee';
    let path=url.pathname;
    if(!STAFF_SAFE_PREFIXES.some(prefix=>path===prefix||path.startsWith(`${prefix}/`)))return '/employee';
    for(const [legacy,dedicated] of Object.entries(LEGACY_EMPLOYEE_DESTINATIONS))if(path===legacy||path.startsWith(`${legacy}/`)){path=`${dedicated}${path.slice(legacy.length)}`;break}
    return `${path}${url.search}${url.hash}`;
  }catch{return '/employee'}
}

export function employeeNotificationHref(value:string|null|undefined,notificationId?:string|null){
  const safe=safeEmployeeNotificationHref(value);
  if(!notificationId||!safe.startsWith('/employee/schedule'))return safe;
  const [beforeHash,hash='']=safe.split('#',2);
  const separator=beforeHash.includes('?')?'&':'?';
  return `${beforeHash}${separator}notice=${encodeURIComponent(notificationId)}${hash?`#${hash}`:''}`;
}

export function normalizeEmployeeNotificationCategory(value:string|null|undefined):EmployeeNotificationCategory{
  return (EMPLOYEE_NOTIFICATION_CATEGORIES as readonly string[]).includes(value||'')?value as EmployeeNotificationCategory:'general';
}

export function notificationTimeLabel(iso:string,now=Date.now()){
  const time=new Date(iso).getTime();
  if(!Number.isFinite(time))return '';
  const diff=Math.max(0,now-time);
  const mins=Math.floor(diff/60000);
  if(mins<1)return 'Now';
  if(mins<60)return `${mins}m`;
  const hours=Math.floor(mins/60);
  if(hours<24)return `${hours}h`;
  const days=Math.floor(hours/24);
  if(days<7)return `${days}d`;
  return new Date(iso).toLocaleDateString([],{month:'short',day:'numeric'});
}

export function notificationPriorityRank(priority:string|null|undefined){
  return ({critical:4,high:3,normal:2,low:1} as Record<string,number>)[priority||'normal']||2;
}
