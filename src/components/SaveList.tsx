/**
 * 세이브(세계관) 목록 — 고르면 그 세이브로 전환 · 삭제(두 번 눌러 확인) · 새 세계관 시작
 *   SaveList     : 목록 본체. 설정 화면과 아래 창이 같이 쓴다.
 *   SaveSwitcher : 홈 왼쪽 위 세계관 이름을 누르면 뜨는 창(목록을 그대로 담는다).
 */
import { useNavigation } from '@react-navigation/native';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RootNav } from '../navigation/types';
import { useDraft } from '../store/draft';
import { useGame } from '../store/game';
import { font, radius, space, useTheme } from '../theme';
import { IconClose, IconPlus } from './icons';
import { Button, Row } from './ui';

/** onDone: 세이브를 바꾸거나 새 세계관으로 넘어가기 직전에 불린다(창 닫기용) */
export function SaveList({ onDone }: { onDone?: () => void }) {
  const { c } = useTheme();
  const nav = useNavigation<RootNav>();
  const scenarios = useGame((s) => s.scenarios);
  const activeId = useGame((s) => s.activeId);
  const setActive = useGame((s) => s.setActive);
  const removeScenario = useGame((s) => s.removeScenario);
  const showToast = useGame((s) => s.showToast);
  const resetDraft = useDraft((s) => s.reset);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const list = Object.values(scenarios).sort((a, b) => b.updatedTs - a.updatedTs);

  const open = (id: string) => {
    onDone?.();
    setActive(id);
    nav.reset({ index: 0, routes: [{ name: 'Main' }] });
  };

  const remove = (id: string) => {
    if (confirmId !== id) {
      setConfirmId(id);
      setTimeout(() => setConfirmId((x) => (x === id ? null : x)), 3000);
      return;
    }
    removeScenario(id);
    setConfirmId(null);
    const left = Object.keys(useGame.getState().scenarios).length;
    if (!left) {
      onDone?.();
      nav.reset({ index: 0, routes: [{ name: 'WorldSelect' }] });
    }
    showToast('세이브를 삭제했어요');
  };

  return (
    <View>
      {list.map((s) => {
        const on = s.id === activeId;
        return (
          <View key={s.id} style={[styles.row, { borderBottomColor: c.border }]}>
            <Pressable style={{ flex: 1, minWidth: 0 }} onPress={() => open(s.id)} accessibilityRole="button" accessibilityLabel={`${s.title} 세이브 열기`} accessibilityState={{ selected: on }}>
              <Text style={{ color: on ? c.primary : c.text, fontWeight: '800', fontSize: font.body }} numberOfLines={1}>
                {s.world.emoji} {s.title}
              </Text>
              <Text style={{ color: c.subtext, fontSize: font.small, marginTop: 2 }} numberOfLines={1}>
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
          onDone?.();
          resetDraft();
          nav.navigate('WorldSelect');
        }}
      />
    </View>
  );
}

export function SaveSwitcher({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  if (!open) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: c.overlay, paddingTop: insets.top + 56 }]}>
        {/* 바깥을 누르면 닫힘 — 창과 형제로 둬서 창 안을 눌러도 닫히지 않게 */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="세계관 창 닫기" />
        <View style={[styles.sheet, { backgroundColor: c.bg, borderColor: c.border }]}>
          <View style={[styles.head, { borderBottomColor: c.border }]}>
            <Text style={{ color: c.text, fontSize: font.title, fontWeight: '800', flex: 1 }} accessibilityRole="header">
              세계관 · 세이브
            </Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="세계관 창 닫기">
              <IconClose size={20} color={c.text} />
            </Pressable>
          </View>
          <ScrollView style={{ maxHeight: 420 }}>
            <SaveList onDone={onClose} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'flex-start', paddingHorizontal: space.lg, paddingBottom: space.lg },
  sheet: { width: '100%', maxWidth: 420, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
});
