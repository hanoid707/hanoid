/**
 * 멘션·관계 색 분류 — 색은 여기 한 곳에서만 정한다(글쓰기 멘션 줄 · @ 자동완성 · 계정 목록 · 프로필 · 쪽지 머리말)
 *
 *   셀럽 = 노랑 칠(검은 글자) · 언론·비즈니스 = 기본 배경 칩 · 친구 부류 = 보라 · 같은 업계 = 파랑 외곽선
 *   팬 = 연한 분홍 글자 · 안티 = 연한 빨강 글자 · 일반 = 표시 없음
 *
 * 분류 자체는 게임 규칙(src/game/relationship.ts의 mentionCategory)이 정하고, 여기서는 색만 입힌다.
 */
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { MENTION_LABEL, mentionCategory, REGISTER_LABEL, registerOf, relationLabel, type MentionCategory } from '../game/relationship';
import { font, radius, useTheme, type Palette } from '../theme';
import type { Character } from '../types';

/** 분류 고유색(라이트·다크 공통) */
export const MENTION_COLOR = {
  celeb: '#FFD400',
  friend: '#7856FF',
  industry: '#1D9BF0',
} as const;

export interface MentionStyle {
  /** 칩 배경 */
  bg: string;
  /** 칩 글자 */
  fg: string;
  /** 칩 테두리 */
  border: string;
  borderWidth: number;
  /** 목록 왼쪽 띠·강조색(없으면 transparent) */
  accent: string;
}

/** 분류 → 칩 모양(색·테두리) */
export function MENTION_STYLE(cat: MentionCategory, c: Palette): MentionStyle {
  switch (cat) {
    case 'celeb':
      return { bg: MENTION_COLOR.celeb, fg: '#0F1419', border: MENTION_COLOR.celeb, borderWidth: 1, accent: MENTION_COLOR.celeb };
    case 'business':
      return { bg: c.surfaceAlt, fg: c.text, border: c.borderStrong, borderWidth: 1, accent: c.borderStrong };
    case 'friend':
      return { bg: MENTION_COLOR.friend, fg: '#FFFFFF', border: MENTION_COLOR.friend, borderWidth: 1, accent: MENTION_COLOR.friend };
    case 'industry':
      return { bg: 'transparent', fg: MENTION_COLOR.industry, border: MENTION_COLOR.industry, borderWidth: 1.5, accent: MENTION_COLOR.industry };
    case 'fan':
      return { bg: 'transparent', fg: c.like, border: c.border, borderWidth: 1, accent: 'transparent' };
    case 'anti':
      return { bg: 'transparent', fg: c.danger, border: c.border, borderWidth: 1, accent: 'transparent' };
    case 'public':
    default:
      return { bg: 'transparent', fg: c.subtext, border: c.border, borderWidth: 1, accent: 'transparent' };
  }
}

/** 캐릭터 → 칩 모양 */
export function mentionStyleOf(ch: Character, c: Palette): MentionStyle {
  return MENTION_STYLE(mentionCategory(ch), c);
}

type ChipSize = 'xs' | 'sm' | 'md';
const SIZE: Record<ChipSize, { h: number; px: number; fs: number }> = {
  xs: { h: 18, px: 6, fs: 10 },
  sm: { h: 20, px: 7, fs: font.tiny },
  md: { h: 26, px: 10, fs: font.small },
};

/** 분류 색 칩(글자 직접 지정) */
export function CategoryChip({ cat, label, size = 'sm', style, onPress, accessibilityLabel }: { cat: MentionCategory; label: string; size?: ChipSize; style?: StyleProp<ViewStyle>; onPress?: () => void; accessibilityLabel?: string }) {
  const { c } = useTheme();
  const s = MENTION_STYLE(cat, c);
  const z = SIZE[size];
  const body = (
    <View style={[styles.chip, { height: z.h, paddingHorizontal: z.px, backgroundColor: s.bg, borderColor: s.border, borderWidth: s.borderWidth }, style]}>
      <Text numberOfLines={1} style={{ color: s.fg, fontSize: z.fs, fontWeight: '800' }}>
        {label}
      </Text>
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} hitSlop={4} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      {body}
    </Pressable>
  );
}

/**
 * 나와의 관계 칩: 인증 캐릭터는 관계(친구·베프·라이벌…), 일반 계정은 분류(팬·셀럽·매거진…)
 * showRegister면 "친구 · 반말"처럼 말투를 붙인다.
 */
export function RelationChip({
  ch,
  character,
  size = 'sm',
  showRegister,
  label,
  style,
}: {
  ch?: Character;
  /** ch와 같음(둘 중 하나) */
  character?: Character;
  size?: ChipSize;
  showRegister?: boolean;
  /** 글자 직접 지정(기본: 관계 이름) */
  label?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const who = ch ?? character;
  if (!who) return null;
  const text = (label ?? relationLabel(who)) + (showRegister ? ` · ${REGISTER_LABEL[registerOf(who)]}` : '');
  return <CategoryChip cat={mentionCategory(who)} label={text} size={size} style={style} accessibilityLabel={`관계: ${text}`} />;
}

/** 표시 이름 칩(글쓰기 "자주 멘션" 줄) — 아이디 대신 실제 이름을 분류 색으로 */
export function NameChip({ ch, onPress, size = 'md' }: { ch: Character; onPress?: () => void; size?: ChipSize }) {
  return <CategoryChip cat={mentionCategory(ch)} label={ch.name} size={size} onPress={onPress} accessibilityLabel={`${ch.name} 멘션하기`} />;
}

const LEGEND: MentionCategory[] = ['celeb', 'business', 'friend', 'industry', 'fan', 'anti'];

/** 색 범례 한 줄(좁은 화면에서는 옆으로 밀림) */
export function MentionLegend({ style, title }: { style?: StyleProp<ViewStyle>; title?: string }) {
  const { c } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={style} contentContainerStyle={styles.legend}>
      {title ? <Text style={{ color: c.subtext, fontSize: font.tiny, fontWeight: '700', marginRight: 2 }}>{title}</Text> : null}
      {LEGEND.map((k) => (
        <CategoryChip key={k} cat={k} label={MENTION_LABEL[k]} size="xs" />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chip: { borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 5 },
});
