-- ShopKart account deletion lifecycle. Apply ONLY to ShopKart-Staging after review.
-- Adds a seven-day reversible deletion state and blocks customer-owned RLS access.

begin;

alter table public.profiles
  add column if not exists account_status text not null default 'active',
  add column if not exists deletion_requested_at timestamptz,
  add column if not exists deletion_scheduled_for timestamptz;

alter table public.profiles
  drop constraint if exists profiles_account_status_check;
alter table public.profiles
  add constraint profiles_account_status_check
  check (account_status in ('active','pending_deletion','deleting'));

create table if not exists public.account_lifecycle_challenges (
  user_id uuid not null,
  purpose text not null check (purpose in ('delete','restore')),
  otp_hash text not null,
  attempts integer not null default 0 check (attempts between 0 and 5),
  expires_at timestamptz not null,
  last_sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (user_id, purpose)
);
alter table public.account_lifecycle_challenges enable row level security;
revoke all on public.account_lifecycle_challenges from anon, authenticated, public;
grant all on public.account_lifecycle_challenges to service_role;

create or replace function public.is_account_active()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.account_status = 'active'
  );
$$;
revoke all on function public.is_account_active() from public;
grant execute on function public.is_account_active() to anon, authenticated;

-- Atomic OTP consumption + state transition. Callable only by service_role.
create or replace function public.account_lifecycle_confirm(
  p_user_id uuid,
  p_purpose text,
  p_otp_hash text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare c public.account_lifecycle_challenges%rowtype;
begin
  select * into c from public.account_lifecycle_challenges
   where user_id = p_user_id and purpose = p_purpose for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'invalid'); end if;
  if c.expires_at <= now() then
    delete from public.account_lifecycle_challenges where user_id=p_user_id and purpose=p_purpose;
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  if c.attempts >= 5 then
    delete from public.account_lifecycle_challenges where user_id=p_user_id and purpose=p_purpose;
    return jsonb_build_object('ok', false, 'reason', 'locked');
  end if;
  if c.otp_hash <> p_otp_hash then
    update public.account_lifecycle_challenges set attempts=attempts+1
     where user_id=p_user_id and purpose=p_purpose;
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  if p_purpose = 'delete' then
    update public.profiles
       set account_status='pending_deletion',
           deletion_requested_at=now(),
           deletion_scheduled_for=now()+interval '7 days',
           updated_at=now()
     where id=p_user_id and role='customer' and account_status='active';
    if not found then return jsonb_build_object('ok', false, 'reason', 'not_eligible'); end if;
  elsif p_purpose = 'restore' then
    update public.profiles
       set account_status='active', deletion_requested_at=null,
           deletion_scheduled_for=null, updated_at=now()
     where id=p_user_id and role='customer' and account_status='pending_deletion'
       and deletion_scheduled_for > now();
    if not found then return jsonb_build_object('ok', false, 'reason', 'not_restorable'); end if;
  else
    return jsonb_build_object('ok', false, 'reason', 'invalid_purpose');
  end if;
  delete from public.account_lifecycle_challenges where user_id=p_user_id and purpose=p_purpose;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.account_lifecycle_confirm(uuid,text,text) from public, anon, authenticated;
grant execute on function public.account_lifecycle_confirm(uuid,text,text) to service_role;

-- Preserve order/payment/return evidence while allowing auth.users/profile deletion.
-- Existing data is not deleted by this migration.
do $$
declare r record;
begin
  for r in
    select con.conname
      from pg_constraint con
      join pg_attribute a on a.attrelid=con.conrelid and a.attnum=any(con.conkey)
     where con.contype='f' and con.conrelid='public.orders'::regclass
       and con.confrelid='public.profiles'::regclass and a.attname='user_id'
  loop execute format('alter table public.orders drop constraint %I', r.conname); end loop;
end $$;
alter table public.orders alter column user_id drop not null;
alter table public.orders add constraint orders_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete set null;

do $$
declare r record;
begin
  for r in
    select con.conname
      from pg_constraint con
      join pg_attribute a on a.attrelid=con.conrelid and a.attnum=any(con.conkey)
     where con.contype='f' and con.conrelid='public.payment_submissions'::regclass
       and con.confrelid='public.profiles'::regclass and a.attname='user_id'
  loop execute format('alter table public.payment_submissions drop constraint %I', r.conname); end loop;
end $$;
alter table public.payment_submissions alter column user_id drop not null;
alter table public.payment_submissions add constraint payment_submissions_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete set null;

do $$
declare r record;
begin
  for r in
    select con.conname
      from pg_constraint con
      join pg_attribute a on a.attrelid=con.conrelid and a.attnum=any(con.conkey)
     where con.contype='f' and con.conrelid='public.reviews'::regclass
       and con.confrelid='public.profiles'::regclass and a.attname='user_id'
  loop execute format('alter table public.reviews drop constraint %I', r.conname); end loop;
end $$;
alter table public.reviews alter column user_id drop not null;
alter table public.reviews add constraint reviews_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete set null;

-- return_requests.user_id was not reported as having a profile FK. Its UUID will be
-- pseudonymised by the purge worker before profile deletion (column remains NOT NULL).

-- Replace customer-owned policies with active-account checks. Admin policies remain intact.
drop policy if exists "Users delete own addresses" on public.addresses;
create policy "Users delete own addresses" on public.addresses for delete to public
 using (public.is_account_active() and auth.uid()=user_id);
drop policy if exists "Users insert own addresses" on public.addresses;
create policy "Users insert own addresses" on public.addresses for insert to public
 with check (public.is_account_active() and auth.uid()=user_id);
drop policy if exists "Users update own addresses" on public.addresses;
create policy "Users update own addresses" on public.addresses for update to public
 using (public.is_account_active() and auth.uid()=user_id)
 with check (public.is_account_active() and auth.uid()=user_id);
drop policy if exists "Users view own addresses" on public.addresses;
create policy "Users view own addresses" on public.addresses for select to public
 using (public.is_account_active() and auth.uid()=user_id);

drop policy if exists "Users delete own cart" on public.carts;
create policy "Users delete own cart" on public.carts for delete to public using (public.is_account_active() and auth.uid()=user_id);
drop policy if exists "Users insert own cart" on public.carts;
create policy "Users insert own cart" on public.carts for insert to public with check (public.is_account_active() and auth.uid()=user_id);
drop policy if exists "Users update own cart" on public.carts;
create policy "Users update own cart" on public.carts for update to public using (public.is_account_active() and auth.uid()=user_id) with check (public.is_account_active() and auth.uid()=user_id);
drop policy if exists "Users view own cart" on public.carts;
create policy "Users view own cart" on public.carts for select to public using (public.is_account_active() and auth.uid()=user_id);
drop policy if exists "Users view own cart items" on public.cart_items;
create policy "Users view own cart items" on public.cart_items for select to public
 using (public.is_account_active() and cart_id in (select c.id from public.carts c where c.user_id=auth.uid()));

drop policy if exists "Users delete own wishlist" on public.wishlists;
create policy "Users delete own wishlist" on public.wishlists for delete to public using (public.is_account_active() and auth.uid()=user_id);
drop policy if exists "Users insert own wishlist" on public.wishlists;
create policy "Users insert own wishlist" on public.wishlists for insert to public with check (public.is_account_active() and auth.uid()=user_id);
drop policy if exists "Users view own wishlist" on public.wishlists;
create policy "Users view own wishlist" on public.wishlists for select to public using (public.is_account_active() and auth.uid()=user_id);
drop policy if exists "Users delete own wishlist items" on public.wishlist_items;
create policy "Users delete own wishlist items" on public.wishlist_items for delete to public
 using (public.is_account_active() and wishlist_id in (select w.id from public.wishlists w where w.user_id=auth.uid()));
drop policy if exists "Users insert own wishlist items" on public.wishlist_items;
create policy "Users insert own wishlist items" on public.wishlist_items for insert to public
 with check (public.is_account_active() and wishlist_id in (select w.id from public.wishlists w where w.user_id=auth.uid()));
drop policy if exists "Users view own wishlist items" on public.wishlist_items;
create policy "Users view own wishlist items" on public.wishlist_items for select to public
 using (public.is_account_active() and wishlist_id in (select w.id from public.wishlists w where w.user_id=auth.uid()));

drop policy if exists "Users view own orders" on public.orders;
create policy "Users view own orders" on public.orders for select to public using (public.is_account_active() and auth.uid()=user_id);
drop policy if exists "Users view own order items" on public.order_items;
create policy "Users view own order items" on public.order_items for select to public
 using (public.is_account_active() and order_id in (select o.id from public.orders o where o.user_id=auth.uid()));
drop policy if exists "Users view own payments" on public.payments;
create policy "Users view own payments" on public.payments for select to public
 using (public.is_account_active() and order_id in (select o.id from public.orders o where o.user_id=auth.uid()));
drop policy if exists "Users view own payment submissions" on public.payment_submissions;
create policy "Users view own payment submissions" on public.payment_submissions for select to public
 using (public.is_account_active() and auth.uid()=user_id);

drop policy if exists "Users view own profile" on public.profiles;
create policy "Users view own profile" on public.profiles for select to public using (public.is_account_active() and auth.uid()=id);
drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile" on public.profiles for update to public
 using (public.is_account_active() and auth.uid()=id)
 with check (public.is_account_active() and auth.uid()=id and account_status='active');

-- Recreate the three review write policies and two customer read policies.
drop policy if exists "Users create own reviews" on public.reviews;
drop policy if exists "Users delete own reviews" on public.reviews;
drop policy if exists "Users update own reviews" on public.reviews;
drop policy if exists "Users view own reviews" on public.reviews;
create policy "Users create own reviews" on public.reviews for insert to public
 with check (public.is_account_active() and auth.uid()=user_id and is_approved=false);
create policy "Users delete own reviews" on public.reviews for delete to public
 using (public.is_account_active() and auth.uid()=user_id);
create policy "Users update own reviews" on public.reviews for update to public
 using (public.is_account_active() and auth.uid()=user_id)
 with check (public.is_account_active() and auth.uid()=user_id and is_approved=false);
create policy "Users view own reviews" on public.reviews for select to public
 using (public.is_account_active() and auth.uid()=user_id);

drop policy if exists "return_requests_select_own_or_admin" on public.return_requests;
create policy "return_requests_select_own_or_admin" on public.return_requests for select to authenticated
 using ((public.is_account_active() and user_id=auth.uid()) or is_admin());

drop policy if exists "Customers can view return inspections for own orders" on public.physical_return_inspections;
create policy "Customers can view return inspections for own orders" on public.physical_return_inspections for select to authenticated
 using ((public.is_account_active() and exists (select 1 from public.orders o where o.id=physical_return_inspections.order_id and o.user_id=auth.uid())) or is_admin());

commit;
