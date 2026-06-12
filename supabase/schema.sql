-- ภาษีเบาใจ — Supabase Schema
-- วิ่งใน: Supabase Dashboard → SQL Editor → New query → วาง → Run

create extension if not exists "uuid-ossp";

-- ─── users ───────────────────────────────────────────────────────────────────
create table if not exists public.users (
  id            uuid primary key default uuid_generate_v4(),
  line_user_id  text unique not null,
  created_at    timestamp default now()
);

-- ─── transactions ────────────────────────────────────────────────────────────
create table if not exists public.transactions (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid references public.users(id) on delete cascade,
  type       text not null check (type in ('income', 'expense')),
  amount     numeric not null check (amount > 0),
  date       date not null,
  note       text,
  created_at timestamp default now()
);

-- ─── deductions ──────────────────────────────────────────────────────────────
create table if not exists public.deductions (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid references public.users(id) on delete cascade,
  type       text not null,
  amount     numeric not null default 0,
  updated_at timestamp default now(),
  unique (user_id, type)
);

-- ─── Row Level Security ───────────────────────────────────────────────────────
alter table public.users        enable row level security;
alter table public.transactions enable row level security;
alter table public.deductions   enable row level security;

create policy "users: self" on public.users for all
  using (id = auth.uid());

create policy "transactions: owner" on public.transactions for all
  using (user_id = auth.uid());

create policy "deductions: owner" on public.deductions for all
  using (user_id = auth.uid());
