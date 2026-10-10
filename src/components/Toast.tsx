/** 화면 위에 잠깐 떴다 사라지는 알림 */
import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGame, type Toast as ToastData } from '../store/game';
import { font, radius, useTheme } from '../theme';

export function ToastHost() {
  const toast = useGame((s) => s.toast);
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState<ToastData | null>(null);

  useEffect(() => {
    if (!toast) return;
    setShown(toast);
    const native = Platform.OS !== 'web';
    Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: native }).start();
    const t = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: native }).start(() => setShown(null));
    }, toast.tone === 'error' ? 4200 : 2600);
    return () => clearTimeout(t);
  }, [toast, opacity]);

  if (!shown) return null;
  const bg = shown.tone === 'error' ? c.danger : c.primary;
  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, { bottom: insets.bottom + 72, opacity }]}>
      <Text style={[styles.text, { backgroundColor: bg, color: '#fff' }]}>{shown.text}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center', zIndex: 1000 },
  text: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: radius.sm, overflow: 'hidden', fontSize: font.body, fontWeight: '600', textAlign: 'center', maxWidth: 440 },
});
