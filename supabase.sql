-- LUMINA Money v1.5.7 - Email/Password Auth + per-user RLS.
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
