/**
 * 아이디·이모지·임시 자기소개(토큰 0) — AI가 이름·소개를 다시 써 줄 때까지의 기본값
 * - 아이디: 한글 이름을 로마자로 바꿔 [a-z0-9_] 4~15자
 * - 문장을 지어내지 않는다(자기소개 기본값 = 사용자가 쓴 특징의 첫마디 · 나이대)
 */
import type { AgeGroup, CharacterType } from '../../types';
import { hashStr } from '../../utils';

const NAME_EMOJI = ['🌙', '🍓', '☁️', '🍀', '🫧', '⭐', '🌷', '🍑', '🎧', '🧸', '🐰', '🦊', '🌻', '📸', '🍙', '✨'];

// ───────────────────────── 한글 → 로마자(아이디용, 국어의 로마자 표기법 간략판)
const INI = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];
const MED = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'];
const FIN = ['', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'k', 'm', 'l', 'l', 'l', 'p', 'l', 'm', 'p', 'p', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 't'];

export function romanize(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) {
      const s = code - 0xac00;
      const ini = Math.floor(s / 588);
      const med = Math.floor((s % 588) / 28);
      const fin = s % 28;
      // 첫소리 ㄹ은 l(아이디에서 더 흔함): 로운 → lowoon 대신 roun 그대로 둔다
      out += INI[ini] + MED[med] + FIN[fin];
    } else if (/[A-Za-z0-9]/.test(ch)) {
      out += ch.toLowerCase();
    }
  }
  return out;
}

/** 성씨의 흔한 영문 표기(아이디용) */
const FAMILY_EN: Record<string, string> = {
  김: 'kim', 이: 'lee', 박: 'park', 최: 'choi', 정: 'jung', 강: 'kang', 조: 'cho', 윤: 'yoon', 장: 'jang', 임: 'lim',
  한: 'han', 오: 'oh', 서: 'seo', 신: 'shin', 권: 'kwon', 황: 'hwang', 안: 'ahn', 송: 'song', 류: 'ryu', 홍: 'hong',
};
/** 단체 계정 이름에 자주 쓰는 외래어 → 영어(아이디용) */
const EN_WORDS: Record<string, string> = {
  데일리: 'daily', 오늘의: 'today', 실시간: 'live', 타임라인: 'tl', 소식: 'news', 뉴스: 'news', 속보: 'flash', 스타일: 'style',
  라이프: 'life', 무드: 'mood', 위클리: 'weekly', 컬처: 'culture', 매거진: 'mag', 에디션: 'edition', 저널: 'journal', 채널: 'ch',
  온에어: 'onair', 스튜디오: 'studio', 방송: 'tv', 라이브: 'live', 브랜드: 'brand', 스토어: 'store', 랩: 'lab', 컴퍼니: 'co',
  공식: 'official', 하루: 'haru', 모먼트: 'moment', 오브제: 'objet', 루틴: 'routine', 포레: 'foret',
};

/** 아무 문자열 → X 규칙 아이디(4~15자, 영문 소문자·숫자·밑줄) */
export function toHandle(raw: string, seed = raw): string {
  const h = hashStr(seed);
  const words = raw.trim().split(/\s+/).filter(Boolean);
  const parts = words.map((w) => {
    if (EN_WORDS[w]) return EN_WORDS[w];
    if (/^[가-힣]{3}$/.test(w) && FAMILY_EN[w[0]]) return FAMILY_EN[w[0]] + romanize(w.slice(1));
    return romanize(w);
  });
  let base = parts.filter(Boolean).join(words.length > 1 && parts.every((p) => p.length <= 7) ? '_' : '').replace(/[^a-z0-9_]/g, '');
  if (!base) base = ['user', 'acc', 'its', 'im'][h % 4];
  const tails = ['', `_${(h % 90) + 10}`, `${(h % 9000) + 1000}`, '_log', '_day', `_${String(h % 100).padStart(2, '0')}`, '_x', '_o'];
  let handle = (base.slice(0, 11) + tails[(h >>> 4) % tails.length]).slice(0, 15).replace(/_+$/, '');
  if (handle.length < 4) handle = `${handle}_${(h % 900) + 100}`.slice(0, 15);
  return handle;
}

/** 표시 이름에서 한글 이름만(아이디 만들기용) */
export function nameCore(name: string): string {
  const m = name.match(/[가-힣]{2,4}/g);
  return m ? m[m.length - 1] : name;
}

// ───────────────────────── 임시 자기소개(특징 첫마디 · 나이대)

/** AI가 소개를 쓰기 전 임시 자기소개(사용자가 쓴 특징의 첫마디 · 나이대) */
export function localBio(type: CharacterType, ageGroup: AgeGroup | undefined, traits: string): string {
  const first = traits
    .replace(/성격 유형:.*$|말투:.*$/gm, '')
    .split(/[.\n,·!?]/)
    .map((s) => s.trim())
    .find((s) => s.length >= 2)
    ?.slice(0, 28);
  const org = type === 'news' || type === 'magazine' || type === 'broadcaster' || type === 'sponsor';
  if (org) return first ? `${first} | 공식 계정` : '공식 계정';
  const age = ageGroup ? `${ageGroup}대` : '';
  if (first) return age ? `${age} · ${first}` : first;
  return age;
}

const TYPE_EMOJI: Partial<Record<CharacterType, string[]>> = {
  news: ['📰', '📡'],
  magazine: ['📖', '💄'],
  broadcaster: ['📺', '🎙️'],
  sponsor: ['🛍️', '🎁'],
  celeb: ['✨', '🌟'],
  antifan: ['👿', '🙄'],
  fan: ['💖', '🫶'],
  superfan: ['💘', '📸'],
  rival: ['⚔️', '🔥'],
  enemy: ['🖤', '🗡️'],
  mentor: ['🧭', '📚'],
  family: ['🏠', '🍚'],
  lover: ['💞', '🌹'],
  spicy: ['🌶️', '💫'],
};

export function localEmoji(type: CharacterType, seed: string): string {
  const h = hashStr(seed);
  const own = TYPE_EMOJI[type];
  if (own && h % 3 !== 0) return own[h % own.length];
  return NAME_EMOJI[h % NAME_EMOJI.length];
}
