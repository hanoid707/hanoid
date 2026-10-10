/**
 * 세계관 템플릿 타입 — 세계관 파일(src/data/worlds/*.ts)이 모두 이 모양을 따른다.
 * - 계정은 core(이야기의 중심 인물)와 crowd(타임라인을 채우는 일반 유저)로 나뉜다.
 * - photo는 "프로필 사진 생성 사양"이다. 실제 사진은 scripts로 미리 생성해 src/data/photos.ts에 들어 있다(앱 안에서 이미지를 새로 만들지 않는다).
 * - posts는 시작 전 타임라인(그 인물의 지난 글)이다. 시작한 뒤의 글·답글·쪽지는 전부 AI가 bio·description을 보고 쓴다.
 * - (v3.1) 무드별 대사(voice)·첫 쪽지(dmOpeners)·일반 유저 답글(crowdReplies)·이벤트 결과 문장(outcome)은 없앴다
 *   — 맥락과 상관없이 끼어드는 틀 문장이 되기 때문.
 */
import type { Archetype, Gender, SpeechRegister } from '../types';

export type { Gender };

/** 프로필 사진 생성 사양 */
export interface PhotoSpec {
  /** face: 얼굴 사진 / faceless: 얼굴 없는 사진(반려동물·풍경·뒷모습 등) / logo: 로고(뉴스·기관) */
  kind: 'face' | 'faceless' | 'logo';
  gender?: Gender;
  age?: number;
  /** 사진 생성기용 영어 묘사(쉼표 구분). logo는 로고에 넣을 짧은 글자(한글 1~4자) */
  prompt: string;
}

/** 이미지가 붙은 게시물. media = 세계관 scenes의 key */
export interface MediaPost {
  text: string;
  media: string;
}

export interface CharacterSeed {
  key: string;
  tier: 'core' | 'crowd';
  /** 표시 이름(X 스타일: 실명·닉네임·이모지 섞임) */
  name: string;
  /** @아이디: 영문 소문자·숫자·밑줄 4~15자 */
  handle: string;
  /** 사진이 없을 때 대신 쓰는 이모지·배경색 */
  emoji: string;
  color: string;
  archetype: Archetype;
  /** 프로필에 보이는 자기소개 */
  bio: string;
  /** (숨김) 핵심 특징 1~2문장(정체·성격·플레이어와의 관계) — AI가 이 캐릭터를 연기할 때 읽는다.
   *  말투·이모지·말버릇 같은 세부 규칙은 적지 않는다(친밀도에 따라 자연스럽게 달라지게). */
  description: string;
  /** core 전용: 처음 플레이어에게 쓰는 말투(관계가 바뀌면 게임 규칙이 다시 정한다) */
  register?: SpeechRegister;
  followers: number;
  following: number;
  location?: string;
  /** 가입 시기 표시(예: '2021년 3월') */
  joined: string;
  /** 파란 인증 배지 */
  verified?: boolean;
  /** 금색 인증 배지(언론사·기업·구단 등 단체 계정) */
  org?: boolean;
  isNews?: boolean;
  photo: PhotoSpec;
  /** 시작 전에 올린 글(타임라인·프로필 초기값) */
  posts: (string | MediaPost)[];
  /** core 전용: 다른 인물과의 관계(AI 참고용) */
  relations?: string;
}

export interface EventChoiceTemplate {
  id: string;
  label: string;
  hint?: string;
}

export interface EventTemplate {
  key: string;
  emoji: string;
  title: string;
  body: string;
  /** 관련 캐릭터 key(세계관 전용 이벤트) */
  involved?: string[];
  /** 관련 캐릭터 성격 유형(공용 이벤트: 해당 유형 캐릭터를 찾아 넣음) */
  involvedArchetypes?: Archetype[];
  choices: EventChoiceTemplate[];
}

export interface MissionTemplate {
  title: string;
  desc: string;
  keyword: string[];
}

/** 게시물 첨부 이미지·프로필 배너용 장면 */
export interface SceneSpec {
  key: string;
  /** 사진 생성기용 영어 묘사 */
  prompt: string;
}

export interface WorldTemplate {
  id: string;
  name: string;
  emoji: string;
  color: string;
  tagline: string;
  /** 세계관 설정(AI 프롬프트 핵심 재료) */
  setting: string;
  tone: string;
  vocab: string[];
  /** 플레이어가 고를 수 있는 역할 */
  roles: string[];
  tag: string;
  trends: string[];
  welcome: string;
  /** 플레이어 기본 설정 예시(온보딩 자동 채우기) */
  personaHint: { bio: string; description: string };
  cast: CharacterSeed[];
  /** 이 세계에서 일어날 법한 사건(선택지만, 결과는 AI가 플레이어 답을 보고 씀) */
  events: EventTemplate[];
  missions: MissionTemplate[];
  /** 게시물 첨부 이미지 장면 */
  scenes: SceneSpec[];
  /** 프로필 배너 장면 */
  banners: SceneSpec[];
}
