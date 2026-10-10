/** 시작 화면(X 가입 화면 느낌) — "지금 일어나고 있는 일" · 새 이야기 시작 / 이어하기 */
import { useNavigation } from '@react-navigation/native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../components/ui';
import type { RootNav } from '../../navigation/types';
import { useDraft } from '../../store/draft';
import { useGame } from '../../store/game';
import { font, space, useTheme } from '../../theme';

export function WelcomeScreen() {
  const { c } = useTheme();
  const nav = useNavigation<RootNav>();
  const insets = useSafeAreaInsets();
  const hasSave = useGame((s) => Object.keys(s.scenarios).length > 0 && !!s.activeId);
  const resetDraft = useDraft((s) => s.reset);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={[styles.wrap, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 }]}>
      <Text style={[styles.logo, { color: c.text }]}>AI-SNS</Text>
      <View style={{ flex: 1, justifyContent: 'center', paddingVertical: 48 }}>
        <Text style={[styles.title, { color: c.text }]}>지금 일어나는 일,{'\n'}그 중심엔 내가 있다</Text>
        <Text style={{ color: c.subtext, fontSize: font.title, marginTop: 16, lineHeight: 25 }}>
          세계관을 고르고 계정을 만들면, 그 세계의 사람들이 내 글에 답글을 달고 쪽지를 보내요. 떡상할지, 캔슬될지는 내 선택에 달렸어요.
        </Text>
      </View>
      <View style={{ gap: space.md }}>
        <Button
          title="새 이야기 시작하기"
          size="lg"
          variant="ink"
          full
          onPress={() => {
            resetDraft();
            nav.navigate('WorldSelect');
          }}
        />
        {hasSave && <Button title="이어하기" size="lg" variant="outline" full onPress={() => nav.reset({ index: 0, routes: [{ name: 'Main' }] })} />}
        <Text style={{ color: c.subtext, fontSize: font.small, lineHeight: 18 }}>
          앱공부 동아리용 클론입니다. 등장인물은 전부 가상 인물이며, 기본 프로필 사진은 AI로 새로 만든 가상 얼굴이에요.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: space.xxl, flexGrow: 1 },
  logo: { fontSize: 26, fontWeight: '900', letterSpacing: -1 },
  title: { fontSize: 36, fontWeight: '900', letterSpacing: -1, lineHeight: 44 },
});
