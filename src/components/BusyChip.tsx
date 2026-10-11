/**
 * 지금 AI가 뭔가 쓰고 있다는 걸 알리는 떠 있는 칩(화면 위쪽 가운데, 어느 화면에서든 보인다).
 *   - 하루가 넘어가는 중(다음 날 버튼 · 이벤트에 답한 뒤 · 시간 건너뛰기) → "🔥 SNS가 불타오르는 중 …"
 *   - 이벤트 결과를 쓰는 중 / 내 글·답글에 반응이 달리는 중 / 새 글을 불러오는 중 / 인물을 만드는 중
 *   문구는 2초마다 바뀌고, 점 세 개가 움직인다. 하루 정산이 끝나면 "🌅 N일차 아침이에요"를 잠깐 보여 주고 사라진다.
 * 진행 상태는 store 의 busy 표(game/* 가 켜고 끈다)에서 읽는다 — 쪽지 답장(dm:)·댓글 불러오기(thread:)는 그 화면에 자체 표시가 있어 뺀다.
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGame, type GameState } from '../store/game';
import { font, radius, useTheme } from '../theme';
import { TypingDots } from './TypingDots';

type Kind = 'event' | 'tick' | 'post' | 'reply' | 'refresh' | 'make' | 'bio' | 'variant';
const ND = Platform.OS !== 'web';

const LINES: Record<Kind, [string, string][]> = {
  tick: [
    ['🔥', 'SNS가 불타오르는 중'],
    ['🌙', '밤사이 일이 벌어지는 중'],
    ['📰', '새 소식이 올라오는 중'],
    ['✉️', '누군가 쪽지를 쓰는 중'],
    ['👀', '다들 타임라인을 보는 중'],
  ],
  event: [
    ['🎬', '일이 벌어지는 중'],
    ['👀', '다들 지켜보는 중'],
    ['🗣️', '소문이 퍼지는 중'],
  ],
  post: [
    ['💬', '반응이 달리는 중'],
    ['👀', '내 글이 퍼지는 중'],
  ],
  reply: [['💬', '답글이 달리는 중']],
  refresh: [['🔄', '새 글을 불러오는 중']],
  make: [['🧑‍🎨', '인물을 만드는 중']],
  bio: [['📝', '자기소개를 쓰는 중']],
  variant: [['🎲', '다른 이벤트를 찾는 중']],
};
/** 여러 일이 겹치면 앞에 있는 것부터 보여 준다 */
const ORDER: [Kind, (k: string, sid: string) => boolean][] = [
  ['event', (k) => k.startsWith('event:')],
  ['tick', (k, sid) => k === `tick:${sid}`],
  ['post', (k) => k.startsWith('post:')],
  ['reply', (k) => k.startsWith('reply:')],
  ['refresh', (k, sid) => k === `refresh:${sid}`],
  ['variant', (k) => k.startsWith('eventVariant:')],
  ['make', (k) => k === 'character:new'],
  ['bio', (k) => k.startsWith('bio:')],
];

const selKind = (s: GameState): Kind | '' => {
  const sid = s.activeId;
  if (!sid) return '';
  const keys = Object.keys(s.busy);
  if (!keys.length) return '';
  for (const [kind, test] of ORDER) if (keys.some((k) => test(k, sid))) return kind;
  return '';
};
const selDay = (s: GameState) => (s.activeId ? (s.scenarios[s.activeId]?.clock.day ?? 0) : 0);

export function BusyChip() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const kind = useGame(selKind);
  const day = useGame(selDay);
  const [shown, setShown] = useState<{ emoji: string; text: string; done?: boolean } | null>(null);
  const [step, setStep] = useState(0);
  const v = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  const startDay = useRef(0);
  const lastKind = useRef<Kind | ''>('');
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 나타나고 사라지기
  useEffect(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    if (kind) {
      if (!lastKind.current) startDay.current = day;
      lastKind.current = kind;
      setStep(0);
      Animated.timing(v, { toValue: 1, duration: 220, useNativeDriver: ND }).start();
      return;
    }
    if (!lastKind.current) return;
    const was = lastKind.current;
    lastKind.current = '';
    const fade = () => Animated.timing(v, { toValue: 0, duration: 240, useNativeDriver: ND }).start(() => setShown(null));
    // 하루가 넘어갔으면 아침 인사를 잠깐 보여 주고 사라진다
    if ((was === 'tick' || was === 'event') && day > startDay.current && startDay.current > 0) {
      setShown({ emoji: '🌅', text: `${day}일차 아침이에요`, done: true });
      hideTimer.current = setTimeout(fade, 1700);
    } else {
      hideTimer.current = setTimeout(fade, 350);
    }
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
    // day 는 사라질 때 한 번만 본다
  }, [kind]);

  // 문구 돌리기
  useEffect(() => {
    if (!kind) return;
    const list = LINES[kind];
    const [emoji, text] = list[step % list.length];
    setShown({ emoji, text });
    if (list.length < 2) return;
    const t = setTimeout(() => setStep((n) => n + 1), 2100);
    return () => clearTimeout(t);
  }, [kind, step]);

  // 이모지 두근두근
  useEffect(() => {
    if (!shown || shown.done) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.22, duration: 420, useNativeDriver: ND }),
        Animated.timing(pulse, { toValue: 1, duration: 420, useNativeDriver: ND }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [!!shown, shown?.done]);

  if (!shown) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.wrap, { top: insets.top + 60, opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) }] }]}
      accessibilityLiveRegion="polite"
    >
      <View testID="busy-chip" style={[styles.chip, { backgroundColor: c.bg, borderColor: shown.done ? c.primary : c.borderStrong }]}>
        <Animated.Text style={{ fontSize: 15, transform: [{ scale: shown.done ? 1 : pulse }] }}>{shown.emoji}</Animated.Text>
        <Text style={{ color: c.text, fontSize: font.small, fontWeight: '800' }} numberOfLines={1}>
          {shown.text}
        </Text>
        {shown.done ? null : <TypingDots color={c.primary} size={5} />}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center', zIndex: 900 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 14,
    height: 34,
    borderRadius: radius.pill,
    borderWidth: 1,
    maxWidth: 360,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
});
