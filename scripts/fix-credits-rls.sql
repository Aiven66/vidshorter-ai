-- 修复 credits 表 RLS 策略和约束
-- 在 Supabase Dashboard > SQL Editor 中运行此脚本
-- 解决问题：新用户首次登录时 INSERT 到 credits 表被 RLS 拒绝

-- 1. 添加 credits INSERT 策略（之前缺失，导致新用户无法插入 credits 行）
drop policy if exists credits_insert_own on public.credits;
create policy credits_insert_own on public.credits
  for insert with check (auth.uid() = user_id);

-- 2. 添加 credit_transactions INSERT 策略（如果缺失）
drop policy if exists credit_transactions_insert_own on public.credit_transactions;
create policy credit_transactions_insert_own on public.credit_transactions
  for insert with check (auth.uid() = user_id);

-- 3. 在 credits.user_id 上添加唯一约束（防止未来再出现重复行）
-- 注意：运行此约束前需要先清理重复行（已由 scripts/cleanup-credits-duplicates.js 完成）
drop index if exists credits_user_id_unique_idx;
create unique index credits_user_id_unique_idx on public.credits(user_id);

-- 4. 验证策略已创建
select polname, polcmd from pg_policy where polrelid = 'credits'::regclass;
