/** 기본 UI 부품(X 스타일): 알약 버튼, 탭(밑줄), 칩, 카드, 입력창, 진행 막대, 빈 화면, 등장 연출, 뼈대(로딩) */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type DimensionValue, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { font, noOutline, radius, space, useTheme } from '../theme';

/** 웹(react-native-web)은 네이티브 드라이버가 없다 */
const ND = Platform.OS !== 'web';
type BtnVariant = 'primary' | 'ink' | 'outline' | 'ghost' | 'danger' | 'secondary';

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled,
  icon,
  style,
  full,
  loading,
  loadingTitle,
  accessibilityLabel,
}: {
  title: string;
  onPress?: () => void;
  variant?: BtnVariant;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
  full?: boolean;
  loading?: boolean;
  /** 기다리는 동안 보일 글자(기본: 잠시만요…) */
  loadingTitle?: string;
  /** 읽어 주는 이름(기본: title) */
  accessibilityLabel?: string;
}) {
  const { c } = useTheme();
  const h = { sm: 32, md: 40, lg: 50 }[size];
  const bg = { primary: c.primary, ink: c.ink, outline: 'transparent', ghost: 'transparent', danger: 'transparent', secondary: c.surfaceAlt }[variant];
  const fg = { primary: c.onPrimary, ink: c.onInk, outline: c.text, ghost: c.primary, danger: c.danger, secondary: c.text }[variant];
  const border = variant === 'outline' ? c.borderStrong : variant === 'danger' ? c.danger : 'transparent';
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [
        {
          height: h,
          paddingHorizontal: size === 'sm' ? 14 : size === 'lg' ? 24 : 18,
          borderRadius: radius.pill,
          backgroundColor: bg,
          borderWidth: variant === 'outline' || variant === 'danger' ? 1 : 0,
          borderColor: border,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          opacity: off ? 0.5 : pressed ? 0.8 : 1,
          alignSelf: full ? 'stretch' : 'auto',
        },
        style,
      ]}
    >
      {icon}
      <Text style={{ color: fg, fontSize: size === 'sm' ? 14 : size === 'lg' ? 17 : 15, fontWeight: '700' }}>{loading ? (loadingTitle ?? '잠시만요…') : title}</Text>
    </Pressable>
  );
}

export function IconButton({ onPress, children, label, badge, size = 38 }: { onPress?: () => void; children: ReactNode; label: string; badge?: number; size?: number }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? c.hover : 'transparent' }]}
    >
      {children}
      {!!badge && badge > 0 && (
        <View style={[styles.badge, { backgroundColor: c.primary, borderColor: c.bg }]}>
          <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  emoji,
  accessibilityLabel,
  small,
  disabled,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  emoji?: string;
  accessibilityLabel?: string;
  /** 낮은 칩(한 줄에 여러 개) */
  small?: boolean;
  disabled?: boolean;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected, disabled }}
      style={({ pressed }) => [
        styles.chip,
        small && { height: 30, paddingHorizontal: 11 },
        { backgroundColor: selected ? c.primarySoft : 'transparent', borderColor: selected ? c.primary : c.borderStrong, opacity: disabled ? 0.45 : pressed ? 0.75 : 1 },
      ]}
    >
      {emoji ? <Text style={{ fontSize: 14 }}>{emoji}</Text> : null}
      <Text style={{ color: selected ? c.primary : c.text, fontSize: font.small, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const { c } = useTheme();
  const base = [styles.card, { backgroundColor: c.surface, borderColor: c.border }, style];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [base, pressed && { backgroundColor: c.hover }]}>
      {children}
    </Pressable>
  );
}

/** X식 상단 탭: 글자 아래 파란 막대 */
export function Tabs<T extends string>({ tabs, value, onChange, scroll }: { tabs: { key: T; label: string }[]; value: T; onChange: (k: T) => void; scroll?: boolean }) {
  const { c } = useTheme();
  const items = tabs.map((t) => {
    const on = t.key === value;
    return (
      <Pressable
        key={t.key}
        onPress={() => onChange(t.key)}
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        style={({ pressed }) => [styles.tab, !scroll && { flex: 1 }, scroll && { paddingHorizontal: 16 }, pressed && { backgroundColor: c.hover }]}
      >
        <View style={{ alignItems: 'center' }}>
          <Text style={{ color: on ? c.text : c.subtext, fontWeight: on ? '800' : '600', fontSize: font.body, paddingVertical: 14 }}>{t.label}</Text>
          <View style={{ height: 4, borderRadius: 2, alignSelf: 'stretch', backgroundColor: on ? c.primary : 'transparent', minWidth: 48 }} />
        </View>
      </Pressable>
    );
  });
  return (
    <View style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }}>
      {scroll ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {items}
        </ScrollView>
      ) : (
        <View style={{ flexDirection: 'row' }}>{items}</View>
      )}
    </View>
  );
}

/** 작은 전환 버튼(설정 화면용) */
export function Segmented<T extends string>({ options, value, onChange }: { options: { key: T; label: string }[]; value: T; onChange: (k: T) => void }) {
  const { c } = useTheme();
  return (
    <View style={[styles.segment, { borderColor: c.borderStrong }]}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={[styles.segmentItem, on && { backgroundColor: c.primary }]}
          >
            <Text style={{ color: on ? '#fff' : c.text, fontWeight: '700', fontSize: font.small }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ProgressBar({ value, max, color, height = 6 }: { value: number; max: number; color?: string; height?: number }) {
  const { c } = useTheme();
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <View style={{ height, borderRadius: height, backgroundColor: c.surfaceAlt, overflow: 'hidden' }}>
      <View style={{ width: `${pct * 100}%`, height: '100%', borderRadius: height, backgroundColor: color ?? c.primary }} />
    </View>
  );
}
export function Field({ label, hint, counter, ...input }: TextInputProps & { label?: string; hint?: string; counter?: boolean }) {
  const { c } = useTheme();
  const [focused, setFocused] = useState(false);
  const len = String(input.value ?? '').length;
  return (
    <View style={{ gap: 4 }}>
      <View style={[styles.field, { borderColor: focused ? c.primary : c.borderStrong, borderWidth: focused ? 2 : 1, padding: focused ? 7 : 8 }]}>
        {label ? (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: focused ? c.primary : c.subtext, fontSize: font.small }}>{label}</Text>
            {counter && input.maxLength ? (
              <Text style={{ color: len >= input.maxLength ? c.danger : c.subtext, fontSize: font.small }}>
                {len} / {input.maxLength}
              </Text>
            ) : null}
          </View>
        ) : null}
        <TextInput
          placeholderTextColor={c.faint}
          accessibilityLabel={label}
          {...input}
          onFocus={(e) => {
            setFocused(true);
            input.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            input.onBlur?.(e);
          }}
          style={[
            noOutline,
            { color: c.text, fontSize: 17, paddingVertical: 4, minHeight: input.multiline ? 72 : 30, textAlignVertical: input.multiline ? 'top' : 'center' },
            input.style,
          ]}
        />
      </View>
      {hint ? <Text style={{ color: c.subtext, fontSize: font.small, lineHeight: 18 }}>{hint}</Text> : null}
    </View>
  );
}

export function EmptyState({ emoji, title, desc, action }: { emoji?: string; title: string; desc?: string; action?: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={styles.empty}>
      {emoji ? <Text style={{ fontSize: 40 }}>{emoji}</Text> : null}
      <Text style={{ color: c.text, fontSize: font.display, fontWeight: '800', lineHeight: 36 }}>{title}</Text>
      {desc ? <Text style={{ color: c.subtext, fontSize: font.body, lineHeight: 21 }}>{desc}</Text> : null}
      {action}
    </View>
  );
}

export function Divider({ thick }: { thick?: boolean }) {
  const { c } = useTheme();
  return <View style={{ height: thick ? 8 : StyleSheet.hairlineWidth, backgroundColor: thick ? c.surfaceAlt : c.border }} />;
}

/** 설정 목록 한 줄 */
export function Row({ icon, title, desc, right, onPress }: { icon?: ReactNode; title: string; desc?: string; right?: ReactNode; onPress?: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.hover }]}>
      {icon}
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.text, fontSize: font.body, fontWeight: '600' }}>{title}</Text>
        {desc ? <Text style={{ color: c.subtext, fontSize: font.small, marginTop: 2, lineHeight: 18 }}>{desc}</Text> : null}
      </View>
      {right}
    </Pressable>
  );
}

/** 입력 묶음 제목(작은 굵은 글자 + 선택 설명) */
export function FormLabel({ children, hint, right }: { children: ReactNode; hint?: string; right?: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Text style={{ color: c.text, fontWeight: '700', fontSize: font.body }}>{children}</Text>
      {hint ? (
        <Text style={{ color: c.subtext, fontSize: font.small, flex: 1 }} numberOfLines={1}>
          {hint}
        </Text>
      ) : (
        <View style={{ flex: 1 }} />
      )}
      {right}
    </View>
  );
}

/**
 * 새로 도착한 항목이 살짝 떠오르며 나타나는 연출(답글·쪽지·결과 칩)
 * animate=false면 바로 보인다(처음부터 있던 항목). 처음 그려질 때 한 번만 움직인다.
 */
export function AppearIn({ children, animate = true, delay = 0, from = 10, style }: { children: ReactNode; animate?: boolean; delay?: number; from?: number; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(animate ? 0 : 1)).current;
  useEffect(() => {
    if (!animate) return;
    const a = Animated.timing(v, { toValue: 1, duration: 280, delay, useNativeDriver: ND });
    a.start();
    return () => a.stop();
  }, []); // 처음 한 번만
  return (
    <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }) }] }]}>{children}</Animated.View>
  );
}

/** 로딩 뼈대(깜빡이는 회색 막대) */
export function Skeleton({ width, height = 12, round = 6, style }: { width: DimensionValue; height?: number; round?: number; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const v = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 650, useNativeDriver: ND }),
        Animated.timing(v, { toValue: 0.45, duration: 650, useNativeDriver: ND }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return <Animated.View style={[{ width, height, borderRadius: round, backgroundColor: c.border, opacity: v }, style]} />;
}

/**
 * 수치 막대 — min이 음수면 가운데(0)에서 좌우로 뻗는다(호감도 -100~100), 아니면 왼쪽부터(설렘 0~100).
 * from을 주면 그 값에서 지금 값까지 움직인다(이벤트 결과 실시간 반응).
 */
export function MeterBar({ value, min = 0, max = 100, from, color, negColor, height = 8, duration = 900, delay = 0 }: { value: number; min?: number; max?: number; from?: number; color?: string; negColor?: string; height?: number; duration?: number; delay?: number }) {
  const { c } = useTheme();
  const clampV = (n: number) => Math.max(min, Math.min(max, n));
  const v = useRef(new Animated.Value(clampV(from ?? value))).current;
  useEffect(() => {
    const a = Animated.timing(v, { toValue: clampV(value), duration: from === undefined ? 0 : duration, delay, useNativeDriver: false });
    a.start();
    return () => a.stop();
  }, [value]); // 값이 바뀔 때만 다시 움직인다
  const centered = min < 0;
  const fill = value < 0 ? (negColor ?? c.danger) : (color ?? c.primary);
  const left = centered ? v.interpolate({ inputRange: [min, 0, max], outputRange: ['0%', '50%', '50%'], extrapolate: 'clamp' }) : '0%';
  const width = centered
    ? v.interpolate({ inputRange: [min, 0, max], outputRange: ['50%', '0%', '50%'], extrapolate: 'clamp' })
    : v.interpolate({ inputRange: [min, max], outputRange: ['0%', '100%'], extrapolate: 'clamp' });
  return (
    <View style={{ height, borderRadius: height, backgroundColor: c.surfaceAlt, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: c.border }}>
      <Animated.View style={{ position: 'absolute', top: 0, bottom: 0, left, width, backgroundColor: fill, borderRadius: height }} />
      {centered ? <View style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 1.5, marginLeft: -0.75, backgroundColor: c.borderStrong }} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { position: 'absolute', top: 0, right: -2, minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, height: 34, borderRadius: radius.pill, borderWidth: 1 },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: space.lg },
  tab: { alignItems: 'center', justifyContent: 'flex-end' },
  segment: { flexDirection: 'row', borderRadius: radius.pill, padding: 3, borderWidth: 1 },
  segmentItem: { flex: 1, height: 32, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm },
  field: { borderRadius: 4 },
  empty: { justifyContent: 'center', gap: 8, paddingVertical: 40, paddingHorizontal: 32 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: 14 },
});
