import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
const root=process.cwd();const read=(p:string)=>fs.readFileSync(path.join(root,p),'utf8');

test('attendance localization preserves raw flag and audit contracts',()=>{const src=read('app/schedule/attendance/page.tsx');assert.match(src,/useI18n/);assert.match(src,/record_schedule_attendance_flag/);assert.match(src,/p_shift_id:shift\.id/);assert.match(src,/p_flag_key:key/);assert.match(src,/p_note:note\.trim\(\)\|\|null/);assert.match(src,/remove_schedule_attendance_flag/);assert.match(src,/p_flag_id:id/);assert.match(src,/upsert_schedule_attendance_flag_type/);assert.match(src,/p_flag_key:key/);assert.match(src,/p_label:newType\.label\.trim\(\)/);assert.match(src,/p_active:true/);assert.match(src,/t\?\.system_type/)});

test('feedback localization preserves ratings and authored comment contracts',()=>{const src=read('app/schedule/feedback/page.tsx');assert.match(src,/useI18n/);assert.match(src,/submit_shift_feedback/);assert.match(src,/p_shift_id:selected/);assert.match(src,/p_overall_rating:form\.overall/);assert.match(src,/p_workload_rating:form\.workload/);assert.match(src,/p_staffing_rating:form\.staffing/);assert.match(src,/p_comment:form\.comment\.trim\(\)\|\|null/);assert.match(src,/review_shift_feedback/);assert.match(src,/p_feedback_id:id/);assert.match(src,/p_manager_note:note/);assert.match(src,/f\.comment/);assert.match(src,/f\.manager_note/)});
