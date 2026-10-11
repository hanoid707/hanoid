/**
 * 나 탭(바닥 다섯 번째 = 내 프사) — 한 화면에 들어오게 묶음별로(겹치는 입구 없이)
 *   위: 배너 · 프사 · 이름 · @아이디 · 팔로우 수 · 레벨·평판 한 줄 → 누르면 내 프로필(프로필 수정·스탯 조정은 그 안에서)
 *   활동: 미션 · 북마크 · 활동 기록
 *   세계관: 세계관 전체 수정 · 공통 캐릭터 · 캐릭터 만들기
 *   설정: AI 연결 · AI 개수 조절(토큰) · DB 동기화 · 난이도 · 연애 수위 · 다크 모드 · 기타 설정(세이브 관리·진동·실험 도구)
 * 여기 없는 것: 아이템 = 홈 오른쪽 위 날짜 / 세계관·세이브 바꾸기 = 홈 왼쪽 위 세계관 이름
 */
import { normTune } from '../../ai/tune';
import { useNavigation } from '@react-navigation/native';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { engineLabel } from '../../ai';
import { Avatar } from '../../components/Avatar';
import { VerifiedBadge } from '../../components/Badge';
import {
  IconBookmark,
  IconBot,
  IconChevronRight,
  IconCloud,
  IconCloudOff,
  IconFlame,
  IconGauge,
  IconSliders,
  IconGlobe,
  IconMoon,
  IconScroll,
  IconSettings,
  IconTarget,
  IconUser,
  IconUserPlus,
  IconUsers,
} from '../../components/icons';
import { Photo } from '../../components/Photo';
import { Screen } from '../../components/Screen';
import { Divider, Segmented } from '../../components/ui';
import { setDifficulty, setRomanceLevel } from '../../game/actions';
import { ROMANCE_DESC, ROMANCE_LABEL } from '../../game/content';
import { DIFFICULTY_DESC, DIFFICULTY_LABEL } from '../../game/difficulty';
import type { RootNav } from '../../navigation/types';
import { useActive, useGame } from '../../store/game';
import { useRoster } from '../../store/roster';
import { useUsage } from '../../store/usage';
import { useSync } from '../../sync';
import { font, radius, space, useTheme } from '../../theme';
import type { Difficulty, RomanceLevel, Scenario } from '../../types';
import { formatCount } from '../../utils';
import { DEFAULT_USD_KRW, fmtKrw, fmtUsd, todayBucket } from '../stack/AISettingsScreen';

const STATUS_LABEL: Record<Scenario['stats']['status'], string> = { normal: '보통', rising: '상승세', viral: '확산 중', controversy: '논란', cancelled: '캔슬됨' };

/** 메뉴 한 줄: 아이콘 · 굵은 제목 · 작은 설명(한 줄) · 오른쪽(숫자 배지·화살표·스위치) */
function MenuRow({ icon, title, desc, badge, right, onPress }: { icon: ReactNode; title: string; desc?: string; badge?: number; right?: ReactNode; onPress?: () => void }) {
  const { c } = useTheme();
  const body = (
    <>
      <View style={styles.rowIcon}>{icon}</View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: c.text, fontSize: font.body, fontWeight: '700' }} numberOfLines={1}>
          {title}
        </Text>
        {desc ? (
          <Text style={{ color: c.subtext, fontSize: font.small, marginTop: 1 }} numberOfLines={1}>
            {desc}
          </Text>
        ) : null}
      </View>
      {badge ? (
        <View style={[styles.badge, { backgroundColor: c.primary }]}>
          <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      ) : null}
      {right ?? (onPress ? <IconChevronRight size={18} color={c.subtext} /> : null)}
    </>
  );
  if (!onPress) return <View style={styles.row}>{body}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title} style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.hover }]}>
      {body}
    </Pressable>
  );
}

/** 묶음 제목(작은 글자) */
function Group({ title }: { title: string }) {
  const { c } = useTheme();
  return (
    <Text style={[styles.group, { color: c.subtext }]} accessibilityRole="header">
      {title}
    </Text>
  );
}

/** 고르는 설정 한 줄: 아이콘 · 제목 · 오른쪽 전환 버튼, 아래 한 줄 설명 */
function ChoiceRow({ icon, title, desc, children }: { icon: ReactNode; title: string; desc: string; children: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={styles.choice}>
      <View style={styles.choiceHead}>
        <View style={styles.rowIcon}>{icon}</View>
        <Text style={{ color: c.text, fontSize: font.body, fontWeight: '700' }}>{title}</Text>
        <View style={styles.choiceCtl}>{children}</View>
      </View>
      <Text style={{ color: c.subtext, fontSize: font.small, marginLeft: 28 + space.md }} numberOfLines={2}>
        {desc}
      </Text>
    </View>
  );
}

export function MeScreen() {
  const { c, dark } = useTheme();
  const nav = useNavigation<RootNav>();
  const sc = useActive();
  const insets = useSafeAreaInsets();
  const ai = useGame((s) => s.settings.ai);
  const tuneNow = normTune(ai.tune);
  const theme = useGame((s) => s.settings.theme);
  const setSettings = useGame((s) => s.setSettings);
  const showToast = useGame((s) => s.showToast);
  const usageByDay = useUsage((s) => s.byDay);
  const rosterCount = useRoster((s) => Object.keys(s.entries).length);
  const sync = useSync();
  if (!sc) return null;

  const today = todayBucket(usageByDay);
  const s = sc.stats;
  const people = Object.values(sc.characters).filter((ch) => !ch.inactive);
  const following = people.filter((ch) => ch.iFollow).length;
  const claimable = sc.quests.filter((q) => q.done && !q.claimed).length;
  const doing = sc.quests.filter((q) => !q.done && !q.claimed).length;
  const difficulty: Difficulty = sc.difficulty ?? 'normal';
  const romanceLevel: RomanceLevel = sc.romanceLevel ?? 'racy';
  const badge = sc.persona.badge ?? (s.followers >= 10_000 ? 'blue' : null);
  const rate = ai.usdKrw && ai.usdKrw > 0 ? ai.usdKrw : DEFAULT_USD_KRW;

  const rosterMode = sc.roster?.mode ?? 'off';
  const rosterText = `${rosterCount}명 · 이 세계관: ${rosterMode === 'on' ? '모두 등장' : rosterMode === 'select' ? `${sc.roster?.ids.length ?? 0}명 골라 넣음` : '안 나옴'}`;
  const aiText = `${engineLabel(ai)} · ${today.calls ? `오늘 ${today.calls}회 · ${fmtUsd(today.usd)} (${fmtKrw(today.usd, rate)})` : '오늘 호출 없음'}`;
  const syncText =
    sync.status === 'off'
      ? '꺼짐 · 이 기기에만 저장'
      : sync.status === 'idle'
        ? `자동 저장 중 · ${sync.via === 'mcp' ? 'Supabase 커넥터' : 'Supabase'}`
        : sync.status === 'syncing'
          ? '동기화 중…'
          : sync.status === 'blocked'
            ? `확인 필요${sync.message ? ` — ${sync.message}` : ''}`
            : `오류${sync.message ? ` — ${sync.message}` : ''}`;

  const changeDifficulty = (d: Difficulty) => {
    if (d === difficulty) return;
    setDifficulty(d);
    showToast(`난이도 ${DIFFICULTY_LABEL[d]} — ${DIFFICULTY_DESC[d]}`);
  };
  const changeRomanceLevel = (lv: RomanceLevel) => {
    if (lv === romanceLevel) return;
    setRomanceLevel(lv);
    showToast(`연애 수위 ${ROMANCE_LABEL[lv]} — ${ROMANCE_DESC[lv]}`);
  };

  const ic = (Comp: typeof IconUser) => <Comp size={20} color={c.text} />;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        {/* 내 계정 요약 — 누르면 내 프로필(프로필 수정·스탯 조정은 그 안에서) */}
        <Pressable onPress={() => nav.navigate('MyProfile')} accessibilityRole="button" accessibilityLabel="내 프로필 열기" style={({ pressed }) => pressed && { opacity: 0.8 }}>
          <Photo photo={sc.persona.banner} table="banner" fallback={sc.world.color} style={{ width: '100%', height: 56 + insets.top }} />
          <View style={styles.head}>
            <View style={styles.headTop}>
              <View style={{ marginTop: -30 }}>
                <Avatar avatar={sc.persona.avatar} size={60} ring={4} />
              </View>
              <View style={[styles.profileBtn, { borderColor: c.borderStrong }]}>
                {ic(IconUser)}
                <Text style={{ color: c.text, fontSize: font.small, fontWeight: '800' }}>내 프로필</Text>
                <IconChevronRight size={16} color={c.subtext} />
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}>
                <Text style={{ color: c.text, fontSize: font.title, fontWeight: '900', flexShrink: 1 }} numberOfLines={1}>
                  {sc.persona.name}
                </Text>
                <VerifiedBadge kind={badge} size={17} />
              </View>
              <Text style={{ color: c.subtext, fontSize: font.small, flexShrink: 1 }} numberOfLines={1}>
                @{sc.persona.handle}
              </Text>
            </View>
            <Text style={{ color: c.subtext, fontSize: font.small, marginTop: 4 }} numberOfLines={1}>
              <Text style={{ color: c.text, fontWeight: '800' }}>{formatCount(following)}</Text> 팔로우 중 · <Text style={{ color: c.text, fontWeight: '800' }}>{formatCount(s.followers)}</Text> 팔로워 · Lv.{s.level} {sc.persona.role} · 평판 {s.reputation} ({STATUS_LABEL[s.status]})
            </Text>
          </View>
        </Pressable>

        <Divider />
        <Group title="활동" />
        <MenuRow icon={ic(IconTarget)} title="미션" desc={`진행 중 ${doing} · 받을 보상 ${claimable}`} badge={claimable} onPress={() => nav.navigate('Quests')} />
        <MenuRow icon={ic(IconBookmark)} title="북마크" onPress={() => nav.navigate('Bookmarks')} />
        <MenuRow icon={ic(IconScroll)} title="활동 기록" onPress={() => nav.navigate('Activity')} />

        <Divider />
        <Group title={`세계관 · ${sc.world.emoji} ${sc.world.name}`} />
        <MenuRow icon={ic(IconGlobe)} title="세계관 전체 수정" desc="세계관 설정·내 계정·인물을 한 화면에서" onPress={() => nav.navigate('WorldEdit')} />
        <MenuRow icon={ic(IconUsers)} title="공통 캐릭터" desc={rosterText} onPress={() => nav.navigate('Roster')} />
        <MenuRow icon={ic(IconUserPlus)} title="캐릭터 만들기" desc="유형·팔로워·특징만 고르면 이름·소개는 AI가" onPress={() => nav.navigate('CharacterEditor')} />

        <Divider />
        <Group title="설정" />
        <MenuRow icon={ic(IconBot)} title="AI 연결" desc={aiText} onPress={() => nav.navigate('AISettings')} />
        <MenuRow icon={ic(IconSliders)} title="AI 개수 조절" desc={`하루 새 글 ${tuneNow.dayPosts}개 · 답글 ${tuneNow.replies}개 · 댓글 ${tuneNow.comments}개 … (토큰)`} onPress={() => nav.navigate('AITune')} />
        <MenuRow icon={sync.status === 'off' || sync.status === 'error' ? ic(IconCloudOff) : ic(IconCloud)} title="DB 동기화" desc={syncText} onPress={() => nav.navigate('SyncSettings')} />
        <ChoiceRow icon={ic(IconGauge)} title="난이도" desc={DIFFICULTY_DESC[difficulty]}>
          <Segmented<Difficulty>
            options={[
              { key: 'easy', label: DIFFICULTY_LABEL.easy },
              { key: 'normal', label: DIFFICULTY_LABEL.normal },
              { key: 'hard', label: DIFFICULTY_LABEL.hard },
            ]}
            value={difficulty}
            onChange={changeDifficulty}
          />
        </ChoiceRow>
        <ChoiceRow icon={ic(IconFlame)} title="연애 수위" desc={ROMANCE_DESC[romanceLevel]}>
          <Segmented<RomanceLevel>
            options={[
              { key: 'mild', label: ROMANCE_LABEL.mild },
              { key: 'racy', label: ROMANCE_LABEL.racy },
              { key: 'erotic', label: ROMANCE_LABEL.erotic },
            ]}
            value={romanceLevel}
            onChange={changeRomanceLevel}
          />
        </ChoiceRow>
        <Text style={{ color: c.subtext, fontSize: font.tiny, lineHeight: 16, paddingHorizontal: space.lg, paddingBottom: 6 }}>
          공개 타임라인은 어느 단계든 암시까지이고, 에로틱 단계의 노골적 묘사는 쪽지에서만 나와요. 공통 캐릭터(실존 인물일 수 있음)·가족·10대 인물은 이 설정과 무관하게 연애 반응이 없어요.
        </Text>
        <MenuRow
          icon={ic(IconMoon)}
          title="다크 모드"
          desc={theme === 'system' ? '기기 설정을 따르는 중' : undefined}
          right={
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {theme !== 'system' ? (
                <Pressable onPress={() => setSettings({ theme: 'system' })} accessibilityRole="button" accessibilityLabel="기기 설정 따르기" hitSlop={6} style={({ pressed }) => pressed && { opacity: 0.6 }}>
                  <Text style={{ color: c.primary, fontSize: font.small, fontWeight: '700' }}>기기 설정 따르기</Text>
                </Pressable>
              ) : null}
              <Switch
                accessibilityLabel="다크 모드"
                value={dark}
                onValueChange={(on) => setSettings({ theme: on ? 'dark' : 'light' })}
                trackColor={{ true: c.primary, false: c.border }}
              />
            </View>
          }
        />
        <MenuRow icon={ic(IconSettings)} title="기타 설정" desc="세이브 관리 · 진동 · 실험 도구" onPress={() => nav.navigate('Settings')} />

        <Text style={{ color: c.faint, fontSize: font.tiny, textAlign: 'center', marginTop: 12 }}>Xsta · 앱공부 동아리용 클론</Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: space.lg, paddingBottom: 10 },
  headTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  profileBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: radius.pill, paddingLeft: 10, paddingRight: 6, height: 32, marginTop: 8 },
  group: { fontSize: font.tiny, fontWeight: '800', letterSpacing: 0.4, paddingHorizontal: space.lg, paddingTop: 10, paddingBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: 9, minHeight: 44 },
  rowIcon: { width: 28, alignItems: 'center' },
  badge: { minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  choice: { paddingHorizontal: space.lg, paddingVertical: 7, gap: 4 },
  choiceHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  choiceCtl: { flex: 1, maxWidth: 230, marginLeft: 'auto' },
});
