export function safeDateInput(value:string){const s=String(value||'').trim();if(!s)return null;const d=new Date(s);return Number.isFinite(d.getTime())?d:null}
export function toIsoOrNull(value:string){const d=safeDateInput(value);return d?d.toISOString():null}
export function endNotBeforeStart(start:string,end:string){const a=safeDateInput(start),b=safeDateInput(end);return !a||!b||b.getTime()>=a.getTime()}
export function uniqueHeaders(headers:string[]){const seen=new Map<string,number>();return headers.map((raw,i)=>{let base=String(raw||'').trim()||`column_${i+1}`;const key=base.toLowerCase();const n=(seen.get(key)||0)+1;seen.set(key,n);return n===1?base:`${base}_${n}`})}
export function hasDuplicateHeaders(headers:string[]){const keys=headers.map(x=>String(x||'').trim().toLowerCase()).filter(Boolean);return new Set(keys).size!==keys.length}
export function validCsvShape(headers:string[],rows:Record<string,string>[]){return headers.length>0&&headers.length<=200&&rows.length>0&&rows.length<=5000}
export function validFileName(name:string){const s=String(name||'').trim();return Boolean(s)&&s.length<=255&&!/[\u0000-\u001f]/.test(s)}
export function safeStorageSegment(name:string){return String(name||'upload').normalize('NFKC').replace(/[^a-zA-Z0-9._-]/g,'_').replace(/_+/g,'_').slice(-160)||'upload'}
export function canPreviewMime(mime:string|null){return /^(image\/|video\/|audio\/|application\/pdf$|text\/)/i.test(String(mime||''))}
export function isValidEntityId(id:string){return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id||''))}
export function validTarget(type:string|null,id:string|null){return Boolean(id&&isValidEntityId(id)&&['ops_record','task','procedure','knowledge'].includes(String(type||'')))}
export function safePageLimit(n:number,max=1000){if(!Number.isFinite(n))return 50;return Math.max(1,Math.min(Math.trunc(n),max))}
export function stableUnique<T>(items:T[],key:(x:T)=>string){const seen=new Set<string>();return items.filter(x=>{const k=key(x);if(seen.has(k))return false;seen.add(k);return true})}
export function isTaskTerminal(status:string){return ['done','cancelled'].includes(String(status||'').toLowerCase())}
export function dependencyCreatesCycle(taskId:string,dependsOnId:string,deps:{task_id:string;depends_on_task_id:string}[]){if(!taskId||!dependsOnId)return false;if(taskId===dependsOnId)return true;const graph=new Map<string,string[]>();for(const d of deps){const x=graph.get(d.task_id)||[];x.push(d.depends_on_task_id);graph.set(d.task_id,x)}const stack=[dependsOnId],seen=new Set<string>();while(stack.length){const x=stack.pop()!;if(x===taskId)return true;if(seen.has(x))continue;seen.add(x);stack.push(...(graph.get(x)||[]))}return false}
export function normalizedText(v:unknown,max:number){return String(v??'').replace(/\u0000/g,'').trim().slice(0,max)}
export function validEmail(v:string){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||'').trim())}
export function strongEnoughPassword(v:string){const s=String(v||'');return s.length>=10&&/[A-Za-z]/.test(s)&&/\d/.test(s)}
export function validRecurrenceInput(v:string){const s=String(v||'').trim().toUpperCase();return !s||/^FREQ=(DAILY|WEEKLY|MONTHLY)(;[A-Z]+=[A-Z0-9,]+)*$/.test(s)}
export function safeMoney(v:number|null){return v==null||!Number.isFinite(Number(v))?null:Math.max(0,Number(v))}
