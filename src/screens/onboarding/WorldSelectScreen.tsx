/** 시작 화면 — 이어할 세계관(최근순) · 구분선 · 새 세계관 고르기 */
import { useNavigation } from '@react-navigation/native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '../../components/Avatar';
import { Photo } from '../../components/Photo';
import { Screen, TopBar } from '../../components/Screen';
import { sceneKey, WORLDS } from '../../data/worlds';
import type { RootNav } from '../../navigation/types';
import { useDraft } from '../../store/draft';
import { useGame } from '../../store/game';
import { font, radius, space, useTheme } from '../../theme';

const compact = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000) / 10}만` : n >= 1000 ? `${Math.round(n / 100) / 10}천` : String(n));

export function WorldSelectScreen() {
  const { c } = useTheme();
  const nav = useNavigation<RootNav>();
  const set = useDraft((s) => s.set);
  const resetDraft = useDraft((s) => s.reset);
  const scenarios = useGame((s) => s.scenarios);
  const setActive = useGame((s) => s.setActive);

  // 이어할 것: 최근에 손댄 순서
  const saves = Object.values(scenarios).sort((a, b) => b.updatedTs - a.updatedTs);

  const open = (id: string) => {
    setActive(id);
    nav.reset({ index: 0, routes: [{ name: 'Main' }] });
  };

  return (
    <Screen>
      <TopBar title="Xsta" />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 40 }}>
        {saves.length > 0 && (
          <>
            <Text style={{ color: c.text, fontSize: font.h1, fontWeight: '900' }}>이어하기</Text>
            {saves.map((sc) => (
              <Pressable
                key={sc.id}
                accessibilityRole="button"
                onPress={() => open(sc.id)}
                style={({ pressed }) => [styles.save, { borderColor: c.border, backgroundColor: pressed ? c.hover : c.bg }]}
              >
                <Text style={{ fontSize: 26 }}>{sc.world.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ color: c.text, fontSize: font.title, fontWeight: '800' }}>
                    {sc.world.name}
                  </Text>
                  <Text numberOfLines={1} style={{ color: c.subtext, fontSize: font.small, marginTop: 2 }}>
                    @{sc.persona.handle} · {sc.clock.day}일차 · 팔로워 {compact(sc.stats.followers)}
                  </Text>
                </View>
              </Pressable>
            ))}
            <View style={{ height: 1, backgroundColor: c.border, marginVertical: space.sm }} />
          </>
        )}

        <Text style={{ color: c.text, fontSize: font.h1, fontWeight: '900' }}>{saves.length > 0 ? '새 세계관' : '어떤 세계의 타임라인에 들어갈까요?'}</Text>

        {WORLDS.map((w) => {
          const faces = w.cast.filter((p) => p.tier === 'core' && p.photo.kind === 'face').slice(0, 5);
          return (
            <Pressable
              key={w.id}
              accessibilityRole="button"
              onPress={() => {
                resetDraft();
                set({ templateId: w.id, custom: null, customCast: null, firstFollowerKey: null });
                nav.navigate('PersonaCreate');
              }}
              style={({ pressed }) => [styles.card, { borderColor: c.border, backgroundColor: pressed ? c.hover : c.bg }]}
            >
              <Photo photo={w.banners[0] ? { photo: sceneKey(w.id, w.banners[0].key) } : undefined} table="banner" fallback={w.color} style={{ width: '100%', height: 96 }} />
              <View style={{ padding: space.md, gap: 6 }}>
                <Text style={{ color: c.text, fontSize: font.title, fontWeight: '900' }}>
                  {w.emoji} {w.name}
                </Text>
                <Text style={{ color: c.subtext, fontSize: font.body, lineHeight: 20 }}>{w.tagline}</Text>
                <View style={styles.castRow}>
                  {faces.map((p, i) => (
                    <View key={p.key} style={{ marginLeft: i === 0 ? 0 : -8 }}>
                      <Avatar avatar={{ emoji: p.emoji, color: p.color, photo: `${w.id}__${p.key}` }} size={30} ring={2} />
                    </View>
                  ))}
                  <Text style={{ color: c.subtext, fontSize: font.small, marginLeft: 8 }}>
                    계정 {w.cast.length}개 · {w.tag}
                  </Text>
                </View>
              </View>
            </Pressable>
          );
        })}

        <Pressable
          accessibilityRole="button"
          onPress={() => {
            resetDraft();
            nav.navigate('WorldCustom');
          }}
          style={({ pressed }) => [styles.card, styles.custom, { borderColor: c.borderStrong, backgroundColor: pressed ? c.hover : c.bg }]}
        >
          <Text style={{ fontSize: 28 }}>🛠️</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.text, fontSize: font.title, fontWeight: '800' }}>새로 세계관 만들기</Text>
            <Text style={{ color: c.subtext, fontSize: font.small, marginTop: 2 }}>설정을 쓰면 등장인물을 자동으로 만들어줘요</Text>
          </View>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden' },
  save: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg, borderWidth: 1 },
  castRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  custom: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderStyle: 'dashed' },
});
