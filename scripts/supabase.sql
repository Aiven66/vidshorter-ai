create extension if not exists pgcrypto;

alter table public.credits alter column balance set default 100;

alter table public.users add column if not exists country text;
alter table public.users add column if not exists region text;
alter table public.users add column if not exists city text;
alter table public.users add column if not exists last_seen_at timestamptz;

create table if not exists public.feedbacks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  content text not null,
  rating int,
  status text not null default 'new',
  created_at timestamptz not null default now()
);

create index if not exists feedbacks_user_id_idx on public.feedbacks(user_id);
create index if not exists feedbacks_created_at_idx on public.feedbacks(created_at);

alter table public.feedbacks enable row level security;
alter table public.users enable row level security;
alter table public.subscriptions enable row level security;
alter table public.credits enable row level security;
alter table public.videos enable row level security;
alter table public.short_videos enable row level security;
alter table public.credit_transactions enable row level security;

drop policy if exists feedback_insert_own on public.feedbacks;
create policy feedback_insert_own on public.feedbacks for insert with check (auth.uid() = user_id);
drop policy if exists feedback_select_own on public.feedbacks;
create policy feedback_select_own on public.feedbacks for select using (auth.uid() = user_id);
drop policy if exists feedback_admin_select on public.feedbacks;
create policy feedback_admin_select on public.feedbacks for select using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

drop policy if exists users_select_own on public.users;
create policy users_select_own on public.users for select using (auth.uid() = id);
drop policy if exists users_update_own on public.users;
create policy users_update_own on public.users for update using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists users_admin_select on public.users;
create policy users_admin_select on public.users for select using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

drop policy if exists subscriptions_select_own on public.subscriptions;
create policy subscriptions_select_own on public.subscriptions for select using (auth.uid() = user_id);
drop policy if exists subscriptions_admin_select on public.subscriptions;
create policy subscriptions_admin_select on public.subscriptions for select using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

drop policy if exists credits_select_own on public.credits;
create policy credits_select_own on public.credits for select using (auth.uid() = user_id);
drop policy if exists credits_update_own on public.credits;
create policy credits_update_own on public.credits for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists credits_admin_select on public.credits;
create policy credits_admin_select on public.credits for select using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

drop policy if exists videos_insert_own on public.videos;
create policy videos_insert_own on public.videos for insert with check (auth.uid() = user_id);
drop policy if exists videos_select_own on public.videos;
create policy videos_select_own on public.videos for select using (auth.uid() = user_id);
drop policy if exists videos_update_own on public.videos;
create policy videos_update_own on public.videos for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists videos_admin_select on public.videos;
create policy videos_admin_select on public.videos for select using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

drop policy if exists short_videos_insert_own on public.short_videos;
create policy short_videos_insert_own on public.short_videos for insert with check (auth.uid() = user_id);
drop policy if exists short_videos_select_own on public.short_videos;
create policy short_videos_select_own on public.short_videos for select using (auth.uid() = user_id);
drop policy if exists short_videos_admin_select on public.short_videos;
create policy short_videos_admin_select on public.short_videos for select using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

drop policy if exists credit_transactions_insert_own on public.credit_transactions;
create policy credit_transactions_insert_own on public.credit_transactions for insert with check (auth.uid() = user_id);
drop policy if exists credit_transactions_select_own on public.credit_transactions;
create policy credit_transactions_select_own on public.credit_transactions for select using (auth.uid() = user_id);
drop policy if exists credit_transactions_admin_select on public.credit_transactions;
create policy credit_transactions_admin_select on public.credit_transactions for select using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));
