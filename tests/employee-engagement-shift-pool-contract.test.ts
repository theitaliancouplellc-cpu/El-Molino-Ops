import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const home=readFileSync('app/employee/page.tsx','utf8');
const schedule=readFileSync('app/employee/schedule/page.tsx','utf8');
const pool=readFileSync('app/employee/shift-pool/page.tsx','utf8');
const legacy=readFileSync('app/schedule/pool/layout.tsx','utf8');
const snapshot=readFileSync('docs/database/employee_engagement_shift_pool_v5.sql','utf8');
const eligibility=readFileSync('docs/database/employee_shift_pool_eligibility_v5_1.sql','utf8');
const changes=readFileSync('docs/database/employee_shift_change_workflow_v5_2.sql','utf8');

test('employee Home uses authoritative priority and Shift Pool snapshots',()=>{
 assert.match(home,/employee_home_priority_snapshot/);
 assert.match(home,/employee_shift_pool_snapshot/);
 assert.match(home,/required_acknowledgments/);
 assert.match(home,/training_overdue/);
 assert.match(home,/unread_messages/);
 assert.match(home,/notes/);
 assert.match(home,/break_minutes/);
 for(const href of ['/employee/requests','/employee/shift-pool','/employee/team','/employee/training'])assert.match(home,new RegExp(href.replaceAll('/','\\/')));
 assert.doesNotMatch(home,/from\('time_off_requests'\)/);
 assert.doesNotMatch(home,/from\('availability_change_requests'\)/);
 assert.doesNotMatch(home,/from\('shift_pool_offers'\)/);
 assert.doesNotMatch(home,/from\('team_announcement_recipients'\)/);
});

test('employee Shift Pool contains no manager review surface or protected-table reads',()=>{
 assert.match(pool,/employee_shift_pool_snapshot/);
 assert.match(pool,/bid_on_shift_pool_offer/);
 assert.match(pool,/claim_open_shift/);
 assert.match(pool,/withdraw_my_shift_pool_offer/);
 assert.match(pool,/withdraw_my_shift_pool_bid/);
 assert.match(pool,/respond_to_my_shift_trade/);
 assert.match(pool,/cancel_my_shift_change_request/);
 assert.match(pool,/You keep responsibility for any shift you offer until reassignment is approved/);
 for(const forbidden of ['review_shift_pool_bid','review_shift_claim','review_shift_change_request'])assert.doesNotMatch(pool,new RegExp(forbidden));
 for(const table of ['shift_pool_offers','shift_pool_bids','shift_claims','shift_change_requests'])assert.doesNotMatch(pool,new RegExp(`from\\('${table}'\\)`));
 assert.match(legacy,/app_role==='employee'/);
 assert.match(legacy,/employee\/shift-pool/);
});

test('employee schedule submits coverage and reciprocal trades through authoritative RPCs',()=>{
 assert.match(schedule,/submit_my_shift_change_request/);
 assert.match(schedule,/Trade sent to your coworker for acceptance/);
 assert.match(schedule,/coworker accepts first/);
 assert.doesNotMatch(schedule,/from\('shift_change_requests'\)\.insert/);
 for(const href of ['/employee/shift-pool','/employee/requests','/employee/team'])assert.match(schedule,new RegExp(href.replaceAll('/','\\/')));
 assert.match(changes,/revoke insert,update,delete on public\.shift_change_requests from authenticated/);
});

test('reciprocal trade state machine requires coworker acceptance before manager review',()=>{
 assert.match(changes,/target_response text not null default 'not_required'/);
 assert.match(changes,/target_response in\('not_required','pending','accepted','declined'\)/);
 assert.match(changes,/respond_to_my_shift_trade/);
 assert.match(changes,/coworker must accept the trade before manager review/);
 assert.match(changes,/target employee is no longer qualified for source role/);
 assert.match(changes,/requester is no longer qualified for target role/);
 assert.match(changes,/trade now conflicts with approved time off/);
 assert.match(changes,/trade now conflicts with another shift/);
 assert.match(pool,/Your response needed/);
 assert.match(pool,/Accept/);
 assert.match(pool,/Decline/);
});

test('Shift Pool snapshot is current-employee scoped and precomputes pickup warnings',()=>{
 assert.match(snapshot,/current_schedule_employee_id/);
 assert.match(snapshot,/can_view_shift_pool_offer/);
 assert.match(snapshot,/q\.requested_by_employee_id=eid or q\.target_employee_id=eid/);
 assert.match(snapshot,/shift_pool_candidate_warnings\(o\.id,eid\)/);
 assert.match(eligibility,/open_shift_candidate_warnings\(s\.id,eid\)/);
});

test('pickup eligibility covers role, overlap, time off, availability, rest and hour limits',()=>{
 for(const code of ['role','overlap','time_off','availability','max_shift','rest','max_hours','overtime'])assert.match(eligibility,new RegExp(`'${code}'`));
 assert.match(eligibility,/this shift conflicts with your schedule, availability, time off, role, rest, or hour limits/);
 assert.match(eligibility,/claim can no longer be approved because the employee now conflicts with this shift/);
});

test('priority snapshot counts read-but-unacknowledged required announcements',()=>{
 assert.match(snapshot,/count\(\*\) filter\(where a\.requires_acknowledgment and r\.acknowledged_at is null\)/);
 assert.match(snapshot,/when required_ack>0 then 'announcement_ack'/);
});
