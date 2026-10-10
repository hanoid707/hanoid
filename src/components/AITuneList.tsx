/**
 * AI 조절 — AI가 한 번에 써 주는 양을 한 줄에 하나씩 정한다(나 탭 > AI 연결).
 *   - 숫자 항목은 − 숫자 +, 켬/끔 항목은 스위치. 비슷한 것끼리 묶고 묶음 사이에 구분선.
 *   - 줄마다 그 일을 한 번 할 때의 예상 소모(제미나이 = 원, 클로드 = 토큰)를 보여 준다. 0으로 두면 그 일엔 AI를 쓰지 않는다.
 *   - 바꾸면 다음 호출부터 바로 적용되고, DB 동기화를 쓰면 Supabase에 저장돼 다른 기기에도 간다.
 * 기본값·범위·예상 소모 계산은 ai/tune.ts.
 */
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { callCost, DEFAULT_TUNE, normTune, playCost, sameTune, TUNE_RANGE, type CallCost, type CallKind } from '../ai/tune';
import { useGame } from '../store/game';
import { costOf } from '../store/usage';
import { useSync } from '../sync';
import { font, space, useTheme } from '../theme';
import type { AITune } from '../types';
import { formatCount } from '../utils';

interface RowSpec {
  key: keyof AITune;
  label: string;
  unit?: string;
  /** 이 줄이 좌우하는 호출(줄 아래에 예상 소모를 보여 줌). 묶음 전체가 호출 하나면 묶음 쪽에 적는다 */
  cost?: CallKind;
  /** 예상 소모 앞에 붙는 말(예: "글 1개") */
  per?: string;
  note?: string;
}
interface GroupSpec {
  title: string;
  cost?: CallKind;
  per?: string;
  rows: RowSpec[];
}

const GROUPS: GroupSpec[] = [
  {
    title: '내가 한 일에 달리는 반응',
    rows: [
      { key: 'replies', label: '내 글에 달리는 답글', unit: '개', cost: 'react', per: '글 1개' },
      { key: 'thread', label: '내 답글에 달리는 답글', unit: '개', cost: 'thread', per: '답글 1개' },
      { key: 'dmBubbles', label: '쪽지 답장 말풍선(최대)', unit: '개', cost: 'dm', per: '쪽지 1번' },
      { key: 'eventPosts', label: '이벤트 뒤에 올라오는 글', unit: '개', cost: 'event', per: '이벤트 1번' },
    ],
  },
  {
    title: '남의 글',
    rows: [
      { key: 'comments', label: '남의 글에 달려 있는 댓글', unit: '개', cost: 'comments', per: '글 1개(처음 열 때)' },
      { key: 'refreshPosts', label: '새로고침할 때 새 글', unit: '개', cost: 'refresh', per: '새로고침 1번' },
    ],
  },
  {
    title: '하루가 바뀔 때',
    cost: 'day',
    per: '하루 1번',
    rows: [
      { key: 'dayPosts', label: '새 글', unit: '개' },
      { key: 'dayDMs', label: '먼저 쪽지 보내는 사람(최대)', unit: '명' },
      { key: 'dayNews', label: '뉴스' },
      { key: 'dayTrends', label: '트렌드' },
      { key: 'dayMission', label: '오늘의 미션' },
      { key: 'dayEvent', label: '새 이벤트', note: '끄면 세계관에 내장된 이벤트만 나와요' },
    ],
  },
  {
    title: '새 이야기를 시작할 때',
    rows: [{ key: 'firstDM', label: '첫 팔로워의 첫 쪽지', cost: 'firstDM', per: '시작 1번' }],
  },
];

const isToggle = (k: keyof AITune) => TUNE_RANGE[k][0] === 0 && TUNE_RANGE[k][1] === 1;

export function AITuneList({ rate }: { rate: number }) {
  const { c } = useTheme();
  const ai = useGame((s) => s.settings.ai);
  const setAI = useGame((s) => s.setAI);
  const synced = useSync((s) => s.status !== 'off');
  const t = normTune(ai.tune);
  const claude = ai.provider === 'claude';
  const model = ai.model?.trim() || 'gemini-3.5-flash-lite';

  const set = (key: keyof AITune, v: number) => {
    const [min, max] = TUNE_RANGE[key];
    const next = Math.min(max, Math.max(min, v));
    if (next === t[key]) return;
    setAI({ tune: { ...t, [key]: next }, tuneTs: Date.now() });
  };
  const reset = () => setAI({ tune: { ...DEFAULT_TUNE }, tuneTs: Date.now() });

  /** 예상 소모 한 줄: 제미나이는 원, 클로드는 토큰(요금 0) */
  const fmt = (cost: CallCost): string => {
    if (!cost.inTok) return 'AI 안 씀 · 0원';
    if (claude) return `약 ${formatCount(cost.inTok + cost.outTok)} 토큰`;
    const won = costOf({ provider: 'gemini', model, inTok: cost.inTok, outTok: cost.outTok }) * rate;
    return `약 ${won < 10 ? won.toFixed(1) : Math.round(won).toLocaleString('ko-KR')}원`;
  };
  const play = playCost(t);
  const changed = !sameTune(t, DEFAULT_TUNE);

  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: c.text, fontSize: font.h2, fontWeight: '800' }} accessibilityRole="header">
            AI 조절
          </Text>
          <Text style={{ color: c.subtext, fontSize: font.small, lineHeight: 18 }}>줄이면 토큰이 덜 들어요. 0이면 그 일엔 AI를 안 써요. 바꾸면 바로 적용돼요.</Text>
        </View>
        {changed ? (
          <Pressable testID="tune-reset" onPress={reset} accessibilityRole="button" accessibilityLabel="AI 조절 기본값으로" hitSlop={8}>
            <Text style={{ color: c.primary, fontSize: font.small, fontWeight: '700' }}>기본값으로</Text>
          </Pressable>
        ) : null}
      </View>
      <Text testID="tune-play" style={{ color: c.text, fontSize: font.small, fontWeight: '700' }}>
        한 판 예상 {fmt(play)} · AI 호출 {play.calls}번
      </Text>

      <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }}>
        {GROUPS.map((g) => (
          <View key={g.title} style={[styles.group, { borderBottomColor: c.border }]}>
            <View style={styles.groupHead}>
              <Text style={{ color: c.subtext, fontSize: font.small, fontWeight: '800', flex: 1 }}>{g.title}</Text>
              {g.cost ? (
                <Text testID={`tune-cost-${g.cost}`} style={{ color: c.subtext, fontSize: font.small }}>
                  {g.per} {fmt(callCost(g.cost, t))}
                </Text>
              ) : null}
            </View>
            {g.rows.map((r) => {
              const v = t[r.key];
              const [min, max] = TUNE_RANGE[r.key];
              const sub = r.cost ? `${r.per} ${fmt(callCost(r.cost, t))}` : r.note;
              return (
                <View key={r.key} style={styles.row}>
                  <View style={{ flex: 1, gap: 1 }}>
                    <Text style={{ color: c.text, fontSize: font.body, fontWeight: '600' }}>{r.label}</Text>
                    {sub ? (
                      <Text testID={r.cost ? `tune-cost-${r.cost}` : undefined} style={{ color: c.subtext, fontSize: font.small }}>
                        {sub}
                      </Text>
                    ) : null}
                  </View>
                  {isToggle(r.key) ? (
                    <Switch testID={`tune-${r.key}`} value={v > 0} onValueChange={(on) => set(r.key, on ? 1 : 0)} trackColor={{ true: c.primary, false: c.border }} accessibilityLabel={r.label} />
                  ) : (
                    <View style={styles.stepper}>
                      <Pressable
                        testID={`tune-${r.key}-minus`}
                        onPress={() => set(r.key, v - 1)}
                        disabled={v <= min}
                        accessibilityRole="button"
                        accessibilityLabel={`${r.label} 줄이기`}
                        hitSlop={6}
                        style={[styles.stepBtn, { borderColor: c.borderStrong, opacity: v <= min ? 0.3 : 1 }]}
                      >
                        <Text style={[styles.stepSign, { color: c.text }]}>−</Text>
                      </Pressable>
                      <Text testID={`tune-${r.key}`} style={[styles.value, { color: v === 0 ? c.faint : c.text }]} accessibilityLabel={`${r.label} ${v}${r.unit ?? ''}`}>
                        {v}
                        <Text style={{ fontSize: font.small, fontWeight: '500', color: c.subtext }}>{r.unit ?? ''}</Text>
                      </Text>
                      <Pressable
                        testID={`tune-${r.key}-plus`}
                        onPress={() => set(r.key, v + 1)}
                        disabled={v >= max}
                        accessibilityRole="button"
                        accessibilityLabel={`${r.label} 늘리기`}
                        hitSlop={6}
                        style={[styles.stepBtn, { borderColor: c.borderStrong, opacity: v >= max ? 0.3 : 1 }]}
                      >
                        <Text style={[styles.stepSign, { color: c.text }]}>+</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        ))}
      </View>
      <Text style={{ color: c.subtext, fontSize: font.small, lineHeight: 18 }}>
        {synced ? '이 값은 Supabase(DB)에 저장돼 같은 동기화 코드를 쓰는 다른 기기에도 적용돼요.' : 'DB 동기화가 꺼져 있어 이 기기에만 저장돼요.'}
        {claude ? ' 클로드는 내 Claude 사용량으로 계산돼 요금은 0원이에요.' : ' 금액은 지금 고른 모델 가격으로 어림한 값이에요.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 2 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 46 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepBtn: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stepSign: { fontSize: 17, fontWeight: '700', lineHeight: 20 },
  value: { minWidth: 40, textAlign: 'center', fontSize: font.body, fontWeight: '800', fontVariant: ['tabular-nums'] },
});
