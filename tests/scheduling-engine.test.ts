import test from 'node:test';
import assert from 'node:assert/strict';
import {addDateDays,dateDayOfWeek,generateSchedule,GenerateScheduleInput,scheduleEmployeeSummary,zonedLocalToIso} from '../lib/scheduling-engine';

const period={id:'period',starts_on:'2026-08-17',ends_on:'2026-08-23',revision:0,status:'draft'};
const role={id:'server',name:'Server'};
const employees=[{id:'a',full_name:'Alex',active:true},{id:'b',full_name:'Blair',active:true}];
const assignments=[{employee_id:'a',role_id:'server'},{employee_id:'b',role_id:'server'}];
const profile=(id:string,overrides:Record<string,unknown>={})=>({employee_id:id,min_weekly_hours:0,target_weekly_hours:32,max_weekly_hours:40,max_shift_hours:12,min_rest_hours:8,max_consecutive_days:6,hourly_rate:15,avoid_overtime:true,preferred_days_off:[],preferred_start:null,preferred_end:null,...overrides}) as any;
const req=(day:number,overrides:Record<string,unknown>={})=>({id:`r${day}-${String(overrides.name||'x')}`,name:String(overrides.name||'Server coverage'),day_of_week:day,role_id:'server',starts_at:'10:00:00',ends_at:'16:00:00',min_staff:1,target_staff:1,max_staff:null,break_minutes:0,priority:50,shift_type:'mid' as const,active:true,effective_from:null,effective_to:null,...overrides}) as any;
function base(overrides:Partial<GenerateScheduleInput>={}):GenerateScheduleInput{return {period,employees,roles:[role],roleAssignments:assignments,availability:[],timeOff:[],profiles:[profile('a'),profile('b')],requirements:[req(1)],existingShifts:[],settings:{timezone:'America/New_York',overtime_after_hours:40,mode:'target',preserve_manual_shifts:true},...overrides}}

function assignedIds(x:ReturnType<typeof generateSchedule>){return x.shifts.filter(s=>s.employee_id).map(s=>s.employee_id)}

test('date helpers keep restaurant calendar dates stable',()=>{
  assert.equal(addDateDays('2026-08-17',6),'2026-08-23');
  assert.equal(dateDayOfWeek('2026-08-17'),1);
  assert.equal(dateDayOfWeek('2026-08-23'),0);
});

test('timezone conversion honors New York daylight time',()=>{
  assert.equal(zonedLocalToIso('2026-08-17','10:00:00','America/New_York'),'2026-08-17T14:00:00.000Z');
  assert.equal(zonedLocalToIso('2026-12-07','10:00:00','America/New_York'),'2026-12-07T15:00:00.000Z');
});

test('target coverage generates the requested number of shifts',()=>{
  const x=generateSchedule(base({requirements:[req(1,{target_staff:2})]}));
  assert.equal(x.shifts.length,2);assert.equal(x.metrics.assigned_slots,2);assert.equal(x.metrics.open_slots,0);
});

test('minimum mode generates minimum rather than target staffing',()=>{
  const input=base({requirements:[req(1,{min_staff:1,target_staff:2})]});input.settings={...input.settings,mode:'minimum'};
  assert.equal(generateSchedule(input).shifts.length,1);
});

test('approved time off is a hard scheduling constraint',()=>{
  const input=base({employees:[employees[0]],roleAssignments:[assignments[0]],profiles:[profile('a')],timeOff:[{employee_id:'a',starts_on:'2026-08-17',ends_on:'2026-08-17',status:'approved'}]});
  const x=generateSchedule(input);assert.equal(x.metrics.open_slots,1);assert.ok(x.issues.some(i=>i.code==='unfilled_coverage'));
});

test('recurring unavailable day is a hard constraint',()=>{
  const input=base({employees:[employees[0]],roleAssignments:[assignments[0]],profiles:[profile('a')],availability:[{employee_id:'a',day_of_week:1,available_from:null,available_to:null,unavailable:true}]});
  assert.equal(generateSchedule(input).metrics.open_slots,1);
});

test('availability windows prevent shifts outside employee hours',()=>{
  const input=base({employees:[employees[0]],roleAssignments:[assignments[0]],profiles:[profile('a')],availability:[{employee_id:'a',day_of_week:1,available_from:'12:00:00',available_to:'18:00:00',unavailable:false}]});
  const x=generateSchedule(input);assert.equal(x.metrics.open_slots,1);assert.equal((x.issues.find(i=>i.code==='unfilled_coverage')?.details?.eligibility_blocks as any).outside_availability,1);
});

test('employees cannot be assigned to roles they are not qualified for',()=>{
  const input=base({employees:[employees[0]],roleAssignments:[],profiles:[profile('a')]});const x=generateSchedule(input);
  assert.equal(x.metrics.open_slots,1);assert.ok(x.issues.some(i=>i.code==='no_role_qualifications'));
});

test('manual or locked existing coverage is preserved and not duplicated',()=>{
  const input=base({existingShifts:[{id:'manual',employee_id:'a',role_id:'server',starts_at:'2026-08-17T14:00:00.000Z',ends_at:'2026-08-17T20:00:00.000Z',break_minutes:0,status:'scheduled',source:'manual',is_locked:false,schedule_period_id:'period'}]});
  const x=generateSchedule(input);assert.equal(x.metrics.requested_slots,0);assert.equal(x.shifts.length,0);
});

test('replaceable unlocked auto shifts do not count as preserved coverage',()=>{
  const input=base({existingShifts:[{id:'old-auto',employee_id:'a',role_id:'server',starts_at:'2026-08-17T14:00:00.000Z',ends_at:'2026-08-17T20:00:00.000Z',break_minutes:0,status:'scheduled',source:'auto',is_locked:false,schedule_period_id:'period'}]});
  assert.equal(generateSchedule(input).shifts.length,1);
});

test('locked auto shifts remain part of the draft',()=>{
  const input=base({existingShifts:[{id:'locked-auto',employee_id:'a',role_id:'server',starts_at:'2026-08-17T14:00:00.000Z',ends_at:'2026-08-17T20:00:00.000Z',break_minutes:0,status:'scheduled',source:'auto',is_locked:true,schedule_period_id:'period'}]});
  assert.equal(generateSchedule(input).shifts.length,0);
});

test('maximum weekly hours are never exceeded',()=>{
  const input=base({employees:[employees[0]],roleAssignments:[assignments[0]],profiles:[profile('a',{max_weekly_hours:8,target_weekly_hours:8})],requirements:[req(1),req(2)]});
  const x=generateSchedule(input);assert.equal(x.metrics.assigned_slots,1);assert.equal(x.metrics.open_slots,1);
});

test('maximum shift duration is enforced before scoring',()=>{
  const input=base({employees:[employees[0]],roleAssignments:[assignments[0]],profiles:[profile('a',{max_shift_hours:4})]});
  assert.equal(generateSchedule(input).metrics.open_slots,1);
});

test('minimum rest prevents unsafe back-to-back assignments',()=>{
  const input=base({employees:[employees[0]],roleAssignments:[assignments[0]],profiles:[profile('a',{min_rest_hours:8,max_weekly_hours:40})],requirements:[req(1,{id:'am',starts_at:'10:00:00',ends_at:'14:00:00'}),req(1,{id:'pm',starts_at:'15:00:00',ends_at:'19:00:00'})]});
  const x=generateSchedule(input);assert.equal(x.metrics.assigned_slots,1);assert.equal(x.metrics.open_slots,1);
});

test('existing adjacent shifts participate in rest checks',()=>{
  const input=base({employees:[employees[0]],roleAssignments:[assignments[0]],profiles:[profile('a',{min_rest_hours:10})],existingShifts:[{id:'prior',employee_id:'a',role_id:'server',starts_at:'2026-08-17T04:00:00.000Z',ends_at:'2026-08-17T12:00:00.000Z',break_minutes:0,status:'scheduled',source:'manual'}]});
  assert.equal(generateSchedule(input).metrics.open_slots,1);
});

test('maximum consecutive days is enforced',()=>{
  const seven=[1,2,3,4,5,6,0].map((d,i)=>req(d,{id:`r${i}`,name:`Day ${i}`}));
  const input=base({employees:[employees[0]],roleAssignments:[assignments[0]],profiles:[profile('a',{max_consecutive_days:6,max_weekly_hours:60,target_weekly_hours:50})],requirements:seven});
  const x=generateSchedule(input);assert.equal(x.metrics.assigned_slots,6);assert.equal(x.metrics.open_slots,1);
});

test('pending time off is avoided when another qualified employee exists',()=>{
  const input=base({timeOff:[{employee_id:'a',starts_on:'2026-08-17',ends_on:'2026-08-17',status:'pending'}]});
  assert.deepEqual(assignedIds(generateSchedule(input)),['b']);
});

test('pending time off remains a warning rather than silently causing undercoverage',()=>{
  const input=base({employees:[employees[0]],roleAssignments:[assignments[0]],profiles:[profile('a')],timeOff:[{employee_id:'a',starts_on:'2026-08-17',ends_on:'2026-08-17',status:'pending'}]});
  const x=generateSchedule(input);assert.equal(x.metrics.assigned_slots,1);assert.ok(x.issues.some(i=>i.code==='pending_time_off'));
});

test('preferred day off is a soft preference',()=>{
  const input=base({profiles:[profile('a',{preferred_days_off:[1]}),profile('b')]});
  assert.deepEqual(assignedIds(generateSchedule(input)),['b']);
});

test('scheduler balances hours across qualified employees',()=>{
  const requirements=[req(1),req(2),req(3),req(4)];const x=generateSchedule(base({requirements}));
  const ids=assignedIds(x),a=ids.filter(id=>id==='a').length,b=ids.filter(id=>id==='b').length;assert.ok(Math.abs(a-b)<=1);
});

test('overtime risk is avoided when a lower-load qualified employee is available',()=>{
  const input=base({existingShifts:[{id:'a-heavy',employee_id:'a',role_id:'server',starts_at:'2026-08-18T12:00:00.000Z',ends_at:'2026-08-20T03:00:00.000Z',break_minutes:0,status:'scheduled',source:'manual'}]});
  // The intentionally broad existing interval gives A a very high load and overlaps only later dates; Monday remains free.
  const x=generateSchedule(input);assert.deepEqual(assignedIds(x),['b']);
});

test('effective coverage dates are respected',()=>{
  const x=generateSchedule(base({requirements:[req(1,{effective_from:'2026-08-18'})]}));assert.equal(x.shifts.length,0);
});

test('inactive employees are excluded',()=>{
  const input=base({employees:[{...employees[0],active:false},employees[1]]});assert.deepEqual(assignedIds(generateSchedule(input)),['b']);
});

test('no active employees produces an explicit issue instead of a fake success',()=>{
  const input=base({employees:employees.map(e=>({...e,active:false}))});const x=generateSchedule(input);assert.ok(x.issues.some(i=>i.code==='no_active_employees'));assert.equal(x.metrics.open_slots,1);
});

test('no coverage configuration is reported explicitly',()=>{
  const x=generateSchedule(base({requirements:[]}));assert.ok(x.issues.some(i=>i.code==='no_coverage_requirements'));assert.equal(x.shifts.length,0);
});

test('schedule generation is deterministic',()=>{
  const input=base({requirements:[req(1),req(2),req(3)]});assert.deepEqual(generateSchedule(input),generateSchedule(input));
});

test('employee summary exposes target, max, hours and overtime for manager review',()=>{
  const input=base({requirements:[req(1),req(2)]});const result=generateSchedule(input),summary=scheduleEmployeeSummary(input,result);
  assert.equal(summary.length,2);assert.ok(summary.every(x=>'hours' in x&&'target' in x&&'max' in x&&'overtime' in x));
});

test('published periods cannot be regenerated in the browser engine',()=>{
  assert.throws(()=>generateSchedule(base({period:{...period,status:'published'}})),/draft/);
});

test('malformed non-seven-day periods are rejected',()=>{
  assert.throws(()=>generateSchedule(base({period:{...period,ends_on:'2026-08-22'}})),/seven days/);
});
