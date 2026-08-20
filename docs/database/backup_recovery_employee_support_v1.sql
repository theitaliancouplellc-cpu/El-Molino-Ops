-- Recovery contract extension for durable Staff support reports.
-- The browser manifest and server begin gate advance together so v5 exports are
-- restorable and legacy v4 files fail explicitly instead of being partially staged.
create or replace function private.backup_restore_allowed_tables()
returns text[] language sql immutable set search_path='pg_catalog','public','private' as $$
 select array[
  'locations','profiles',
  'employee_roles','employees','employee_role_assignments','employee_employment_status_history','employee_role_change_requests','employee_role_change_request_roles','employee_role_assignment_history','employee_self_setup_claims','employee_self_setup_role_claims','employee_schedule_profiles','employee_availability','availability_change_requests','employee_availability_overrides','employee_compliance_profiles','employee_support_reports',
  'areas','stations','knowledge_sources','knowledge_items','procedures','procedure_steps','checklist_templates','checklist_template_items','checklist_runs','checklist_run_items','menu_categories','menu_items','menu_item_aliases','menu_item_components','restaurant_vendors','inventory_items','recipe_cost_components','inventory_counts','inventory_count_lines','waste_entries','purchase_orders','purchase_order_lines','files','import_jobs','import_rows','restaurant_performance_targets','restaurant_daily_performance','cash_control_sessions','tasks','task_dependencies','comments','ops_records','calendar_events','discussion_rooms','discussion_messages','entity_file_links','activity_log','notifications','notification_preferences','mentions','favorites','recent_views','saved_views','dashboard_widgets','ai_conversations','ai_messages','user_preferences','user_invitations','content_versions','food_safety_temperature_points',
  'schedule_settings','schedule_coverage_requirements','schedule_break_rules','schedule_daily_forecasts','schedule_periods','schedule_generation_runs','schedule_shifts','schedule_shift_breaks','schedule_department_publications','schedule_publication_events','schedule_shift_change_log','schedule_shift_feedback','schedule_attendance_flag_types','schedule_attendance_flags','schedule_school_calendar_days','schedule_templates','schedule_template_shifts','schedule_shift_reminders_sent','time_off_blocked_days','time_off_requests','shift_change_requests','shift_claims','shift_pool_offers','shift_pool_offer_recipients','shift_pool_bids','time_clock_settings','time_clock_pay_periods','time_clock_punches','time_clock_breaks','time_clock_punch_audit','toast_sync_state','toast_employee_map','toast_time_entries','toast_order_payments','toast_cash_entries','toast_deposits','tip_settings','tip_pools','tip_pool_receivers','tip_pool_runs','tip_contributions','tip_distributions','tip_run_audit',
  'team_announcements','team_announcement_recipients','team_shoutouts','team_shoutout_reactions','team_channels','team_channel_members','team_channel_messages','team_message_reactions','team_message_mentions',
  'training_lessons','training_courses','training_course_lessons','training_quiz_questions','training_course_assignments','training_course_lesson_progress','training_quiz_attempts','training_lesson_comments','hiring_job_postings','hiring_applicants','hiring_stage_history','hiring_interviews','hiring_manager_notes','hiring_offers','onboarding_packages','onboarding_documents','onboarding_package_items','onboarding_assignments','onboarding_item_progress','onboarding_acknowledgments','onboarding_comments'
 ]::text[]
$$;

create or replace function public.begin_backup_restore(
 p_format text,
 p_schema_version integer,
 p_schema_fingerprint text,
 p_exported_at timestamptz,
 p_backup_location uuid,
 p_manifest_tables text[]
) returns uuid
language plpgsql
security definer
set search_path='pg_catalog','public','private'
as $$
declare
 loc uuid:=public.current_location_id();
 sid uuid;
 allowed text[]:=private.backup_restore_allowed_tables();
 got text[];
 want text[];
begin
 if auth.uid() is null or public.current_app_role()<>'admin' then raise exception 'admin access required'; end if;
 if loc is null or p_backup_location is distinct from loc then raise exception 'backup belongs to a different location'; end if;
 if p_format<>'el-molino-ops-backup-v5' or p_schema_version<>5 then raise exception 'unsupported backup format'; end if;
 if p_schema_fingerprint is distinct from private.backup_restore_schema_fingerprint_internal() then raise exception 'backup schema fingerprint does not match the running database'; end if;
 select array_agg(x order by x) into got from (select distinct unnest(p_manifest_tables) x) q;
 select array_agg(x order by x) into want from unnest(allowed) x;
 if got is distinct from want or cardinality(p_manifest_tables)<>cardinality(allowed) then raise exception 'backup manifest does not match recovery table set'; end if;
 delete from private.backup_restore_sessions where (expires_at<now() or status in ('cancelled','failed')) and created_at<now()-interval '1 day';
 insert into private.backup_restore_sessions(location_id,created_by,format,schema_version,schema_fingerprint,exported_at)
 values(loc,auth.uid(),p_format,p_schema_version,p_schema_fingerprint,p_exported_at) returning id into sid;
 return sid;
end
$$;