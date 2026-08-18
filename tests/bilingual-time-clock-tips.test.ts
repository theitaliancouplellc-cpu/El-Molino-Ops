import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const root=process.cwd();
const read=(file:string)=>fs.readFileSync(path.join(root,file),'utf8');

test('time clock localization preserves payroll RPC contracts and authored values',()=>{
 const src=read('app/time-clock/page.tsx');
 assert.match(src,/useI18n/);
 assert.match(src,/Reloj/);
 assert.match(src,/Períodos de pago y salarios/);
 for(const rpc of ['time_clock_employee_id_for_user','clock_in','clock_out','start_time_clock_break','end_time_clock_break','employee_attest_time_clock_punch','set_time_clock_pin','manager_approve_time_clock_punch','manager_upsert_time_clock_punch','manager_approve_all_time_clock_punches','close_time_clock_pay_period','reopen_time_clock_pay_period','time_clock_worked_hours_wages'])assert.ok(src.includes(`'${rpc}'`),`missing ${rpc}`);
 assert.match(src,/p_note:p\.note/);
 assert.match(src,/p_note:manual\.note\.trim\(\)\|\|null/);
 assert.match(src,/p_reason:reason\.trim\(\)/);
 assert.match(src,/p_reason:manual\.reason\.trim\(\)/);
});

test('tip localization preserves distribution RPC contracts and authored values',()=>{
 const src=read('app/tips/page.tsx');
 assert.match(src,/useI18n/);
 assert.match(src,/Fondos de Propinas/);
 assert.match(src,/Vista previa de distribución/);
 for(const rpc of ['my_tip_report','tip_pool_report','upsert_tip_pool_receiver','remove_tip_pool_receiver','ensure_tip_pool_run','add_tip_contribution','remove_tip_contribution','generate_tip_distributions','finalize_tip_pool_run','cancel_tip_pool_run'])assert.ok(src.includes(`'${rpc}'`),`missing ${rpc}`);
 assert.match(src,/name:poolForm\.name\.trim\(\)\.slice\(0,120\)/);
 assert.match(src,/description:poolForm\.description\.trim\(\)\.slice\(0,2000\)\|\|null/);
 assert.match(src,/p_target_id:receiver\.target/);
 assert.match(src,/p_note:contribution\.note\.trim\(\)\|\|null/);
});
