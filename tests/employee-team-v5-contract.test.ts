import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const page=readFileSync('app/employee/team/page.tsx','utf8');
const schema=readFileSync('docs/database/employee_team_communications_v5.sql','utf8');
const readWatermark=readFileSync('docs/database/employee_team_communications_v5_1.sql','utf8');
const releaseBoundary=readFileSync('docs/database/employee_team_communications_v5_2.sql','utf8');
const recovery=readFileSync('docs/database/backup_recovery_employee_team_v5.sql','utf8');
const backup=readFileSync('lib/backup-manifest.ts','utf8');
const features=readFileSync('lib/staff-features.ts','utf8');

test('Phase 2 releases private group chat without releasing future system channels',()=>{
  assert.match(features,/groupChats:\s*true/);
  assert.match(features,/systemChannels:\s*false/);
  assert.match(page,/staffFeatureEnabled\('groupChats'\)/);
  assert.match(page,/start_team_group_channel/);
  assert.match(schema,/group requires 1-49 other active teammates/);
  assert.match(schema,/all group members must be active teammates at this location/);
  assert.match(schema,/client_request_id/);
  assert.match(releaseBoundary,/c\.channel_kind<>'system'/);
});

test('roster chat is system-maintained from active same-location employees and prunes inactive membership',()=>{
  assert.match(releaseBoundary,/ensure_staff_roster_channel/);
  assert.match(releaseBoundary,/values\(loc,'roster','All Staff','staff-roster'/);
  assert.match(releaseBoundary,/delete from public\.team_channel_members/);
  assert.match(releaseBoundary,/not exists\([\s\S]*coalesce\(e\.employment_status,'active'\)='active'/);
  assert.match(releaseBoundary,/e\.location_id=loc and e\.active and e\.deleted_at is null/);
  assert.match(page,/ensure_staff_roster_channel/);
  assert.match(page,/channel_kind==='roster'/);
});

test('message creation is idempotent and retries reuse a client message id',()=>{
  assert.match(schema,/client_message_id uuid/);
  assert.match(schema,/team_channel_messages_client_id_uq/);
  assert.match(schema,/send_team_channel_message_v2/);
  assert.match(schema,/deduplicated',true/);
  assert.match(schema,/exception when unique_violation/);
  assert.match(page,/pendingSendKey/);
  assert.match(page,/p_client_message_id:key/);
  assert.match(page,/pendingSendKey\.current=key/);
});

test('replies mentions reactions and read evidence stay membership-gated',()=>{
  assert.match(schema,/reply_to_message_id uuid references public\.team_channel_messages/);
  assert.match(schema,/reply target is not available/);
  assert.match(schema,/mentions must be members of this conversation/);
  assert.match(schema,/create table if not exists public\.team_message_reactions/);
  assert.match(schema,/reaction in\('like','heart','celebrate','ack'\)/);
  assert.match(schema,/message not available/);
  assert.match(schema,/m\.employee_id=me/);
  assert.match(schema,/read_by_count/);
  assert.match(page,/react_to_team_message/);
  assert.match(page,/remove_team_message_reaction/);
  assert.match(page,/p_reply_to_message_id:replyTo\?\.id\|\|null/);
  assert.match(page,/p_mentioned_employee_ids:mentionIds\.length\?mentionIds:null/);
});

test('private realtime broadcast is authorized by conversation membership and cleaned up client-side',()=>{
  assert.match(schema,/can_receive_team_channel_topic/);
  assert.match(schema,/p_topic='team:'\|\|c\.id::text/);
  assert.match(schema,/on realtime\.messages for select to authenticated/);
  assert.match(schema,/realtime\.messages\.extension='broadcast'/);
  assert.match(schema,/realtime\.broadcast_changes/);
  assert.match(schema,/revoke all on function private\.broadcast_team_channel_change\(\) from public,anon,authenticated/);
  assert.match(page,/await supabase\.realtime\.setAuth\(\)/);
  assert.doesNotMatch(page,/void supabase\.realtime\.setAuth\(\)/);
  assert.match(page,/channel\(`team:\$\{selectedChannel\}`,[\s\S]*private:true/);
  assert.match(page,/supabase\.removeChannel\(realtime\)/);
  assert.doesNotMatch(page,/postgres_changes/);
  assert.doesNotMatch(page,/from\('team_channel_messages'\)/);
  assert.doesNotMatch(page,/from\('team_channel_members'\)/);
});

test('read-watermark broadcast converges instead of recursively advancing now',()=>{
  assert.match(readWatermark,/latest_message_at/);
  assert.match(readWatermark,/coalesce\(last_read_at,'epoch'::timestamptz\)<latest_message_at/);
  assert.match(readWatermark,/set last_read_at=latest_message_at/);
  assert.doesNotMatch(readWatermark,/set last_read_at=now\(\)/);
});

test('new communications evidence is included in portable recovery',()=>{
  for(const table of ['team_message_reactions','team_message_mentions']){
    assert.match(backup,new RegExp(table));
    assert.match(recovery,new RegExp(table));
  }
});

test('new private communication tables do not receive direct Staff table privileges',()=>{
  for(const table of ['team_message_reactions','team_message_mentions']){
    assert.match(schema,new RegExp(`revoke all on public\\.${table} from anon,authenticated`));
  }
  assert.match(schema,/revoke all on function public\.can_receive_team_channel_topic\(text\) from public,anon/);
  assert.match(schema,/grant execute on function public\.can_receive_team_channel_topic\(text\) to authenticated/);
});
