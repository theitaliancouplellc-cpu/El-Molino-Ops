import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const source=fs.readFileSync('app/team/page.tsx','utf8');

test('Team Hub is bilingual and locale-aware',()=>{
  assert.match(source,/useI18n/);
  for(const marker of ['Centro del Equipo','Enviar anuncio','Anuncios','Dar un reconocimiento','Feed de reconocimiento'])assert.ok(source.includes(marker),`missing Spanish marker: ${marker}`);
  assert.match(source,/toLocaleString\(localeCode\)/);
  assert.match(source,/systemLabel/);
});

test('Team Hub localization preserves authored content and server-authoritative mutations',()=>{
  for(const rpc of ['send_team_announcement','mark_team_announcement_read','remind_unread_team_announcement','archive_team_announcement','create_team_shoutout','remove_team_shoutout_reaction','react_to_team_shoutout','hide_team_shoutout'])assert.ok(source.includes(`'${rpc}'`),`missing RPC: ${rpc}`);
  for(const value of ['p_title:announcement.title.trim()','p_body:announcement.body.trim()','p_message:shoutout.message.trim()','p_priority:announcement.priority','p_reaction:reaction'])assert.ok(source.includes(value),`missing mutation contract: ${value}`);
  assert.match(source,/<h3>\{a\.title\}<\/h3>/);
  assert.match(source,/<p>\{a\.body\}<\/p>/);
  assert.match(source,/<p>\{s\.message\}<\/p>/);
});
