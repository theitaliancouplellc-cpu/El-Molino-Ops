import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {STAFF_FEATURES,isStaffRouteReleased,staffRouteFeature} from '../lib/staff-features';

const tour=readFileSync('app/employee/staff-tour.tsx','utf8');
const tourCss=readFileSync('app/employee/staff-tour.module.css','utf8');
const mobilePolish=readFileSync('app/employee/mobile-polish.css','utf8');
const tutorialPage=readFileSync('app/employee/tutorials/page.tsx','utf8');
const layout=readFileSync('app/employee/layout.tsx','utf8');
const home=readFileSync('app/employee/page.tsx','utf8');
const nav=readFileSync('app/employee/staff-bottom-nav.tsx','utf8');
const more=readFileSync('app/employee/more/page.tsx','utf8');

const hiddenProductCopy=/\btraining\b|time[- ]?clock|\btips?\b|\bpayroll\b|\bwages?\b|\btoast\b|\binventory\b|\badmin(?:istrative)?\b|\bcapacitación\b|\bpropinas\b|\bnómina\b|\binventario\b|\badministrativ[oa]s?\b/i;

test('Staff tutorials are released through one exact route while hidden product domains remain closed',()=>{
 assert.equal(STAFF_FEATURES.tutorials,true);
 for(const feature of ['systemChannels','support','training','timeClock','tips','earnings','financialFeatures','toastFeatures'] as const)assert.equal(STAFF_FEATURES[feature],false,feature);
 assert.equal(staffRouteFeature('/employee/tutorials'),'tutorials');
 assert.equal(isStaffRouteReleased('/employee/tutorials'),true);
 assert.equal(staffRouteFeature('/employee/tutorials/internal'),null);
 assert.equal(isStaffRouteReleased('/employee/tutorials/internal'),false);
});

test('guided tour is on-demand, local-only, and mounted behind the Staff release boundary',()=>{
 assert.match(layout,/StaffReleaseBoundary>[\s\S]*\{children\}[\s\S]*<StaffTour\/>[\s\S]*<\/StaffReleaseBoundary>/);
 assert.match(tour,/new URLSearchParams\(window\.location\.search\)\.get\('tour'\)==='1'/);
 assert.match(tour,/STAFF_TOUR_COMPLETION_KEY='el-molino-staff-tour-v1'/);
 assert.match(tour,/window\.localStorage\.setItem\(STAFF_TOUR_COMPLETION_KEY,'complete'\)/);
 assert.doesNotMatch(tour,/localStorage\.getItem\(STAFF_TOUR_COMPLETION_KEY\)[\s\S]*setActive\(true\)/);
 for(const source of [tour,tutorialPage]){
  assert.doesNotMatch(source,/\bsupabase\b|\.rpc\(|\bfetch\(|XMLHttpRequest|navigator\.sendBeacon/i);
 }
});

test('guided tour targets only stable released Staff controls that exist in the current UI',()=>{
 for(const key of ['next-shift','schedule','request-time-off','messages','more'])assert.match(tour,new RegExp(`selector:'\\[data-tour=\\"${key}\\"\\]'`));
 for(const actual of ['data-tour="next-shift"','data-tour="schedule"','data-tour="request-time-off"','data-tour="messages"'])assert.match(home,new RegExp(actual));
 assert.match(nav,/data-tour=\{tour\}/);
 assert.match(nav,/tab\('more','\/employee\/more',[\s\S]*,'more'\)/);
 assert.doesNotMatch(tour,/employee\/training|employee\/time-clock|employee\/tips|\/manager|\/admin|\/ops|\/inventory/i);
});

test('guided tour supplies keyboard, focus, progress and reduced-motion affordances',()=>{
 assert.match(tour,/event\.key==='Escape'/);
 assert.match(tour,/event\.key==='ArrowRight'/);
 assert.match(tour,/event\.key==='ArrowLeft'/);
 assert.match(tour,/role="region"/);
 assert.match(tour,/aria-live="polite"/);
 assert.match(tour,/role="progressbar"/);
 assert.match(tour,/panelRef\.current\?\.focus\(\)/);
 assert.match(tour,/prefers-reduced-motion: reduce/);
 assert.match(tourCss,/min-height:44px/);
 assert.match(tourCss,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(mobilePolish,/\.employee-shell \[data-staff-tour-active="true"\]/);
});

test('tutorial center and More expose only released Staff destinations and no hidden capability copy',()=>{
 for(const href of ['/employee','/employee/schedule','/employee/requests','/employee/team','/employee/more'])assert.match(tutorialPage,new RegExp(`href:'${href.replaceAll('/','\\/')}'`));
 assert.match(tutorialPage,/href="\/employee\?tour=1"/);
 assert.match(more,/staffFeatureEnabled\('tutorials'\)/);
 assert.match(more,/href="\/employee\/tutorials"/);
 for(const source of [tutorialPage,more,tour])assert.doesNotMatch(source,hiddenProductCopy);
});
