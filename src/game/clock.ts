/** 게임 시계: 행동할 때마다 시간이 흐르고, 날이 바뀌면 하루 정산(월드 틱)이 돈다. */
import type { GameTime } from '../types';

export function advanceClock(t: GameTime, minutes: number): { time: GameTime; daysPassed: number } {
  let total = t.hour * 60 + t.minute + Math.round(minutes);
  const daysPassed = Math.floor(total / 1440);
  total %= 1440;
  return {
    time: { day: t.day + daysPassed, hour: Math.floor(total / 60), minute: total % 60 },
    daysPassed,
  };
}

/** 3일차 오후 2시 */
export function formatClock(t: GameTime): string {
  const ampm = t.hour < 12 ? '오전' : '오후';
  const h12 = t.hour % 12 === 0 ? 12 : t.hour % 12;
  return `${t.day}일차 ${ampm} ${h12}시${t.minute ? ` ${t.minute}분` : ''}`;
}

/** 3일차 / (시작 전 글) 시작 2일 전 */
export function dayLabel(day: number): string {
  return day >= 1 ? `${day}일차` : `시작 ${1 - day}일 전`;
}

export function minutesBetween(a: GameTime, b: GameTime): number {
  return (b.day - a.day) * 1440 + (b.hour - a.hour) * 60 + (b.minute - a.minute);
}

/** 게임 시간 기준 상대 시간: 방금 / 12분 / 3시간 / 2일 */
export function relativeTime(at: GameTime, now: GameTime): string {
  const diff = minutesBetween(at, now);
  if (diff < 1) return '방금';
  if (diff < 60) return `${diff}분`;
  if (diff < 1440) return `${Math.floor(diff / 60)}시간`;
  return `${Math.floor(diff / 1440)}일`;
}

/** 시간대 이모지 */
export function timeEmoji(t: GameTime): string {
  if (t.hour < 6) return '🌙';
  if (t.hour < 12) return '🌤️';
  if (t.hour < 18) return '☀️';
  return '🌆';
}
