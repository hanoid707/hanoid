/**
 * 아이템 — 재화 없이 언제든 쓰는 도우미(원본의 선물·바이럴 모먼트·되돌리기)
 * 화면: 상단 날짜(시계)를 누르면 아이템 화면으로 간다.
 * 선물 효과 = 기본값(GIFTS) × 관계 보정 × 같은 날 반복 감소 × 난이도(이벤트 배율) × 바이럴 모먼트(×2)
 */
import type { Character, Difficulty } from '../types';
import { EVENT_MUL } from './difficulty';

export interface GiftDef {
  id: string;
  emoji: string;
  name: string;
  /** 쪽지로 보내는 문구 */
  message: string;
  /** 기본 호감도·설렘 상승량(난이도·관계로 보정) */
  affinity: number;
  romance: number;
  desc: string;
}

export const GIFTS: GiftDef[] = [
  { id: 'coffee', emoji: '☕', name: '커피 기프티콘', message: '☕ 아이스 아메리카노 기프티콘을 보냈어요', affinity: 6, romance: 0, desc: '부담 없이 고마움 표시' },
  { id: 'dessert', emoji: '🍰', name: '디저트 세트', message: '🍰 디저트 세트를 보냈어요', affinity: 9, romance: 1, desc: '기분 전환용 달달함' },
  { id: 'letter', emoji: '✉️', name: '손편지', message: '✉️ 손편지를 보냈어요', affinity: 10, romance: 5, desc: '진심이 통하는 선물' },
  { id: 'flower', emoji: '💐', name: '꽃다발', message: '💐 꽃다발을 보냈어요', affinity: 8, romance: 12, desc: '설렘이 크게 오른다' },
  { id: 'perfume', emoji: '🎁', name: '향수', message: '🎁 향수를 선물했어요', affinity: 12, romance: 8, desc: '특별한 사람에게' },
  { id: 'ticket', emoji: '🎫', name: '공연 티켓', message: '🎫 공연 티켓 두 장을 보냈어요', affinity: 15, romance: 6, desc: '같이 갈래? 라는 뜻' },
  { id: 'cookie', emoji: '🍪', name: '화해의 쿠키', message: '🍪 화해의 쿠키를 보냈어요', affinity: 14, romance: 0, desc: '사이가 나쁠수록 효과 큼' },
  { id: 'support', emoji: '🪄', name: '응원 선물', message: '🪄 응원 선물을 보냈어요', affinity: 8, romance: 0, desc: '팬·동료 응원용' },
];

export const ITEM_INFO = {
  gift: { emoji: '🎁', name: '선물', desc: '캐릭터에게 선물을 보내 관계를 강화해요' },
  viral: { emoji: '🚀', name: '바이럴 모먼트', desc: '다음 행동 1번의 결과를 크게 강화해요' },
  undo: { emoji: '↩️', name: '되돌리기', desc: '방금 한 행동과 그 결과를 취소해요' },
  skip: { emoji: '⏩', name: '시간 건너뛰기', desc: '몇 시간 또는 다음 날로 넘어가요' },
} as const;

const ORG = ['news', 'magazine', 'broadcaster', 'sponsor'];

/**
 * 선물의 기본 효과(AI 답장의 호감도 변화와 별도로 더해진다)
 * - 적·라이벌·안티팬: 화해의 쿠키는 효과 큼(사이가 나쁠수록), 다른 선물은 약함
 * - 연인·썸: 설렘 선물이 더 잘 통함 / 가족: 설렘 없음 / 단체 계정: 약하게, 설렘 없음
 * - 같은 날 같은 사람에게 또 보내면 효과가 줄어든다(0.6 → 0.35)
 */
export function giftEffect(c: Character, g: GiftDef, diff: Difficulty, boost: boolean, sameDayCount: number): { affinity: number; romance: number } {
  const rel = c.tier !== 'crowd' && !c.isNews ? c.relation : undefined;
  const role = c.crowdRole;
  let a = g.affinity;
  let r = g.romance;
  const hostile = rel === 'enemy' || rel === 'rival' || role === 'antifan' || c.affinity <= -30;
  if (hostile) {
    if (g.id === 'cookie') a *= 1.6 + Math.min(0.8, Math.max(0, -c.affinity) / 100);
    else a *= 0.35;
    r *= 0.25;
  } else if (g.id === 'cookie') {
    a *= 0.6; // 싸운 것도 아닌데 화해의 쿠키?
  }
  if (rel === 'lover' || rel === 'spicy') r *= 1.3;
  if (rel === 'mentor') r *= 0.5;
  if (rel === 'acquaintance') r *= 0.6;
  if (rel === 'family' || c.relationBase === 'family') r = 0;
  if (role && ORG.includes(role)) {
    a *= 0.6;
    r = 0;
  }
  if (c.tier === 'crowd') r = 0;
  if ((role === 'fan' || role === 'superfan') && g.id === 'support') a *= 1.5;
  const fatigue = sameDayCount <= 0 ? 1 : sameDayCount === 1 ? 0.6 : 0.35;
  const mul = EVENT_MUL[diff].pos * (boost ? 2 : 1) * fatigue;
  // 한 번에 너무 크게 뛰지 않게(바이럴 모먼트면 조금 더)
  const cap = boost ? 30 : 22;
  return { affinity: Math.min(cap, Math.max(1, Math.round(a * mul))), romance: Math.min(cap, Math.round(r * mul)) };
}
