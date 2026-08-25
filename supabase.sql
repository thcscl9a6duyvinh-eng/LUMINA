-- LUMINA Money v1.5.11
-- Email/Password Auth + per-user RLS + atomic wallet balance trigger.
-- Chạy TOÀN BỘ file trong Supabase SQL Editor của project chủ app.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  monthly_budget numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('income','expense','saving')),
  amount numeric not null check (amount > 0),
  category text not null default 'Khác',
  note text,
  account text,
  wallet_id uuid references public.wallets(id) on delete set null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.transactions add column if not exists wallet_id uuid references public.wallets(id) on delete set null;

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

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text,
  type text not null default 'info',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_transactions_user_date on public.transactions(user_id, occurred_at desc);
create index if not exists idx_transactions_wallet on public.transactions(wallet_id);
create index if not exists idx_goals_user on public.goals(user_id);
create index if not exists idx_wallets_user on public.wallets(user_id);
create index if not exists idx_loans_user on public.loans(user_id);
create index if not exists idx_subscriptions_user on public.subscriptions(user_id);
create index if not exists idx_bank_accounts_user on public.bank_accounts(user_id);
create index if not exists idx_notifications_user_date on public.notifications(user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.transactions enable row level security;
alter table public.goals enable row level security;
alter table public.wallets enable row level security;
alter table public.loans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.bank_accounts enable row level security;
alter table public.notifications enable row level security;

alter table public.profiles force row level security;
alter table public.transactions force row level security;
alter table public.goals force row level security;
alter table public.wallets force row level security;
alter table public.loans force row level security;
alter table public.subscriptions force row level security;
alter table public.bank_accounts force row level security;
alter table public.notifications force row level security;

do $$
declare t text;
begin
  foreach t in array array['transactions','goals','wallets','loans','subscriptions','bank_accounts','notifications']
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
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

-- v1.5.11: đồng bộ số dư ví bằng trigger DB + tương thích các PWA cũ đang bị Update Gate giữ lại.
-- KHÔNG được phá API/database mà các release cũ còn đang dùng.
create or replace function public.lumina_sync_transaction_wallet()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_wallet_id uuid;
  v_wallet_name text;
  v_delta numeric;
begin
  if tg_op = 'INSERT' then
    if auth.uid() is null or new.user_id <> auth.uid() then
      raise exception 'AUTH_REQUIRED';
    end if;

    v_wallet_id := new.wallet_id;
    -- Client mới gửi wallet_id. Client cũ có thể chỉ gửi account hoặc không gửi gì.
    if v_wallet_id is null and nullif(btrim(coalesce(new.account,'')),'') is not null then
      select id, name into v_wallet_id, v_wallet_name
      from public.wallets
      where user_id = new.user_id and lower(name) = lower(btrim(new.account))
      order by created_at asc
      limit 1;
    end if;
    -- Tương thích release cũ: nếu không map được tên ví thì dùng ví đầu tiên của chính user.
    if v_wallet_id is null then
      select id, name into v_wallet_id, v_wallet_name
      from public.wallets
      where user_id = new.user_id
      order by created_at asc
      limit 1;
    end if;

    -- Nếu user cũ chưa có ví, vẫn cho lưu giao dịch legacy để app cũ không bị chết.
    if v_wallet_id is null then
      return new;
    end if;

    select name into v_wallet_name
    from public.wallets
    where id = v_wallet_id and user_id = new.user_id
    for update;
    if not found then raise exception 'WALLET_NOT_OWNED'; end if;

    new.wallet_id := v_wallet_id;
    new.account := v_wallet_name;
    v_delta := case when new.kind='income' then new.amount else -new.amount end;
    update public.wallets set balance = balance + v_delta where id=v_wallet_id and user_id=new.user_id;
    return new;

  elsif tg_op = 'DELETE' then
    if old.wallet_id is not null then
      v_delta := case when old.kind='income' then -old.amount else old.amount end;
      update public.wallets set balance = balance + v_delta where id=old.wallet_id and user_id=old.user_id;
    end if;
    return old;

  elsif tg_op = 'UPDATE' then
    if auth.uid() is null or new.user_id <> auth.uid() then
      raise exception 'AUTH_REQUIRED';
    end if;
    if old.wallet_id is not null then
      v_delta := case when old.kind='income' then -old.amount else old.amount end;
      update public.wallets set balance = balance + v_delta where id=old.wallet_id and user_id=old.user_id;
    end if;

    v_wallet_id := new.wallet_id;
    if v_wallet_id is null and nullif(btrim(coalesce(new.account,'')),'') is not null then
      select id, name into v_wallet_id, v_wallet_name
      from public.wallets
      where user_id = new.user_id and lower(name) = lower(btrim(new.account))
      order by created_at asc limit 1;
    end if;
    if v_wallet_id is null then
      select id, name into v_wallet_id, v_wallet_name
      from public.wallets where user_id = new.user_id order by created_at asc limit 1;
    end if;
    if v_wallet_id is null then
      new.wallet_id := null;
      return new;
    end if;
    select name into v_wallet_name from public.wallets where id=v_wallet_id and user_id=new.user_id for update;
    if not found then raise exception 'WALLET_NOT_OWNED'; end if;
    new.wallet_id := v_wallet_id;
    new.account := v_wallet_name;
    v_delta := case when new.kind='income' then new.amount else -new.amount end;
    update public.wallets set balance = balance + v_delta where id=v_wallet_id and user_id=new.user_id;
    return new;
  end if;
  return null;
end;
$$;

revoke all on function public.lumina_sync_transaction_wallet() from public, anon, authenticated;
drop trigger if exists trg_lumina_sync_transaction_wallet on public.transactions;
create trigger trg_lumina_sync_transaction_wallet
before insert or update or delete on public.transactions
for each row execute function public.lumina_sync_transaction_wallet();

-- Compatibility API cho v1.5.9: RPC cũ được GIỮ LẠI vì PWA có thể chưa đồng ý cập nhật.
-- RPC chỉ INSERT/DELETE; trigger ở trên chịu trách nhiệm cộng/trừ số dư để tránh cộng hai lần.
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
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  if p_kind not in ('income','expense','saving') then raise exception 'INVALID_KIND'; end if;
  if not exists(select 1 from public.wallets where id=p_wallet_id and user_id=auth.uid()) then
    raise exception 'WALLET_REQUIRED';
  end if;

  insert into public.transactions(user_id,kind,amount,category,note,wallet_id,occurred_at)
  values(auth.uid(),p_kind,p_amount,coalesce(nullif(p_category,''),'Khác'),p_note,p_wallet_id,coalesce(p_occurred_at,now()))
  returning id into v_id;

  return query select * from public.transactions where id=v_id and user_id=auth.uid();
end;
$$;

grant execute on function public.record_transaction(text,numeric,text,text,uuid,timestamptz) to authenticated;

create or replace function public.delete_transaction(p_transaction_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  delete from public.transactions where id=p_transaction_id and user_id=auth.uid();
  return found;
end;
$$;

grant execute on function public.delete_transaction(uuid) to authenticated;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;

-- Realtime
DO $$
begin
  begin alter publication supabase_realtime add table public.transactions; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.goals; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.wallets; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.loans; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.subscriptions; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.bank_accounts; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.notifications; exception when duplicate_object then null; end;
end $$;

-- Dashboard:
-- Authentication > Providers > Email: bật Email provider.
-- Nên bật Confirm email.
-- Frontend chỉ dùng Project URL + anon/publishable key. Không dùng service_role.
