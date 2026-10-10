/**
 * 로컬(토큰 0) 인물 재료 — 실제 한국 X 계정 같은 표시 이름·아이디
 * 전부 가상의 이름 조합이다(실존 인물 아님). 인물이 하는 말(첫 쪽지·첫 글 등)은 만들지 않는다 — 전부 AI가 쓴다.
 */
import { localBio, romanize } from '../ai/local/names';
import type { AgeGroup, CharacterType, Gender } from '../types';
import { cutText, hashStr } from '../utils';

export { localBio, romanize };

const SURNAMES = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '류', '홍'];
const SURNAME_ROMAN: Record<string, string> = {
  김: 'kim', 이: 'lee', 박: 'park', 최: 'choi', 정: 'jung', 강: 'kang', 조: 'cho', 윤: 'yoon', 장: 'jang', 임: 'lim',
  한: 'han', 오: 'oh', 서: 'seo', 신: 'shin', 권: 'kwon', 황: 'hwang', 안: 'ahn', 송: 'song', 류: 'ryu', 홍: 'hong',
};

const GIVEN: Record<'young' | 'old', Record<Gender, string[]>> = {
  young: {
    f: ['서아', '하린', '지우', '유나', '세아', '다은', '소율', '예린', '민지', '수아', '채원', '윤서', '지아', '하은', '서연', '나연', '은비', '다인', '가은', '연우', '시은', '하윤', '수빈', '예나', '아린', '유진', '서윤', '지현', '채은', '도희'],
    m: ['서준', '도윤', '시우', '이안', '준호', '민재', '현우', '지호', '태윤', '은우', '건우', '우진', '승민', '재현', '동현', '지훈', '하준', '준서', '민혁', '태오', '로운', '정우', '승현', '유찬', '재윤', '시혁', '도겸', '한결', '주원', '태민'],
  },
  old: {
    f: ['미경', '은정', '수진', '지영', '혜진', '선영', '미영', '경희', '정은', '현주', '은영', '소영', '윤정', '민정', '희정', '정민'],
    m: ['성호', '정훈', '상민', '영수', '진호', '동욱', '재훈', '성수', '기현', '준석', '형준', '상훈', '민수', '태호', '승우', '경민'],
  },
};

const NAME_EMOJI = ['🌙', '☁️', '🍀', '🫧', '⭐', '🌿', '🍓', '🐾', '🎧', '📷', '☕', '🌊'];

/** 마지막 글자에 받침이 있는지 */
function hasJong(word: string): boolean {
  const code = word.charCodeAt(word.length - 1);
  return code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 !== 0;
}

/** 한국어 이름 → 아이디 재료(성은 흔한 표기: 박 → park, 이 → lee). 예) 박정훈 → parkjeonghun, 서아 → seoa */
export function romanizeName(name: string): string {
  const t = name.trim();
  if (/^[가-힣]{3,4}$/.test(t) && SURNAME_ROMAN[t[0]]) return SURNAME_ROMAN[t[0]] + romanize(t.slice(1));
  return romanize(t);
}

export interface LocalName {
  name: string;
  handle: string;
}

/**
 * 실제 X에 있을 법한 표시 이름 + 아이디(같은 seed면 같은 결과)
 * 예) 서아 · 하린 🌙 · 김도윤 · 지우 JIWOO · 퇴근한 민재 / seoa_0412 · harin.day → harin_day · kimdoyun97
 */
export function koreanDisplayName(gender: Gender, ageGroup: AgeGroup, seed: string, avoid?: { names?: Iterable<string>; handles?: Iterable<string> }): LocalName {
  if (!avoid) return makeDisplayName(gender, ageGroup, seed).out;
  // 이미 있는 인물과 이름이 겹치면(예: 한결 ↔ hangyeol) 헷갈리니 다른 이름으로 다시 짓는다
  const names = [...(avoid.names ?? [])].map((n) => n.replace(/\s/g, '').toLowerCase()).filter(Boolean);
  const handles = [...(avoid.handles ?? [])].map((x) => x.toLowerCase());
  const romans = names.map((n) => romanize(n));
  const clash = (r: ReturnType<typeof makeDisplayName>) =>
    names.some((n) => n.includes(r.given) || n.includes(r.rg)) ||
    romans.some((n) => n.length >= 3 && n.includes(r.rg)) ||
    handles.some((x) => x === r.out.handle || x.includes(r.rg));
  for (let i = 0; i < 16; i++) {
    const r = makeDisplayName(gender, ageGroup, i ? `${seed}#${i}` : seed);
    if (!clash(r)) return r.out;
  }
  return makeDisplayName(gender, ageGroup, seed).out;
}

function makeDisplayName(gender: Gender, ageGroup: AgeGroup, seed: string): { out: LocalName; given: string; rg: string } {
  const h = hashStr(seed);
  const pool = GIVEN[ageGroup >= 40 ? 'old' : 'young'][gender];
  const given = pool[h % pool.length];
  const sur = SURNAMES[(h >>> 5) % SURNAMES.length];
  const rg = romanize(given);
  const rs = SURNAME_ROMAN[sur] ?? romanize(sur);
  const fmt = (h >>> 9) % (ageGroup >= 40 ? 3 : 7);
  let name: string;
  switch (fmt) {
    case 0: name = `${sur}${given}`; break;
    case 1: name = given; break;
    case 2: name = `${given} ${rg.toUpperCase()}`; break;
    case 3: name = `${given} ${NAME_EMOJI[(h >>> 13) % NAME_EMOJI.length]}`; break;
    case 4: name = hasJong(given) ? `${given}이` : given; break;
    case 5: name = `${['퇴근한', '오늘도', '주말의', '새벽', '배고픈'][(h >>> 13) % 5]} ${given}`; break;
    default: name = rg; break;
  }
  const age = ageGroup + ((h >>> 17) % 10);
  const year = String((2026 - age) % 100).padStart(2, '0');
  const hf = (h >>> 21) % 6;
  const base =
    hf === 0 ? `${rg}_${String((h % 9000) + 1000)}` :
    hf === 1 ? `${rs}${rg}${year}` :
    hf === 2 ? `${rg}_${['day', 'log', 'zip', 'mood', 'ing', 'xx'][(h >>> 3) % 6]}` :
    hf === 3 ? `${rg}${rg.slice(-1)}${rg.slice(-1)}` :
    hf === 4 ? `its_${rg}` :
    `${rg}${year}`;
  const handle = base.replace(/[^a-z0-9_]/g, '').slice(0, 15) || `user_${h % 100000}`;
  return { out: { name, handle: handle.length >= 4 ? handle : `${handle}_${h % 1000}`.slice(0, 15) }, given, rg };
}

/** 단체 계정(언론·매거진·방송사·협찬사) 이름 — 사람 이름 대신 */
export function orgDisplayName(type: CharacterType, worldName: string, seed: string): LocalName | null {
  const h = hashStr(seed);
  const w = cutText(worldName.replace(/\s/g, ''), 8) || '오늘';
  const n = String((h % 900) + 100);
  switch (type) {
    case 'news': return { name: [`${w} 소식통`, `${w} 뉴스`, `속보 ${w}`][h % 3], handle: `news_${n}` };
    case 'magazine': return { name: [`월간 ${w}`, `${w} 매거진`, `위클리 ${w}`][h % 3], handle: `mag_${n}` };
    case 'broadcaster': return { name: [`${w} TV`, `${w} 방송`, `채널 ${w}`][h % 3], handle: `tv_${n}` };
    case 'sponsor': return { name: [`${w} 브랜드 공식`, `${w} 스토어`, `${w} 파트너스`][h % 3], handle: `brand_${n}` };
    default: return null;
  }
}
