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

/** 시각만 12시간제로: 6:48 PM */
export function formatClock12(t: { hour: number; minute: number }): string {
  const h12 = t.hour % 12 === 0 ? 12 : t.hour % 12;
  return `${h12}:${String(t.minute).padStart(2, '0')} ${t.hour < 12 ? 'AM' : 'PM'}`;
}

/**
 * 사람이 친 시각 글자 → 시·분. "6:48 PM" · "6:48" · "648" · "18:48" · "오후 6시 48분" · "6시" 를 읽는다.
 * AM/PM(오전/오후)이 글자에 없으면 pm(화면의 AM/PM 버튼) 값을 따른다. 읽을 수 없으면 null.
 */
export function parseClock12(text: string, pm: boolean): { hour: number; minute: number } | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  const saysPm = /pm|오후|저녁|밤/.test(t);
  const saysAm = /am|오전|아침|새벽/.test(t);
  const nums = t.match(/\d+/g);
  if (!nums) return null;
  let h: number;
  let m: number;
  if (nums.length >= 2) {
    h = Number(nums[0]);
    m = Number(nums[1]);
  } else if (nums[0].length >= 3) {
    h = Number(nums[0].slice(0, -2));
    m = Number(nums[0].slice(-2));
  } else {
    h = Number(nums[0]);
    m = 0;
  }
  if (!Number.isFinite(h) || !Number.isFinite(m) || h > 23 || m > 59) return null;
  if (h > 12) return { hour: h, minute: m }; // 24시간제로 친 경우
  if (h === 0) return { hour: 0, minute: m };
  const isPm = saysPm ? true : saysAm ? false : pm;
  return { hour: (h % 12) + (isPm ? 12 : 0), minute: m };
}

/** 지금 시각에서 그 시각이 될 때까지 몇 분(이미 지난 시각이면 다음 날 그 시각) */
export function minutesUntil(now: GameTime, at: { hour: number; minute: number }): number {
  const diff = at.hour * 60 + at.minute - (now.hour * 60 + now.minute);
  return diff >= 0 ? diff : diff + 1440;
}
