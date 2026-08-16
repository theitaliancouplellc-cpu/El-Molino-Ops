import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

test('Team Communications keeps existing chat and adds targeted manager announcements', () => {
  const page = read('app/team/page.tsx');
  assert.match(page, /href="\/discussions"/);
  assert.match(page, /send_team_announcement/);
  assert.match(page, /p_role_ids/);
  assert.match(page, /p_departments/);
  assert.match(page, /p_employee_ids/);
  assert.match(page, /Remind Unread/);
  assert.match(page, /mark_team_announcement_read/);
  assert.match(page, /archive_team_announcement/);
});

test('Team Communications exposes server-authoritative shout-outs and reactions', () => {
  const page = read('app/team/page.tsx');
  assert.match(page, /create_team_shoutout/);
  assert.match(page, /react_to_team_shoutout/);
  assert.match(page, /remove_team_shoutout_reaction/);
  assert.match(page, /hide_team_shoutout/);
  assert.match(page, /Recognition feed/);
});

test('Team Communications is exposed from Ops navigation', () => {
  const home = read('app/page.tsx');
  assert.match(home, /href="\/team"/);
  assert.match(home, />Team</);
});
