/** 화면 틀(X 스타일): 배경 + 상단 바(← 뒤로 · 제목/부제목 · 오른쪽 버튼) */
import { useNavigation } from '@react-navigation/native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { font, space, useTheme } from '../theme';
import { IconBack, IconClose } from './icons';

export function Screen({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return <View style={[{ flex: 1, backgroundColor: c.bg }, style]}>{children}</View>;
}

export function TopBar({
  title,
  subtitle,
  back = true,
  close,
  right,
  left,
  transparent,
  center,
  border = true,
}: {
  title?: ReactNode;
  subtitle?: string;
  back?: boolean;
  /** 모달처럼 X 버튼으로 닫기 */
  close?: boolean;
  right?: ReactNode;
  left?: ReactNode;
  transparent?: boolean;
  /** 제목 가운데 정렬(기본: 왼쪽, X와 같음) */
  center?: boolean;
  border?: boolean;
}) {
  const { c } = useTheme();
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const showBack = (back || close) && nav.canGoBack();
  return (
    <View
      style={[
        styles.bar,
        {
          paddingTop: insets.top,
          height: 53 + insets.top,
          backgroundColor: transparent ? 'transparent' : c.bg,
          borderBottomColor: transparent || !border ? 'transparent' : c.border,
        },
      ]}
    >
      <View style={styles.left}>
        {left ??
          (showBack ? (
            <Pressable accessibilityRole="button" accessibilityLabel={close ? '닫기' : '뒤로'} hitSlop={10} onPress={() => nav.goBack()} style={({ pressed }) => [styles.backBtn, pressed && { backgroundColor: c.hover }]}>
              {close ? <IconClose size={22} color={c.text} /> : <IconBack size={22} color={c.text} />}
            </Pressable>
          ) : null)}
      </View>
      <View style={[styles.center, center && { alignItems: 'center' }]}>
        {typeof title === 'string' ? (
          <Text numberOfLines={1} style={{ color: c.text, fontSize: font.h2, fontWeight: '800' }}>
            {title}
          </Text>
        ) : (
          title
        )}
        {subtitle ? (
          <Text numberOfLines={1} style={{ color: c.subtext, fontSize: font.small }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={styles.right}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, zIndex: 2 },
  left: { minWidth: 40, flexDirection: 'row', alignItems: 'center' },
  right: { minWidth: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  center: { flex: 1, justifyContent: 'center', paddingHorizontal: space.sm },
  backBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
});
