import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
const root=process.cwd();const read=(p:string)=>fs.readFileSync(path.join(root,p),'utf8');

test('schedule views localization remains read-only over shifts and events',()=>{const src=read('app/schedule/views/page.tsx');assert.match(src,/useI18n/);assert.match(src,/schedule_shifts/);assert.match(src,/calendar_events/);assert.match(src,/\.neq\('status','cancelled'\)/);assert.doesNotMatch(src,/\.insert\(/);assert.doesNotMatch(src,/\.update\(/);assert.doesNotMatch(src,/\.delete\(/);assert.match(src,/s\.notes/);assert.match(src,/ev\.title/);assert.match(src,/ev\.description/)});

test('publish localization preserves authoritative publishing and notification contracts',()=>{const src=read('app/schedule/publish/page.tsx');assert.match(src,/useI18n/);for(const mode of ['everyone','changed_only','none'])assert.match(src,new RegExp(`value="${mode}"`));for(const dept of ['foh','boh','management','other'])assert.match(src,new RegExp(`id:'${dept}'`));assert.match(src,/publish_schedule_department/);assert.match(src,/p_expected_period_revision:period\.revision/);assert.match(src,/p_override_reason:over/);assert.match(src,/p_notification_mode:mode/);assert.match(src,/reopen_schedule_department/);assert.match(src,/publish_schedule_period_with_notifications/);assert.match(src,/p_expected_revision:period\.revision/);assert.match(src,/reopen_schedule_period/);assert.match(src,/schedule_department_validation/);assert.match(src,/schedule_period_validation/)});
