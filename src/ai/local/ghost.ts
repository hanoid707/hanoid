/**
 * 이름 없는 일반 유저(임시 계정)의 이름·아이디·이모지(토큰 0, 같은 seed면 같은 사람)
 * 계정 모양만 만든다 — 그 계정이 하는 말은 전부 AI가 쓴다.
 */
import type { GhostAuthor } from '../../types';
import { hashStr } from '../../utils';

// ───────────────────────── 임시 계정(이름 없는 일반 유저)

const NICK_A = [
  '새벽', '퇴근', '월요일', '고양이', '라면', '민트', '코코', '딸기', '하루', '모모', '구름', '감자', '고구마', '떡볶이', '초코', '복숭아',
  '바닐라', '우유', '두부', '보리', '토끼', '곰돌이', '햇살', '별빛', '노을', '여름', '겨울', '봄날', '가을', '파도', '산책', '야근',
  '출근', '주말', '커피', '마카롱', '젤리', '참깨', '호두', '밤톨', '오리', '펭귄', '판다', '다람쥐', '귤', '체리', '수박', '김밥',
];
const NICK_B = [
  '요정', '집사', '러버', '좋아', '부자', '인간', '한입', '덕후', '중독', '수집가', '장인', '맛집', '여행자', '일기', '조각', '산책러',
  '탐험대', '연구소', '공장', '구독자', '지킴이', '대장', '탐정', '마스터', '꿈나무', '생활', '기록', '중독자', '홀릭', '만세', '파티',
  '천국', '냠냠', '왕', '단짝', '친구', '부스러기', '한스푼', '모음', '소년', '소녀', '씨앗', '애호가',
];
const GIVEN = [
  '지우', '하린', '도윤', '서연', '민준', '예린', '유나', '시우', '채원', '준호', '다은', '서윤', '하준', '수아', '지민', '현우', '나연',
  '은우', '소율', '태윤', '가은', '민서', '주원', '연우', '하은', '재윤', '수빈', '지호', '예준', '윤서', '건우', '아린', '서진', '다인',
  '민재', '지안', '로아', '이준', '세아', '우진', '규리', '태오', '보미', '한결',
];
const H_A = [
  'mint', 'choco', 'haru', 'momo', 'gureum', 'gamja', 'saebyeok', 'cloud', 'moon', 'star', 'bori', 'dubu', 'coco', 'peach', 'cherry',
  'latte', 'mango', 'ramyeon', 'tteok', 'kimbap', 'bunny', 'kitty', 'puppy', 'panda', 'otter', 'duck', 'hodu', 'bam', 'gyul', 'sunny',
  'rainy', 'snow', 'spring', 'summer', 'autumn', 'winter', 'night', 'daily', 'lazy', 'sleepy', 'hungry', 'jelly', 'milk', 'honey', 'sugar',
];
const H_B = [
  '_lover', '_daily', '_log', '_zip', '_house', '_club', '_room', '_box', '_jar', '_land', '_world', 'mania', '_fan', '_life', '_story',
  '_diary', '_note', '_cat', '_dog', '_moon', '_day', '_kim', '_lee', '_park', '_choi', '_jung', '_k', '_j', '_x', '_o', '0', '00', '_99',
  '_01', '_02', '_03', '_88', '_77', '_s2', '_w', '__', '_yy', '_zz',
];
/** 이름(GIVEN)과 같은 순서의 로마자(아이디용) */
const GIVEN_EN = [
  'jiwoo', 'harin', 'doyun', 'seoyeon', 'minjun', 'yerin', 'yuna', 'siwoo', 'chaewon', 'junho', 'daeun', 'seoyun', 'hajun', 'sua', 'jimin',
  'hyunwoo', 'nayeon', 'eunwoo', 'soyul', 'taeyun', 'gaeun', 'minseo', 'juwon', 'yeonwoo', 'haeun', 'jaeyun', 'subin', 'jiho', 'yejun',
  'yunseo', 'geonwoo', 'arin', 'seojin', 'dain', 'minjae', 'jian', 'roa', 'ijun', 'sea', 'woojin', 'gyuri', 'taeo', 'bomi', 'hangyeol',
];
const EMOJIS = ['🐱', '🐶', '🌙', '🍓', '☁️', '🍀', '🐰', '🍙', '🫧', '⭐', '🐻', '🥨', '🍑', '🌷', '🦊', '🐧', '🍊', '🌻', '🎧', '🧸', '🍒', '🐥', '🌈', '🍵'];
const COLORS = ['#94A3B8', '#F59E0B', '#10B981', '#6366F1', '#EC4899', '#0EA5E9', '#84CC16', '#F97316', '#A855F7', '#14B8A6', '#E11D48', '#64748B'];

/** 이름 없는 일반 유저(임시 계정) 한 명 — 같은 seed면 같은 사람 */
export function ghostAuthor(seed: string): GhostAuthor {
  const h = hashStr(seed);
  const h2 = hashStr(`${seed}#2`);
  const at = <T,>(arr: readonly T[], x: number) => arr[x % arr.length];
  const gi = h2 % GIVEN.length;
  const emoji = at(EMOJIS, h >>> 5);
  // 표시 이름 모양: 닉네임 조합 / 이름+이모지 / 닉네임+이름 / 익명의 ○○ / 짧은 이름
  let name: string;
  switch (h % 9) {
    case 0:
    case 1:
    case 2:
      name = `${at(NICK_A, h >>> 3)}${at(NICK_B, h2 >>> 3)}`;
      break;
    case 3:
    case 4:
      name = `${GIVEN[gi]}${h2 % 2 ? ` ${emoji}` : emoji}`;
      break;
    case 5:
      name = `${at(NICK_A, h >>> 3)} ${GIVEN[gi]}`;
      break;
    case 6:
      name = `익명의 ${at(NICK_A, h >>> 3)}`;
      break;
    case 7:
      name = `${at(NICK_A, h >>> 3)}${at(NICK_A, h2 >>> 7)}`;
      break;
    default:
      name = h2 % 3 === 0 ? 'ㅇㅇ' : `${GIVEN[gi]}네 ${at(['고양이', '강아지', '냥이', '햄찌', '댕댕이', '앵무'], h >>> 3)}`;
  }
  // 아이디 모양: 영단어+꼬리 / 이름 로마자+숫자 / its_이름
  let handle: string;
  switch (h2 % 5) {
    case 0:
    case 1:
      handle = `${at(H_A, h >>> 9)}${at(H_B, h2 >>> 9)}`;
      break;
    case 2:
      handle = `${GIVEN_EN[gi]}_${String((h >>> 11) % 10000).padStart(4, '0')}`;
      break;
    case 3:
      handle = `${['its', 'im', 'hi', 'just', 'real'][(h >>> 13) % 5]}_${GIVEN_EN[gi]}`;
      break;
    default:
      handle = `${at(H_A, h >>> 9)}_${GIVEN_EN[gi]}`;
  }
  handle = handle.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 15);
  if (handle.length < 4) handle = `${handle}_${(h % 900) + 100}`;
  return { name, handle, emoji, color: at(COLORS, h >>> 7) };
}
