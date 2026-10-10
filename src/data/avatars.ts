/** 아바타 재료: 이모지·배경색 / 직접 만든 세계관용 캐릭터 이름 재료 */
import type { Archetype } from '../types';

export const AVATAR_EMOJIS = [
  '😎', '🦊', '🐰', '🐻', '🐱', '🐶', '🦄', '🐸', '🐧', '🦋',
  '🌸', '🌙', '⭐', '🔥', '⚡', '💎', '🎧', '🎨', '📸', '🍓',
  '🍀', '🌊', '👑', '🎭', '🕶️', '🧸', '🪐', '🌈', '🍑', '🐯',
];

export const AVATAR_COLORS = [
  '#6D4AFF', '#FF4F81', '#FFB020', '#12B5CB', '#16A34A', '#2E90FA',
  '#F97316', '#A855F7', '#0F172A', '#E11D48', '#14B8A6', '#64748B',
];

export const ARCHETYPE_LABEL: Record<Archetype, string> = {
  bestie: '절친',
  rival: '라이벌',
  fan: '팬',
  mentor: '멘토',
  troll: '악플러',
  news: '뉴스',
  crush: '관심',
  chaos: '엉뚱',
  celeb: '셀럽',
};
/** 성격 유형별 기본 설정(직접 만든 세계관·캐릭터 생성기에서 사용) */
export const ARCHETYPE_DEFAULTS: Record<Archetype, { bio: string; description: string; affinity: number }> = {
  bestie: { bio: '언제나 내 편인 친구.', description: '플레이어의 오랜 친구. 장난스럽지만 힘들 때 가장 먼저 위로한다.', affinity: 18 },
  rival: { bio: '나를 의식하는 경쟁자.', description: '플레이어를 의식하는 경쟁자. 은근히 견제하지만 실력을 보이면 조금씩 인정한다.', affinity: -10 },
  fan: { bio: '나를 열렬히 응원하는 팬.', description: '플레이어를 열렬히 응원하는 팬.', affinity: 25 },
  mentor: { bio: '경험 많은 어른.', description: '경험 많은 어른. 짧고 현실적인 조언을 건넨다.', affinity: 5 },
  troll: { bio: '모든 것에 시비를 거는 익명 계정.', description: '시비 걸기를 좋아하는 익명 계정. 비꼬기만 하고 욕설·혐오 표현은 쓰지 않는다.', affinity: -25 },
  news: { bio: '이 세계의 소식을 전하는 계정.', description: '이 세계의 화제와 논란을 전하는 소식 계정.', affinity: 0 },
  crush: { bio: '자꾸 신경 쓰이는 사람.', description: '자꾸 신경 쓰이는 사람. 무심한 듯 다정하다.', affinity: 10 },
  chaos: { bio: '예측 불가한 엉뚱한 캐릭터.', description: '엉뚱하고 유쾌한 사람. 그래도 대화 흐름에 맞는 드립으로 분위기를 띄운다.', affinity: 5 },
  celeb: { bio: '모두가 아는 유명인.', description: '모두가 아는 유명인. 여유롭고 다정하다.', affinity: 0 },
};
