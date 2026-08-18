import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('docs/database/authored_content_update_ownership_v1.sql','utf8');

test('comment updates preserve author ownership for non-managers',()=>{
  assert.match(sql,/create policy comments_author_manager_update[\s\S]*?using \([\s\S]*?author_user_id = auth\.uid\(\)[\s\S]*?with check \([\s\S]*?author_user_id = auth\.uid\(\)/i);
});

test('discussion-message updates preserve author ownership and room location scope',()=>{
  assert.match(sql,/create policy discussion_messages_author_update[\s\S]*?using \([\s\S]*?r\.location_id = public\.current_location_id\(\)[\s\S]*?author_user_id = auth\.uid\(\)[\s\S]*?with check \([\s\S]*?r\.location_id = public\.current_location_id\(\)[\s\S]*?author_user_id = auth\.uid\(\)/i);
});

test('file updates preserve uploader ownership for non-managers',()=>{
  assert.match(sql,/create policy files_manager_update[\s\S]*?using \([\s\S]*?uploaded_by = auth\.uid\(\)[\s\S]*?with check \([\s\S]*?uploaded_by = auth\.uid\(\)/i);
});

test('all three policies preserve manager and admin authority',()=>{
  assert.equal((sql.match(/current_app_role\(\) in \('admin','manager'\)/g)||[]).length,6);
});
