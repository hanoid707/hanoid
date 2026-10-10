/**
 * AI 연결 — 쓸 수 있는 AI 고르기 · AI를 쓰는 범위(절약) · 제미나이 모델(가격 · 한 판 예상 요금) · 키 · 연결 테스트 · 클로드 모드
 *   + 사용량: 오늘 / 이번 달 / 전체(호출·토큰·예상 요금·원화) · 기능별 · 마지막 호출 · 충전 금액 대비 남은 예상 금액
 * 사용량은 이 기기에서 센 추정치다(응답에 적힌 토큰 × 가격표). 정확한 청구·한도는 Google AI Studio에서 본다.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { availableProviders, engineLabel, GEMINI_MODEL_PRESETS, resetEngineState } from '../../ai';
import { claudeAvailable } from '../../ai/claude/engine';
import { pingGemini } from '../../ai/gemini/engine';
import { IconExternalLink } from '../../components/icons';
import { Screen, TopBar } from '../../components/Screen';
import { Button, Field, ProgressBar, Segmented } from '../../components/ui';
import { isArtifactRuntime } from '../../config';
import { useGame } from '../../store/game';
import { emptyBucket, PLAY_PROFILE, playCostUsd, PRICES, resetUsage, useUsage, type UsageBucket, type UsageEvent } from '../../store/usage';
import { font, radius, space, useTheme } from '../../theme';
import type { AISettings, BackgroundAI } from '../../types';
import { formatCount } from '../../utils';

/** 'AI를 쓰는 범위' 단계별 설명 */
const BACKGROUND_DESC: Record<BackgroundAI, string> = {
  off: '쪽지·내 글·답글·댓글·이벤트 선택처럼 내가 한 행동에만 AI를 써요. 날이 바뀌어도 남의 새 글·뉴스·트렌드·오늘의 미션·먼저 오는 쪽지는 생기지 않고, 이벤트는 내장된 것만 나와요.',
  lite: '내 행동 + 날이 바뀔 때 남의 새 글 3개만 받아요(빠른 호출 1번). 뉴스·트렌드·오늘의 미션·먼저 오는 쪽지는 없어요.',
  full: '하루 정산(새 글·뉴스·트렌드·이벤트·오늘의 미션·먼저 오는 쪽지), 새 이야기의 첫 쪽지, 댓글 보충까지 전부 써요.',
};

// ───────────────────────── 사용량 표시 도우미(나 탭에서도 쓴다)

/** 기본 환율(원/달러) — 화면에서 바꿀 수 있다 */
export const DEFAULT_USD_KRW = 1400;
export const AI_STUDIO_USAGE_URL = 'https://aistudio.google.com/usage';

const pad2 = (n: number) => String(n).padStart(2, '0');

/** 오늘 날짜 키(기기 시간, 사용량 일별 집계와 같은 YYYY-MM-DD) */
export function todayKey(d = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 오늘 집계(기기 날짜 키 우선, 없으면 UTC 날짜 키 — 기록 쪽 규칙이 달라도 0으로 보이지 않게) */
export function todayBucket(byDay: Record<string, UsageBucket>, d = new Date()): UsageBucket {
  return byDay[todayKey(d)] ?? byDay[d.toISOString().slice(0, 10)] ?? emptyBucket();
}

/** 여러 집계를 더한다 */
export function sumBuckets(list: UsageBucket[]): UsageBucket {
  const out = emptyBucket();
  for (const b of list) {
    out.calls += b.calls;
    out.errors += b.errors;
    out.inTok += b.inTok;
    out.outTok += b.outTok;
    out.cachedTok += b.cachedTok;
    out.usd += b.usd;
  }
  return out;
}

/** 이번 달 = 이번 달 날짜들의 합 */
export function monthBucket(byDay: Record<string, UsageBucket>, d = new Date()): UsageBucket {
  const prefix = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  return sumBuckets(Object.entries(byDay).filter(([k]) => k.startsWith(prefix)).map(([, b]) => b));
}

/** 달러: 작은 금액은 소수점 넷째 자리까지 */
export function fmtUsd(n: number): string {
  if (!n) return '$0';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

/** 원화 환산 */
export function fmtKrw(usd: number, rate: number): string {
  const won = usd * rate;
  if (!won) return '0원';
  if (won < 1) return '1원 미만';
  return `${Math.round(won).toLocaleString('ko-KR')}원`;
}

/** 한 판 예상 요금 표시: "한 판 약 17원" */
export function playCostLabel(model: string, rate: number): string {
  const won = playCostUsd(model) * rate;
  if (won < 1) return '한 판 1원 미만';
  return `한 판 약 ${won < 10 ? won.toFixed(1) : Math.round(won).toLocaleString('ko-KR')}원`;
}

/** 기능 이름(사용량 기록의 kind → 화면 이름). 모르는 값은 그대로 보여 준다 */
export const KIND_LABEL: Record<string, string> = {
  react: '내 글 반응',
  reply: '내 답글에 되받아치기',
  thread: '내 답글에 되받아치기',
  threadComments: '남의 글 댓글',
  dm: '쪽지 답장',
  gift: '선물 답장',
  tick: '하루 정산',
  event: '이벤트 결과',
  resolveEvent: '이벤트 결과',
  newEvent: '다른 이벤트',
  firstDM: '첫 쪽지',
  suggest: '글쓰기 제안(예전 기록)',
  draft: '캐릭터 이름·소개·첫 글',
  draftCharacter: '캐릭터 이름·소개·첫 글',
  bio: '자기소개 다시 쓰기',
  ambient: '타임라인 새로고침',
  cast: '세계관 인물 만들기',
  ping: '연결 테스트',
};

const VIA_LABEL: Record<UsageEvent['via'], string> = {
  rest: 'API 직접',
  db: 'Supabase 경유',
  sample: 'claude.ai 페이지',
  proxy: '서버 경유(키 미노출)',
};

/** 토큰 수(1.2천 / 3.4만) */
const tok = (n: number) => formatCount(Math.round(n));

// ───────────────────────── 화면

/** AI가 쓰이는 자리 — 행동 1번에 호출 몇 번인지(토큰 절약 규칙) */
const USES: [string, string][] = [
  ['내 글 반응', '글 1개 = 1번. 답글 5~6개(인플루언서가 달면 대댓글 2~3개 더, 최대 8개)를 한 번에 받아 나눠 보여 줘요'],
  ['남의 글 댓글', '처음 열 때만 1번(다시 열면 0번)'],
  ['답글 스레드', '내 답글 1개 = 1번'],
  ['쪽지 답장', '메시지 1개 = 1번(한 줄씩 나눠 도착)'],
  ['첫 쪽지', '새 이야기를 시작할 때 1번'],
  ['하루 정산', '하루 1번(뒤에서): 캐릭터 글·뉴스·트렌드·이벤트·미션'],
  ['이벤트 결과', '답 1번 = 1번'],
  ['다른 이벤트', '세계관에 준비된 이벤트가 바닥났을 때만'],
  ['글쓰기 제안', '내 글 반응·하루 정산에 얹어 받음 · "다른 제안"은 모아 둔 것 중에서(0번)'],
  ['캐릭터 만들기', '이름·소개·첫 글 짧게 1번'],
  ['타임라인 새로고침', '당겨서 새로고침할 때 1번'],
];

const MODEL_NOTE: Record<string, string> = {
  'gemini-3.5-flash-lite': '가장 빠름 · 기본값',
  'gemini-flash-latest': '최신 flash 별칭',
};

export function AISettingsScreen() {
  const { c } = useTheme();
  const ai = useGame((s) => s.settings.ai);
  const setAI = useGame((s) => s.setAI);
  const showToast = useGame((s) => s.showToast);
  const usage = useUsage();
  const [testing, setTesting] = useState(false);
  const [claudeOk, setClaudeOk] = useState<boolean | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [budgetText, setBudgetText] = useState(ai.budgetUsd ? String(ai.budgetUsd) : '');
  const [rateText, setRateText] = useState(String(ai.usdKrw ?? DEFAULT_USD_KRW));
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inArtifact = isArtifactRuntime();

  useEffect(() => {
    if (inArtifact) void claudeAvailable().then(setClaudeOk);
  }, [inArtifact]);
  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  const providers = useMemo(() => availableProviders(ai), [ai]);
  const current = providers.find((p) => p.id === ai.provider);
  const label = engineLabel(ai);
  const rate = ai.usdKrw && ai.usdKrw > 0 ? ai.usdKrw : DEFAULT_USD_KRW;

  const today = todayBucket(usage.byDay);
  const month = useMemo(() => monthBucket(usage.byDay), [usage.byDay]);
  const total = usage.total;
  const kinds = useMemo(() => Object.entries(usage.byKind).sort((a, b) => b[1].calls - a[1].calls || b[1].usd - a[1].usd), [usage.byKind]);
  const models = useMemo(() => Object.entries(usage.byModel).sort((a, b) => b[1].calls - a[1].calls), [usage.byModel]);
  const maxKindCalls = kinds.reduce((m, [, b]) => Math.max(m, b.calls), 0);
  const budget = ai.budgetUsd && ai.budgetUsd > 0 ? ai.budgetUsd : 0;
  const remaining = Math.max(0, budget - total.usd);

  const test = async () => {
    setTesting(true);
    try {
      resetEngineState(); // 이번 접속에서 꺼 둔 엔진(키 오류 등)을 다시 켜고 시험
      const msg = await pingGemini(ai);
      showToast(`✅ ${msg}`, 'success');
    } catch (e) {
      showToast(`연결 실패: ${(e as Error).message}`, 'error');
    } finally {
      setTesting(false);
    }
  };

  const onBudget = (t: string) => {
    const clean = t.replace(/[^0-9.]/g, '');
    setBudgetText(clean);
    const n = parseFloat(clean);
    setAI({ budgetUsd: Number.isFinite(n) && n > 0 ? n : undefined });
  };
  const onRate = (t: string) => {
    const clean = t.replace(/[^0-9.]/g, '');
    setRateText(clean);
    const n = parseFloat(clean);
    if (Number.isFinite(n) && n > 0) setAI({ usdKrw: n });
  };

  const reset = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      if (resetTimer.current) clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setConfirmReset(false), 3000);
      return;
    }
    setConfirmReset(false);
    resetUsage();
    showToast('사용량 기록을 비웠어요');
  };

  const openStudio = () => {
    Linking.openURL(AI_STUDIO_USAGE_URL).catch(() => showToast(`주소를 열 수 없어요: ${AI_STUDIO_USAGE_URL}`, 'error'));
  };

  // 지금 어떤 길로 답하는지 한 줄 설명
  const routeText =
    ai.provider === 'gemini'
      ? inArtifact
        ? '이 페이지(claude.ai)에서는 제미나이를 Supabase(DB)를 거쳐 불러요. 키는 서버에 있어서 여기서 넣지 않아요.'
        : ai.apiKey.trim()
          ? '주신 API 키로 제미나이를 직접 불러요.'
          : 'API 키를 넣어야 캐릭터들이 반응해요(키가 없으면 답글·쪽지가 달리지 않아요).'
      : inArtifact
        ? '이 페이지(claude.ai)에서 클로드가 캐릭터들을 연기해요. 보는 사람 본인의 Claude 사용량을 써요.'
        : '클로드는 claude.ai 페이지 안에서만 쓸 수 있어요.';

  const cols: { key: string; label: string; b: UsageBucket }[] = [
    { key: 'today', label: '오늘', b: today },
    { key: 'month', label: '이번 달', b: month },
    { key: 'total', label: '전체', b: total },
  ];
  const tableRows: { label: string; val: (b: UsageBucket) => string; strong?: boolean }[] = [
    { label: '호출', val: (b) => `${b.calls.toLocaleString('ko-KR')}회` },
    { label: '입력 토큰', val: (b) => tok(b.inTok) },
    { label: '출력 토큰', val: (b) => tok(b.outTok) },
    { label: '예상 요금', val: (b) => fmtUsd(b.usd), strong: true },
    { label: '원화', val: (b) => fmtKrw(b.usd, rate) },
  ];
  if (total.errors > 0) tableRows.push({ label: '실패', val: (b) => `${b.errors}회` });

  const last = usage.last;
  const background: BackgroundAI = ai.background ?? 'off';
  const head = (t: string, sub?: string) => (
    <View style={{ gap: 2 }}>
      <Text style={{ color: c.text, fontSize: font.h2, fontWeight: '800' }} accessibilityRole="header">
        {t}
      </Text>
      {sub ? <Text style={{ color: c.subtext, fontSize: font.small, lineHeight: 18 }}>{sub}</Text> : null}
    </View>
  );

  return (
    <Screen>
      <TopBar title="AI 연결" subtitle={`지금 답하는 AI: ${label}`} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.xl, paddingBottom: 56 }} keyboardShouldPersistTaps="handled">
        {/* 지금 답하는 AI */}
        <View style={[styles.box, { borderColor: c.border, backgroundColor: c.surfaceAlt }]} accessibilityLabel={`지금 답하는 AI: ${label}`}>
          <Text style={{ color: c.subtext, fontSize: font.small, fontWeight: '700' }}>지금 답하는 AI</Text>
          <Text style={{ color: c.text, fontSize: font.title, fontWeight: '900' }}>{label}</Text>
          <Text style={{ color: c.subtext, fontSize: font.small, lineHeight: 19 }}>{routeText}</Text>
          {last ? (
            <Text style={{ color: c.subtext, fontSize: font.small, lineHeight: 19 }}>
              마지막 호출 {new Date(last.ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} · {last.model} · {(last.ms / 1000).toFixed(1)}초 · {KIND_LABEL[last.kind] ?? last.kind}
              {last.ok ? '' : ' · 실패'}
            </Text>
          ) : (
            <Text style={{ color: c.subtext, fontSize: font.small }}>아직 이 기기에서 AI를 부른 기록이 없어요.</Text>
          )}
        </View>

        {/* 고를 수 있는 AI */}
        <View style={{ gap: space.sm }}>
          {head('사용할 AI', '지금 실행 환경에서 쓸 수 있는 것만 고를 수 있어요.')}
          <View style={[styles.list, { borderColor: c.border }]}>
            {providers.map((p, i) => {
              const on = ai.provider === p.id;
              return (
                <Pressable
                  key={p.id}
                  disabled={!p.available}
                  onPress={() => {
                    resetEngineState();
                    setAI({ provider: p.id, chosen: true });
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on, disabled: !p.available }}
                  accessibilityLabel={`${p.label} 사용`}
                  style={({ pressed }) => [styles.option, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }, pressed && { backgroundColor: c.hover }]}
                >
                  <View style={[styles.radio, { borderColor: on ? c.primary : c.borderStrong, opacity: p.available ? 1 : 0.5 }]}>{on ? <View style={[styles.radioDot, { backgroundColor: c.primary }]} /> : null}</View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ color: p.available ? c.text : c.faint, fontWeight: '800', fontSize: font.body }}>
                      {p.label}
                      <Text style={{ color: c.subtext, fontWeight: '600', fontSize: font.small }}> ({p.id === 'claude' ? '한 판 0원 · Claude 사용량' : playCostLabel(ai.model?.trim() || GEMINI_MODEL_PRESETS[0], rate)})</Text>
                      {on ? <Text style={{ color: c.primary }}> · 선택됨</Text> : null}
                    </Text>
                    <Text style={{ color: c.subtext, fontSize: font.small, lineHeight: 18 }}>{p.desc}</Text>
                    {!p.available ? <Text style={{ color: c.warning, fontSize: font.small, lineHeight: 18 }}>{p.reason ?? '지금 환경에서는 쓸 수 없어요'}</Text> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
          {current && !current.available ? (
            <Text style={{ color: c.warning, fontSize: font.small, lineHeight: 19 }}>고른 AI를 지금 쓸 수 없어서 캐릭터들이 반응하지 않아요. 키·연결을 확인해 주세요.</Text>
          ) : null}
        </View>

        {/* AI를 쓰는 범위(토큰 절약) */}
        <View style={{ gap: space.sm }}>
          {head('AI를 쓰는 범위', '내가 시키지 않아도 뒤에서 도는 AI를 얼마나 쓸지 골라요.')}
          <Segmented<BackgroundAI>
            options={[
              { key: 'off', label: '내 행동만' },
              { key: 'lite', label: '+ 새 글' },
              { key: 'full', label: '전부' },
            ]}
            value={background}
            onChange={(next) => setAI({ background: next })}
          />
          <Text style={{ color: c.subtext, fontSize: font.small, lineHeight: 19 }}>{BACKGROUND_DESC[background]}</Text>
        </View>

        {/* AI별 설정 */}
        {ai.provider === 'gemini' ? (
          <View style={{ gap: space.md }}>
            {head('제미나이 설정')}
            {inArtifact ? (
              <Text style={{ color: c.text, fontSize: font.body, lineHeight: 22 }}>
                이 페이지에서는 <Text style={{ fontWeight: '800' }}>Supabase를 거쳐</Text> 제미나이를 불러요. 키는 서버에 저장돼 있어서 입력 칸이 없어요.
              </Text>
            ) : (
              <Field
                label="Gemini API 키"
                value={ai.apiKey}
                onChangeText={(apiKey) => {
                  resetEngineState();
                  setAI({ apiKey: apiKey.trim() });
                }}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                hint="이 기기에만 저장돼요(DB에는 올리지 않음)."
              />
            )}
            <Text style={{ color: c.subtext, fontSize: font.small, fontWeight: '700' }}>모델 (한 판 예상 요금) · 100만 토큰당 가격</Text>
            <View style={[styles.list, { borderColor: c.border }]}>
              {GEMINI_MODEL_PRESETS.map((m, i) => {
                const on = ai.model === m;
                const price = PRICES[m];
                return (
                  <Pressable
                    key={m}
                    onPress={() => {
                      resetEngineState();
                      setAI({ model: m });
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={`모델 ${m}`}
                    style={({ pressed }) => [styles.option, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }, pressed && { backgroundColor: c.hover }]}
                  >
                    <View style={[styles.radio, { borderColor: on ? c.primary : c.borderStrong }]}>{on ? <View style={[styles.radioDot, { backgroundColor: c.primary }]} /> : null}</View>
                    <View style={{ flex: 1, gap: 1 }}>
                      <Text style={{ color: c.text, fontWeight: '800', fontSize: font.body }} numberOfLines={1}>
                        {m}
                        <Text style={{ color: c.primary, fontWeight: '700', fontSize: font.small }}> ({playCostLabel(m, rate)})</Text>
                        {MODEL_NOTE[m] ? <Text style={{ color: c.subtext, fontWeight: '400', fontSize: font.small }}> · {MODEL_NOTE[m]}</Text> : null}
                      </Text>
                      <Text style={{ color: c.subtext, fontSize: font.small }}>
                        {price ? `입력 $${price.in} · 출력 $${price.out}${price.cachedIn !== undefined ? ` · 캐시 $${price.cachedIn}` : ''}` : '가격표에 없음 → flash-lite 가격으로 계산'}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
            <Text style={{ color: c.subtext, fontSize: font.small, lineHeight: 18 }}>
              한 판 = 새 이야기 시작(첫 쪽지)·내 글 2개·답글·남의 글 댓글 2번·쪽지 2번·이벤트·하루 정산·캐릭터 만들기 정도(약 {PLAY_PROFILE.calls}번 호출, 입력 {tok(PLAY_PROFILE.inTok)}·출력 {tok(PLAY_PROFILE.outTok)} 토큰). 1달러 = {rate.toLocaleString('ko-KR')}원
            </Text>
            <Field label="모델 직접 입력" value={ai.model} onChangeText={(model) => {
                resetEngineState();
                setAI({ model: model.trim() });
              }} autoCapitalize="none" autoCorrect={false} />
            <Button title="연결 테스트" disabled={!inArtifact && !ai.apiKey.trim()} loading={testing} onPress={test} variant="ink" />
            {!inArtifact ? (
              <View style={[styles.box, { borderColor: c.border }]}>
                <Text style={{ color: c.text, fontWeight: '800', fontSize: font.small }}>공부 포인트</Text>
                <Text style={{ color: c.subtext, fontSize: font.small, lineHeight: 19 }}>
                  앱 안에 키를 넣으면 앱을 뜯어서 키를 볼 수 있어요. 실제 서비스라면 키는 서버(예: Supabase Edge Function)에 두고 앱은 서버를 불러요.
                </Text>
              </View>
            ) : null}
          </View>
        ) : ai.provider === 'claude' ? (
          <View style={{ gap: space.md }}>
            {head('클로드 설정')}
            <Segmented<NonNullable<AISettings['claudeMode']>>
              options={[
                { key: 'fast', label: '빠름' },
                { key: 'balanced', label: '균형' },
                { key: 'quality', label: '고품질' },
              ]}
              value={ai.claudeMode ?? 'balanced'}
              onChange={(claudeMode) => setAI({ claudeMode })}
            />
            <Text style={{ color: c.subtext, fontSize: font.small, lineHeight: 19 }}>
              빠름: 모든 반응을 빠른 모델로 · 균형: 답글·쪽지는 빠르게, 하루 정산·이벤트는 깊게 · 고품질: 전부 깊게(느림)
            </Text>
            <Text style={{ color: c.subtext, fontSize: font.small, lineHeight: 19 }}>클로드는 내 Claude 요금제 사용량으로 계산돼서 아래 요금은 $0으로 보여요(토큰은 글자 수로 추정).</Text>
            {claudeOk === false && <Text style={{ color: c.danger, fontSize: font.small }}>이 화면에서는 클로드를 쓸 수 없어요.</Text>}
          </View>
        ) : null}

        {/* 사용량 */}
        <View style={{ gap: space.md }}>
          {head('사용량', '이 기기에서 센 추정치예요(응답에 적힌 토큰 × 가격표).')}
          <View style={[styles.table, { borderColor: c.border }]} accessibilityLabel="AI 사용량 표">
            <View style={[styles.tr, { borderBottomColor: c.border, borderBottomWidth: StyleSheet.hairlineWidth, backgroundColor: c.surfaceAlt }]}>
              <Text style={[styles.th, { color: c.subtext }]} />
              {cols.map((col) => (
                <Text key={col.key} style={[styles.td, { color: c.subtext, fontWeight: '800' }]}>
                  {col.label}
                </Text>
              ))}
            </View>
            {tableRows.map((r, i) => (
              <View key={r.label} style={[styles.tr, i < tableRows.length - 1 && { borderBottomColor: c.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
                <Text style={[styles.th, { color: c.subtext }]}>{r.label}</Text>
                {cols.map((col) => (
                  <Text key={col.key} style={[styles.td, { color: c.text, fontWeight: r.strong ? '800' : '500' }]} numberOfLines={1}>
                    {r.val(col.b)}
                  </Text>
                ))}
              </View>
            ))}
          </View>
          <Text style={{ color: c.subtext, fontSize: font.small }}>원화 환산: 1달러 = {rate.toLocaleString('ko-KR')}원</Text>

          {last ? (
            <View style={[styles.box, { borderColor: c.border }]}>
              <Text style={{ color: c.text, fontWeight: '800', fontSize: font.small }}>마지막 호출</Text>
              <Text style={{ color: c.subtext, fontSize: font.small, lineHeight: 19 }}>
                {new Date(last.ts).toLocaleString('ko-KR')} · {KIND_LABEL[last.kind] ?? last.kind}
                {'\n'}
                {last.model} · {VIA_LABEL[last.via] ?? last.via} · {(last.ms / 1000).toFixed(1)}초
                {'\n'}
                입력 {last.inTok.toLocaleString('ko-KR')} · 출력 {last.outTok.toLocaleString('ko-KR')}
                {last.cachedTok ? ` · 캐시 ${last.cachedTok.toLocaleString('ko-KR')}` : ''} 토큰{last.estimated ? ' (글자 수로 추정)' : ''}
                {last.ok ? '' : ' · 실패'}
              </Text>
            </View>
          ) : null}

          {kinds.length ? (
            <View style={{ gap: 8 }}>
              <Text style={{ color: c.text, fontWeight: '800', fontSize: font.body }}>기능별</Text>
              {kinds.map(([k, b]) => (
                <View key={k} style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                    <Text style={{ color: c.text, fontSize: font.small, fontWeight: '700', flex: 1 }} numberOfLines={1}>
                      {KIND_LABEL[k] ?? k}
                    </Text>
                    <Text style={{ color: c.subtext, fontSize: font.small }}>
                      {b.calls}회 · {tok(b.inTok + b.outTok)} 토큰 · {fmtUsd(b.usd)}
                    </Text>
                  </View>
                  <ProgressBar value={b.calls} max={maxKindCalls} height={4} />
                </View>
              ))}
            </View>
          ) : null}

          {models.length ? (
            <View style={{ gap: 4 }}>
              <Text style={{ color: c.text, fontWeight: '800', fontSize: font.body }}>모델별</Text>
              {models.map(([m, b]) => (
                <Text key={m} style={{ color: c.subtext, fontSize: font.small }} numberOfLines={1}>
                  {m} — {b.calls}회 · {fmtUsd(b.usd)} ({fmtKrw(b.usd, rate)})
                </Text>
              ))}
            </View>
          ) : null}

          {/* 충전 금액 → 남은 예상 금액 */}
          <View style={[styles.box, { borderColor: c.border, gap: space.sm }]}>
            <Text style={{ color: c.text, fontWeight: '800', fontSize: font.body }}>남은 금액(예상)</Text>
            <Field label="충전 금액(달러)" value={budgetText} onChangeText={onBudget} keyboardType="decimal-pad" placeholder="예: 10" hint="Google AI Studio에 충전·설정한 금액을 넣으면 남은 금액을 계산해요." />
            {budget ? (
              <View style={{ gap: 6 }} accessibilityLabel={`남은 예상 금액 ${fmtUsd(remaining)}`}>
                <ProgressBar value={remaining} max={budget} height={8} color={remaining / budget < 0.2 ? c.warning : c.repost} />
                <Text style={{ color: c.text, fontSize: font.small, fontWeight: '700' }}>
                  남은 예상 금액 {fmtUsd(remaining)} ({fmtKrw(remaining, rate)}) · {Math.min(100, Math.round((total.usd / budget) * 100))}% 사용
                </Text>
              </View>
            ) : null}
            <Field label="환율(원/달러)" value={rateText} onChangeText={onRate} keyboardType="decimal-pad" placeholder={String(DEFAULT_USD_KRW)} />
            <Text style={{ color: c.subtext, fontSize: font.small, lineHeight: 19 }}>정확한 청구·한도는 Google AI Studio 사용량 페이지에서 확인하세요.</Text>
            <Button title="Google AI Studio 사용량 열기" variant="outline" size="sm" icon={<IconExternalLink size={15} color={c.text} />} onPress={openStudio} style={{ alignSelf: 'flex-start' }} />
          </View>

          <Button title={confirmReset ? '정말 비울까요?' : '사용량 기록 비우기'} variant="danger" size="sm" onPress={reset} style={{ alignSelf: 'flex-start' }} />
        </View>

        {/* 쓰이는 자리 */}
        <View>
          {head('AI가 쓰이는 자리', '행동 1번에 호출 몇 번인지 — 숫자(좋아요·조회수)·자동완성은 기기에서 계산해요. 글은 전부 AI가 쓰고, 이미지·영상은 만들지 않아요.')}
          <View style={{ marginTop: 6 }}>
            {USES.map(([title, desc]) => (
              <View key={title} style={[styles.useRow, { borderBottomColor: c.border }]}>
                <Text style={{ color: c.text, fontWeight: '700', width: 116, fontSize: font.small }}>{title}</Text>
                <Text style={{ color: c.subtext, fontSize: font.small, flex: 1, lineHeight: 18 }}>{desc}</Text>
              </View>
            ))}
          </View>
          <Text style={{ color: c.subtext, fontSize: font.small, marginTop: 8, lineHeight: 19 }}>호출이 실패하면 한 번 더 시도하고, 그래도 안 되면 그 반응은 비워 둬요(미리 써 둔 문장으로 채우지 않음).</Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radius.md, padding: space.md, borderWidth: 1, gap: 4 },
  list: { borderRadius: radius.md, borderWidth: 1, overflow: 'hidden' },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.md, paddingVertical: 12 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  table: { borderRadius: radius.md, borderWidth: 1, overflow: 'hidden' },
  tr: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, paddingVertical: 9, borderBottomWidth: 0 },
  th: { width: 72, fontSize: font.small, fontWeight: '700' },
  td: { flex: 1, fontSize: font.small, textAlign: 'right' },
  useRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth },
});
