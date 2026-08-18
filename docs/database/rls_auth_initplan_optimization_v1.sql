-- El Molino Ops: cache auth.uid() once per statement in hot RLS policies.
--
-- Supabase/Postgres can evaluate a bare auth.uid() once per candidate row inside
-- a policy. Wrapping it as (select auth.uid()) creates an initplan and preserves
-- the exact authorization expression while avoiding repeated JWT identity lookup.
-- No roles, commands, policy permissiveness, or authorization predicates change.

alter policy comments_author_manager_update on public.comments
using (
  location_id=public.current_location_id()
  and (author_user_id=(select auth.uid()) or public.current_app_role() in ('admin','manager'))
)
with check (
  location_id=public.current_location_id()
  and (author_user_id=(select auth.uid()) or public.current_app_role() in ('admin','manager'))
);

alter policy discussion_messages_author_update on public.discussion_messages
using (
  exists(select 1 from public.discussion_rooms r where r.id=discussion_messages.room_id and r.location_id=public.current_location_id())
  and (author_user_id=(select auth.uid()) or public.current_app_role() in ('admin','manager'))
)
with check (
  exists(select 1 from public.discussion_rooms r where r.id=discussion_messages.room_id and r.location_id=public.current_location_id())
  and (author_user_id=(select auth.uid()) or public.current_app_role() in ('admin','manager'))
);

alter policy employee_availability_delete on public.employee_availability
using (
  location_id=public.current_location_id()
  and (
    public.current_app_role() in ('admin','manager')
    or exists(
      select 1 from public.employees e
      where e.id=employee_availability.employee_id
        and e.location_id=employee_availability.location_id
        and e.user_id=(select auth.uid())
        and e.deleted_at is null
    )
  )
);

alter policy employee_availability_select on public.employee_availability
using (
  location_id=public.current_location_id()
  and (
    public.current_app_role() in ('admin','manager')
    or exists(
      select 1 from public.employees e
      where e.id=employee_availability.employee_id
        and e.location_id=employee_availability.location_id
        and e.user_id=(select auth.uid())
        and e.deleted_at is null
    )
  )
);

alter policy employee_availability_update on public.employee_availability
using (
  location_id=public.current_location_id()
  and (
    public.current_app_role() in ('admin','manager')
    or exists(
      select 1 from public.employees e
      where e.id=employee_availability.employee_id
        and e.location_id=employee_availability.location_id
        and e.user_id=(select auth.uid())
        and e.deleted_at is null
    )
  )
)
with check (
  location_id=public.current_location_id()
  and (
    public.current_app_role() in ('admin','manager')
    or exists(
      select 1 from public.employees e
      where e.id=employee_availability.employee_id
        and e.location_id=employee_availability.location_id
        and e.user_id=(select auth.uid())
        and e.deleted_at is null
    )
  )
);

alter policy employee_availability_overrides_read on public.employee_availability_overrides
using (
  location_id=public.current_location_id()
  and (
    public.current_app_role() in ('admin','manager')
    or exists(
      select 1 from public.employees e
      where e.id=employee_availability_overrides.employee_id
        and e.location_id=employee_availability_overrides.location_id
        and e.user_id=(select auth.uid())
        and e.deleted_at is null
    )
  )
);

alter policy employee_role_assignments_read on public.employee_role_assignments
using (
  exists(
    select 1 from public.employees e
    where e.id=employee_role_assignments.employee_id
      and e.location_id=public.current_location_id()
      and (public.current_app_role() in ('admin','manager') or e.user_id=(select auth.uid()))
  )
);

alter policy employee_role_change_request_roles_read on public.employee_role_change_request_roles
using (
  exists(
    select 1 from public.employee_role_change_requests q
    where q.id=employee_role_change_request_roles.request_id
      and q.location_id=public.current_location_id()
      and (public.current_app_role() in ('admin','manager') or q.user_id=(select auth.uid()))
  )
);

alter policy employee_role_change_read on public.employee_role_change_requests
using (
  location_id=public.current_location_id()
  and (public.current_app_role() in ('admin','manager') or user_id=(select auth.uid()))
);

alter policy schedule_profiles_read on public.employee_schedule_profiles
using (
  location_id=public.current_location_id()
  and (
    public.current_app_role() in ('admin','manager')
    or exists(
      select 1 from public.employees e
      where e.id=employee_schedule_profiles.employee_id
        and e.user_id=(select auth.uid())
        and e.deleted_at is null
    )
  )
);

alter policy employee_self_setup_claims_read on public.employee_self_setup_claims
using (
  user_id=(select auth.uid())
  or (public.current_app_role() in ('admin','manager') and location_id=public.current_location_id())
);

alter policy employee_self_setup_roles_read on public.employee_self_setup_role_claims
using (
  exists(
    select 1 from public.employee_self_setup_claims c
    where c.id=employee_self_setup_role_claims.claim_id
      and (
        c.user_id=(select auth.uid())
        or (public.current_app_role() in ('admin','manager') and c.location_id=public.current_location_id())
      )
  )
);

alter policy employee_shift_reminder_read on public.employee_shift_reminder_events
using (
  location_id=public.current_location_id()
  and (public.current_app_role() in ('admin','manager') or user_id=(select auth.uid()))
);

alter policy employees_location_read on public.employees
using (
  location_id=public.current_location_id()
  and (public.current_app_role() in ('admin','manager') or user_id=(select auth.uid()))
);

alter policy files_manager_update on public.files
using (
  location_id=public.current_location_id()
  and (uploaded_by=(select auth.uid()) or public.current_app_role() in ('admin','manager'))
)
with check (
  location_id=public.current_location_id()
  and (uploaded_by=(select auth.uid()) or public.current_app_role() in ('admin','manager'))
);

alter policy manager_contact_read on public.manager_contact_requests
using (
  location_id=public.current_location_id()
  and (public.current_app_role() in ('admin','manager') or employee_user_id=(select auth.uid()))
);

alter policy notification_preferences_own_read on public.notification_preferences
using (user_id=(select auth.uid()) and location_id=public.current_location_id());

alter policy onboarding_ack_self_read on public.onboarding_acknowledgments
using (
  location_id=public.current_location_id()
  and employee_id=public.time_clock_employee_id_for_user((select auth.uid()))
);

alter policy onboarding_assignments_self_read on public.onboarding_assignments
using (
  location_id=public.current_location_id()
  and employee_id=public.time_clock_employee_id_for_user((select auth.uid()))
);

alter policy onboarding_comments_self_read on public.onboarding_comments
using (
  location_id=public.current_location_id()
  and employee_id=public.time_clock_employee_id_for_user((select auth.uid()))
);

alter policy onboarding_documents_assigned_read on public.onboarding_documents
using (
  location_id=public.current_location_id()
  and exists(
    select 1
    from public.onboarding_package_items pi
    join public.onboarding_assignments oa on oa.package_id=pi.package_id
    where pi.document_id=onboarding_documents.id
      and oa.employee_id=public.time_clock_employee_id_for_user((select auth.uid()))
      and oa.status in ('assigned','in_progress','completed')
  )
);

alter policy onboarding_item_progress_self_read on public.onboarding_item_progress
using (
  location_id=public.current_location_id()
  and employee_id=public.time_clock_employee_id_for_user((select auth.uid()))
);

alter policy onboarding_package_items_assigned_read on public.onboarding_package_items
using (
  location_id=public.current_location_id()
  and exists(
    select 1 from public.onboarding_assignments oa
    where oa.package_id=onboarding_package_items.package_id
      and oa.employee_id=public.time_clock_employee_id_for_user((select auth.uid()))
  )
);

alter policy onboarding_packages_assigned_read on public.onboarding_packages
using (
  location_id=public.current_location_id()
  and exists(
    select 1 from public.onboarding_assignments oa
    where oa.package_id=onboarding_packages.id
      and oa.employee_id=public.time_clock_employee_id_for_user((select auth.uid()))
  )
);

alter policy shift_claims_read on public.shift_claims
using (
  location_id=public.current_location_id()
  and (
    public.current_app_role() in ('admin','manager')
    or requested_by=(select auth.uid())
    or exists(
      select 1 from public.employees e
      where e.id=shift_claims.employee_id and e.user_id=(select auth.uid())
    )
  )
);

alter policy team_announcement_recipients_self_read on public.team_announcement_recipients
using (
  location_id=public.current_location_id()
  and employee_id=public.time_clock_employee_id_for_user((select auth.uid()))
);

alter policy team_announcements_recipient_read on public.team_announcements
using (
  location_id=public.current_location_id()
  and exists(
    select 1 from public.team_announcement_recipients ar
    where ar.announcement_id=team_announcements.id
      and ar.employee_id=public.time_clock_employee_id_for_user((select auth.uid()))
  )
);

alter policy time_clock_break_select on public.time_clock_breaks
using (
  location_id=public.current_location_id()
  and (
    public.current_app_role() in ('admin','manager')
    or employee_id=(
      select e.id from public.employees e
      where e.user_id=(select auth.uid())
        and e.location_id=public.current_location_id()
        and e.deleted_at is null
      limit 1
    )
  )
);

alter policy time_clock_punch_select on public.time_clock_punches
using (
  location_id=public.current_location_id()
  and (
    public.current_app_role() in ('admin','manager')
    or employee_id=(
      select e.id from public.employees e
      where e.user_id=(select auth.uid())
        and e.location_id=public.current_location_id()
        and e.deleted_at is null
      limit 1
    )
  )
);

alter policy tip_distributions_select on public.tip_distributions
using (
  location_id=public.current_location_id()
  and (
    public.current_app_role() in ('admin','manager')
    or (
      employee_id=public.time_clock_employee_id_for_user((select auth.uid()))
      and exists(select 1 from public.tip_pool_runs r where r.id=tip_distributions.run_id and r.status='final')
      and coalesce((select s.employee_visibility from public.tip_settings s where s.location_id=public.current_location_id()),true)
    )
  )
);

alter policy training_course_assignments_self_read on public.training_course_assignments
using (
  location_id=public.current_location_id()
  and employee_id=public.time_clock_employee_id_for_user((select auth.uid()))
);

alter policy training_lesson_progress_self_read on public.training_course_lesson_progress
using (
  location_id=public.current_location_id()
  and employee_id=public.time_clock_employee_id_for_user((select auth.uid()))
);

alter policy training_course_lessons_assigned_read on public.training_course_lessons
using (
  location_id=public.current_location_id()
  and exists(
    select 1 from public.training_course_assignments ca
    where ca.course_id=training_course_lessons.course_id
      and ca.employee_id=public.time_clock_employee_id_for_user((select auth.uid()))
      and ca.status in ('assigned','in_progress','completed')
  )
);

alter policy training_courses_assigned_read on public.training_courses
using (
  location_id=public.current_location_id()
  and exists(
    select 1 from public.training_course_assignments ca
    where ca.course_id=training_courses.id
      and ca.employee_id=public.time_clock_employee_id_for_user((select auth.uid()))
      and ca.status in ('assigned','in_progress','completed')
  )
);

alter policy training_lesson_comments_self_read on public.training_lesson_comments
using (
  location_id=public.current_location_id()
  and employee_id=public.time_clock_employee_id_for_user((select auth.uid()))
);

alter policy training_lessons_assigned_read on public.training_lessons
using (
  location_id=public.current_location_id()
  and exists(
    select 1
    from public.training_course_lessons cl
    join public.training_course_assignments ca on ca.course_id=cl.course_id
    where cl.lesson_id=training_lessons.id
      and ca.employee_id=public.time_clock_employee_id_for_user((select auth.uid()))
      and ca.status in ('assigned','in_progress','completed')
  )
);

alter policy training_quiz_attempts_self_read on public.training_quiz_attempts
using (
  location_id=public.current_location_id()
  and employee_id=public.time_clock_employee_id_for_user((select auth.uid()))
);
