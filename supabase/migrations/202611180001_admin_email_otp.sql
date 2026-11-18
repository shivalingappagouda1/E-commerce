-- ShopKart admin email OTP protection.
-- Apply only after reviewing the target project and taking a database backup.

begin;

create table if not exists public.admin_otp_challenges (
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  otp_hash text not null,
  attempts integer not null default 0 check (attempts between 0 and 5),
  last_sent_at timestamptz not null default now(),
  otp_expires_at timestamptz not null,
  verified_at timestamptz,
  verified_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, session_id),
  constraint admin_otp_hash_format check (otp_hash ~ '^[0-9a-f]{64}$')
);

alter table public.admin_otp_challenges enable row level security;
revoke all on table public.admin_otp_challenges from public, anon, authenticated;

-- Serializes issuance for a user/session even when no challenge row exists yet.
create or replace function public.admin_otp_issue(
  p_user_id uuid,
  p_session_id uuid,
  p_otp_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_last_sent timestamptz;
begin
  if p_user_id is null or p_session_id is null
     or p_otp_hash is null or p_otp_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid OTP issue parameters';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text || ':' || p_session_id::text, 0)
  );

  select p.role into v_role
  from public.profiles p
  where p.id = p_user_id;

  if v_role is distinct from 'admin' then
    raise exception 'not an administrator';
  end if;

  select c.last_sent_at into v_last_sent
  from public.admin_otp_challenges c
  where c.user_id = p_user_id and c.session_id = p_session_id
  for update;

  if found and v_last_sent > pg_catalog.now() - interval '60 seconds' then
    raise exception 'cooldown: wait 60 seconds';
  end if;

  insert into public.admin_otp_challenges (
    user_id, session_id, otp_hash, attempts, last_sent_at,
    otp_expires_at, verified_at, verified_until, updated_at
  )
  values (
    p_user_id, p_session_id, p_otp_hash, 0, pg_catalog.now(),
    pg_catalog.now() + interval '5 minutes', null, null, pg_catalog.now()
  )
  on conflict (user_id, session_id) do update
  set otp_hash = excluded.otp_hash,
      attempts = 0,
      last_sent_at = excluded.last_sent_at,
      otp_expires_at = excluded.otp_expires_at,
      verified_at = null,
      verified_until = null,
      updated_at = excluded.updated_at;

  return true;
end;
$$;

-- Verify and increment failed attempts under one row lock, avoiding lost updates.
create or replace function public.admin_otp_verify(
  p_user_id uuid,
  p_session_id uuid,
  p_otp_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_challenge public.admin_otp_challenges%rowtype;
begin
  if p_user_id is null or p_session_id is null
     or p_otp_hash is null or p_otp_hash !~ '^[0-9a-f]{64}$' then
    return false;
  end if;

  select c.* into v_challenge
  from public.admin_otp_challenges c
  where c.user_id = p_user_id and c.session_id = p_session_id
  for update;

  if not found
     or v_challenge.verified_at is not null
     or v_challenge.otp_expires_at <= pg_catalog.now()
     or v_challenge.attempts >= 5 then
    return false;
  end if;

  if v_challenge.otp_hash = p_otp_hash then
    update public.admin_otp_challenges
    set verified_at = pg_catalog.now(),
        verified_until = pg_catalog.now() + interval '12 hours',
        updated_at = pg_catalog.now()
    where user_id = p_user_id and session_id = p_session_id;
    return true;
  end if;

  update public.admin_otp_challenges
  set attempts = attempts + 1,
      updated_at = pg_catalog.now()
  where user_id = p_user_id and session_id = p_session_id;

  return false;
end;
$$;

create or replace function public.admin_otp_session_status(
  p_user_id uuid,
  p_session_id uuid
)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.admin_otp_challenges c
    join public.profiles p on p.id = c.user_id
    where c.user_id = p_user_id
      and c.session_id = p_session_id
      and p.role = 'admin'
      and c.verified_at is not null
      and c.verified_until > pg_catalog.now()
  );
$$;

-- Roll back a challenge only if this exact issue request created it.
-- This prevents failed Brevo delivery from leaving an unusable 60-second cooldown.
create or replace function public.admin_otp_cancel_issue(
  p_user_id uuid,
  p_session_id uuid,
  p_otp_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from public.admin_otp_challenges c
  where c.user_id = p_user_id
    and c.session_id = p_session_id
    and c.otp_hash = p_otp_hash
    and c.verified_at is null;
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

-- Safe session_id claim handling: malformed/missing JWT claims deny admin access
-- instead of raising an invalid UUID cast exception.
create or replace function public.is_admin()
returns boolean
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_session_claim text;
  v_session_id uuid;
begin
  v_session_claim := auth.jwt() ->> 'session_id';

  if v_session_claim is null
     or v_session_claim !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return false;
  end if;

  v_session_id := v_session_claim::uuid;

  return exists (
    select 1
    from public.profiles p
    join public.admin_otp_challenges c on c.user_id = p.id
    where p.id = auth.uid()
      and p.role = 'admin'
      and c.session_id = v_session_id
      and c.verified_at is not null
      and c.verified_until > pg_catalog.now()
  );
end;
$$;

-- These RPCs are only callable by the Edge Function's service-role client.
revoke all on function public.admin_otp_issue(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.admin_otp_verify(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.admin_otp_session_status(uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_otp_cancel_issue(uuid, uuid, text) from public, anon, authenticated;

grant execute on function public.admin_otp_issue(uuid, uuid, text) to service_role;
grant execute on function public.admin_otp_verify(uuid, uuid, text) to service_role;
grant execute on function public.admin_otp_session_status(uuid, uuid) to service_role;
grant execute on function public.admin_otp_cancel_issue(uuid, uuid, text) to service_role;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

commit;
