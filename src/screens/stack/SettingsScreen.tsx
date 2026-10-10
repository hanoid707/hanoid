/** 설정 — 세이브(세계관) 관리, AI 연결, DB 동기화, 화면, 공부용 도구 ((v3) 하루 건너뛰기는 아이템 화면으로 옮김) */
import { useNavigation } from '@react-navigation/native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { engineLabel } from '../../ai';
import { IconBackpack, IconBot, IconChevronRight, IconCloud, IconPlus, IconSliders } from '../../components/icons';
import { Screen, TopBar } from '../../components/Screen';
import { Button, Divider, Row, Segmented } from '../../components/ui';
import { recomputeStatus } from '../../game/progress';
import type { RootNav } from '../../navigation/types';
import { useDraft } from '../../store/draft';
import { useActive, useGame } from '../../store/game';
import { useSync } from '../../sync';
import { font, space, useTheme } from '../../theme';
import type { Settings } from '../../types';

export function SettingsScreen() {
  const { c } = useTheme();
  const nav = useNavigation<RootNav>();
  const sc = useActive();
  const { scenarios, activeId, settings, setActive, removeScenario, setSettings, edit, showToast } = useGame();
  const sync = useSync();
  const resetDraft = useDraft((s) => s.reset);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const list = Object.values(scenarios).sort((a, b) => b.updatedTs - a.updatedTs);

  const remove = (id: string) => {
    if (confirmId !== id) {
      setConfirmId(id);
      setTimeout(() => setConfirmId((x) => (x === id ? null : x)), 3000);
      return;
    }
    removeScenario(id);
    setConfirmId(null);
    const left = Object.keys(useGame.getState().scenarios).length;
    if (!left) nav.reset({ index: 0, routes: [{ name: 'WorldSelect' }] });
    showToast('세이브를 삭제했어요');
  };

  const tool = (label: string, fn: () => void) => <Button key={label} title={label} size="sm" variant="outline" onPress={fn} />;
  const head = (t: string) => <Text style={[styles.head, { color: c.text }]}>{t}</Text>;
  const syncText = sync.status === 'off' ? '꺼짐' : sync.status === 'idle' ? `켜짐 · ${sync.via === 'mcp' ? 'Supabase 커넥터' : 'Supabase'}` : sync.status === 'syncing' ? '동기화 중…' : sync.status === 'blocked' ? '승인 필요' : '오류';

  return (
    <Screen>
      <TopBar title="설정" subtitle={sc ? `@${sc.persona.handle}` : undefined} />
      <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
        {head('세계관 · 세이브')}
        {list.map((s) => {
          const on = s.id === activeId;
          return (
            <View key={s.id} style={[styles.row, { borderBottomColor: c.border }]}>
              <Pressable
                style={{ flex: 1 }}
                onPress={() => {
                  setActive(s.id);
                  nav.reset({ index: 0, routes: [{ name: 'Main' }] });
                }}
              >
                <Text style={{ color: on ? c.primary : c.text, fontWeight: '800', fontSize: font.body }}>
                  {s.world.emoji} {s.title}
                </Text>
                <Text style={{ color: c.subtext, fontSize: font.small, marginTop: 2 }}>
                  {s.clock.day}일차 · 팔로워 {s.stats.followers.toLocaleString('ko-KR')} · Lv.{s.stats.level}
                  {on ? ' · 플레이 중' : ''}
                </Text>
              </Pressable>
              <Button title={confirmId === s.id ? '정말 삭제?' : '삭제'} size="sm" variant="danger" onPress={() => remove(s.id)} />
            </View>
          );
        })}
        <Row
          icon={<IconPlus size={20} color={c.primary} />}
          title="새 세계관 시작"
          onPress={() => {
            resetDraft();
            nav.navigate('WorldSelect');
          }}
        />
        <Divider thick />

        {head('연결')}
        <Row icon={<IconBot size={22} color={c.text} />} title="AI 연결" desc={engineLabel(settings.ai)} right={<IconChevronRight size={18} color={c.subtext} />} onPress={() => nav.navigate('AISettings')} />
        <Row icon={<IconCloud size={22} color={c.text} />} title="DB 저장·동기화" desc={syncText} right={<IconChevronRight size={18} color={c.subtext} />} onPress={() => nav.navigate('SyncSettings')} />
        <Divider thick />

        {head('화면')}
        <View style={{ paddingHorizontal: space.lg, paddingVertical: space.sm }}>
          <Segmented<Settings['theme']>
            options={[
              { key: 'system', label: '시스템' },
              { key: 'light', label: '라이트' },
              { key: 'dark', label: '다크' },
            ]}
            value={settings.theme}
            onChange={(theme) => setSettings({ theme })}
          />
        </View>
        <Row title="진동 피드백" right={<Switch value={settings.haptics} onValueChange={(haptics) => setSettings({ haptics })} trackColor={{ true: c.primary, false: c.border }} />} />
        <Divider thick />

        {sc && (
          <>
            {head('공부용 도구 (게임 규칙 실험)')}
            <Row
              icon={<IconBackpack size={22} color={c.text} />}
              title="시간 건너뛰기 · 아이템"
              desc="+1시간 · +3시간 · 다음 날 / 선물 · 바이럴 모먼트 · 되돌리기"
              right={<IconChevronRight size={18} color={c.subtext} />}
              onPress={() => nav.navigate('Items')}
            />
            <Row
              icon={<IconSliders size={22} color={c.text} />}
              title="세계관 전체 수정"
              desc="세계관 설정·내 계정·인물 이름·나이·성별·특징·호감도 한 화면에서"
              right={<IconChevronRight size={18} color={c.subtext} />}
              onPress={() => nav.navigate('WorldEdit')}
            />
            <Row
              icon={<IconSliders size={22} color={c.text} />}
              title="스탯 조정"
              desc="팔로워·아우라·유머·평판·레벨 직접 바꾸기"
              right={<IconChevronRight size={18} color={c.subtext} />}
              onPress={() => nav.navigate('StatsEditor')}
            />
            <View style={styles.tools}>
              {tool('평판 -30', () =>
                edit(sc.id, (d) => {
                  d.stats.reputation = Math.max(-100, d.stats.reputation - 30);
                  recomputeStatus(d);
                }),
              )}
              {tool('평판 +30', () =>
                edit(sc.id, (d) => {
                  d.stats.reputation = Math.min(100, d.stats.reputation + 30);
                  recomputeStatus(d);
                }),
              )}
            </View>
            <Text style={{ color: c.subtext, fontSize: font.small, paddingHorizontal: space.lg }}>평판이 -40 이하면 논란, -70 이하면 캔슬돼요. 행동 횟수 제한(에너지)은 없어요.</Text>
          </>
        )}

        <Text style={{ color: c.subtext, fontSize: font.small, textAlign: 'center', lineHeight: 18, marginTop: 32 }}>
          Xsta 3.1 · 앱공부 동아리용 클론{'\n'}React Native + Expo · 기기 저장 + Supabase 동기화
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { fontSize: font.h2, fontWeight: '800', paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, paddingHorizontal: space.lg, paddingBottom: space.sm },
});
