-- client_event_privacy_hardening_v2
-- Keeps browser telemetry useful for release diagnosis without turning client_events
-- into a store for raw errors, credentials, message bodies, payroll data, or PII.

begin;

alter table public.client_events enable row level security;

-- The public/anonymous client has no reason to read or write diagnostic telemetry.
revoke all privileges on table public.client_events from anon;

-- Signed-in clients may submit their own telemetry and administrators may read it
-- through the existing location/admin RLS policy. Client rows are append-only.
revoke update, delete on table public.client_events from authenticated;
grant insert, select on table public.client_events to authenticated;

-- Bound route/event/message sizes and prevent raw URLs with query/fragment data.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.client_events'::regclass
      and conname = 'client_events_route_privacy_v2'
  ) then
    alter table public.client_events
      add constraint client_events_route_privacy_v2
      check (
        route is null
        or (
          char_length(route) <= 160
          and position('?' in route) = 0
          and position('#' in route) = 0
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.client_events'::regclass
      and conname = 'client_events_event_type_bounded_v2'
  ) then
    alter table public.client_events
      add constraint client_events_event_type_bounded_v2
      check (char_length(event_type) between 1 and 64);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.client_events'::regclass
      and conname = 'client_events_message_bounded_v2'
  ) then
    alter table public.client_events
      add constraint client_events_message_bounded_v2
      check (message is null or char_length(message) <= 80);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.client_events'::regclass
      and conname = 'client_events_metadata_bounded_v2'
  ) then
    alter table public.client_events
      add constraint client_events_metadata_bounded_v2
      check (octet_length(metadata::text) <= 4096);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.client_events'::regclass
      and conname = 'client_events_metadata_forbidden_keys_v2'
  ) then
    alter table public.client_events
      add constraint client_events_metadata_forbidden_keys_v2
      check (
        metadata::text !~* '"(password|token|authorization|cookie|stack|error_message|errormessage|user_agent|useragent|email|phone|message_body|wage|tip)"[[:space:]]*:'
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.client_events'::regclass
      and conname = 'client_events_error_shape_v2'
  ) then
    alter table public.client_events
      add constraint client_events_error_shape_v2
      check (
        event_type <> 'client_error'
        or (
          message = any (array[
            'auth_session',
            'authorization',
            'conflict',
            'data_integrity',
            'validation',
            'network',
            'application'
          ]::text[])
          and metadata ->> 'category' = message
          and metadata ? 'correlation_id'
          and char_length(metadata ->> 'correlation_id') between 8 and 80
          and metadata ->> 'correlation_id' ~ '^[A-Za-z0-9_-]+$'
        )
      );
  end if;
end
$$;

commit;
