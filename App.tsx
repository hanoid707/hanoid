/**
 * 앱 시작점
 * 1) 기기에 저장된 데이터·공통 캐릭터 불러오기(hydrate) → 2) DB 동기화 시작 → 3) 화면 구조(RootNavigator) 표시 → 4) 전역 토스트
 * 웹에서는 폰 크기 틀(최대 480px) 안에 앱을 보여준다.
 */
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ToastHost } from './src/components/Toast';
import { RootNavigator } from './src/navigation/RootNavigator';
import { hydrateStore, useGame } from './src/store/game';
import { hydrateRoster } from './src/store/roster';
import { hydrateUsage } from './src/store/usage';
import { startSync } from './src/sync';
import { useTheme } from './src/theme';

function Shell() {
  const { c, dark } = useTheme();
  const hydrated = useGame((s) => s.hydrated);

  if (!hydrated) {
    return (
      <View style={[styles.center, { backgroundColor: c.bg }]}>
        <Text style={{ fontSize: 28, fontWeight: '900', color: c.text, letterSpacing: -1 }}>AI-SNS</Text>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  const app = (
    <>
      <RootNavigator />
      <ToastHost />
      <StatusBar style={dark ? 'light' : 'dark'} />
    </>
  );

  if (Platform.OS !== 'web') return app;
  // 웹: 바깥 배경은 페이지(HTML)가 칠하고, 앱은 가운데 폰 크기 틀 안에 둔다
  return (
    <View style={styles.webOuter}>
      <View style={[styles.webPhone, { backgroundColor: c.bg, borderColor: c.border }]}>{app}</View>
    </View>
  );
}

export default function App() {
  useEffect(() => {
    // 세이브 + 공통 캐릭터 목록을 불러온 뒤 DB 동기화 시작. AI 사용량 기록(설정 > AI 연결)도 같이 불러온다
    void Promise.all([hydrateStore(), hydrateRoster()]).then(() => startSync());
    void hydrateUsage();
  }, []);
  return (
    <SafeAreaProvider>
      <Shell />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  webOuter: { flex: 1, alignItems: 'center', backgroundColor: 'transparent' },
  webPhone: { flex: 1, width: '100%', maxWidth: 480, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderRadius: 16 },
});
