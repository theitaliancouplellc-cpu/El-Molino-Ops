export const RESTAURANT_TZ='America/New_York';
export function businessDateInZone(now:Date=new Date(),timeZone=RESTAURANT_TZ){return new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now)}
export function safeDateMs(v:unknown){const n=new Date(String(v??'')).getTime();return Number.isFinite(n)?n:null}
export function isOverdue(v:unknown,now=Date.now()){const n=safeDateMs(v);return n!==null&&n<now}
export function norm(v:unknown,max=500){return String(v??'').replace(/\u0000/g,'').trim().replace(/\s+/g,' ').slice(0,max)}
export function normLower(v:unknown,max=500){return norm(v,max).toLowerCase()}
export function safeStatus(v:unknown){return normLower(v,40).replace(/\s+/g,'_')}
export function isTerminalStatus(v:unknown){return ['done','complete','completed','cancelled','canceled','archived'].includes(safeStatus(v))}
export function isOpenStatus(v:unknown){return !isTerminalStatus(v)}
export function validMoney(v:unknown){const n=Number(v);return Number.isFinite(n)&&n>=0&&n<=100000?n:null}
export function priceLabel(v:unknown){const n=validMoney(v);return n===null?'—':`$${n.toFixed(2)}`}
export function searchable(v:unknown,max=120){return normLower(v,max)}
export function menuMatches(item:{name?:unknown;description?:unknown;price_source?:unknown},categoryName:unknown,q:unknown){const needle=searchable(q);if(!needle)return true;return searchable(`${item.name??''} ${item.description??''} ${item.price_source??''} ${categoryName??''}`,1000).includes(needle)}
export function visibleMenuItem(item:{active?:unknown,name?:unknown}){return item.active===true&&norm(item.name,200).length>0}
export function dedupeById<T extends {id:string}>(rows:T[]){const seen=new Set<string>();return rows.filter(r=>Boolean(r?.id)&&!seen.has(r.id)&&(seen.add(r.id),true))}
export function stableSortByName<T extends {name?:unknown}>(rows:T[]){return [...rows].sort((a,b)=>norm(a.name,200).localeCompare(norm(b.name,200),undefined,{sensitivity:'base'}))}
export function cappedExactLabel(loaded:number,cap:number){return loaded>=cap?`${cap}+`:String(Math.max(0,loaded))}
export function chooseLatestRun<T extends {created_at?:string;started_at?:string|null}>(runs:T[]){return [...runs].sort((a,b)=>(safeDateMs(b.started_at)||safeDateMs(b.created_at)||0)-(safeDateMs(a.started_at)||safeDateMs(a.created_at)||0))[0]??null}
export function safeKindQuery(v:unknown){const s=normLower(v,80).replace(/[^a-z0-9_]/g,'');return s||'other'}
export function validPriority(v:unknown){const s=safeStatus(v);return ['low','normal','high','urgent'].includes(s)?s:'normal'}
export function validProcedureTitle(v:unknown){const s=norm(v,200);return s.length>=2?s:null}
export function validProcedureInstruction(v:unknown){const s=norm(v,4000);return s.length>=2?s:null}
export function validChecklistPeriod(v:unknown){const s=safeStatus(v);return ['opening','mid_shift','closing','other'].includes(s)?s:null}
export function canApproveProcedure(stepCount:number,title:unknown){return Number.isInteger(stepCount)&&stepCount>0&&Boolean(validProcedureTitle(title))}
export function nextStepNumber(steps:{step_number:number}[]){const nums=steps.map(s=>Number(s.step_number)).filter(Number.isFinite);return nums.length?Math.max(...nums)+1:1}
export function contiguousStepNumbers(steps:{step_number:number}[]){const nums=steps.map(s=>Number(s.step_number)).sort((a,b)=>a-b);return nums.every((n,i)=>n===i+1)}
export function canConvertProcedure(status:unknown,steps:number){return safeStatus(status)==='approved'&&steps>0}
export function canToggleChecklistItem(runCompletedAt:unknown,busy:boolean){return !busy&&!runCompletedAt}
export function checklistProgress(items:{completed:boolean}[]){const total=items.length,done=items.filter(x=>x.completed).length;return {total,done,complete:total>0&&done===total}}
export function canFinishChecklist(runCompletedAt:unknown,items:{completed:boolean}[]){const p=checklistProgress(items);return !runCompletedAt&&p.complete}
export function validBusinessDate(v:unknown){return /^\d{4}-\d{2}-\d{2}$/.test(norm(v,20))}
export function safeRecentCutoff(days:number,now=Date.now()){const d=Number.isFinite(days)?Math.min(90,Math.max(1,Math.trunc(days))):7;return new Date(now-d*86400000).toISOString().slice(0,10)}
export function fileSizeLabel(v:unknown){const n=Number(v);if(!Number.isFinite(n)||n<0)return 'Unknown size';if(n===0)return '0 B';if(n<1024)return `${Math.round(n)} B`;if(n<1048576)return `${(n/1024).toFixed(1)} KB`;if(n<1073741824)return `${(n/1048576).toFixed(1)} MB`;return `${(n/1073741824).toFixed(1)} GB`}
export function safeTimestampLabel(v:unknown){const n=safeDateMs(v);return n===null?'Unknown date':new Date(n).toLocaleString()}
export function validStorageRef(bucket:unknown,path:unknown){const b=norm(bucket,100),p=norm(path,500);return Boolean(b&&p&&!p.includes('..')&&!p.startsWith('/')&&!/[\u0000-\u001f]/.test(p))}
export function safeFileTitle(title:unknown,fileName:unknown){return norm(title,255)||norm(fileName,255)||'Untitled file'}
export function safeAttachmentCount(n:unknown){const x=Number(n);return Number.isFinite(x)&&x>0?Math.min(9999,Math.trunc(x)):0}
export function maxSafeRows(requested:number,hardMax=10000){if(!Number.isFinite(requested))return 500;return Math.max(1,Math.min(Math.trunc(requested),hardMax))}
export function staleResponse(requestId:number,currentId:number){return requestId!==currentId}
export function safeMessage(v:unknown,fallback='Something went wrong.'){const s=norm(v,300);if(!s)return fallback;if(/jwt|postgres|supabase|row-level|rls|constraint|stack|sqlstate|permission denied/i.test(s))return fallback;return s}
