/**
 * 기본 세계관 인물의 계급·직함·나이 — 타임라인의 이름 옆에 보인다("맞선임 상병 · 22").
 *   직함: 아래 표(세계관ID__인물 key). 플레이어와의 사이(동기·맞선임·팀장)나 그 세계에서의 자리(상병·중대장·부장)를 6자 안팎으로.
 *   나이: 세계관 파일의 사진 사양(photo.age), 없으면 설명에 적힌 "○○살/세"에서 읽는다. 그 자리의 현실 나이(data/ageNorms.ts 기준)로 적어 둔다.
 * 직접 만든 세계관·캐릭터는 인물 설정의 "계급·직함"·"나이" 칸에 적은 값을 쓴다(character.title · character.age).
 */
import type { CharacterSeed } from './worldTypes';

export const CAST_TITLE: Record<string, string> = {
  // 뉴로맨서: 네오서울
  cyberpunk__kiddie: '스크립트 키디',
  cyberpunk__sera: '카우보이',
  cyberpunk__chaewon: '절친 · 경호',
  cyberpunk__turing: '수사관',
  cyberpunk__woojin: '사원',
  cyberpunk__yeoul: '심스팀 배우',
  cyberpunk__ripper: '리퍼닥',
  cyberpunk__fixer: '픽서',
  cyberpunk__capsule412: '물류 알바',
  cyberpunk__daeun: '덱 수리 알바',
  cyberpunk__rider: '라이더',
  cyberpunk__arco47: '회사원',
  cyberpunk__yeoulfan: '팬',
  cyberpunk__gurostack: '설비 관리',
  cyberpunk__yejin: '파견직',
  cyberpunk__pocha: '포차 사장',
  cyberpunk__nail12: '사무라이 지망',
  cyberpunk__nocowboy: '회사원',
  cyberpunk__retired: '은퇴 카우보이',
  cyberpunk__nurse: '간호사',
  // 킥오프
  football__dohan: '국대 주장',
  football__taeha: '주전 공격수',
  football__chan: '골키퍼 · 룸메',
  football__dasom: '서포터 운영진',
  football__harin: '구단 콘텐츠팀',
  football__abel: '플레이메이커',
  football__rocha: '공격수',
  football__ryu_agent: '에이전트 · 대표',
  football__dawn4am: '개발자',
  football__jiwoo_n: '직관러',
  football__donghae_fan: '라이벌 팬',
  football__relojero: '팬',
  football__gymrat: '직장인',
  football__yebigun: '예비역',
  football__eunbi: '회사원',
  football__hamstring: '물리치료사',
  football__haeun: '대학생',
  football__gulgae: '서포터',
  football__story_check: '대학생',
  football__mingyu: '고교 친구',
  // 사내연애 금지
  office__haesol: '팀장',
  office__hangyeol: 'PM · 사수',
  office__sodam: '입사 동기',
  office__dowon: '옆팀 디자이너',
  office__bom: '신입 개발자',
  office__seungjae: '입사 동기 · 개발',
  office__eunjung: '피플팀 과장',
  office__yunseul: '8년차 개발자',
  office__chaeeun: '대학 동기',
  office__jaehyun: 'QA · 옆자리',
  office__hayoon: 'CX팀',
  office__minkyu: '취준생',
  office__dabin: '신입',
  office__sua: '개발 지망생',
  office__nofri: '타사 개발자',
  office__wfh: '타사 직장인',
  office__bubble: '외부인',
  office__hyejin: '퇴사한 선배',
  office__gunwoo: '사내카페 바리스타',
  // 여초부대 이등병
  military__bulchim: '상병',
  military__taejun: '상병 · 룸메',
  military__daon: '이병 · 동기',
  military__eunyoung: '행보관 · 상사',
  military__pxfairy: '일병 · PX병',
  military__hayul: '상병 · 홍보지원대',
  military__seojin: '분대장 · 병장',
  military__haram: '맞선임 · 상병',
  military__eunjae: '소대장 · 중위',
  military__sowon: '상병 · 의무병',
  military__gomsin: '곰신',
  military__reservist: '예비역',
  military__airforce: '공군 상병',
  military__marine: '해병대 일병',
  military__navyvol: '해군 지원병',
  military__sjbrother: '대학생',
  military__hayulfan: '팬',
  military__draftee: '입대 예정',
  military__armyclock: '상병',
  military__latte: '예비역',
  military__cook: '상병 · 취사병',
  military__unifriend: '대학 친구',
  military__firstgen: '예비역',
  military__hasa: '하사',
  // 떡상할 때까지
  youtuber__mujin: '대형 유튜버',
  youtuber__seoha: '유튜버',
  youtuber__jiho: '대학 동기',
  youtuber__hangyeol: '편집자',
  youtuber__sojeong: 'MCN 9년차',
  youtuber__yerin: '구독자',
  youtuber__haesol: '유튜버',
  youtuber__kimsil: '이슈 유튜버',
  youtuber__dain: '브랜드 마케터',
  youtuber__sua: '유튜버',
  youtuber__shorts_factory: '쇼츠 유튜버',
  youtuber__dodam: '시청자',
  youtuber__algo: '대학생',
  youtuber__ari: '썸네일 외주',
  youtuber__chosim: '시청자',
  youtuber__superchat: '간호사',
  youtuber__taegyeong: '게임 유튜버',
  youtuber__tldr: '시청자',
  youtuber__haeun: '편집 지망생',
  // 팔로워 0부터
  influencer__seoa: '패션 인플루언서',
  influencer__haeun: '선배 인플루언서',
  influencer__eunsol: '동갑 절친',
  influencer__junseo: '포토그래퍼',
  influencer__sujin: '에이전시 팀장',
  influencer__danbi: '1호 팬',
  influencer__doyoon: 'MD',
  influencer__algo: '직장인',
  influencer__jiyoung: '회사원',
  influencer__hajin: '대학생',
  influencer__soyoon: '직장인',
  influencer__follower41: '회사원',
  influencer__gaeun: '헬스 인플루언서',
  influencer__carrier: '여행 인플루언서',
  influencer__cafeowner: '카페 사장',
  influencer__dain: '직장인',
  influencer__hwedit: '편집 외주',
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
  return head.match(RANK_RE)?.[1];
}

/** 기본 세계관 인물 한 명의 직함·나이(없으면 undefined) */
export function seedMeta(templateId: string, seed: Pick<CharacterSeed, 'key' | 'photo' | 'description' | 'bio' | 'isNews' | 'org'>): { title?: string; age?: number } {
  if (seed.isNews || seed.org) return {};
  const title = CAST_TITLE[`${templateId}__${seed.key}`];
  const age = seed.photo.age ?? ageInText(seed.description) ?? ageInText(seed.bio);
  return { ...(title ? { title } : {}), ...(age ? { age } : {}) };
}
