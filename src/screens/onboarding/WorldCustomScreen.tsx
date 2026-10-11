/** 1-1단계: 세계관 직접 만들기 → AI가 등장인물 생성(AI 연결이 필요해요) */
import { useNavigation } from '@react-navigation/native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { activeEngine, createEngine } from '../../ai';
import { Screen, TopBar } from '../../components/Screen';
import { Button, Chip, Field } from '../../components/ui';
import type { RootNav } from '../../navigation/types';
import { useDraft } from '../../store/draft';
import { useGame } from '../../store/game';
import { font, space, useTheme } from '../../theme';

const EMOJIS = ['🌍', '🏫', '🏰', '🚀', '🏙️', '🌊', '🎮', '🍳', '⚽', '🕵️', '🎻', '🐉'];
/** 분위기는 고르지 않는다 — 어떤 세계든 현실에 있을 법한 사람·나이·관례로 굴러간다(분위기는 세계관 설정 글과 이야기 흐름이 정한다) */
const TONE = '사실적이고 현실적인 분위기. 실제로 있을 법한 사람·나이·조직 관례와 일상의 디테일';

export function WorldCustomScreen() {
  const { c } = useTheme();
  const nav = useNavigation<RootNav>();
  const setDraft = useDraft((s) => s.set);
  const settings = useGame((s) => s.settings.ai);
  const showToast = useGame((s) => s.showToast);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🌍');
  const [setting, setSetting] = useState('');
  const [loading, setLoading] = useState(false);

  const ok = name.trim().length >= 2 && setting.trim().length >= 10;

  const next = async () => {
    setLoading(true);
    try {
      const engine = createEngine(settings, (e) => showToast(`AI 오류 → 다른 AI로 만들었어요 (${e.message})`, 'error'));
      const world = { name: name.trim(), setting: setting.trim(), tone: TONE };
      const cast = await engine.generateCast(world);
      if (!cast.length) throw new Error('등장인물을 받지 못했어요');
      setDraft({ templateId: null, custom: { ...world, emoji }, customCast: cast, firstFollowerKey: null });
      nav.navigate('PersonaCreate');
    } catch (e) {
      showToast(`등장인물을 만들지 못했어요 — ${(e as Error).message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <TopBar title="세계관 만들기" subtitle="1 / 3" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Field label="세계관 이름" placeholder="예: 네온시티 2099" value={name} onChangeText={setName} maxLength={20} />
          <View style={{ gap: 6 }}>
            <Text style={{ color: c.text, fontWeight: '700', fontSize: font.small }}>대표 이모지</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {EMOJIS.map((e) => (
                <Chip key={e} label={e} selected={emoji === e} onPress={() => setEmoji(e)} />
              ))}
            </View>
          </View>
          <Field
            label="세계관 설정"
            placeholder="어떤 세계인지, 어떤 일이 벌어지는지 자유롭게 써주세요. (예: 2099년 사이버펑크 도시. 거대 기업이 SNS로 시민 점수를 매긴다. 모두 성인.)"
            value={setting}
            onChangeText={setSetting}
            multiline
            maxLength={400}
            counter
            hint="AI가 이 설정을 읽고 등장인물을 만들어요. 계급·직급·나이는 그 세계의 실제 관례에 맞춰져요. 언어를 정하고 싶으면 여기 적으세요."
          />
          <Button title={loading ? '등장인물 만드는 중…' : '등장인물 만들기'} size="lg" full disabled={!ok} loading={loading} onPress={next} />
          <Text style={{ color: c.faint, fontSize: font.tiny, textAlign: 'center' }}>
            {activeEngine(settings).primary ? 'AI가 이 설정을 읽고 등장인물을 만들어요' : 'AI 연결이 필요해요(나 탭 → AI 연결에서 키를 넣어 주세요)'}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
