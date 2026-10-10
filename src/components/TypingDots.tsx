/** "입력 중…" 점 세 개 애니메이션 */
import { useEffect, useRef } from 'react';
import { Animated, Platform, View } from 'react-native';

export function TypingDots({ color, size = 6 }: { color: string; size?: number }) {
  const vals = useRef([0, 1, 2].map(() => new Animated.Value(0.3))).current;
  useEffect(() => {
    const anims = vals.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(v, { toValue: 1, duration: 320, useNativeDriver: Platform.OS !== 'web' }),
          Animated.timing(v, { toValue: 0.3, duration: 320, useNativeDriver: Platform.OS !== 'web' }),
          Animated.delay((2 - i) * 160),
        ]),
      ),
    );
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, [vals]);
  return (
    <View style={{ flexDirection: 'row', gap: size * 0.6, alignItems: 'center' }}>
      {vals.map((v, i) => (
        <Animated.View key={i} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity: v }} />
      ))}
    </View>
  );
}
