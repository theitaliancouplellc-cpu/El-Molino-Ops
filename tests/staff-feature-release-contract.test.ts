import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {STAFF_FEATURES,isStaffNotificationReleased,isStaffRouteReleased,staffRouteFeature} from '../lib/staff-features';

const boundary=readFileSync('app/employee/staff-release-boundary.tsx','utf8');
const layout=readFileSync('app/employee/layout.tsx','utf8');
const staffNav=readFileSync('app/employee/staff-bottom-nav.tsx','utf8');
const mobilePolish=readFileSync('app/employee/mobile-polish.css','utf8');
const more=readFileSync('app/employee/more/page.tsx','utf8');
const notificationCenter=readFileSync('app/employee/notifications/page.tsx','utf8');
const notificationPreferences=readFileSync('app/employee/notifications/preferences/page.tsx','utf8');

test('staff feature release source hides unreleased operational domains',()=>{
  assert.equal(STAFF_FEATURES.training,false);
  assert.equal(STAFF_FEATURES.timeClock,false);
  assert.equal(STAFF_FEATURES.tips,false);
  assert.equal(STAFF_FEATURES.earnings,false);
  assert.equal(STAFF_FEATURES.financialFeatures,false);
  assert.equal(STAFF_FEATURES.toastFeatures,false);
  assert.equal(STAFF_FEATURES.schedule,true);
  assert.equal(STAFF_FEATURES.requests,true);
  assert.equal(STAFF_FEATURES.communications,true);
  assert.equal(STAFF_FEATURES.notifications,true);
});

test('staff route release gate blocks hidden employee-prefixed routes and preserves released routes',()=>{
  for(const route of ['/employee/training','/employee/training/assignment/123','/employee/time-clock','/employee/time-clock/history','/employee/tips']){
    assert.equal(isStaffRouteReleased(route),false,route);
  }
  for(const route of ['/employee','/employee/schedule','/employee/requests','/employee/shift-pool','/employee/team','/employee/notifications','/employee/more']){
    assert.equal(isStaffRouteReleased(route),true,route);
  }
  assert.equal(staffRouteFeature('/employee/training'),'training');
  assert.equal(staffRouteFeature('/employee/time-clock'),'timeClock');
  assert.equal(staffRouteFeature('/employee/tips'),'tips');
});

test('employee layout fails closed visually before an unreleased route can render',()=>{
  assert.match(layout,/StaffReleaseBoundary/);
  assert.match(boundary,/isStaffRouteReleased/);
  assert.match(boundary,/if\(!released\)return null/);
  assert.match(boundary,/location\.replace\('\/employee'\)/);
});

test('staff primary navigation is centralized and legacy per-page copies are suppressed',()=>{
  assert.match(layout,/StaffBottomNav/);
  assert.match(staffNav,/data-staff-primary-nav/);
  assert.match(staffNav,/aria-current/);
  for(const href of ['/employee','/employee/schedule','/employee/requests','/employee/team','/employee/more'])assert.match(staffNav,new RegExp(`['"]${href.replaceAll('/','\\/')}['"]`));
  assert.match(staffNav,/nav\.messages/);
  assert.doesNotMatch(staffNav,/employee\/training|employee\/time-clock|employee\/tips/);
  assert.match(mobilePolish,/\.employee-shell main>nav\{display:none!important\}/);
  assert.match(mobilePolish,/\.employee-shell>nav\{display:grid\}/);
});

test('hidden-domain notifications do not leak through Staff Home notification surfaces',()=>{
  assert.equal(isStaffNotificationReleased({href:'/employee/training',category:'training'}),false);
  assert.equal(isStaffNotificationReleased({href:null,event_key:'time_clock.punch_recorded'}),false);
  assert.equal(isStaffNotificationReleased({href:null,category:'tips'}),false);
  assert.equal(isStaffNotificationReleased({href:null,event_key:'payroll.finalized'}),false);
  assert.equal(isStaffNotificationReleased({href:'/employee/schedule',category:'schedule'}),true);
  assert.equal(isStaffNotificationReleased({href:'/employee/team',event_key:'announcement.created'}),true);
  assert.match(notificationCenter,/filter\(isStaffNotificationReleased\)/);
  assert.match(notificationCenter,/p_category:category/);
  assert.match(notificationPreferences,/isStaffNotificationReleased\(\{category:p\.category\}\)/);
});

test('More remains small and contains only currently implemented staff destinations',()=>{
  for(const href of ['/employee/team','/employee/notifications','/employee/notifications/preferences','/account'])assert.match(more,new RegExp(href.replaceAll('/','\\/')));
  for(const hidden of ['/employee/training','/employee/time-clock','/employee/tips','/ops','/inventory','/manager','/admin'])assert.doesNotMatch(more,new RegExp(hidden.replaceAll('/','\\/')));
});
