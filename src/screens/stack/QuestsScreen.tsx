/** 미션 — 오늘의 미션 · 진행 중 · 완료(보상: 경험치·팔로워) */
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Screen, TopBar } from '../../components/Screen';
import { Button, ProgressBar } from '../../components/ui';
import { claimQuest } from '../../game/actions';
import { useActive } from '../../store/game';
import { font, space, useTheme } from '../../theme';
import type { Quest } from '../../types';

export function QuestsScreen() {
  const { c } = useTheme();
  const sc = useActive();
  if (!sc) return null;

  const daily = sc.quests.filter((q) => q.day !== undefined && !q.claimed);
  const doing = sc.quests.filter((q) => q.day === undefined && !q.claimed);
  const finished = sc.quests.filter((q) => q.claimed);

  const reward = (q: Quest) => [q.reward.xp ? `경험치 ${q.reward.xp}` : '', q.reward.followers ? `팔로워 +${q.reward.followers}` : ''].filter(Boolean).join(' · ');

  const item = (q: Quest) => (
    <View key={q.id} style={[styles.item, { borderBottomColor: c.border }]}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: q.goal === 'recover' ? c.danger : c.text, fontWeight: '800', fontSize: font.body }}>{q.title}</Text>
          <Text style={{ color: c.subtext, fontSize: font.body, marginTop: 2, lineHeight: 20 }}>{q.desc}</Text>
        </View>
        {q.done && !q.claimed ? <Button title="보상 받기" size="sm" onPress={() => claimQuest(q.id)} /> : null}
        {q.claimed ? <Text style={{ color: c.repost, fontWeight: '800' }}>완료</Text> : null}
      </View>
      <ProgressBar value={q.progress} max={q.target} color={q.done ? c.repost : c.primary} />
      <View style={styles.row}>
        <Text style={{ color: c.subtext, fontSize: font.small, flex: 1 }}>보상 {reward(q) || '-'}</Text>
        <Text style={{ color: c.subtext, fontSize: font.small }}>
          {Math.min(q.progress, q.target).toLocaleString('ko-KR')} / {q.target.toLocaleString('ko-KR')}
        </Text>
      </View>
    </View>
  );

  const section = (title: string) => <Text style={[styles.section, { color: c.text }]}>{title}</Text>;

  return (
    <Screen>
      <TopBar title="미션" subtitle={`${sc.world.name} · ${sc.clock.day}일차`} />
      <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
        {section('오늘의 미션')}
        {daily.length ? daily.map(item) : <Text style={{ color: c.subtext, paddingHorizontal: space.lg }}>내일 새 미션이 열려요</Text>}
        {section('진행 중')}
        {doing.length ? doing.map(item) : <Text style={{ color: c.subtext, paddingHorizontal: space.lg }}>모든 미션을 끝냈어요</Text>}
        {finished.length > 0 && (
          <>
            {section('보상 받은 미션')}
            {finished.map(item)}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  item: { paddingHorizontal: space.lg, paddingVertical: space.md, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  section: { fontSize: font.h2, fontWeight: '800', paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: 4 },
});
