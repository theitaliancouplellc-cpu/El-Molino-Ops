export const ROLES=['admin','manager','employee'] as const;
export function isRole(v:unknown):v is typeof ROLES[number]{return ROLES.includes(String(v) as any)}
export function canDemoteAdmin(users:{id:string;app_role:string}[],targetId:string,nextRole:string){if(nextRole==='admin')return true;const target=users.find(x=>x.id===targetId);if(target?.app_role!=='admin')return true;return users.filter(x=>x.app_role==='admin').length>1}
export function inviteActionable(status:string,expiresAt:string|null,now=Date.now()){if(status!=='pending')return false;if(!expiresAt)return true;const t=new Date(expiresAt).getTime();return Number.isFinite(t)&&t>now}
export function normalizedQuery(v:string,max=120){return String(v||'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max)}
export function searchableQuery(v:string){const q=normalizedQuery(v);return q.length>=2?q:''}
export function safeInternalHref(v:string|null|undefined,fallback='/'){const s=String(v||'').trim();if(!s.startsWith('/')||s.startsWith('//')||/[\u0000-\u001f]/.test(s))return fallback;try{const u=new URL(s,'https://local.invalid');return u.origin==='https://local.invalid'?`${u.pathname}${u.search}${u.hash}`:fallback}catch{return fallback}}
export function dedupeBy<T>(items:T[],key:(x:T)=>string){const seen=new Set<string>();return items.filter(x=>{const k=key(x);if(!k||seen.has(k))return false;seen.add(k);return true})}
export function newestRequestWins(requestId:number,currentId:number){return requestId===currentId}
export function boundedText(v:unknown,max:number){return String(v??'').replace(/\u0000/g,'').trim().slice(0,max)}
export function canSubmitText(v:string,max=5000){const s=boundedText(v,max+1);return s.length>0&&s.length<=max}
export function backupRanges(total:number,pageSize=1000){const out:{from:number;to:number}[]=[];if(!Number.isFinite(total)||total<=0)return out;const size=Math.max(1,Math.min(Math.trunc(pageSize),5000));for(let from=0;from<total;from+=size)out.push({from,to:Math.min(total-1,from+size-1)});return out}
export function nextBackupRange(received:number,pageSize=1000){return received===pageSize}
export function clampSignedUrlSeconds(v:number){return Math.max(30,Math.min(Number.isFinite(v)?Math.trunc(v):120,900))}
export function businessDate(date:Date,timeZone='America/New_York'){try{return new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date)}catch{return new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit'}).format(date)}}
export function safeLocalDateTime(iso:string,timeZone='America/New_York'){const d=new Date(iso);if(!Number.isFinite(d.getTime()))return 'Invalid date';try{return new Intl.DateTimeFormat('en-US',{timeZone,dateStyle:'medium',timeStyle:'short'}).format(d)}catch{return d.toLocaleString()}}
export function notificationKey(n:{id?:string;type?:string;entity_type?:string;entity_id?:string;message?:string}){return n.id||`${n.type||''}:${n.entity_type||''}:${n.entity_id||''}:${n.message||''}`}
export function mergeNotifications<T extends {id?:string;type?:string;entity_type?:string;entity_id?:string;message?:string}>(a:T[],b:T[]){return dedupeBy([...b,...a],notificationKey)}
export function shouldReloadForServiceWorker(opts:{controllerChanged:boolean;documentVisible:boolean;hasBlockingDialog:boolean;dirty:boolean}){return opts.controllerChanged&&opts.documentVisible&&!opts.hasBlockingDialog&&!opts.dirty}
export function safeOfflineWrite(online:boolean,kind:'read'|'idempotent'|'write'){return online||kind==='read'}
export function optimisticRollback<T>(before:T,error:boolean,current:T){return error?before:current}
export function staleEntityUpdate(expected:string|null,current:string|null){return Boolean(expected&&current&&expected!==current)}
export function validPageSize(v:number,max=500){if(!Number.isFinite(v))return 50;return Math.max(1,Math.min(Math.trunc(v),max))}
export function pageCount(total:number,size:number){if(total<=0)return 0;return Math.ceil(total/validPageSize(size,5000))}
export function uniqueRecent<T>(rows:T[],key:(x:T)=>string,max=100){return dedupeBy(rows,key).slice(0,Math.max(1,max))}
export function safeAriaLabel(v:string,fallback:string){const s=boundedText(v,120);return s||fallback}
export function focusIndex(current:number,delta:number,length:number){if(length<=0)return -1;return ((current+delta)%length+length)%length}
export function nonNegativeCount(v:unknown){const n=Number(v);return Number.isFinite(n)?Math.max(0,Math.trunc(n)):0}
export function canRestore(deletedAt:string|null){return Boolean(deletedAt&&Number.isFinite(new Date(deletedAt).getTime()))}
export function safeJsonForDownload(v:unknown,maxBytes=50_000_000){const s=JSON.stringify(v,null,2);if(new TextEncoder().encode(s).length>maxBytes)throw new Error('Backup is too large for a single browser download.');return s}
export function sanitizeAuditMessage(v:unknown){return boundedText(v,1000).replace(/Bearer\s+[A-Za-z0-9._-]+/gi,'Bearer [redacted]').replace(/sb_[A-Za-z0-9_-]+/gi,'[redacted-key]')}
