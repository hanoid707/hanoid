/**
 * 기본 세계관 인물의 계급·직급·나이 — 인물 프로필의 이름 옆에만 보인다("상병 · 22살", 타임라인에는 안 보인다).
 *   직급: 아래 표(세계관ID__인물 key). 계급·직급(상병·중대장·부장·사장)이나 플레이어와 얽힌 직업(기자·감독·에이전트)만, 4자 이하.
 *   친구·동기·팬·유튜버·인플루언서처럼 관계나 일반 직업은 적지 않는다(없으면 비워 둔다).
 *   나이: 세계관 파일의 사진 사양(photo.age), 없으면 설명에 적힌 "○○살/세"에서 읽는다. 그 자리의 현실 나이(data/ageNorms.ts 기준)로 적어 둔다.
 * 직접 만든 세계관·캐릭터는 인물 설정의 "계급·직함"·"나이" 칸에 적은 값을 쓴다(character.title · character.age).
 */
import type { CharacterSeed } from './worldTypes';

export const CAST_TITLE: Record<string, string> = {
  cyberpunk__turing: '수사관',
  cyberpunk__woojin: '사원',
  cyberpunk__ripper: '리퍼닥',
  cyberpunk__fixer: '픽서',
  cyberpunk__pocha: '사장',
  football__dohan: '주장',
  football__ryu_agent: '에이전트',
  office__haesol: '팀장',
  office__hangyeol: 'PM',
  office__bom: '신입',
  office__eunjung: '과장',
  office__dabin: '신입',
  military__bulchim: '상병',
  military__taejun: '상병',
  military__daon: '이병',
  military__eunyoung: '행보관',
  military__pxfairy: '일병',
  military__hayul: '상병',
  military__seojin: '분대장',
  military__haram: '상병',
  military__eunjae: '소대장',
  military__sowon: '상병',
  military__airforce: '상병',
  military__marine: '일병',
  military__armyclock: '상병',
  military__cook: '상병',
  military__hasa: '하사',
  youtuber__hangyeol: '편집자',
  youtuber__sojeong: '매니저',
  youtuber__dain: '마케터',
  influencer__junseo: '사진작가',
  influencer__sujin: '팀장',
  influencer__doyoon: 'MD',
  influencer__cafeowner: '사장',
};

/** 설명·소개에 적힌 나이("24살", "(25, …", "27세") */
export function ageInText(text: string): number | undefined {
  const m = text.match(/(?<![0-9])(1[89]|[2-7][0-9])(?:살|세)/) ?? text.match(/\((1[89]|[2-7][0-9])[,)]/);
  return m ? Number(m[1]) : undefined;
}

const RANK = '행정보급관|행보관|주임원사|대대장|중대장|소대장|분대장|이병|일병|상병|병장|하사|중사|상사|원사|소위|중위|대위|소령|중령|대령|인턴|신입|대리|과장|차장|부장|팀장|실장|본부장|교수|조교|감독|코치|주장';
const RANK_RE = new RegExp(`(${RANK})(?![을를의님께]|에게|한테|[이가와과] )`);

/**
 * 인물 설명의 첫 대목에 적힌 계급·직급("3중대 행정보급관 상사(41)" → "행정보급관") — 예전 세이브·직접 만든 인물에 직함 채우기용.
 * 남의 직함("팀장을 어려워함")을 잘못 집지 않게 첫 쉼표·마침표 앞까지만 보고, 목적어·호칭으로 쓰인 것은 뺀다.
 */
export function titleInText(text: string | undefined): string | undefined {
  const head = (text ?? '').split(/[,.。\n]/)[0].slice(0, 44);
  const m = head.match(RANK_RE);
  return m ? cleanRank(m[1]) : undefined;
}

/**
 * 계급·직급(+ 플레이어와 얽힌 직업)만 골라 4자 이하의 이름으로. 해당 없으면 undefined.
 * 위에서부터 먼저 맞는 것: 군 보직 → 군 계급 → 직업 → 회사 직급
 */
const RANKS: [RegExp, string][] = [
  [/주임원사/, '주임원사'],
  [/행정보급관|행보관/, '행보관'],
  [/대대장/, '대대장'],
  [/중대장/, '중대장'],
  [/소대장/, '소대장'],
  [/부분대장/, '부분대장'],
  [/분대장/, '분대장'],
  [/훈련병/, '훈련병'],
  [/이병|이등병/, '이병'],
  [/일병|일등병/, '일병'],
  [/상병|상등병/, '상병'],
  [/병장/, '병장'],
  [/하사/, '하사'],
  [/중사/, '중사'],
  [/원사/, '원사'],
  [/준위/, '준위'],
  [/소위/, '소위'],
  [/중위/, '중위'],
  [/대위/, '대위'],
  [/소령/, '소령'],
  [/중령/, '중령'],
  [/대령/, '대령'],
  [/준장/, '준장'],
  [/소장/, '소장'],
  [/중장/, '중장'],
  [/(?<![중소대])대장/, '대장'],
  [/상사(?!원)/, '상사'],
  [/에이전트/, '에이전트'],
  [/감독/, '감독'],
  [/코치/, '코치'],
  [/단장/, '단장'],
  [/주장|캡틴/, '주장'],
  [/기자/, '기자'],
  [/앵커/, '앵커'],
  [/(^|[^A-Za-z])(PD|피디)([^A-Za-z]|$)/, 'PD'],
  [/사진\s?작가|포토그래퍼|스냅 ?작가/, '사진작가'],
  [/작가/, '작가'],
  [/편집자/, '편집자'],
  [/매니저/, '매니저'],
  [/마케터/, '마케터'],
  [/수사관/, '수사관'],
  [/형사/, '형사'],
  [/변호사/, '변호사'],
  [/검사/, '검사'],
  [/리퍼닥/, '리퍼닥'],
  [/픽서/, '픽서'],
  [/의사(?!소통)/, '의사'],
  [/교수/, '교수'],
  [/조교/, '조교'],
  [/원장/, '원장'],
  [/점장/, '점장'],
  [/부회장/, '부회장'],
  [/(?<![학생])회장/, '회장'],
  [/부사장/, '부사장'],
  [/사장/, '사장'],
  [/전무/, '전무'],
  [/상무/, '상무'],
  [/본부장/, '본부장'],
  [/센터장/, '센터장'],
  [/실장/, '실장'],
  [/파트장/, '파트장'],
  [/팀장/, '팀장'],
  [/부장/, '부장'],
  [/차장/, '차장'],
  [/과장/, '과장'],
  [/대리/, '대리'],
  [/주임/, '주임'],
  [/대표/, '대표'],
  [/(^|[^A-Za-z])PM([^A-Za-z]|$)/, 'PM'],
  [/(^|[^A-Za-z])MD([^A-Za-z]|$)/, 'MD'],
  [/인턴/, '인턴'],
  [/신입/, '신입'],
  [/(?<![회직])사원/, '사원'],
];

export function cleanRank(text: string | undefined): string | undefined {
  const t = (text ?? '').trim();
  if (!t) return undefined;
  for (const [re, name] of RANKS) if (re.test(t)) return name;
  return undefined;
}

/** 기본 세계관 인물 한 명의 직급·나이(없으면 undefined) */
export function seedMeta(templateId: string, seed: Pick<CharacterSeed, 'key' | 'photo' | 'description' | 'bio' | 'isNews' | 'org'>): { title?: string; age?: number } {
  if (seed.isNews || seed.org) return {};
  const title = CAST_TITLE[`${templateId}__${seed.key}`];
  const age = seed.photo.age ?? ageInText(seed.description) ?? ageInText(seed.bio);
  return { ...(title ? { title } : {}), ...(age ? { age } : {}) };
}
