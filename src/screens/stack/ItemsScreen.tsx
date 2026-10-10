/**
 * 아이템(재화 없이 무제한) — 홈 위쪽 날짜를 누르면 열린다
 *   🎁 선물: 받을 사람(관계별 묶음·검색) → 선물 고르기 → 쪽지로 보내고 그 대화방으로
 *   🚀 바이럴 모먼트: 켜 두면 다음 행동 1번의 결과가 크게 강화
 *   ↩️ 되돌리기: 마지막 행동과 그 결과 취소
 *   ⏩ 시간 건너뛰기: +1시간 · +3시간 · 다음 날(날이 바뀌면 하루 정산)
 *   + 최근 사용 기록
 */
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Avatar } from '../../components/Avatar';
import { VerifiedBadge } from '../../components/Badge';
import { IconClose, IconSearch } from '../../components/icons';
import { CategoryChip, RelationChip } from '../../components/RelationChip';
import { Screen, TopBar } from '../../components/Screen';
import { Button } from '../../components/ui';
import { formatClock } from '../../game/clock';
import { armViralMoment, sendGift, skipTime, undoInfo, undoLast, type ActionResult } from '../../game/actions';
import { giftEffect, GIFTS, ITEM_INFO, type GiftDef } from '../../game/items';
import { MENTION_LABEL, mentionCategory, type MentionCategory } from '../../game/relationship';
import type { RootNav, RootStackParamList } from '../../navigation/types';
import { getActive, useActive, useGame } from '../../store/game';
import { useUI } from '../../store/ui';
import { font, noOutline, radius, space, useTheme } from '../../theme';
import type { Character, ID } from '../../types';
import { fill } from '../../utils';

/** 받을 사람 묶음 순서(검색 탭 '사람'과 같음) */
const GROUP_ORDER: MentionCategory[] = ['friend', 'industry', 'celeb', 'business', 'fan', 'anti', 'public'];

const GIFT_FAIL: Record<Exclude<ActionResult, { ok: true }>['reason'], string> = {
  left: '지금은 대화방을 나간 상태예요. 나중에 다시 보내 보세요',
  busy: '답장을 기다리는 중이에요. 잠시 후에 다시 보내 주세요',
  none: '지금은 선물을 보낼 수 없어요',
  empty: '선물을 골라 주세요',
  limit: '지금은 선물을 보낼 수 없어요',
};

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

/** 받을 사람 한 줄 */
function PersonRow({ ch, left, onPress }: { ch: Character; left: boolean; onPress: () => void }) {
  const { c } = useTheme();
  const badge = ch.badge === undefined ? (ch.isNews ? 'gold' : ch.verified ? 'blue' : null) : ch.badge;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${ch.name}에게 선물하기`}
      style={({ pressed }) => [styles.person, { borderTopColor: c.border }, pressed && { backgroundColor: c.hover }]}
    >
      <Avatar avatar={ch.avatar} size={36} square={badge === 'gold'} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ color: c.text, fontWeight: '800', fontSize: font.body, flexShrink: 1 }} numberOfLines={1}>
            {ch.name}
          </Text>
          <VerifiedBadge kind={badge} size={15} />
        </View>
        <Text style={{ color: c.subtext, fontSize: font.small }} numberOfLines={1}>
          @{ch.handle} · 호감 {ch.affinity}
          {left ? ' · 대화방 나감' : ''}
        </Text>
      </View>
      <RelationChip ch={ch} size="sm" />
    </Pressable>
  );
}

export function ItemsScreen() {
  const { c } = useTheme();
  const nav = useNavigation<RootNav>();
  const route = useRoute<RouteProp<RootStackParamList, 'Items'>>();
  const sc = useActive();
  const showToast = useGame((s) => s.showToast);
  const ticking = useGame((s) => (sc ? !!s.busy[`tick:${sc.id}`] : false));
  const lastGiftId = useUI((s) => s.lastGiftId);
  const setLastGift = useUI((s) => s.setLastGift);

  const giftTo = route.params?.giftTo;
  const [targetId, setTargetId] = useState<ID | null>(() => {
    const ch = giftTo && sc ? sc.characters[giftTo] : undefined;
    return ch && !ch.inactive ? ch.id : null;
  });
  const [picking, setPicking] = useState(!targetId);
  const [q, setQ] = useState('');
  const [giftId, setGiftId] = useState<string | null>(() => (lastGiftId && GIFTS.some((g) => g.id === lastGiftId) ? lastGiftId : null));
  const [skipping, setSkipping] = useState<string | null>(null);

  const people = useMemo(() => (sc ? sc.cast.map((id) => sc.characters[id]).filter((ch): ch is Character => !!ch && !ch.inactive) : []), [sc]);
  const groups = useMemo(() => {
    const k = q.trim().toLowerCase().replace(/^@/, '');
    const map = new Map<MentionCategory, Character[]>();
    for (const ch of people) {
      if (k && !ch.name.toLowerCase().includes(k) && !ch.handle.toLowerCase().includes(k)) continue;
      const cat = mentionCategory(ch);
      const list = map.get(cat);
      if (list) list.push(ch);
      else map.set(cat, [ch]);
    }
    return GROUP_ORDER.filter((cat) => map.get(cat)?.length).map((cat) => ({
      cat,
      list: [...(map.get(cat) ?? [])].sort((a, b) => (cat === 'anti' ? a.affinity - b.affinity : b.affinity - a.affinity)),
    }));
  }, [people, q]);

  if (!sc) return null;

  const target = targetId ? sc.characters[targetId] : undefined;
  const gift = GIFTS.find((g) => g.id === giftId);
  const leftOf = (id: ID) => {
    const cv = sc.dms[id];
    return !!cv && cv.leftUntilDay !== null && cv.leftUntilDay > sc.clock.day;
  };
  const armed = sc.boost?.kind === 'viral';
  // 선물 효과 미리보기(게임 규칙과 같은 계산, 토큰 0) — 같은 날 같은 사람에게 또 보내면 줄어든다
  const sameDay = targetId ? (sc.itemLog ?? []).filter((l) => l.item === 'gift' && l.target === targetId && l.at.day === sc.clock.day).length : 0;
  const effectOf = (g: GiftDef) => (target ? giftEffect(target, g, sc.difficulty ?? 'normal', armed, sameDay) : { affinity: g.affinity, romance: g.romance });
  const undo = undoInfo();
  const log = [...(sc.itemLog ?? [])].sort((a, b) => b.ts - a.ts).slice(0, 12);

  // 받는 사람에 따라 선물 효과 힌트(실제 계산은 게임 규칙)
  const hint = !target
    ? null
    : target.relation === 'enemy' || target.relation === 'rival' || target.crowdRole === 'antifan' || target.affinity <= -30
      ? '사이가 나쁠수록 🍪 화해의 쿠키가 잘 통해요'
      : target.relation === 'family'
        ? '가족에게는 설렘이 오르지 않아요'
        : target.relation === 'spicy' || target.relation === 'lover'
          ? '💐 꽃다발·✉️ 손편지는 설렘이 크게 올라요'
          : null;

  /** 선물을 보낸 뒤 그 대화방으로(쪽지에서 왔으면 돌아가기) */
  const openChat = (id: ID) => {
    const st = nav.getState();
    const prev = st ? st.routes[st.index - 1] : undefined;
    if (prev?.name === 'Chat' && (prev.params as { characterId?: string } | undefined)?.characterId === id) nav.goBack();
    else nav.replace('Chat', { characterId: id });
  };

  const send = () => {
    if (!target || !gift) return;
    const r = sendGift(target.id, gift.id);
    if (!r.ok) {
      showToast(GIFT_FAIL[r.reason], 'error');
      return;
    }
    setLastGift(gift.id);
    showToast(fill('{g}을 보냈어요', { g: `${gift.emoji} ${gift.name}` }));
    openChat(target.id);
  };

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
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 56 }} keyboardShouldPersistTaps="handled">
        {/* 🎁 선물 */}
        <ItemCard emoji={ITEM_INFO.gift.emoji} title={ITEM_INFO.gift.name} desc={`${ITEM_INFO.gift.desc} · 쪽지로 보내면 답장이 와요`}>
          <Text style={[styles.step, { color: c.subtext }]}>1. 받는 사람</Text>
          {target && !picking ? (
            <View style={[styles.target, { borderColor: c.border }]}>
              <Avatar avatar={target.avatar} size={40} />
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={{ color: c.text, fontWeight: '800', fontSize: font.body }} numberOfLines={1}>
                  {target.name}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <RelationChip ch={target} size="sm" showRegister />
                  <Text style={{ color: c.subtext, fontSize: font.small }}>
                    호감 {target.affinity} · 설렘 {target.romance ?? 0}
                  </Text>
                </View>
                {leftOf(target.id) ? <Text style={{ color: c.warning, fontSize: font.small }}>대화방을 나간 상태예요</Text> : null}
              </View>
              <Button title="바꾸기" size="sm" variant="outline" onPress={() => setPicking(true)} />
            </View>
          ) : (
            <View style={{ gap: 6 }}>
              <View style={[styles.search, { backgroundColor: c.surfaceAlt }]}>
                <IconSearch size={16} color={c.subtext} />
                <TextInput
                  value={q}
                  onChangeText={setQ}
                  placeholder="이름·아이디 검색"
                  placeholderTextColor={c.subtext}
                  accessibilityLabel="받는 사람 검색"
                  autoCapitalize="none"
                  style={[{ flex: 1, color: c.text, fontSize: font.body, paddingVertical: 8 }, noOutline]}
                />
                {q ? (
                  <Pressable onPress={() => setQ('')} hitSlop={8} accessibilityLabel="검색어 지우기">
                    <IconClose size={16} color={c.subtext} />
                  </Pressable>
                ) : null}
              </View>
              {groups.length === 0 ? (
                <Text style={{ color: c.subtext, fontSize: font.small, paddingVertical: 8 }}>{q ? `"${q}"에 맞는 사람이 없어요` : '선물할 사람이 아직 없어요'}</Text>
              ) : (
                groups.map((g) => (
                  <View key={g.cat}>
                    <View style={styles.groupHead}>
                      <CategoryChip cat={g.cat} label={MENTION_LABEL[g.cat]} size="xs" />
                      <Text style={{ color: c.subtext, fontSize: font.small }}>{g.list.length}</Text>
                    </View>
                    {g.list.map((ch) => (
                      <PersonRow
                        key={ch.id}
                        ch={ch}
                        left={leftOf(ch.id)}
                        onPress={() => {
                          setTargetId(ch.id);
                          setPicking(false);
                          setQ('');
                        }}
                      />
                    ))}
                  </View>
                ))
              )}
              {target ? <Button title="취소" size="sm" variant="ghost" onPress={() => setPicking(false)} style={{ alignSelf: 'flex-start' }} /> : null}
            </View>
          )}

          <Text style={[styles.step, { color: c.subtext }]}>2. 선물</Text>
          <View style={styles.giftGrid}>
            {GIFTS.map((g) => {
              const on = g.id === giftId;
              const eff = effectOf(g);
              return (
                <Pressable
                  key={g.id}
                  onPress={() => setGiftId(g.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`${g.name} 고르기`}
                  style={({ pressed }) => [
                    styles.gift,
                    { borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primarySoft : pressed ? c.hover : c.bg },
                  ]}
                >
                  <Text style={{ fontSize: 24 }}>{g.emoji}</Text>
                  <Text style={{ color: c.text, fontWeight: '800', fontSize: font.small }} numberOfLines={1}>
                    {g.name}
                  </Text>
                  <Text style={{ color: c.subtext, fontSize: font.tiny }} numberOfLines={1}>
                    {g.desc}
                  </Text>
                  <Text style={{ color: c.like, fontSize: font.tiny, fontWeight: '700' }}>
                    호감 +{eff.affinity}
                    {eff.romance ? ` · 설렘 +${eff.romance}` : ''}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={{ color: c.subtext, fontSize: font.small, lineHeight: 18 }}>
            {target ? `${target.name} 기준 예상치 · 답장에 따라 더 오르거나 내릴 수 있어요` : '숫자는 기본값 · 받는 사람을 고르면 관계·난이도에 맞춰 바뀌어요'}
          </Text>
          {sameDay ? <Text style={{ color: c.warning, fontSize: font.small }}>오늘 이미 {sameDay}번 보냈어요 — 같은 날 또 보내면 효과가 줄어요</Text> : null}
          {hint ? <Text style={{ color: c.subtext, fontSize: font.small }}>💡 {hint}</Text> : null}
          {armed ? <Text style={{ color: c.primary, fontSize: font.small, fontWeight: '700' }}>🚀 바이럴 모먼트가 켜져 있어서 이번 선물 효과가 커져요</Text> : null}
          {target && gift ? (
            <Text style={{ color: c.text, fontSize: font.small, fontWeight: '700' }} numberOfLines={1}>
              → {target.name}에게 {gift.emoji} {gift.name}
            </Text>
          ) : (
            <Text style={{ color: c.subtext, fontSize: font.small }}>{!target ? '받는 사람을 골라 주세요' : '선물을 골라 주세요'}</Text>
          )}
          <Button title="선물 보내기" disabled={!target || !gift} onPress={send} full />
        </ItemCard>

        {/* 🚀 바이럴 모먼트 */}
        <ItemCard emoji={ITEM_INFO.viral.emoji} title={ITEM_INFO.viral.name} desc={ITEM_INFO.viral.desc} active={armed}>
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: armed ? c.primary : c.text, fontWeight: '800', fontSize: font.body }}>{armed ? '대기 중 — 다음 행동 1번에 적용돼요' : '꺼짐'}</Text>
              {armed && sc.boost ? <Text style={{ color: c.subtext, fontSize: font.small }}>{ago(sc.boost.armedTs)} 켰어요</Text> : null}
            </View>
            <Switch value={armed} onValueChange={(on) => armViralMoment(on)} accessibilityLabel="바이럴 모먼트" trackColor={{ true: c.primary, false: c.border }} />
          </View>
          <Text style={{ color: c.subtext, fontSize: font.small, lineHeight: 19 }}>글: 반응 3~6배 · 팔로워 증가 3배 · 무조건 확산{'\n'}이벤트·선물: 좋은 결과 2배</Text>
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
  step: { fontSize: font.small, fontWeight: '800' },
  target: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderWidth: 1, borderRadius: radius.md, padding: space.md },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.pill, paddingHorizontal: 14, height: 38 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 10, paddingBottom: 4 },
  person: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth },
  giftGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gift: { width: '48%', flexGrow: 1, borderWidth: 1, borderRadius: radius.md, padding: 10, gap: 2 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  logRow: { flexDirection: 'row', gap: space.md, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
});
