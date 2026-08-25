-- LUMINA Money v1.5.9 - Email/Password Auth + per-user RLS.
-- Chạy toàn bộ file này trong Supabase SQL Editor của CHÍNH dự án Supabase chủ app.
-- Người dùng cuối đăng ký/đăng nhập bằng email + mật khẩu qua Supabase Auth; họ KHÔNG cần tài khoản quản trị Supabase.
-- Tất cả người dùng dùng chung database, nhưng RLS khóa từng hàng theo auth.uid().

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  monthly_budget numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('income','expense','saving')),
  amount numeric not null check (amount > 0),
  category text not null default 'Khác',
  note text,
  account text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  target numeric not null check (target > 0),
  saved numeric not null default 0 check (saved >= 0),
  due_date date,
  icon text default '🎯',
  created_at timestamptz not null default now()
);

create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text default 'Ví',
  balance numeric not null default 0,
  icon text default '💳',
  created_at timestamptz not null default now()
);

create table if not exists public.loans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  principal numeric not null default 0,
  remaining numeric not null default 0,
  due_date date,
  created_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  amount numeric not null default 0,
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly','yearly')),
  next_charge date,
  created_at timestamptz not null default now()
);

create table if not exists public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bank_name text not null,
  account_label text,
  last4 text,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_transactions_user_date on public.transactions(user_id, occurred_at desc);
create index if not exists idx_goals_user on public.goals(user_id);
create index if not exists idx_wallets_user on public.wallets(user_id);
create index if not exists idx_loans_user on public.loans(user_id);
create index if not exists idx_subscriptions_user on public.subscriptions(user_id);
create index if not exists idx_bank_accounts_user on public.bank_accounts(user_id);

alter table public.profiles enable row level security;
alter table public.transactions enable row level security;
alter table public.goals enable row level security;
alter table public.wallets enable row level security;
alter table public.loans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.bank_accounts enable row level security;

-- Bắt buộc áp RLS ở cấp bảng. Frontend chỉ được dùng anon/publishable key.
alter table public.profiles force row level security;
alter table public.transactions force row level security;
alter table public.goals force row level security;
alter table public.wallets force row level security;
alter table public.loans force row level security;
alter table public.subscriptions force row level security;
alter table public.bank_accounts force row level security;

do $$
declare t text;
begin
  foreach t in array array['transactions','goals','wallets','loans','subscriptions','bank_accounts']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_own_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t || '_own_all', t
    );
  end loop;
end $$;

drop policy if exists profiles_own_select on public.profiles;
create policy profiles_own_select on public.profiles for select to authenticated using (auth.uid() = id);
drop policy if exists profiles_own_update on public.profiles;
create policy profiles_own_update on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Bật realtime để Safari và bản "Add to Home Screen" nhận thay đổi gần như tức thời.
do $$
begin
  begin alter publication supabase_realtime add table public.transactions; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.goals; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.wallets; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.loans; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.subscriptions; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.bank_accounts; exception when duplicate_object then null; end;
end $$;


-- EMAIL LOGIN SETUP (thực hiện trong Dashboard, không phải SQL):
-- 1) Authentication > Providers > Email: bật Email provider.
-- 2) Nên bật Confirm email để tài khoản phải xác nhận email trước khi đăng nhập.
-- 3) Authentication > URL Configuration: Site URL = domain Vercel; thêm domain Vercel vào Redirect URLs.
-- 4) Không cần bật Google Provider, không cần Google Cloud, Client ID hay Client Secret.
-- 5) Frontend chỉ dùng Project URL + anon/publishable key. Tuyệt đối không đưa service_role key lên GitHub/Vercel frontend.


-- QUAN TRỌNG: cấp quyền bảng cho người dùng đã đăng nhập.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;

-- Nếu đã từng gặp lỗi "permission denied for table transactions",
-- hãy chạy lại toàn bộ file SQL v1.5.9 này rồi đăng xuất/đăng nhập lại trong app.

-- ===== LUMINA v1.5.9 migrations =====
-- Giao dịch bắt buộc gắn với một Ví & Tài sản của chính người dùng.
alter table public.transactions add column if not exists wallet_id uuid references public.wallets(id) on delete set null;
create index if not exists idx_transactions_wallet on public.transactions(wallet_id);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text,
  type text not null default 'info',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifications_user_date on public.notifications(user_id, created_at desc);
alter table public.notifications enable row level security;
alter table public.notifications force row level security;
drop policy if exists notifications_own_all on public.notifications;
create policy notifications_own_all on public.notifications
for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

grant select, insert, update, delete on public.notifications to authenticated;
grant select, insert, update, delete on public.transactions to authenticated;
grant select, insert, update, delete on public.wallets to authenticated;

-- Ghi giao dịch và cập nhật số dư ví trong CÙNG một transaction DB.
create or replace function public.record_transaction(
  p_kind text,
  p_amount numeric,
  p_category text,
  p_note text,
  p_wallet_id uuid,
  p_occurred_at timestamptz default now()
)
returns setof public.transactions
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_wallet public.wallets%rowtype;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;
  if p_kind not in ('income','expense','saving') then
    raise exception 'INVALID_KIND';
  end if;

  select * into v_wallet
  from public.wallets
  where id = p_wallet_id and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'WALLET_REQUIRED';
  end if;

  insert into public.transactions(user_id,kind,amount,category,note,account,wallet_id,occurred_at)
  values(auth.uid(),p_kind,p_amount,coalesce(nullif(p_category,''),'Khác'),p_note,v_wallet.name,v_wallet.id,coalesce(p_occurred_at,now()))
  returning id into v_id;

  update public.wallets
  set balance = balance + case when p_kind='income' then p_amount else -p_amount end
  where id=v_wallet.id and user_id=auth.uid();

  return query select * from public.transactions where id=v_id and user_id=auth.uid();
end;
$$;

grant execute on function public.record_transaction(text,numeric,text,text,uuid,timestamptz) to authenticated;

-- Xóa giao dịch và hoàn nguyên số dư ví.
create or replace function public.delete_transaction(p_transaction_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tx public.transactions%rowtype;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_tx
  from public.transactions
  where id=p_transaction_id and user_id=auth.uid()
  for update;

  if not found then return false; end if;

  delete from public.transactions where id=v_tx.id and user_id=auth.uid();

  if v_tx.wallet_id is not null then
    update public.wallets
    set balance = balance + case when v_tx.kind='income' then -v_tx.amount else v_tx.amount end
    where id=v_tx.wallet_id and user_id=auth.uid();
  end if;
  return true;
end;
$$;

grant execute on function public.delete_transaction(uuid) to authenticated;

-- Realtime cho chuông thông báo.
do $$
begin
  begin alter publication supabase_realtime add table public.notifications; exception when duplicate_object then null; end;
end $$;
