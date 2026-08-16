export type EmployeeScheduleCache<TPeriod,TShift,TRole,TBreak>={
 version:1;employeeId:string;weekStart:string;savedAt:string;period:TPeriod|null;shifts:TShift[];roles:TRole[];breaks:TBreak[];
};
const PREFIX='el-molino:employee-schedule:v1:';
const key=(employeeId:string,weekStart:string)=>`${PREFIX}${employeeId}:${weekStart}`;
export function readEmployeeScheduleCache<TPeriod,TShift,TRole,TBreak>(employeeId:string,weekStart:string){
 if(typeof window==='undefined')return null;
 try{const raw=localStorage.getItem(key(employeeId,weekStart));if(!raw)return null;const parsed=JSON.parse(raw) as EmployeeScheduleCache<TPeriod,TShift,TRole,TBreak>;if(parsed?.version!==1||parsed.employeeId!==employeeId||parsed.weekStart!==weekStart||!Array.isArray(parsed.shifts)||!Array.isArray(parsed.roles)||!Array.isArray(parsed.breaks))return null;return parsed}catch{return null}
}
export function writeEmployeeScheduleCache<TPeriod,TShift,TRole,TBreak>(cache:Omit<EmployeeScheduleCache<TPeriod,TShift,TRole,TBreak>,'version'|'savedAt'>){
 if(typeof window==='undefined')return;
 try{localStorage.setItem(key(cache.employeeId,cache.weekStart),JSON.stringify({...cache,version:1,savedAt:new Date().toISOString()}));const ours=Object.keys(localStorage).filter(k=>k.startsWith(`${PREFIX}${cache.employeeId}:`)).map(k=>({k,t:(()=>{try{return new Date(JSON.parse(localStorage.getItem(k)||'{}').savedAt||0).getTime()}catch{return 0}})()})).sort((a,b)=>b.t-a.t);for(const old of ours.slice(8))localStorage.removeItem(old.k)}catch{}
}
export function employeeScheduleCacheAge(savedAt:string,now=Date.now()){const t=new Date(savedAt).getTime();if(!Number.isFinite(t))return 'cached previously';const mins=Math.max(0,Math.floor((now-t)/60000));if(mins<1)return 'cached just now';if(mins<60)return `cached ${mins}m ago`;const h=Math.floor(mins/60);if(h<24)return `cached ${h}h ago`;const d=Math.floor(h/24);return `cached ${d}d ago`}
