/**
 * 아이템 — 재화 없이 언제든 쓰는 도우미(바이럴 모먼트·되돌리기·시간 건너뛰기)
 * 화면: 상단 날짜(시계)를 누르면 아이템 화면으로 간다.
 * 선물은 아이템 화면이 아니라 쪽지 대화·캐릭터 프로필에서만 보낸다(3종, 효과 고정 +18).
 */
import type { Character } from '../types';
import { canRomance } from './relationship';

/** 선물이 올리는 수치 */
export type GiftStat = 'affinity' | 'romance' | 'devotion';

export interface GiftDef {
  id: string;
  emoji: string;
  name: string;
  /** 쪽지로 보내는 문구 */
  message: string;
  /** 올리는 수치(하나만) */
  stat: GiftStat;
  /** 화면에 보이는 수치 이름 */
  statLabel: string;
}

/** 선물 1번의 효과(난이도·관계 보정 없이 고정) */
export const GIFT_AMOUNT = 18;

export const GIFTS: GiftDef[] = [
  { id: 'clothes', emoji: '👗', name: '옷', message: '👗 옷을 선물했어요', stat: 'affinity', statLabel: '호감도' },
  { id: 'flower', emoji: '💐', name: '꽃', message: '💐 꽃을 선물했어요', stat: 'romance', statLabel: '설렘' },
  { id: 'potion', emoji: '🧪', name: '마법의 물약', message: '🧪 마법의 물약을 선물했어요', stat: 'devotion', statLabel: '정복도' },
];

/** 이 사람에게 이 선물을 보낼 수 없는 이유(보낼 수 있으면 null) — 설렘은 연애 대상이 아닌 계정에 오르지 않는다 */
export function giftBlocked(c: Character, g: GiftDef): string | null {
  return g.stat === 'romance' && !canRomance(c) ? '설렘 대상 아님' : null;
}

/** 선물 효과: 고른 수치 하나만 +18 */
export function giftEffect(g: GiftDef): { affinity: number; romance: number; devotion: number } {
  return { affinity: g.stat === 'affinity' ? GIFT_AMOUNT : 0, romance: g.stat === 'romance' ? GIFT_AMOUNT : 0, devotion: g.stat === 'devotion' ? GIFT_AMOUNT : 0 };
}

export const ITEM_INFO = {
  gift: { emoji: '🎁', name: '선물', desc: '쪽지 대화·프로필에서 보내요' },
  viral: { emoji: '🚀', name: '바이럴 모먼트', desc: '다음 행동 1번의 결과를 크게 강화해요' },
  undo: { emoji: '↩️', name: '되돌리기', desc: '방금 한 행동과 그 결과를 취소해요' },
  skip: { emoji: '⏩', name: '시간 건너뛰기', desc: '몇 시간 또는 다음 날로 넘어가요' },
} as const;
