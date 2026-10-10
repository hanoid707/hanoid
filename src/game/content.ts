/**
 * 연애·플러팅 수위(romanceLevel) — 순한맛·보통·매콤함 3단계
 *
 * 사용자가 나 탭에서 직접 조절하는 "다이얼". AI 지시문·설렘 변화 폭이 단계별로 달라진다.
 * 매콤함도 어디까지나 설렘·밀당·스킨십 암시까지이고, 노골적인 성 묘사·신체 묘사는 어떤 단계에서도
 * 쓰지 않는다(AI 지시문 [안전] 블록에 고정 — 이 설정으로 움직이지 않는다).
 * 공통 캐릭터(celeb_… 등 실존 인물일 수 있는 계정)와 가족 관계는 이 설정과 무관하게 연애·성적
 * 반응을 하지 않는다 — 조절 대상에서 항상 제외.
 */
import type { RomanceLevel } from '../types';

export const ROMANCE_LABEL: Record<RomanceLevel, string> = { mild: '순한맛', normal: '보통', spicy: '매콤함' };
export const ROMANCE_DESC: Record<RomanceLevel, string> = {
  mild: '플러팅엔 반갑게 받지만 담백하게, 설렘은 천천히 올라요',
  normal: '플러팅에 적극적으로 반응, 설렘이 있으면 한 단계 더 받아쳐요',
  spicy: '가장 적극적으로 받아치고 스킨십 암시까지 — 노골적 묘사는 여전히 없음',
};
/** AI 지시문·프롬프트에 넣는 실제 수치·어투 지시 — src/ai/prompts.ts 에서만 읽는다 */
export const ROMANCE_ORDER: RomanceLevel[] = ['mild', 'normal', 'spicy'];
