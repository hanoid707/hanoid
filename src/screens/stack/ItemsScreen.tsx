/**
 * 아이템(재화 없이 무제한) — 홈 위쪽 날짜를 누르면 열린다
 *   🚀 바이럴 모먼트: 켜 두면 다음 행동 1번의 결과가 크게 강화
 *   ↩️ 되돌리기: 마지막 행동과 그 결과 취소
 *   ⏩ 시간 건너뛰기: +1시간 · +3시간 · 다음 날(날이 바뀌면 하루 정산)
 *   + 최근 사용 기록
 * 선물은 여기 없다 — 쪽지 대화·캐릭터 프로필의 🎁 에서 보낸다(components/GiftSheet).
 */
import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Screen, TopBar } from '../../components/Screen';
import { Button } from '../../components/ui';
import { formatClock } from '../../game/clock';
import { armViralMoment, skipTime, undoInfo, undoLast } from '../../game/actions';
import { ITEM_INFO } from '../../game/items';
import { getActive, useActive, useGame } from '../../store/game';
import { font, radius, space, useTheme } from '../../theme';

/** 실제 시각 기준 "방금 / 3분 전" */
function ago(ts: number): string {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return '방금';
  if (m < 60) return `${m}분 전`;
  return `${Math.floor(m / 60)}시간 전`;
}

/** 아이템 카드 틀: 이모지 · 이름 · 무제한 · 설명 */
function ItemCard({ emoji, title, desc, children, active }: { emoji: string; title: string; desc: string; children: ReactNode; active?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={[styles.card, { borderColor: active ? c.primary : c.border, backgroundColor: active ? c.primarySoft : c.bg }]}>
      <View style={styles.cardHead}>
        <Text style={{ fontSize: 26 }}>{emoji}</Text>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ color: c.text, fontSize: font.title, fontWeight: '800' }} accessibilityRole="header">
              {title}
            </Text>
            <View style={[styles.pill, { borderColor: c.borderStrong }]}>
              <Text style={{ color: c.subtext, fontSize: font.tiny, fontWeight: '800' }}>무제한</Text>
            </View>
          </View>
          <Text style={{ color: c.subtext, fontSize: font.small, lineHeight: 18 }}>{desc}</Text>
        </View>
      </View>
      {children}
    </View>
  );
}

export function ItemsScreen() {
  const { c } = useTheme();
  const sc = useActive();
  const showToast = useGame((s) => s.showToast);
  const ticking = useGame((s) => (sc ? !!s.busy[`tick:${sc.id}`] : false));
  const [skipping, setSkipping] = useState<string | null>(null);

  if (!sc) return null;

  const armed = sc.boost?.kind === 'viral';
  const undo = undoInfo();
  const log = [...(sc.itemLog ?? [])].sort((a, b) => b.ts - a.ts).slice(0, 12);

  const doUndo = () => {
    if (!undoLast()) showToast('되돌릴 행동이 없어요');
  };

  const skip = async (minutes: number, label: string) => {
    if (skipping) return;
    setSkipping(label);
    try {
      await skipTime(minutes);
      const now = getActive();
      showToast(`⏩ ${label} 건너뛰었어요${now ? ` — ${formatClock(now.clock)}` : ''}`);
    } finally {
      setSkipping(null);
    }
  };
  const minutesToNextDay = (24 * 60 - (sc.clock.hour * 60 + sc.clock.minute)) + 9 * 60; // 다음 날 오전 9시

  return (
    <Screen>
      <TopBar title="아이템" subtitle="무제한 · 재화 없이 언제든" close />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 56 }}>
        {/* 🚀 바이럴 모먼트 */}
        <ItemCard emoji={ITEM_INFO.viral.emoji} title={ITEM_INFO.viral.name} desc={ITEM_INFO.viral.desc} active={armed}>
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: armed ? c.primary : c.text, fontWeight: '800', fontSize: font.body }}>{armed ? '대기 중 — 다음 행동 1번에 적용돼요' : '꺼짐'}</Text>
              {armed && sc.boost ? <Text style={{ color: c.subtext, fontSize: font.small }}>{ago(sc.boost.armedTs)} 켰어요</Text> : null}
            </View>
            <Switch value={armed} onValueChange={(on) => armViralMoment(on)} accessibilityLabel="바이럴 모먼트" trackColor={{ true: c.primary, false: c.border }} />
          </View>
          <Text style={{ color: c.subtext, fontSize: font.small, lineHeight: 19 }}>글: 반응 3~6배 · 팔로워 증가 3배 · 무조건 확산{'\n'}이벤트: 좋은 결과 2배</Text>
        </ItemCard>

        {/* ↩️ 되돌리기 */}
        <ItemCard emoji={ITEM_INFO.undo.emoji} title={ITEM_INFO.undo.name} desc={ITEM_INFO.undo.desc}>
          <Text style={{ color: undo ? c.text : c.subtext, fontSize: font.body }}>
            {undo ? (
              <>
                마지막 행동: <Text style={{ fontWeight: '800' }}>{undo.label}</Text> · {ago(undo.ts)}
              </>
            ) : (
              '되돌릴 행동이 없어요'
            )}
          </Text>
          <Button title="되돌리기" variant="ink" disabled={!undo} onPress={doUndo} style={{ alignSelf: 'flex-start' }} />
          <Text style={{ color: c.subtext, fontSize: font.small, lineHeight: 19 }}>최근 5개까지 · 앱을 다시 켜면 비어요 · 늦게 도착하는 반응도 같이 취소돼요</Text>
        </ItemCard>

        {/* ⏩ 시간 건너뛰기 */}
        <ItemCard emoji={ITEM_INFO.skip.emoji} title={ITEM_INFO.skip.name} desc={`지금 ${formatClock(sc.clock)}`}>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Button title="+1시간" size="sm" variant="outline" disabled={!!skipping} onPress={() => void skip(60, '1시간')} />
            <Button title="+3시간" size="sm" variant="outline" disabled={!!skipping} onPress={() => void skip(180, '3시간')} />
            <Button title="다음 날" size="sm" variant="ink" disabled={!!skipping} loading={skipping === '다음 날'} onPress={() => void skip(minutesToNextDay, '다음 날')} />
          </View>
          <Text style={{ color: c.subtext, fontSize: font.small, lineHeight: 19 }}>
            {ticking ? '⏳ 하루 정산 중… ' : ''}날이 바뀌면 화면은 바로 다음 날로 넘어가고, 하루 정산(새 글·뉴스·이벤트·미션)은 뒤에서 AI가 써요
          </Text>
        </ItemCard>

        {/* 최근 사용 */}
        <View style={{ gap: 6 }}>
          <Text style={{ color: c.text, fontSize: font.h2, fontWeight: '800' }} accessibilityRole="header">
            최근 사용
          </Text>
          {log.length ? (
            log.map((l) => (
              <View key={l.id} style={[styles.logRow, { borderBottomColor: c.border }]}>
                <Text style={{ fontSize: 18, width: 26, textAlign: 'center' }}>{ITEM_INFO[l.item]?.emoji ?? '✨'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontSize: font.body }}>{l.text}</Text>
                  <Text style={{ color: c.faint, fontSize: font.tiny, marginTop: 2 }}>{formatClock(l.at)}</Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={{ color: c.subtext, fontSize: font.small }}>아직 쓴 아이템이 없어요</Text>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.lg, padding: space.lg, gap: space.md },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  pill: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 1 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  logRow: { flexDirection: 'row', gap: space.md, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
});
