export const BACKUP_FORMAT='el-molino-ops-backup-v4' as const;
export const BACKUP_SCHEMA_VERSION=4 as const;
export const BACKUP_MAX_TABLE_ROWS=100_000;
export const BACKUP_MAX_TOTAL_ROWS=500_000;
export const BACKUP_MAX_FILE_BYTES=50*1024*1024;
export const BACKUP_CHUNK_ROWS=250;

// Recovery data is deliberately explicit. New persistent tables must be added here
// and to the backup contract test before an export can claim to be complete.
export const BACKUP_TABLES=[
  'locations','profiles',
  'employee_roles','employees','employee_role_assignments','employee_self_setup_claims','employee_self_setup_role_claims','employee_schedule_profiles','employee_availability','employee_availability_overrides','availability_change_requests','employee_compliance_profiles',
  'areas','stations',
  'knowledge_sources','knowledge_items','procedures','procedure_steps',
  'checklist_templates','checklist_template_items','checklist_runs','checklist_run_items',
  'menu_categories','menu_items','menu_item_aliases','menu_item_components',
  'restaurant_vendors','inventory_items','recipe_cost_components','inventory_counts','inventory_count_lines','waste_entries','purchase_orders','purchase_order_lines',
  'restaurant_performance_targets','restaurant_daily_performance','cash_control_sessions',
  'tasks','task_dependencies','comments','ops_records','calendar_events',
  'discussion_rooms','discussion_messages','files','entity_file_links','import_jobs','import_rows',
  'activity_log','notifications','mentions','favorites','recent_views','saved_views','dashboard_widgets',
  'ai_conversations','ai_messages','user_preferences','user_invitations','content_versions',
  'food_safety_temperature_points',
  'schedule_settings','schedule_coverage_requirements','schedule_break_rules','schedule_daily_forecasts','schedule_periods','schedule_shifts','schedule_shift_breaks','schedule_department_publications','schedule_publication_events','schedule_generation_runs','schedule_shift_change_log','schedule_shift_feedback','schedule_attendance_flag_types','schedule_attendance_flags','schedule_school_calendar_days','schedule_templates','schedule_template_shifts','schedule_shift_reminders_sent',
  'time_off_blocked_days','time_off_requests','shift_change_requests','shift_claims','shift_pool_offers','shift_pool_offer_recipients','shift_pool_bids',
  'time_clock_settings','time_clock_pay_periods','time_clock_punches','time_clock_breaks','time_clock_punch_audit',
  'toast_sync_state','toast_employee_map','toast_time_entries','toast_order_payments','toast_cash_entries','toast_deposits',
  'tip_settings','tip_pools','tip_pool_receivers','tip_pool_runs','tip_contributions','tip_distributions','tip_run_audit',
  'team_announcements','team_announcement_recipients','team_shoutouts','team_shoutout_reactions',
  'training_lessons','training_courses','training_course_lessons','training_quiz_questions','training_course_assignments','training_course_lesson_progress','training_quiz_attempts','training_lesson_comments',
  'hiring_job_postings','hiring_applicants','hiring_stage_history','hiring_interviews','hiring_manager_notes','hiring_offers',
  'onboarding_packages','onboarding_package_items','onboarding_assignments','onboarding_item_progress','onboarding_documents','onboarding_acknowledgments','onboarding_comments',
] as const;

export type BackupTable=(typeof BACKUP_TABLES)[number];
export const BACKUP_TABLE_SET=new Set<string>(BACKUP_TABLES);

// These are intentionally not exported into a portable browser backup.
export const BACKUP_EXCLUSIONS={
  employee_time_clock_credentials:'PIN hashes are credentials and must be reset after a full recovery.',
  permissions:'Internal authorization map is schema/configuration, not restaurant backup data.',
  role_permissions:'Internal authorization map is schema/configuration, not restaurant backup data.',
  api_rate_limits:'Ephemeral abuse-protection counters are regenerated automatically.',
  push_subscriptions:'Device push endpoints are device-specific and should be re-registered after recovery.',
  client_events:'Ephemeral client diagnostics are not required to recover restaurant operations.',
} as const;

export const BACKUP_EXCLUDED_TABLES=Object.keys(BACKUP_EXCLUSIONS);

export type BackupEnvelope={
  exported_at:string;
  format:typeof BACKUP_FORMAT;
  schema_version:typeof BACKUP_SCHEMA_VERSION;
  schema_fingerprint:string;
  location_id:string;
  manifest:{tables:readonly BackupTable[];excluded:typeof BACKUP_EXCLUSIONS};
  storage:{objects_included:false;note:string};
  tables:Partial<Record<BackupTable,unknown[]>>;
  errors:{table:string;error:string}[];
};
