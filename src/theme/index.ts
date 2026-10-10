/**
 * 디자인 토큰(색·간격·모서리·글자) + 라이트/다크 테마
 * X(트위터) 앱과 같은 느낌: 흰/검정 바탕, 파랑 포인트, 분홍 마음, 초록 재게시
 * (로고·이름 같은 상표는 쓰지 않는다)
 */
import { Platform, useColorScheme } from 'react-native';
import { useGame } from '../store/game';

export interface Palette {
  bg: string;
  surface: string;
  surfaceAlt: string;
  /** 눌렀을 때·카드 배경 */
  hover: string;
  text: string;
  subtext: string;
  faint: string;
  border: string;
  borderStrong: string;
  primary: string;
  primarySoft: string;
  onPrimary: string;
  /** 검정 알약 버튼(라이트) / 흰 알약 버튼(다크) */
  ink: string;
  onInk: string;
  like: string;
  likeSoft: string;
  repost: string;
  repostSoft: string;
  gold: string;
  gray: string;
  success: string;
  successSoft: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  warningSoft: string;
  aura: string;
  humor: string;
  overlay: string;
  bubbleMe: string;
  bubbleThem: string;
  onBubbleThem: string;
}

const light: Palette = {
  bg: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceAlt: '#F7F9F9',
  hover: '#F7F9F9',
  text: '#0F1419',
  subtext: '#536471',
  faint: '#8B98A5',
  border: '#EFF3F4',
  borderStrong: '#CFD9DE',
  primary: '#1D9BF0',
  primarySoft: '#E8F5FD',
  onPrimary: '#FFFFFF',
  ink: '#0F1419',
  onInk: '#FFFFFF',
  like: '#F91880',
  likeSoft: '#FFE5F2',
  repost: '#00BA7C',
  repostSoft: '#DEF1EB',
  gold: '#E2B719',
  gray: '#829AAB',
  success: '#00BA7C',
  successSoft: '#DEF1EB',
  danger: '#F4212E',
  dangerSoft: '#FDECEE',
  warning: '#D97706',
  warningSoft: '#FEF3E2',
  aura: '#7856FF',
  humor: '#FFAD1F',
  overlay: 'rgba(91,112,131,0.4)',
  bubbleMe: '#1D9BF0',
  bubbleThem: '#EFF3F4',
  onBubbleThem: '#0F1419',
};

const dark: Palette = {
  bg: '#000000',
  surface: '#000000',
  surfaceAlt: '#16181C',
  hover: '#080808',
  text: '#E7E9EA',
  subtext: '#71767B',
  faint: '#536471',
  border: '#2F3336',
  borderStrong: '#536471',
  primary: '#1D9BF0',
  primarySoft: '#031018',
  onPrimary: '#FFFFFF',
  ink: '#EFF3F4',
  onInk: '#0F1419',
  like: '#F91880',
  likeSoft: '#200914',
  repost: '#00BA7C',
  repostSoft: '#071A14',
  gold: '#E2B719',
  gray: '#829AAB',
  success: '#00BA7C',
  successSoft: '#071A14',
  danger: '#F4212E',
  dangerSoft: '#2A0A0C',
  warning: '#FFAD1F',
  warningSoft: '#2A1E08',
  aura: '#9B85FF',
  humor: '#FFAD1F',
  overlay: 'rgba(91,112,131,0.4)',
  bubbleMe: '#1D9BF0',
  bubbleThem: '#2F3336',
  onBubbleThem: '#E7E9EA',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 } as const;
export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 } as const;
export const font = {
  tiny: 11,
  small: 13,
  body: 15,
  title: 17,
  h2: 20,
  h1: 23,
  display: 31,
} as const;

/** 웹에서 입력창 포커스 시 생기는 검은 테두리 제거 */
export const noOutline = Platform.OS === 'web' ? { outlineWidth: 0 } : {};

export interface Theme {
  dark: boolean;
  c: Palette;
}

export function useTheme(): Theme {
  const pref = useGame((s) => s.settings.theme);
  const system = useColorScheme();
  const isDark = pref === 'dark' || (pref === 'system' && system === 'dark');
  return { dark: isDark, c: isDark ? dark : light };
}
