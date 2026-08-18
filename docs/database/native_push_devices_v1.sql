-- Native APNs/FCM device enrollment. Provision native_push_token_encryption_key in Vault first.
create extension if not exists pgcrypto;
create table if not exists public.native_push_devices(
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 device_id uuid not null, platform text not null check(platform in ('ios','android')),
 token_ciphertext text not null, disabled_at timestamptz, last_seen_at timestamptz not null default now(),
 created_at timestamptz not null default now(), unique(user_id,device_id)
);
alter table public.native_push_devices enable row level security;
revoke all on public.native_push_devices from anon,authenticated;
grant all on public.native_push_devices to service_role;

create or replace function public.register_my_native_push_device(p_device_id uuid,p_platform text,p_token text) returns boolean
language plpgsql security definer set search_path='pg_catalog','public','auth','vault' as $$
declare status jsonb; encryption_key text;
begin
 if auth.uid() is null then raise exception 'authentication required'; end if;
 status:=public.employee_self_setup_status();
 if coalesce((status->>'access_allowed')::boolean,false) is not true then raise exception 'active employee access required'; end if;
 if p_platform not in ('ios','android') or length(trim(coalesce(p_token,''))) not between 16 and 4096 then raise exception 'invalid native push token'; end if;
 select decrypted_secret into encryption_key from vault.decrypted_secrets where name='native_push_token_encryption_key' limit 1;
 if length(coalesce(encryption_key,''))<32 then raise exception 'native push encryption is not configured'; end if;
 insert into public.native_push_devices(user_id,device_id,platform,token_ciphertext,disabled_at,last_seen_at)
 values(auth.uid(),p_device_id,p_platform,encode(pgp_sym_encrypt(p_token,encryption_key,'cipher-algo=aes256'),'base64'),null,now()) on conflict(user_id,device_id) do update set platform=excluded.platform,token_ciphertext=excluded.token_ciphertext,disabled_at=null,last_seen_at=now();
 return true;
end $$;
create or replace function public.remove_my_native_push_device(p_device_id uuid) returns boolean
language plpgsql security definer set search_path='pg_catalog','public','auth' as $$ begin
 if auth.uid() is null then raise exception 'authentication required'; end if;
 update public.native_push_devices set disabled_at=now(),token_ciphertext='',last_seen_at=now() where user_id=auth.uid() and device_id=p_device_id;return found;
end $$;
revoke all on function public.register_my_native_push_device(uuid,text,text) from public,anon;
revoke all on function public.remove_my_native_push_device(uuid) from public,anon;
grant execute on function public.register_my_native_push_device(uuid,text,text) to authenticated;
grant execute on function public.remove_my_native_push_device(uuid) to authenticated;
