-- El Molino Ops: deterministic lock ordering for competing schedule reviews.
--
-- Parent schedule resources are locked before child claim/bid rows where a review
-- can resolve sibling rows. Reciprocal swap shifts are locked in UUID order. This
-- removes deadlock cycles without weakening any eligibility or manager checks.

create or replace function public.review_shift_claim(p_claim_id uuid, p_decision text)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  c public.shift_claims%rowtype;
  s public.schedule_shifts%rowtype;
  loc uuid:=public.current_location_id();
  warnings jsonb;
  v_shift_id uuid;
begin
  if auth.uid() is null or public.current_app_role() not in('admin','manager') then
    raise exception 'manager access required';
  end if;
  if p_decision not in('approved','denied') then raise exception 'invalid decision'; end if;

  -- Discover the parent without taking a child lock, then serialize every review
  -- and every new claim on the shift row first.
  select shift_id into v_shift_id
  from public.shift_claims
  where id=p_claim_id and location_id=loc and status='pending';
  if not found then return false; end if;

  select * into s
  from public.schedule_shifts
  where id=v_shift_id and location_id=loc
  for update;
  if not found then raise exception 'shift not found'; end if;

  select * into c
  from public.shift_claims
  where id=p_claim_id and location_id=loc and status='pending'
  for update;
  if not found then return false; end if;
  if c.shift_id is distinct from s.id then raise exception 'claim parent changed during review'; end if;

  if p_decision='approved' then
    warnings:=public.open_shift_candidate_warnings(s.id,c.employee_id);
    if exists(select 1 from jsonb_array_elements(warnings) x where x->>'severity'='error') then
      raise exception 'claim can no longer be approved because the employee now conflicts with this shift';
    end if;
    perform set_config('el_molino.published_schedule_rpc','1',true);
    update public.schedule_shifts
      set employee_id=c.employee_id,status='covered',source='claim'
      where id=s.id;
    update public.shift_claims
      set status='denied',reviewed_by=auth.uid(),reviewed_at=now()
      where shift_id=s.id and status='pending' and id<>c.id;
  end if;

  update public.shift_claims
    set status=p_decision,reviewed_by=auth.uid(),reviewed_at=now()
    where id=c.id;
  perform public.notify_schedule_employee(
    loc,c.employee_id,'schedule','Open-shift claim '||p_decision,
    'Your open-shift request was '||p_decision||'.','/schedule/pool',
    jsonb_build_object('shift_id',s.id,'claim_id',c.id,'decision',p_decision)
  );
  return true;
end
$function$;

create or replace function public.review_shift_change_request(p_request_id uuid, p_decision text)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  r public.shift_change_requests%rowtype;
  a public.schedule_shifts%rowtype;
  b public.schedule_shifts%rowtype;
  loc uuid:=public.current_location_id();
  wa jsonb;
  wb jsonb;
  v_locked integer:=0;
begin
  if auth.uid() is null or public.current_app_role() not in('admin','manager') then
    raise exception 'manager access required';
  end if;
  if p_decision not in('approved','denied') then raise exception 'invalid decision'; end if;

  select * into r
  from public.shift_change_requests
  where id=p_request_id and location_id=loc and status='pending'
  for update;
  if not found then return false; end if;

  if r.request_type='swap' and r.target_response not in('accepted','not_required') then
    raise exception 'coworker must accept the trade before manager review';
  end if;

  if p_decision='approved' then
    if r.request_type='swap' and r.target_shift_id is null then
      raise exception 'swap requires a target shift';
    end if;

    -- Lock all involved shift rows in one deterministic UUID order. Reciprocal
    -- requests A->B and B->A can no longer acquire the same pair in reverse order.
    perform s.id
    from public.schedule_shifts s
    where s.location_id=loc
      and (s.id=r.shift_id or (r.target_shift_id is not null and s.id=r.target_shift_id))
    order by s.id
    for update;
    get diagnostics v_locked = row_count;
    if v_locked < case when r.request_type='swap' then 2 else 1 end then
      raise exception 'shift request references an unavailable shift';
    end if;

    select * into a
    from public.schedule_shifts
    where id=r.shift_id and location_id=loc;
    if not found or a.ends_at<=now() then raise exception 'source shift is unavailable'; end if;

    perform set_config('el_molino.published_schedule_rpc','1',true);
    if r.request_type in('callout','coverage') then
      update public.schedule_shifts set status='open',employee_id=null where id=a.id;
      if r.target_employee_id is not null then
        update public.schedule_shifts set employee_id=r.target_employee_id,status='covered',source='swap' where id=a.id;
      end if;
    elsif r.request_type='swap' then
      select * into b
      from public.schedule_shifts
      where id=r.target_shift_id and location_id=loc;
      if not found or b.ends_at<=now() or a.employee_id is null or b.employee_id is null then
        raise exception 'swap shifts are unavailable';
      end if;
      if r.requested_by_employee_id is distinct from a.employee_id then
        raise exception 'requester no longer owns source shift';
      end if;
      if r.target_employee_id is distinct from b.employee_id then
        raise exception 'target employee no longer owns target shift';
      end if;

      wa:=public.employee_trade_candidate_warnings(a.employee_id,a.id,b.id);
      wb:=public.employee_trade_candidate_warnings(b.employee_id,b.id,a.id);
      if exists(select 1 from jsonb_array_elements(wa) x where x->>'severity'='error')
         or exists(select 1 from jsonb_array_elements(wb) x where x->>'severity'='error') then
        raise exception 'trade can no longer be approved because eligibility changed';
      end if;

      update public.schedule_shifts set employee_id=null,status='open' where id in(a.id,b.id);
      update public.schedule_shifts set employee_id=b.employee_id,status='covered',source='swap' where id=a.id;
      update public.schedule_shifts set employee_id=a.employee_id,status='covered',source='swap' where id=b.id;
    end if;
  end if;

  update public.shift_change_requests
    set status=p_decision,reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now()
    where id=r.id;
  if r.requested_by_employee_id is not null then
    perform public.notify_schedule_employee(
      loc,r.requested_by_employee_id,'schedule','Shift request '||p_decision,
      initcap(r.request_type)||' request was '||p_decision||'.','/schedule/pool',
      jsonb_build_object('request_id',r.id,'decision',p_decision,'type',r.request_type)
    );
  end if;
  if r.request_type='swap' and r.target_employee_id is not null
     and r.target_employee_id is distinct from r.requested_by_employee_id then
    perform public.notify_schedule_employee(
      loc,r.target_employee_id,'schedule','Shift swap '||p_decision,
      'A shift swap involving you was '||p_decision||'.','/schedule/pool',
      jsonb_build_object('request_id',r.id,'decision',p_decision)
    );
  end if;
  return true;
end
$function$;

create or replace function public.review_shift_pool_bid(p_bid_id uuid, p_decision text)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  loc uuid:=public.current_location_id();
  b public.shift_pool_bids%rowtype;
  o public.shift_pool_offers%rowtype;
  s public.schedule_shifts%rowtype;
  warnings jsonb;
  left_id uuid;
  right_id uuid;
  structured_count int:=0;
  structured_unpaid int:=0;
  left_unpaid int:=0;
  offer_unpaid int:=0;
  right_unpaid int:=0;
  br record;
  br_end timestamptz;
  v_offer_id uuid;
  v_shift_id uuid;
begin
  if auth.uid() is null or public.current_app_role() not in ('admin','manager') then
    raise exception 'manager access required';
  end if;
  if p_decision not in ('approved','denied') then raise exception 'invalid decision'; end if;

  -- Discover parent ids without child locks. The canonical order is
  -- schedule_shift -> shift_pool_offer -> selected bid. Manual shift mutations
  -- already take shift -> offer through expire_shift_pool_offer_on_shift_change().
  select offer_id into v_offer_id
  from public.shift_pool_bids
  where id=p_bid_id and location_id=loc and status='pending';
  if not found then return false; end if;

  select shift_id into v_shift_id
  from public.shift_pool_offers
  where id=v_offer_id and location_id=loc and status='open';
  if not found then raise exception 'offer is no longer open'; end if;

  select * into s
  from public.schedule_shifts
  where id=v_shift_id and location_id=loc
  for update;
  if not found then raise exception 'shift not found'; end if;

  select * into o
  from public.shift_pool_offers
  where id=v_offer_id and location_id=loc and status='open'
  for update;
  if not found then raise exception 'offer is no longer open'; end if;

  select * into b
  from public.shift_pool_bids
  where id=p_bid_id and location_id=loc and status='pending'
  for update;
  if not found then return false; end if;

  if b.offer_id is distinct from o.id or o.shift_id is distinct from s.id then
    raise exception 'shift pool parent changed during review';
  end if;
  if s.employee_id is distinct from o.offered_by_employee_id or s.updated_at is distinct from o.shift_version_at then
    raise exception 'shift changed after it was offered; withdraw and offer it again';
  end if;

  if p_decision='approved' then
    warnings:=public.shift_pool_candidate_warnings(o.id,b.employee_id);
    if exists(select 1 from jsonb_array_elements(warnings) x where x->>'severity'='error') then
      raise exception 'bidder is no longer eligible for this shift';
    end if;
    perform set_config('el_molino.published_schedule_rpc','1',true);
    perform set_config('el_molino.shift_pool_assignment_rpc','1',true);

    if o.offer_type='full' then
      update public.schedule_shifts set employee_id=b.employee_id,status='covered',source='shift_pool' where id=s.id;
    else
      if o.offered_starts_at<=s.starts_at and o.offered_ends_at>=s.ends_at then
        raise exception 'partial offer unexpectedly covers the full shift';
      end if;
      select count(*),coalesce(sum(case when not paid then duration_minutes else 0 end),0)
        into structured_count,structured_unpaid
      from public.schedule_shift_breaks where shift_id=s.id;
      if s.break_minutes>0 and structured_count=0 then
        raise exception 'partial transfer requires scheduled break times because this shift has unpaid break minutes';
      end if;
      if structured_count>0 and structured_unpaid<>s.break_minutes then
        raise exception 'structured unpaid breaks do not match the shift unpaid break total';
      end if;

      for br in select * from public.schedule_shift_breaks where shift_id=s.id order by starts_at loop
        br_end:=br.starts_at+make_interval(mins=>br.duration_minutes);
        if (br.starts_at<o.offered_starts_at and br_end>o.offered_starts_at)
           or (br.starts_at<o.offered_ends_at and br_end>o.offered_ends_at) then
          raise exception 'a scheduled break crosses the partial-shift boundary; move the break before approving';
        end if;
        if not br.paid then
          if br_end<=o.offered_starts_at then left_unpaid:=left_unpaid+br.duration_minutes;
          elsif br.starts_at>=o.offered_ends_at then right_unpaid:=right_unpaid+br.duration_minutes;
          else offer_unpaid:=offer_unpaid+br.duration_minutes;
          end if;
        end if;
      end loop;

      update public.schedule_shifts
      set starts_at=o.offered_starts_at,ends_at=o.offered_ends_at,employee_id=b.employee_id,
          status='covered',source='shift_pool',break_minutes=offer_unpaid,
          notes=concat_ws(' · ',nullif(s.notes,''),'Partial Shift Pool transfer')
      where id=s.id;

      if o.offered_starts_at>s.starts_at then
        insert into public.schedule_shifts(
          location_id,schedule_period_id,coverage_requirement_id,generation_run_id,employee_id,role_id,
          starts_at,ends_at,break_minutes,status,notes,source,is_locked,constraint_override_reason
        ) values(
          s.location_id,s.schedule_period_id,s.coverage_requirement_id,s.generation_run_id,
          o.offered_by_employee_id,s.role_id,s.starts_at,o.offered_starts_at,left_unpaid,'scheduled',
          concat_ws(' · ',nullif(s.notes,''),'Retained portion after partial Shift Pool transfer'),
          'pool_retained',s.is_locked,s.constraint_override_reason
        ) returning id into left_id;
        update public.schedule_shift_breaks set shift_id=left_id
        where shift_id=s.id and starts_at<o.offered_starts_at;
      end if;

      if o.offered_ends_at<s.ends_at then
        insert into public.schedule_shifts(
          location_id,schedule_period_id,coverage_requirement_id,generation_run_id,employee_id,role_id,
          starts_at,ends_at,break_minutes,status,notes,source,is_locked,constraint_override_reason
        ) values(
          s.location_id,s.schedule_period_id,s.coverage_requirement_id,s.generation_run_id,
          o.offered_by_employee_id,s.role_id,o.offered_ends_at,s.ends_at,right_unpaid,'scheduled',
          concat_ws(' · ',nullif(s.notes,''),'Retained portion after partial Shift Pool transfer'),
          'pool_retained',s.is_locked,s.constraint_override_reason
        ) returning id into right_id;
        update public.schedule_shift_breaks set shift_id=right_id
        where shift_id=s.id and starts_at>=o.offered_ends_at;
      end if;
    end if;

    update public.shift_pool_offers
      set status='assigned',assigned_to_employee_id=b.employee_id,resolved_by=auth.uid(),resolved_at=now()
      where id=o.id;
    update public.shift_pool_bids
      set status='denied',reviewed_by=auth.uid(),reviewed_at=now()
      where offer_id=o.id and status='pending' and id<>b.id;
    update public.shift_pool_bids
      set status='approved',reviewed_by=auth.uid(),reviewed_at=now()
      where id=b.id;

    perform public.notify_schedule_employee(
      loc,o.offered_by_employee_id,'schedule',
      case when o.offer_type='partial' then 'Part of your shift was covered' else 'Your shift was covered' end,
      case when o.offer_type='partial'
        then 'A manager approved a coworker to take the offered part of your shift. Your retained portion remains your responsibility.'
        else 'A manager approved a coworker to take your shift. You are no longer responsible for it.' end,
      '/schedule',jsonb_build_object('offer_id',o.id,'shift_id',s.id,'offer_type',o.offer_type,'retained_left_shift_id',left_id,'retained_right_shift_id',right_id)
    );
    perform public.notify_schedule_employee(
      loc,b.employee_id,'schedule','Shift Pool bid approved',
      case when o.offer_type='partial' then 'The offered portion of the shift is now assigned to you.' else 'The shift is now assigned to you.' end,
      '/schedule',jsonb_build_object('offer_id',o.id,'shift_id',s.id,'offer_type',o.offer_type)
    );
    insert into public.notifications(location_id,user_id,type,title,body,href,data)
    select loc,e.user_id,'schedule','Shift Pool bid closed','Another employee was assigned this shift.','/schedule',
           jsonb_build_object('offer_id',o.id,'shift_id',s.id)
    from public.shift_pool_bids x
    join public.employees e on e.id=x.employee_id
    where x.offer_id=o.id and x.id<>b.id and x.status='denied' and e.user_id is not null;
  else
    update public.shift_pool_bids
      set status='denied',reviewed_by=auth.uid(),reviewed_at=now()
      where id=b.id;
    perform public.notify_schedule_employee(
      loc,b.employee_id,'schedule','Shift Pool bid denied',
      'Your request to take the shift was not approved.','/schedule',
      jsonb_build_object('offer_id',o.id,'shift_id',s.id)
    );
  end if;
  return true;
end
$function$;
