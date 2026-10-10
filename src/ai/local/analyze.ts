/**
 * 글의 분위기·핵심어 추정(토큰 0) — 게임 규칙(스탯 변화·떡상 판정)용 신호만 만든다.
 * 이 결과로 문장을 지어내지 않는다(답글·쪽지는 전부 AI가 문맥을 보고 쓴다).
 */
import type { Mood } from '../types';

const POSITIVE = ['감사', '고마', '사랑', '행복', '최고', '축하', '응원', '좋아', '좋다', '기뻐', '설레', '뿌듯', '힘내', '화이팅', '파이팅', '멋지', '멋있', '대박', '희망', '💖', '❤', '🥰', '😊', '🙏', '✨', '💕'];
const NEGATIVE = ['짜증', '싫어', '싫다', '최악', '꺼져', '별로', '실망', '화나', '열받', '빡치', '망했', '저격', '한심', '노잼', '지겹', '닥쳐', '어이없', '역겹', '😡', '🤬', '💢', '시끄러'];
const FUNNY = ['ㅋㅋㅋ', '웃기', '웃겨', '드립', '개웃', '빵터', '🤣', '😂', 'lol', '농담', '밈'];
/** 'ㅋㅋ'·'ㅎㅎ' 한 번은 웃음 표시일 뿐(농담 글이 아님) — 약하게만 센다 */
const FUNNY_WEAK = ['ㅋㅋ', 'ㅎㅎ'];
const APOLOGY = ['죄송', '미안', '사과', '반성', '잘못했', '용서'];
const BRAG = ['당연', '클라스', '수준', '레벨', '천재', '최강', '1등', '넘사', '원래', '역시 나', '😎', '🔥', '👑', '💪', '압도', '내가 제일'];
const QUESTION = ['어때', '할까', '뭐가', '어떻게', '추천', '골라', 'vs', '누가'];

const PARTICLES = ['에서', '에게', '한테', '까지', '부터', '으로', '이랑', '하고', '보다', '처럼', '은', '는', '이', '가', '을', '를', '에', '의', '도', '로', '와', '과', '랑', '만', '요', '야'];
// 한글·영문·숫자만 '단어'로 본다(\p{L} 같은 유니코드 속성은 일부 JS 엔진에서 미지원이라 범위를 직접 씀)
const WORD = 'A-Za-z0-9_\\uAC00-\\uD7A3\\u3131-\\u318E';
const WORD_TAG = new RegExp(`#([${WORD}]+)`);
const WORD_TAG_G = new RegExp(`#([${WORD}]+)`, 'g');
const NON_WORD = new RegExp(`[^${WORD}]+`);
const STOPWORDS = new Set(['오늘', '진짜', '너무', '그냥', '우리', '이거', '저거', '그거', '내가', '하는', '했다', '한다', '있다', '없다', '같은', '근데', '그리고', '정말', '완전', '약간', '다들', '여러분', '이제', '지금', '아직', '나도', '너도', '이번', '하루']);

export interface Analysis {
  mood: Mood;
  keyword: string;
  /** 유머 신호 개수 */
  humor: number;
  /** 자신감(아우라) 신호 개수 */
  aura: number;
  /** 공격성 0~1 */
  toxicity: number;
  hashtags: string[];
  mentions: string[];
}

function count(text: string, words: string[]): number {
  return words.reduce((n, w) => n + (text.includes(w) ? 1 : 0), 0);
}

function stripParticle(token: string): string {
  for (const p of PARTICLES) {
    if (token.endsWith(p) && token.length - p.length >= 2) return token.slice(0, -p.length);
  }
  return token;
}

export function extractKeyword(text: string, fallback: string): string {
  const tag = text.match(WORD_TAG);
  if (tag) return tag[1];
  const tokens = text
    .replace(/@[\w.]+/g, ' ')
    .split(NON_WORD)
    .map(stripParticle)
    .filter((t) => t.length >= 2 && t.length <= 8 && !STOPWORDS.has(t) && !/^[ㅋㅎㅠㅜ]+$/.test(t));
  if (!tokens.length) return fallback;
  return tokens.slice(0, 8).sort((a, b) => b.length - a.length)[0];
}

export function analyze(text: string, fallbackKeyword = '이거'): Analysis {
  const lower = text.toLowerCase();
  const pos = count(lower, POSITIVE);
  const neg = count(lower, NEGATIVE);
  const fun = count(lower, FUNNY);
  const funWeak = count(lower, FUNNY_WEAK) > 0 ? 1 : 0;
  const apo = count(lower, APOLOGY);
  const brag = count(lower, BRAG);
  const q = count(lower, QUESTION) + (/[?？]\s*$/.test(text.trim()) ? 2 : 0);

  const scores: [Mood, number][] = [
    ['apology', apo * 3],
    ['negative', neg * 2.2],
    ['funny', fun * 1.6 + funWeak * 0.5],
    ['brag', brag * 1.5],
    ['question', q * 1.2],
    ['positive', pos * 1.1],
  ];
  scores.sort((a, b) => b[1] - a[1]);
  // 약한 신호(ㅋㅋ 한 번 등)만 있으면 무난한 글로 본다
  const mood: Mood = scores[0][1] >= 1 ? scores[0][0] : 'neutral';

  return {
    mood,
    keyword: extractKeyword(text, fallbackKeyword),
    humor: fun + funWeak,
    aura: brag,
    toxicity: Math.min(1, neg / 3),
    hashtags: [...text.matchAll(WORD_TAG_G)].map((m) => m[1]),
    mentions: [...text.matchAll(/@([a-zA-Z0-9_.]+)/g)].map((m) => m[1].toLowerCase()),
  };
}
