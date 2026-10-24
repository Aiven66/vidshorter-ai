/**
 * 发布提醒 cron（v6 路径 B）。
 *
 * 半自动排期没有平台直发能力，闭环靠「到点提醒」：
 *   扫描所有用户的 schedule-*.json → 找出已到点且未提醒过的 scheduled 条目
 *   → 给用户发一封汇总邮件（含标题 / 平台 / 计划时间 / 工作流入口）
 *   → 写回 `remindedAt`，同一批不会重复发送。
 *
 * 鉴权与其它 cron 一致：只认 CRON_SECRET，未配置则一律 403。
 * 单个用户失败不中断整批（best-effort）。
 */

import { NextRequest, NextResponse } from 'next/server';
import { sendMail } from '@/lib/server/email';
import { subscriptionServiceClient } from '@/lib/server/effective-plan';
import { isDue } from '@/lib/publish-schedule';
import {
  listScheduleUserIds,
  readSchedule,
  writeScheduleForUser,
} from '@/lib/server/schedule-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_USERS_PER_RUN = 200;
const SITE = 'https://www.clipopai.com';

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get('x-vercel-cron-secret') || req.headers.get('x-cron-secret');
  if (header === secret) return true;
  const auth = req.headers.get('authorization') || '';
  return auth.toLowerCase().startsWith('bearer ') && auth.slice(7).trim() === secret;
}

async function lookupEmail(userId: string): Promise<string | null> {
  const client = subscriptionServiceClient();
  if (!client) return null;
  try {
    const { data } = await client.from('users').select('email').eq('id', userId).maybeSingle();
    const email = typeof data?.email === 'string' ? data.email.trim() : '';
    return email || null;
  } catch {
    return null;
  }
}

function reminderHtml(items: Array<{ title: string; platform: string; at: string }>): string {
  const rows = items
    .map(
      (i) => `
      <li style="margin:0 0 10px;">
        <strong>${i.platform}</strong> · ${i.at}<br/>
        <span style="color:#374151;">${i.title}</span>
      </li>`,
    )
    .join('');
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
      <h1 style="color:#6366f1;margin:0 0 8px;font-size:22px;">Clipop AI</h1>
      <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 12px;">
        你有 <strong>${items.length}</strong> 条内容到点该发布了。文案已备好，点下面按钮进工作流一键复制并打开上传页。
      </p>
      <ul style="color:#6b7280;font-size:14px;line-height:1.6;padding-left:18px;">${rows}</ul>
      <a href="${SITE}/dashboard?tab=workflow"
         style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-size:15px;margin-top:12px;">
        打开发布工作流 / Open workflow
      </a>
    </div>`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const userIds = (await listScheduleUserIds()).slice(0, MAX_USERS_PER_RUN);
  let scanned = 0;
  let notified = 0;
  let mailed = 0;
  let failed = 0;

  for (const userId of userIds) {
    scanned++;
    try {
      const posts = await readSchedule(userId);
      if (posts.length === 0) continue;

      const due = posts.filter((p) => isDue(p) && !p.remindedAt);
      if (due.length === 0) continue;

      const email = await lookupEmail(userId);
      if (!email) continue;

      const res = await sendMail({
        to: email,
        subject:
          due.length === 1
            ? `该发布了：${due[0].title || '你的片段'}`
            : `你有 ${due.length} 条内容到点该发布了`,
        html: reminderHtml(
          due.map((p) => ({
            title: p.title || 'Untitled clip',
            platform: p.platform,
            at: new Date(p.scheduledAt).toLocaleString('zh-CN', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            }),
          })),
        ),
      });

      if (!res.ok) {
        failed++;
        continue;
      }
      mailed++;

      const nowIso = new Date().toISOString();
      const next = posts.map((p) => (due.some((d) => d.id === p.id) ? { ...p, remindedAt: nowIso } : p));
      await writeScheduleForUser(userId, next);
      notified += due.length;
    } catch (e) {
      failed++;
      console.warn(
        '[cron/publish-reminders] user failed:',
        userId,
        e instanceof Error ? e.message.slice(0, 160) : e,
      );
    }
  }

  return NextResponse.json({
    ok: true,
    scanned_users: scanned,
    notified_posts: notified,
    emails_sent: mailed,
    failed,
  });
}
