export type ScheduleSeverity='error'|'warning'|'info';

export type ScheduleEmployee={id:string;full_name:string;active:boolean};
export type ScheduleRole={id:string;name:string};
export type RoleAssignment={employee_id:string;role_id:string};
export type AvailabilityRow={employee_id:string;day_of_week:number;available_from:string|null;available_to:string|null;unavailable:boolean};
export type TimeOffRow={employee_id:string;starts_on:string;ends_on:string;status:string};
export type ScheduleProfile={
  employee_id:string;min_weekly_hours:number;target_weekly_hours:number|null;max_weekly_hours:number|null;
  max_shift_hours:number;min_rest_hours:number;max_consecutive_days:number;hourly_rate:number|null;
  avoid_overtime:boolean;preferred_days_off:number[];preferred_start:string|null;preferred_end:string|null;
};
export type CoverageRequirement={
  id:string;name:string;day_of_week:number;role_id:string;starts_at:string;ends_at:string;min_staff:number;target_staff:number;
  max_staff:number|null;break_minutes:number;priority:number;shift_type:'opening'|'mid'|'closing'|'other';active:boolean;
  effective_from:string|null;effective_to:string|null;
};
export type SchedulePeriod={id:string;starts_on:string;ends_on:string;revision:number;status:string};
export type ExistingShift={
  id:string;employee_id:string|null;role_id:string|null;starts_at:string;ends_at:string;break_minutes:number;status:string;
  source?:string|null;is_locked?:boolean;coverage_requirement_id?:string|null;schedule_period_id?:string|null;
};
export type ScheduleEngineSettings={
  timezone:string;overtime_after_hours:number;mode:'minimum'|'target';preserve_manual_shifts:boolean;
};
export type GeneratedShift={
  employee_id:string|null;role_id:string;starts_at:string;ends_at:string;break_minutes:number;coverage_requirement_id:string;
  notes:string;
};
export type ScheduleIssue={
  severity:ScheduleSeverity;code:string;message:string;date?:string;requirement_id?:string;employee_id?:string;
  details?:Record<string,unknown>;
};
export type ScheduleMetrics={
  requested_slots:number;assigned_slots:number;open_slots:number;coverage_rate:number;scheduled_hours:number;
  projected_labor_cost:number;projected_overtime_hours:number;employees_scheduled:number;fairness_deviation:number;
};
export type ScheduleGenerationResult={
  algorithm_version:'v2.1';shifts:GeneratedShift[];issues:ScheduleIssue[];metrics:ScheduleMetrics;objective_score:number;
};
export type GenerateScheduleInput={
  period:SchedulePeriod;employees:ScheduleEmployee[];roles:ScheduleRole[];roleAssignments:RoleAssignment[];
  availability:AvailabilityRow[];timeOff:TimeOffRow[];profiles:ScheduleProfile[];requirements:CoverageRequirement[];
  existingShifts:ExistingShift[];settings:ScheduleEngineSettings;
};

type Slot={key:string,date:string,requirement:CoverageRequirement,starts_at:string,ends_at:string,hours:number,ordinal:number};
type Assigned={employee_id:string,starts_at:string,ends_at:string,hours:number,date:string,shift_type:CoverageRequirement['shift_type'],role_id:string};
type CandidateCheck={ok:boolean,reasons:string[],pendingTimeOff:boolean,softPenalty:number};
type Run={shifts:GeneratedShift[],issues:ScheduleIssue[],objective:number,metrics:ScheduleMetrics};

const ACTIVE_STATUSES=new Set(['scheduled','covered','callout']);
const pad=(n:number)=>String(n).padStart(2,'0');
const round2=(n:number)=>Math.round(n*100)/100;
const num=(v:unknown,fallback=0)=>Number.isFinite(Number(v))?Number(v):fallback;

export function addDateDays(ymd:string,days:number){
  const [y,m,d]=ymd.split('-').map(Number);const x=new Date(Date.UTC(y,m-1,d+days,12));
  return `${x.getUTCFullYear()}-${pad(x.getUTCMonth()+1)}-${pad(x.getUTCDate())}`;
}
export function dateDayOfWeek(ymd:string){const [y,m,d]=ymd.split('-').map(Number);return new Date(Date.UTC(y,m-1,d,12)).getUTCDay()}
export function timeMinutes(value:string|null|undefined){if(!value)return null;const [h,m]=value.slice(0,5).split(':').map(Number);return Number.isFinite(h)&&Number.isFinite(m)?h*60+m:null}

function zonedParts(at:Date,timeZone:string){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(at);
  const get=(t:Intl.DateTimeFormatPartTypes)=>Number(parts.find(p=>p.type===t)?.value||0);
  return {year:get('year'),month:get('month'),day:get('day'),hour:get('hour'),minute:get('minute'),second:get('second')};
}
export function zonedLocalToIso(date:string,time:string,timeZone:string){
  const [y,m,d]=date.split('-').map(Number),[hh,mm,ss=0]=time.slice(0,8).split(':').map(Number);
  const localMs=Date.UTC(y,m-1,d,hh,mm,ss);let guess=localMs;
  for(let i=0;i<3;i++){
    const p=zonedParts(new Date(guess),timeZone);const represented=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);
    guess=localMs-(represented-guess);
  }
  return new Date(guess).toISOString();
}
function localDate(atIso:string,timeZone:string){const p=zonedParts(new Date(atIso),timeZone);return `${p.year}-${pad(p.month)}-${pad(p.day)}`}
function localMinute(atIso:string,timeZone:string){const p=zonedParts(new Date(atIso),timeZone);return p.hour*60+p.minute}
export function shiftNetHours(startsAt:string,endsAt:string,breakMinutes=0){return Math.max(0,(new Date(endsAt).getTime()-new Date(startsAt).getTime())/3600000-num(breakMinutes)/60)}
function overlaps(aStart:string,aEnd:string,bStart:string,bEnd:string){return new Date(aStart)<new Date(bEnd)&&new Date(aEnd)>new Date(bStart)}
function covers(shift:ExistingShift,slot:Slot){return shift.role_id===slot.requirement.role_id&&shift.employee_id!==null&&ACTIVE_STATUSES.has(shift.status)&&new Date(shift.starts_at)<=new Date(slot.starts_at)&&new Date(shift.ends_at)>=new Date(slot.ends_at)}
function inRange(day:string,start:string,end:string){return day>=start&&day<=end}
function profileFor(input:GenerateScheduleInput,id:string):ScheduleProfile{
  return input.profiles.find(p=>p.employee_id===id)??{employee_id:id,min_weekly_hours:0,target_weekly_hours:null,max_weekly_hours:null,max_shift_hours:12,min_rest_hours:8,max_consecutive_days:6,hourly_rate:null,avoid_overtime:true,preferred_days_off:[],preferred_start:null,preferred_end:null};
}
function assignmentSet(input:GenerateScheduleInput){return new Set(input.roleAssignments.map(a=>`${a.employee_id}:${a.role_id}`))}
function preservedExisting(input:GenerateScheduleInput){
  return input.existingShifts.filter(s=>ACTIVE_STATUSES.has(s.status)&&s.employee_id&&!(s.source==='auto'&&!s.is_locked&&s.schedule_period_id===input.period.id));
}
function assignedFromExisting(input:GenerateScheduleInput):Assigned[]{
  return preservedExisting(input).map(s=>({employee_id:s.employee_id!,starts_at:s.starts_at,ends_at:s.ends_at,hours:shiftNetHours(s.starts_at,s.ends_at,s.break_minutes),date:localDate(s.starts_at,input.settings.timezone),shift_type:'other',role_id:s.role_id||''}));
}
function hoursInPeriod(assignments:Assigned[],employeeId:string,input:GenerateScheduleInput){return assignments.filter(a=>a.employee_id===employeeId&&inRange(a.date,input.period.starts_on,input.period.ends_on)).reduce((n,a)=>n+a.hours,0)}
function consecutiveDaysIfAdded(assignments:Assigned[],employeeId:string,date:string){
  const days=new Set(assignments.filter(a=>a.employee_id===employeeId).map(a=>a.date));days.add(date);
  let count=1,d=date;while(days.has(addDateDays(d,-1))){count++;d=addDateDays(d,-1)}d=date;while(days.has(addDateDays(d,1))){count++;d=addDateDays(d,1)}return count;
}
function staticEligibilityReasons(employee:ScheduleEmployee,slot:Slot,input:GenerateScheduleInput,qualified:Set<string>){
  const reasons:string[]=[];
  if(!employee.active)reasons.push('inactive');
  if(!qualified.has(`${employee.id}:${slot.requirement.role_id}`))reasons.push('not_qualified');
  const approved=input.timeOff.some(o=>o.employee_id===employee.id&&o.status==='approved'&&inRange(slot.date,o.starts_on,o.ends_on));if(approved)reasons.push('approved_time_off');
  const av=input.availability.find(a=>a.employee_id===employee.id&&a.day_of_week===slot.requirement.day_of_week);
  if(av){
    if(av.unavailable)reasons.push('unavailable');
    else {const from=timeMinutes(av.available_from),to=timeMinutes(av.available_to),st=timeMinutes(slot.requirement.starts_at),en=timeMinutes(slot.requirement.ends_at);if(from===null||to===null||st===null||en===null||st<from||en>to)reasons.push('outside_availability')}
  }
  const p=profileFor(input,employee.id);if(slot.hours>p.max_shift_hours+1e-6)reasons.push('max_shift_hours');
  return reasons;
}
function checkCandidate(employee:ScheduleEmployee,slot:Slot,assignments:Assigned[],input:GenerateScheduleInput,qualified:Set<string>):CandidateCheck{
  const reasons=staticEligibilityReasons(employee,slot,input,qualified);const p=profileFor(input,employee.id);
  for(const a of assignments.filter(x=>x.employee_id===employee.id)){
    if(overlaps(slot.starts_at,slot.ends_at,a.starts_at,a.ends_at)){reasons.push('overlap');break}
    if(p.min_rest_hours>0){const before=(new Date(slot.starts_at).getTime()-new Date(a.ends_at).getTime())/3600000;const after=(new Date(a.starts_at).getTime()-new Date(slot.ends_at).getTime())/3600000;if((before>=0&&before<p.min_rest_hours)||(after>=0&&after<p.min_rest_hours)){reasons.push('min_rest');break}}
  }
  const h=hoursInPeriod(assignments,employee.id,input);if(p.max_weekly_hours!==null&&h+slot.hours>p.max_weekly_hours+1e-6)reasons.push('max_weekly_hours');
  if(consecutiveDaysIfAdded(assignments,employee.id,slot.date)>p.max_consecutive_days)reasons.push('max_consecutive_days');
  const pending=input.timeOff.some(o=>o.employee_id===employee.id&&o.status==='pending'&&inRange(slot.date,o.starts_on,o.ends_on));
  let softPenalty=0;if(pending)softPenalty+=80;if(p.preferred_days_off.includes(slot.requirement.day_of_week))softPenalty+=24;
  const prefStart=timeMinutes(p.preferred_start),prefEnd=timeMinutes(p.preferred_end),st=timeMinutes(slot.requirement.starts_at)!,en=timeMinutes(slot.requirement.ends_at)!;
  if(prefStart!==null&&st<prefStart)softPenalty+=8;if(prefEnd!==null&&en>prefEnd)softPenalty+=8;
  return {ok:reasons.length===0,reasons:[...new Set(reasons)],pendingTimeOff:pending,softPenalty};
}
function baselineEligibleCount(slot:Slot,input:GenerateScheduleInput,qualified:Set<string>){return input.employees.filter(e=>staticEligibilityReasons(e,slot,input,qualified).length===0).length}
function candidateScore(employee:ScheduleEmployee,slot:Slot,assignments:Assigned[],input:GenerateScheduleInput,check:CandidateCheck,fairShare:number){
  const p=profileFor(input,employee.id),hours=hoursInPeriod(assignments,employee.id,input),after=hours+slot.hours,target=p.target_weekly_hours;
  const loadBase=Math.max(1,target??fairShare??1);let score=(hours/loadBase)*35+check.softPenalty;
  if(target!==null){if(after>target)score+=(after-target)*4;else score-=(Math.min(after,target)-Math.min(hours,target))*0.6}
  const ot=input.settings.overtime_after_hours;if(p.avoid_overtime&&after>ot)score+=(after-Math.max(hours,ot))*18;
  const sameType=assignments.filter(a=>a.employee_id===employee.id&&a.shift_type===slot.requirement.shift_type&&slot.requirement.shift_type!=='other').length;score+=sameType*2.5;
  if([0,6].includes(slot.requirement.day_of_week))score+=assignments.filter(a=>a.employee_id===employee.id&&[0,6].includes(dateDayOfWeek(a.date))).length*1.5;
  return score;
}
function buildSlots(input:GenerateScheduleInput){
  const slots:Slot[]=[];const existing=preservedExisting(input);let ordinal=0;
  for(let d=input.period.starts_on;d<=input.period.ends_on;d=addDateDays(d,1)){
    const dow=dateDayOfWeek(d);
    for(const r of input.requirements.filter(x=>x.active&&x.day_of_week===dow&&(!x.effective_from||x.effective_from<=d)&&(!x.effective_to||x.effective_to>=d))){
      const desired=input.settings.mode==='minimum'?r.min_staff:r.target_staff;
      if(desired<=0)continue;
      const base:Slot={key:`${d}:${r.id}`,date:d,requirement:r,starts_at:zonedLocalToIso(d,r.starts_at,input.settings.timezone),ends_at:zonedLocalToIso(d,r.ends_at,input.settings.timezone),hours:0,ordinal:ordinal++};
      base.hours=shiftNetHours(base.starts_at,base.ends_at,r.break_minutes);
      const already=existing.filter(s=>covers(s,base)).length;
      for(let i=already;i<desired;i++)slots.push({...base,key:`${base.key}:${i}`});
    }
  }
  return slots;
}
function failureDetails(slot:Slot,input:GenerateScheduleInput,qualified:Set<string>){
  const counts:Record<string,number>={};for(const e of input.employees){for(const r of staticEligibilityReasons(e,slot,input,qualified))counts[r]=(counts[r]||0)+1}return counts;
}
function calculateMetrics(shifts:GeneratedShift[],assignments:Assigned[],input:GenerateScheduleInput,requestedSlots:number):ScheduleMetrics{
  const generatedAssigned=shifts.filter(s=>s.employee_id);const open=shifts.length-generatedAssigned.length;
  const generatedHours=generatedAssigned.reduce((n,s)=>n+shiftNetHours(s.starts_at,s.ends_at,s.break_minutes),0);
  const employees=new Set(generatedAssigned.map(s=>s.employee_id!));let overtime=0,cost=0;const loads:number[]=[];
  for(const e of input.employees.filter(x=>x.active)){
    const h=hoursInPeriod(assignments,e.id,input),p=profileFor(input,e.id),ot=Math.max(0,h-input.settings.overtime_after_hours);overtime+=ot;loads.push(h);
    if(p.hourly_rate!==null)cost+=Math.min(h,input.settings.overtime_after_hours)*p.hourly_rate+ot*p.hourly_rate*1.5;
  }
  const mean=loads.length?loads.reduce((a,b)=>a+b,0)/loads.length:0;const deviation=loads.length?Math.sqrt(loads.reduce((n,h)=>n+(h-mean)**2,0)/loads.length):0;
  return {requested_slots:requestedSlots,assigned_slots:generatedAssigned.length,open_slots:open,coverage_rate:requestedSlots?round2((requestedSlots-open)/requestedSlots*100):100,scheduled_hours:round2(generatedHours),projected_labor_cost:round2(cost),projected_overtime_hours:round2(overtime),employees_scheduled:employees.size,fairness_deviation:round2(deviation)};
}
function runOrder(slots:Slot[],input:GenerateScheduleInput,order:'constrained'|'priority'|'chronological'):Run{
  const qualified=assignmentSet(input),assignments=assignedFromExisting(input),shifts:GeneratedShift[]=[],issues:ScheduleIssue[]=[];
  const totalDemand=slots.reduce((n,s)=>n+s.hours,0),active=Math.max(1,input.employees.filter(e=>e.active).length),fairShare=totalDemand/active;
  const sorted=[...slots].sort((a,b)=>{
    if(order==='constrained'){const ec=baselineEligibleCount(a,input,qualified)-baselineEligibleCount(b,input,qualified);if(ec)return ec}
    if(order!=='chronological'){const p=b.requirement.priority-a.requirement.priority;if(p)return p}
    const t=a.starts_at.localeCompare(b.starts_at);if(t)return t;return a.ordinal-b.ordinal;
  });
  let softTotal=0;
  for(const slot of sorted){
    const candidates=input.employees.map(employee=>({employee,check:checkCandidate(employee,slot,assignments,input,qualified)})).filter(x=>x.check.ok)
      .map(x=>({...x,score:candidateScore(x.employee,slot,assignments,input,x.check,fairShare)})).sort((a,b)=>a.score-b.score||a.employee.full_name.localeCompare(b.employee.full_name)||a.employee.id.localeCompare(b.employee.id));
    const chosen=candidates[0];
    if(!chosen){
      shifts.push({employee_id:null,role_id:slot.requirement.role_id,starts_at:slot.starts_at,ends_at:slot.ends_at,break_minutes:slot.requirement.break_minutes,coverage_requirement_id:slot.requirement.id,notes:`Auto-scheduler could not fill ${slot.requirement.name}.`});
      issues.push({severity:'error',code:'unfilled_coverage',message:`No eligible employee could fill ${slot.requirement.name} on ${slot.date}.`,date:slot.date,requirement_id:slot.requirement.id,details:{eligibility_blocks:failureDetails(slot,input,qualified)}});continue;
    }
    const e=chosen.employee,p=profileFor(input,e.id),before=hoursInPeriod(assignments,e.id,input),after=before+slot.hours;
    assignments.push({employee_id:e.id,starts_at:slot.starts_at,ends_at:slot.ends_at,hours:slot.hours,date:slot.date,shift_type:slot.requirement.shift_type,role_id:slot.requirement.role_id});softTotal+=chosen.score;
    const reason=`Auto-scheduled for ${slot.requirement.name}; qualified and available, projected ${round2(after)} hrs this week.`;
    shifts.push({employee_id:e.id,role_id:slot.requirement.role_id,starts_at:slot.starts_at,ends_at:slot.ends_at,break_minutes:slot.requirement.break_minutes,coverage_requirement_id:slot.requirement.id,notes:reason});
    if(chosen.check.pendingTimeOff)issues.push({severity:'warning',code:'pending_time_off',message:`${e.full_name} has pending time off overlapping this shift.`,date:slot.date,requirement_id:slot.requirement.id,employee_id:e.id});
    if(p.avoid_overtime&&before<=input.settings.overtime_after_hours&&after>input.settings.overtime_after_hours)issues.push({severity:'warning',code:'overtime_risk',message:`${e.full_name} crosses the overtime threshold in this draft.`,date:slot.date,employee_id:e.id,details:{projected_hours:round2(after)}});
  }
  const metrics=calculateMetrics(shifts,assignments,input,slots.length);const objective=metrics.open_slots*100000+metrics.projected_overtime_hours*1000+metrics.fairness_deviation*20+softTotal;
  return {shifts,issues,metrics,objective};
}
export function generateSchedule(input:GenerateScheduleInput):ScheduleGenerationResult{
  if(input.period.status!=='draft')throw new Error('Auto-scheduling requires a draft schedule period.');
  if(input.period.ends_on!==addDateDays(input.period.starts_on,6))throw new Error('Schedule period must be exactly seven days.');
  if(!input.settings.timezone)throw new Error('A restaurant timezone is required.');
  const slots=buildSlots(input);
  const strategies=(['constrained','priority','chronological'] as const).map(order=>runOrder(slots,input,order));
  strategies.sort((a,b)=>a.objective-b.objective||a.metrics.open_slots-b.metrics.open_slots);
  const best=strategies[0];
  const issues=[...best.issues];
  if(!input.requirements.some(r=>r.active))issues.unshift({severity:'error',code:'no_coverage_requirements',message:'No active coverage requirements are configured, so there is nothing to auto-schedule.'});
  if(!input.employees.some(e=>e.active))issues.unshift({severity:'error',code:'no_active_employees',message:'No active employees are available for scheduling.'});
  const qualified=assignmentSet(input);if(input.employees.some(e=>e.active)&&qualified.size===0)issues.unshift({severity:'error',code:'no_role_qualifications',message:'Employees need role qualifications before the auto-scheduler can assign them.'});
  return {algorithm_version:'v2.1',shifts:best.shifts,issues,metrics:best.metrics,objective_score:round2(best.objective)};
}

export function scheduleEmployeeSummary(input:GenerateScheduleInput,result:ScheduleGenerationResult){
  const existing=assignedFromExisting(input);const generated=result.shifts.filter(s=>s.employee_id).map(s=>({employee_id:s.employee_id!,starts_at:s.starts_at,ends_at:s.ends_at,hours:shiftNetHours(s.starts_at,s.ends_at,s.break_minutes),date:localDate(s.starts_at,input.settings.timezone),shift_type:'other' as const,role_id:s.role_id}));
  const all=[...existing,...generated];return input.employees.filter(e=>e.active).map(e=>{const p=profileFor(input,e.id),hours=round2(hoursInPeriod(all,e.id,input));return {employee_id:e.id,full_name:e.full_name,hours,target:p.target_weekly_hours,max:p.max_weekly_hours,overtime:round2(Math.max(0,hours-input.settings.overtime_after_hours))}}).sort((a,b)=>a.full_name.localeCompare(b.full_name));
}
