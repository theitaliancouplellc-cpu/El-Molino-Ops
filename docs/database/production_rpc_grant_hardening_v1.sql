-- Production RPC grant hardening applied 2026-08-16.
-- Internal SECURITY DEFINER helpers remain callable by their owning triggers/functions,
-- but are not exposed as direct PostgREST RPCs to anon/authenticated clients.

DO $$
DECLARE sig regprocedure; fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.apply_availability_request_rows(uuid)',
    'public.audit_time_clock_punch_update()',
    'public.auto_close_stale_time_clock_punches()',
    'public.capture_knowledge_version()',
    'public.capture_procedure_version()',
    'public.guard_checklist_item_update()',
    'public.guard_checklist_run_completion()',
    'public.guard_comment_identity()',
    'public.guard_discussion_message_identity()',
    'public.guard_internal_punch_when_toast_authoritative()',
    'public.guard_last_admin()',
    'public.guard_new_temperature_log()',
    'public.guard_ops_employee_update()',
    'public.guard_profile_self_privilege_changes()',
    'public.guard_task_employee_update()',
    'public.guard_user_invitation_update()',
    'public.handle_new_user()',
    'public.handle_new_user_preferences()',
    'public.notify_calendar_assignment()',
    'public.notify_checklist_assignment()',
    'public.notify_labor_target_trigger()',
    'public.notify_ops_exception_trigger()',
    'public.notify_staffing_request_trigger()',
    'public.notify_task_assignment()',
    'public.notify_time_off_request_trigger()',
    'public.populate_checklist_run_items()',
    'public.spawn_next_recurring_task()',
    'public.sync_onboarding_from_training_completion()',
    'public.time_clock_clock_in_internal(uuid,text,numeric,numeric,uuid)',
    'public.time_clock_clock_out_internal(uuid,text,numeric,numeric,uuid)',
    'public.time_clock_match_shift(uuid,timestamp with time zone)',
    'public.time_clock_period_is_open(uuid,timestamp with time zone)',
    'public.time_clock_validate_geo(text,numeric,numeric,uuid)',
    'public.training_refresh_course_completion(uuid)',
    'public.notify_employee_event(uuid,uuid,text,text,text,text,text,jsonb,text,text)',
    'public.notify_location_managers(uuid,text,text,text,text,jsonb)',
    'public.notify_schedule_employee(uuid,uuid,text,text,text,text,jsonb)',
    'public.deliver_upcoming_shift_reminders()',
    'public.refresh_certification_expiry_notifications()',
    'public.expire_stale_invites_before_insert()',
    'public.ensure_time_clock_pay_period(date)',
    'public.refresh_onboarding_assignment(uuid)'
  ] LOOP
    sig := to_regprocedure(fn);
    IF sig IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', sig);
    END IF;
  END LOOP;
END $$;

-- Intentional exceptions:
-- public_job_postings() and submit_job_application(...) remain anonymous because
-- they are the public hiring surface. Employee/manager RPCs that are intentionally
-- invoked by signed-in clients remain authenticated and enforce authorization inside
-- their server-authoritative function bodies.
