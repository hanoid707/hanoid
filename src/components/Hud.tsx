/** 게임 상태 표시: 게임 시계(누르면 아이템) · 평판 배너 · 대기 중 이벤트 카드(X 타임라인 안에 자연스럽게) */
import { useNavigation } from '@react-navigation/native';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { formatClock, timeEmoji } from '../game/clock';
import type { RootNav } from '../navigation/types';
import { useGame } from '../store/game';
import { font, radius, space, useTheme } from '../theme';
import type { GameEvent, Scenario } from '../types';
import { Button, Skeleton } from './ui';

/**
 * 상단 날짜·시각 칩 — 누르면 아이템 화면(바이럴 모먼트·되돌리기·시간 건너뛰기)
 * 바이럴 모먼트가 켜져 있으면 🚀, 하루 정산 중이면 ⏳ 로 바로 보인다.
 */
export function ClockChip({ sc, onPress }: { sc: Scenario; onPress?: () => void }) {
  const { c } = useTheme();
  const nav = useNavigation<RootNav>();
  const ticking = useGame((s) => !!s.busy[`tick:${sc.id}`]);
  const armed = sc.boost?.kind === 'viral';
  return (
    <Pressable
      onPress={onPress ?? (() => nav.navigate('Items'))}
      accessibilityRole="button"
      accessibilityLabel="아이템 열기"
      accessibilityHint="바이럴 모먼트·되돌리기·시간 건너뛰기"
      hitSlop={6}
      style={({ pressed }) => [
        styles.clock,
        { borderColor: armed ? c.primary : c.border, backgroundColor: pressed ? c.hover : armed ? c.primarySoft : 'transparent' },
      ]}
    >
      <Text style={{ color: c.subtext, fontSize: font.small, fontWeight: '600' }} numberOfLines={1}>
        {timeEmoji(sc.clock)} {formatClock(sc.clock)}
      </Text>
      <View style={[styles.clockHint, { borderLeftColor: armed ? c.primary : c.border }]}>
        {ticking ? <Hourglass /> : <Text style={{ fontSize: 13 }}>{armed ? '🚀' : '🎒'}</Text>}
      </View>
    </Pressable>
  );
}

/** 하루 정산 중: 모래시계가 뒤집히며 돈다 */
function Hourglass() {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.cubic), useNativeDriver: Platform.OS !== 'web' }),
        Animated.delay(500),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return <Animated.Text style={{ fontSize: 13, transform: [{ rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }] }}>⏳</Animated.Text>;
}

/** 타임라인 맨 위 뼈대: 하루가 넘어가거나 새 글을 불러오는 동안 "곧 글이 올라온다"는 자리 표시 */
export function FeedSkeleton({ sid }: { sid: string }) {
  const { c } = useTheme();
  const on = useGame((s) => !!s.busy[`tick:${sid}`] || !!s.busy[`refresh:${sid}`]);
  if (!on) return null;
  return (
    <View testID="feed-skeleton">
      {[0, 1].map((i) => (
        <View key={i} style={[styles.skelRow, { borderBottomColor: c.border }]}>
          <Skeleton width={40} height={40} round={20} />
          <View style={{ flex: 1, gap: 8, paddingTop: 2 }}>
            <Skeleton width={i ? '30%' : '42%'} height={11} />
            <Skeleton width={i ? '86%' : '94%'} height={11} />
            <Skeleton width={i ? '52%' : '68%'} height={11} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function StatusBanner({ sc }: { sc: Scenario }) {
  const { c } = useTheme();
  const nav = useNavigation<RootNav>();
  const s = sc.stats.status;
  if (s === 'normal') return null;
  const cfg = {
    rising: { fg: c.primary, text: '📈 평판 상승세 — 글이 더 멀리 퍼지고 있어요' },
    viral: { fg: c.repost, text: '🔥 지금 확산 중 — 오늘 하루 노출이 늘어나요' },
    controversy: { fg: c.warning, text: '⚠️ 논란 발생 — 평판이 더 떨어지면 캔슬당해요' },
    cancelled: { fg: c.danger, text: '🚫 캔슬됨 — 미션의 "재기하기"를 완료하세요' },
  }[s];
  return (
    <Pressable onPress={() => nav.navigate('Quests')} style={({ pressed }) => [styles.banner, { borderBottomColor: c.border, backgroundColor: pressed ? c.hover : c.bg }]}>
      <Text style={{ color: cfg.fg, fontWeight: '700', fontSize: font.small }}>{cfg.text}</Text>
    </Pressable>
  );
}

export function EventCard({ ev }: { ev: GameEvent }) {
  const { c } = useTheme();
  const nav = useNavigation<RootNav>();
  return (
    <Pressable onPress={() => nav.navigate('Event', { eventId: ev.id })} style={({ pressed }) => [styles.event, { borderBottomColor: c.border, backgroundColor: pressed ? c.hover : c.bg }]}>
      <View style={[styles.eventBox, { borderColor: c.borderStrong }]}>
        <View style={styles.eventHead}>
          <Text style={{ fontSize: 26 }}>{ev.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.primary, fontSize: font.small, fontWeight: '800' }}>지금 일어나는 일</Text>
            <Text style={{ color: c.text, fontSize: font.title, fontWeight: '800' }}>{ev.title}</Text>
          </View>
        </View>
        <Text numberOfLines={3} style={{ color: c.text, fontSize: font.body, lineHeight: 21 }}>
          {ev.body}
        </Text>
        <Button title="답하기" size="sm" variant="ink" onPress={() => nav.navigate('Event', { eventId: ev.id })} style={{ alignSelf: 'flex-start' }} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  clock: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: radius.pill, paddingLeft: 10, paddingRight: 6, height: 30, flexShrink: 1 },
  clockHint: { borderLeftWidth: StyleSheet.hairlineWidth, paddingLeft: 6, height: 18, justifyContent: 'center' },
  skelRow: { flexDirection: 'row', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
  banner: { paddingHorizontal: space.lg, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  event: { paddingHorizontal: space.lg, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
  eventBox: { borderWidth: 1, borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  eventHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
