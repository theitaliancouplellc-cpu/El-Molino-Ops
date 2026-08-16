import test from 'node:test';
import assert from 'node:assert/strict';
import {generateSchedule,type GenerateScheduleInput} from '../lib/scheduling-engine';

const period={id:'p',starts_on:'2026-08-17',ends_on:'2026-08-23',revision:0,status:'draft'};
const employee={id:'e',full_name:'E',active:true};
const req=(overrides:any={})=>({id:'r',name:'Server',day_of_week:1,role_id:'server',starts_at:'10:30:00',ends_at:'14:30:00',min_staff:1,target_staff:1,max_staff:1,break_minutes:0,priority:50,shift_type:'opening' as const,active:true,effective_from:null,effective_to:null,required_skill_level:1,...overrides});
const input=(overrides:Partial<GenerateScheduleInput>={}):GenerateScheduleInput=>({period,employees:[employee],roles:[{id:'server',name:'Server'}],roleAssignments:[{employee_id:'e',role_id:'server',skill_level:1}],availability:[],temporaryAvailability:[],timeOff:[],profiles:[{employee_id:'e',min_weekly_hours:0,target_weekly_hours:40,max_weekly_hours:60,max_shift_hours:12,min_rest_hours:8,max_consecutive_days:6,hourly_rate:15,avoid_overtime:true,preferred_days_off:[],preferred_start:null,preferred_end:null,allow_split_shifts:true,min_split_gap_hours:.5}],requirements:[req()],existingShifts:[],settings:{timezone:'America/New_York',overtime_after_hours:40,mode:'target',preserve_manual_shifts:true},...overrides});

test('temporary availability overrides recurring availability for its effective dates',()=>{const x=generateSchedule(input({availability:[{employee_id:'e',day_of_week:1,available_from:'12:00',available_to:'20:00',unavailable:false}],temporaryAvailability:[{employee_id:'e',day_of_week:1,available_from:'10:00',available_to:'22:00',unavailable:false,effective_from:'2026-08-17',effective_to:'2026-08-17'}]}));assert.equal(x.metrics.assigned_slots,1)});

test('coverage skill requirement rejects an employee below the required level',()=>{const x=generateSchedule(input({requirements:[req({required_skill_level:2})]}));assert.equal(x.metrics.open_slots,1);assert.equal((x.issues.find(i=>i.code==='unfilled_coverage')?.details?.eligibility_blocks as any).insufficient_skill,1)});

test('coverage skill requirement accepts a sufficiently skilled employee',()=>{const x=generateSchedule(input({roleAssignments:[{employee_id:'e',role_id:'server',skill_level:3}],requirements:[req({required_skill_level:2})]}));assert.equal(x.metrics.assigned_slots,1)});

test('partial-day approved time off blocks only overlapping shift hours',()=>{const off=[{employee_id:'e',starts_on:'2026-08-17',ends_on:'2026-08-17',status:'approved',full_day:false,starts_at_time:'15:00',ends_at_time:'17:00'}];const morning=generateSchedule(input({timeOff:off,requirements:[req()]}));assert.equal(morning.metrics.assigned_slots,1);const afternoon=generateSchedule(input({timeOff:off,requirements:[req({starts_at:'15:30:00',ends_at:'18:00:00'})]}));assert.equal(afternoon.metrics.open_slots,1)});

test('pending partial-day time off is a soft warning only when hours overlap',()=>{const x=generateSchedule(input({timeOff:[{employee_id:'e',starts_on:'2026-08-17',ends_on:'2026-08-17',status:'pending',full_day:false,starts_at_time:'11:00',ends_at_time:'12:00'}]}));assert.equal(x.metrics.assigned_slots,1);assert.ok(x.issues.some(i=>i.code==='pending_time_off'))});
