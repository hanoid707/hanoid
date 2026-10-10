/**
 * 수치 슬라이더(호감도·설렘·정복도 직접 조절) — 끌기·누르기 + 양옆 −/+ 버튼(5씩)
 * 외부 라이브러리 없이 PanResponder로 만들어 폰·웹 모두 동작한다.
 */
import { useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { font, radius, useTheme } from '../theme';

export interface StatSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  color?: string;
  step?: number;
  disabled?: boolean;
  /** 아래 작은 설명 */
  hint?: string;
  onChange: (v: number) => void;
}

export function StatSlider({ label, value, min, max, color, step = 5, disabled, hint, onChange }: StatSliderProps) {
  const { c } = useTheme();
  const [w, setW] = useState(0);
  const width = useRef(0);
  const startX = useRef(0);
  const clampV = (n: number) => Math.max(min, Math.min(max, Math.round(n)));
  const fromX = (x: number) => clampV(min + (Math.max(0, Math.min(width.current, x)) / Math.max(1, width.current)) * (max - min));
  const cb = useRef(onChange);
  cb.current = onChange;

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabled,
      onMoveShouldSetPanResponder: () => !disabled,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        startX.current = e.nativeEvent.locationX;
        cb.current(fromX(startX.current));
      },
      onPanResponderMove: (_e, g) => cb.current(fromX(startX.current + g.dx)),
    }),
  ).current;

  const onLayout = (e: LayoutChangeEvent) => {
    width.current = e.nativeEvent.layout.width;
    setW(e.nativeEvent.layout.width);
  };
  const ratio = (clampV(value) - min) / (max - min);
  const zero = min < 0 ? (0 - min) / (max - min) : 0;
  const fill = color ?? c.primary;
  const left = Math.min(ratio, zero);
  const span = Math.abs(ratio - zero);

  return (
    <View style={{ gap: 4, opacity: disabled ? 0.45 : 1 }}>
      <View style={styles.head}>
        <Text style={{ color: c.text, fontSize: font.small, fontWeight: '700' }}>{label}</Text>
        <Text style={{ color: c.text, fontSize: font.small, fontWeight: '800' }} accessibilityLabel={`${label} 값 ${clampV(value)}`}>
          {clampV(value)}
        </Text>
      </View>
      <View style={styles.row}>
        <Pressable
          disabled={disabled}
          onPress={() => onChange(clampV(value - step))}
          accessibilityRole="button"
          accessibilityLabel={`${label} 내리기`}
          hitSlop={6}
          style={[styles.btn, { borderColor: c.borderStrong }]}
        >
          <Text style={{ color: c.text, fontWeight: '800' }}>−</Text>
        </Pressable>
        <View
          style={styles.trackWrap}
          onLayout={onLayout}
          {...pan.panHandlers}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={`${label} 조절`}
          accessibilityValue={{ min, max, now: clampV(value) }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) => onChange(clampV(value + (e.nativeEvent.actionName === 'increment' ? step : -step)))}
        >
          <View style={[styles.track, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
            <View style={{ position: 'absolute', top: 0, bottom: 0, left: `${left * 100}%`, width: `${span * 100}%`, backgroundColor: fill, borderRadius: 6 }} />
            {min < 0 ? <View style={{ position: 'absolute', top: 0, bottom: 0, left: `${zero * 100}%`, width: 1.5, backgroundColor: c.borderStrong }} /> : null}
          </View>
          {w ? <View pointerEvents="none" style={[styles.thumb, { left: ratio * w - 11, backgroundColor: c.bg, borderColor: fill }]} /> : null}
        </View>
        <Pressable
          disabled={disabled}
          onPress={() => onChange(clampV(value + step))}
          accessibilityRole="button"
          accessibilityLabel={`${label} 올리기`}
          hitSlop={6}
          style={[styles.btn, { borderColor: c.borderStrong }]}
        >
          <Text style={{ color: c.text, fontWeight: '800' }}>+</Text>
        </Pressable>
      </View>
      {hint ? <Text style={{ color: c.subtext, fontSize: font.tiny, lineHeight: 16 }}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  btn: { width: 32, height: 32, borderRadius: radius.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  trackWrap: { flex: 1, height: 32, justifyContent: 'center' },
  track: { height: 10, borderRadius: 6, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  thumb: { position: 'absolute', top: 5, width: 22, height: 22, borderRadius: 11, borderWidth: 3 },
});
