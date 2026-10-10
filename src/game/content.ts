/**
 * 연애·플러팅 수위(romanceLevel) — 순한맛·보통·에로틱 3단계
 * 사용자가 나 탭에서 직접 조절하는 "다이얼". AI 지시문·설렘 변화 폭이 단계별로 달라진다.
 */
import type { RomanceLevel } from '../types';

export const ROMANCE_LABEL: Record<RomanceLevel, string> = { mild: '순한맛', racy: '보통', erotic: '에로틱' };
export const ROMANCE_DESC: Record<RomanceLevel, string> = {
  mild: '플러팅엔 반갑게 받지만 아직 좋아하는 감정이 있는지 모르는 상태에요',
  racy: '플러팅에 적극적으로 반응, 설렘이 있으면 대담하게 한 단계 더 받아쳐요. 유혹하는 멘트를 할 수도 있어요',
  erotic: '가장 적극적으로 받아치고, 성인물다운 노골적 묘사도 있어요',
};
/** AI 지시문·프롬프트에 넣는 실제 수치·어투 지시 — src/ai/prompts.ts 에서만 읽는다 */
export const ROMANCE_ORDER: RomanceLevel[] = ['mild', 'racy', 'erotic'];
