export type RecurrenceFrequency='DAILY'|'WEEKLY'|'MONTHLY'|null;

export function recurrenceFrequency(rule:string|null|undefined):RecurrenceFrequency{
  const r=String(rule||'').trim().toUpperCase();
  if(!r)return null;
  if(/(^|;)FREQ=DAILY(;|$)/.test(r))return 'DAILY';
  if(/(^|;)FREQ=WEEKLY(;|$)/.test(r))return 'WEEKLY';
  if(/(^|;)FREQ=MONTHLY(;|$)/.test(r))return 'MONTHLY';
  return null;
}

export function normalizeRecurrence(rule:string){
  const r=rule.trim().toUpperCase();
  if(!r)return '';
  const freq=recurrenceFrequency(r);
  if(!freq)throw new Error('Recurrence must include FREQ=DAILY, FREQ=WEEKLY or FREQ=MONTHLY.');
  return `FREQ=${freq}`;
}

export function taskIsBlocked(taskId:string,dependencies:{task_id:string;depends_on_task_id:string}[],statusById:Record<string,string>){
  return dependencies.some(d=>d.task_id===taskId&&statusById[d.depends_on_task_id]!=='done');
}

export function dependencyWouldBeSelf(taskId:string,dependsOnId:string){return Boolean(taskId&&dependsOnId&&taskId===dependsOnId)};
