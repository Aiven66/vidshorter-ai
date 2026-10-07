// 留存引擎纯逻辑回归探针（无网络、无 DB）。
// 运行：node --experimental-strip-types .pwtest/retention-engine-probe.mjs
import {
  computeStreak,
  daysToNextMilestone,
  streakMilestoneCredits,
  utcDayKey,
  shiftDayKey,
  checkinSessionId,
  CHECKIN_SESSION_PREFIX,
  taskRewardDescription,
  TASK_REWARD_CREDITS,
  STREAK_MILESTONE_CREDITS,
  RETENTION_TASKS,
} from '../src/lib/retention.ts';

let pass = 0;
let fail = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}\n      got=${JSON.stringify(got)} want=${JSON.stringify(want)}`); }
}

eq('utcDayKey format', /^\d{4}-\d{2}-\d{2}$/.test(utcDayKey()), true);
eq('shiftDayKey -1 across year', shiftDayKey('2026-01-01', -1), '2025-12-31');
eq('shiftDayKey -7', shiftDayKey('2026-03-10', -7), '2026-03-03');
eq('shiftDayKey +1 month boundary', shiftDayKey('2026-02-28', 1), '2026-03-01');

eq('streak: today signed, 3 in a row', computeStreak(new Set(['2026-10-07', '2026-10-06', '2026-10-05']), '2026-10-07'), 3);
eq('streak: today NOT signed, counts from yesterday', computeStreak(new Set(['2026-10-06', '2026-10-05']), '2026-10-07'), 2);
eq('streak: gap breaks count', computeStreak(new Set(['2026-10-07', '2026-10-05', '2026-10-04']), '2026-10-07'), 1);
eq('streak: only yesterday, today unsigned', computeStreak(new Set(['2026-10-06']), '2026-10-07'), 1);
eq('streak: nothing recent', computeStreak(new Set(['2026-10-01']), '2026-10-07'), 0);
eq('streak: empty', computeStreak(new Set(), '2026-10-07'), 0);
eq(
  'streak: 7 days ending yesterday',
  computeStreak(
    new Set(['2026-09-30','2026-10-01','2026-10-02','2026-10-03','2026-10-04','2026-10-05','2026-10-06']),
    '2026-10-07',
  ),
  7,
);

eq('milestone 0', streakMilestoneCredits(0), 0);
eq('milestone 6', streakMilestoneCredits(6), 0);
eq('milestone 7', streakMilestoneCredits(7), STREAK_MILESTONE_CREDITS);
eq('milestone 14', streakMilestoneCredits(14), STREAK_MILESTONE_CREDITS);
eq('milestone 15', streakMilestoneCredits(15), 0);

eq('dtnm 0 -> 7', daysToNextMilestone(0), 7);
eq('dtnm 1 -> 6', daysToNextMilestone(1), 6);
eq('dtnm 6 -> 1', daysToNextMilestone(6), 1);
eq('dtnm 7 -> 0 (on milestone)', daysToNextMilestone(7), 0);
eq('dtnm 8 -> 6', daysToNextMilestone(8), 6);

eq('checkinSessionId', checkinSessionId('u1', '2026-10-07'), 'daily_checkin_u1_2026-10-07');
eq('prefix match', checkinSessionId('u1', '2026-10-07').startsWith(`${CHECKIN_SESSION_PREFIX}u1_`), true);
eq('taskRewardDescription', taskRewardDescription('2026-10-07', 30), 'daily_task_reward 2026-10-07 (+30)');

eq('three tasks defined', RETENTION_TASKS.map((t) => t.id), ['checkin', 'create', 'export']);
eq('day7 total = 30 + 90', TASK_REWARD_CREDITS + streakMilestoneCredits(7), 120);
eq('day1 total = 30', TASK_REWARD_CREDITS + streakMilestoneCredits(1), 30);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
