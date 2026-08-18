-- El Molino Ops: deterministic lock ordering for competing schedule reviews.
--
-- Keep the already-tested review implementations intact behind private RPC names,
-- then pre-acquire the parent serialization lock before delegating. This removes
-- deadlock cycles without duplicating or drifting the review business logic.

alter function public.review_shift_claim(uuid,text)
  rename to review_shift_claim_unlocked_v1;
revoke all on function public.review_shift_claim_unlocked_v1(uuid,text)
  from public, anon, authenticated;

create function public.review_shift_claim(p_claim_id uuid, p_decision text)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  loc uuid:=public.current_location_id();
  v_shift_id uuid;
begin
  if auth.uid() is null or public.current_app_role() not in ('admin','manager') then
    raise exception 'manager access required';
  end if;
  if p_decision not in ('approved','denied') then raise exception 'invalid decision'; end if;

  -- Discover the parent without locking the child, then serialize on the shift.
  -- The delegated implementation can safely lock claim -> shift afterward because
  -- this transaction already owns the shift lock and competing reviews cannot
  -- reach their child-row lock until this shift lock is released.
  select c.shift_id into v_shift_id
  from public.shift_claims c
  where c.id=p_claim_id and c.location_id=loc and c.status='pending';
  if not found then return false; end if;

  perform 1
  from public.schedule_shifts s
  where s.id=v_shift_id and s.location_id=loc
  for update;
  if not found then raise exception 'shift not found'; end if;

  return public.review_shift_claim_unlocked_v1(p_claim_id,p_decision);
end
$function$;
revoke all on function public.review_shift_claim(uuid,text) from public, anon;
grant execute on function public.review_shift_claim(uuid,text) to authenticated;

alter function public.review_shift_pool_bid(uuid,text)
  rename to review_shift_pool_bid_unlocked_v1;
revoke all on function public.review_shift_pool_bid_unlocked_v1(uuid,text)
  from public, anon, authenticated;

create function public.review_shift_pool_bid(p_bid_id uuid, p_decision text)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  loc uuid:=public.current_location_id();
  v_offer_id uuid;
  v_shift_id uuid;
begin
  if auth.uid() is null or public.current_app_role() not in ('admin','manager') then
    raise exception 'manager access required';
  end if;
  if p_decision not in ('approved','denied') then raise exception 'invalid decision'; end if;

  select b.offer_id into v_offer_id
  from public.shift_pool_bids b
  where b.id=p_bid_id and b.location_id=loc and b.status='pending';
  if not found then return false; end if;

  select o.shift_id into v_shift_id
  from public.shift_pool_offers o
  where o.id=v_offer_id and o.location_id=loc and o.status='open';
  if not found then raise exception 'offer is no longer open'; end if;

  -- Canonical order matches schedule-shift mutation triggers: shift -> offer.
  perform 1
  from public.schedule_shifts s
  where s.id=v_shift_id and s.location_id=loc
  for update;
  if not found then raise exception 'shift not found'; end if;

  perform 1
  from public.shift_pool_offers o
  where o.id=v_offer_id and o.location_id=loc and o.status='open'
  for update;
  if not found then raise exception 'offer is no longer open'; end if;

  return public.review_shift_pool_bid_unlocked_v1(p_bid_id,p_decision);
end
$function$;
revoke all on function public.review_shift_pool_bid(uuid,text) from public, anon;
grant execute on function public.review_shift_pool_bid(uuid,text) to authenticated;

alter function public.review_shift_change_request(uuid,text)
  rename to review_shift_change_request_unlocked_v1;
revoke all on function public.review_shift_change_request_unlocked_v1(uuid,text)
  from public, anon, authenticated;

create function public.review_shift_change_request(p_request_id uuid, p_decision text)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  loc uuid:=public.current_location_id();
begin
  if auth.uid() is null or public.current_app_role() not in ('admin','manager') then
    raise exception 'manager access required';
  end if;
  if p_decision not in ('approved','denied') then raise exception 'invalid decision'; end if;

  -- Preserve the existing request -> shift row-lock order used by coworker response
  -- RPCs, while serializing all manager decisions for a location with one advisory
  -- transaction lock. Reciprocal A->B / B->A (and longer cycles) therefore cannot
  -- run concurrently, and employee response/cancel paths cannot deadlock on this
  -- lock because they never acquire it.
  perform pg_advisory_xact_lock(
    hashtextextended('el-molino:shift-change-review:'||loc::text,0)
  );

  return public.review_shift_change_request_unlocked_v1(p_request_id,p_decision);
end
$function$;
revoke all on function public.review_shift_change_request(uuid,text) from public, anon;
grant execute on function public.review_shift_change_request(uuid,text) to authenticated;
