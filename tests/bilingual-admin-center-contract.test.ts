import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const admin=readFileSync('app/admin/page.tsx','utf8');
const diagnostics=readFileSync('app/admin/diagnostics/page.tsx','utf8');
const restore=readFileSync('app/admin/restore/page.tsx','utf8');

test('admin surfaces are bilingual',()=>{
 for(const source of [admin,diagnostics,restore])assert.match(source,/useI18n/);
 for(const phrase of ['Centro de Administración','Usuarios y roles','Papelera y restauración'])assert.match(admin,new RegExp(phrase));
 for(const phrase of ['Estado del sistema','Posibles duplicados','Papelera recuperable'])assert.match(diagnostics,new RegExp(phrase));
 for(const phrase of ['Recuperación de Respaldo','Recuperar datos faltantes del restaurante','Vista previa de integridad del servidor'])assert.match(restore,new RegExp(phrase));
});

test('admin translation preserves raw roles, statuses, audit content and backup contracts',()=>{
 for(const raw of ["'admin'","'manager'","'employee'","'pending'","'revoked'"])assert.match(admin,new RegExp(raw));
 assert.match(admin,/sanitizeAuditMessage\(JSON\.stringify\(v\.snapshot/);
 assert.match(admin,/sanitizeAuditMessage\(`\$\{e\.route/);
 for(const rpc of ['backup_restore_schema_fingerprint','begin_backup_restore','stage_backup_restore_chunk','preview_backup_restore','apply_backup_restore','cancel_backup_restore'])assert.match(admin+restore,new RegExp(rpc));
 assert.match(restore,/const CONFIRM='RESTORE MISSING DATA'/);
 assert.match(restore,/p_confirmation:confirmation/);
});

test('diagnostics preserves authored titles and health details',()=>{
 for(const raw of ['d.left_title','d.right_title','r.title','x.detail','health.ai.mode'])assert.match(diagnostics,new RegExp(raw.replaceAll('.','\\.')));
 assert.match(diagnostics,/toLocaleString\(localeCode\)/);
});
