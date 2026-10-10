/** 활동 기록 — 원본의 "activity book": 내가 한 모든 행동을 일차별로 */
import { SectionList, StyleSheet, Text, View } from 'react-native';
import { Screen, TopBar } from '../../components/Screen';
import { EmptyState } from '../../components/ui';
import { formatClock } from '../../game/clock';
import { useActive } from '../../store/game';
import { font, space, useTheme } from '../../theme';
import type { Activity } from '../../types';

export function ActivityScreen() {
  const { c } = useTheme();
  const sc = useActive();
  if (!sc) return null;
  const byDay = new Map<number, Activity[]>();
  for (const a of sc.activity) {
    const list = byDay.get(a.at.day) ?? [];
    list.push(a);
    byDay.set(a.at.day, list);
  }
  const sections = [...byDay.entries()].sort((a, b) => b[0] - a[0]).map(([day, data]) => ({ title: `${day}일차`, data }));

  return (
    <Screen>
      <TopBar title="활동 기록" subtitle={`${sc.activity.length}개의 기록`} />
      <SectionList
        sections={sections}
        keyExtractor={(a) => a.id}
        contentContainerStyle={{ paddingBottom: 48 }}
        ListEmptyComponent={<EmptyState emoji="📖" title="아직 기록이 없어요" />}
        renderSectionHeader={({ section }) => (
          <Text style={[styles.header, { color: c.subtext, backgroundColor: c.bg }]}>{section.title}</Text>
        )}
        renderItem={({ item }) => (
          <View style={[styles.row, { borderBottomColor: c.border }]}>
            <Text style={{ fontSize: 18, width: 28, textAlign: 'center' }}>{item.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.text, fontSize: font.body }}>{item.text}</Text>
              <Text style={{ color: c.faint, fontSize: font.tiny, marginTop: 2 }}>{formatClock(item.at)}</Text>
            </View>
          </View>
        )}
        stickySectionHeadersEnabled
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { fontSize: font.small, fontWeight: '800', paddingHorizontal: space.lg, paddingVertical: space.sm },
  row: { flexDirection: 'row', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
});
