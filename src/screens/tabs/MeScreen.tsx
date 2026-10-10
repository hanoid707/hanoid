/**
 * 나 탭(바닥 다섯 번째 = 내 프사) — X의 내 계정 메뉴처럼
 *   위: 배너 · 프사 · 이름 · @아이디 · 팔로우 수 · 레벨·경험치 · 평판 상태
 *   아래: 내 프로필 · 프로필 수정 · 아이템 · 스탯 조정 · 미션 · 공통 캐릭터 · 북마크 · 활동 기록 · 캐릭터 만들기
 *         · 세계관·세이브 · AI 연결(오늘 사용량) · DB 동기화 · 난이도 · 다크 모드
 * (v3) 예전 왼쪽 위 사이드 메뉴를 대신한다.
 */
import { useNavigation } from '@react-navigation/native';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { engineLabel } from '../../ai';
import { Avatar } from '../../components/Avatar';
import { VerifiedBadge } from '../../components/Badge';
import {
  IconBackpack,
  IconBookmark,
  IconBot,
  IconChevronRight,
  IconCloud,
  IconCloudOff,
  IconFlame,
  IconGauge,
  IconGlobe,
  IconMoon,
  IconScroll,
  IconSliders,
  IconTarget,
  IconUser,
  IconUserPen,
  IconUserPlus,
  IconUsers,
} from '../../components/icons';
import { Photo } from '../../components/Photo';
import { Screen } from '../../components/Screen';
import { Divider, ProgressBar, Segmented } from '../../components/ui';
import { formatClock } from '../../game/clock';
import { setDifficulty, setRomanceLevel } from '../../game/actions';
import { ROMANCE_DESC, ROMANCE_LABEL } from '../../game/content';
import { DIFFICULTY_DESC, DIFFICULTY_LABEL } from '../../game/difficulty';
import { xpToNext } from '../../game/rules';
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

/** 메뉴 한 줄(X 계정 메뉴 모양): 아이콘 · 굵은 제목 · 작은 설명 · 오른쪽(숫자 배지·화살표·스위치) */
function MenuRow({ icon, title, desc, badge, right, onPress }: { icon: ReactNode; title: string; desc?: string; badge?: number; right?: ReactNode; onPress?: () => void }) {
  const { c } = useTheme();
  const body = (
    <>
      <View style={styles.rowIcon}>{icon}</View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: c.text, fontSize: font.title, fontWeight: '700' }} numberOfLines={1}>
          {title}
        </Text>
        {desc ? (
          <Text style={{ color: c.subtext, fontSize: font.small, marginTop: 1, lineHeight: 18 }} numberOfLines={2}>
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

export function MeScreen() {
  const { c, dark } = useTheme();
  const nav = useNavigation<RootNav>();
  const sc = useActive();
  const insets = useSafeAreaInsets();
  const ai = useGame((s) => s.settings.ai);
  const theme = useGame((s) => s.settings.theme);
  const setSettings = useGame((s) => s.setSettings);
  const showToast = useGame((s) => s.showToast);
  const saves = useGame((s) => Object.keys(s.scenarios).length);
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
  const armed = sc.boost?.kind === 'viral';
  const difficulty: Difficulty = sc.difficulty ?? 'normal';
  const romanceLevel: RomanceLevel = sc.romanceLevel ?? 'racy';
  const badge = sc.persona.badge ?? (s.followers >= 10_000 ? 'blue' : null);
  const rate = ai.usdKrw && ai.usdKrw > 0 ? ai.usdKrw : DEFAULT_USD_KRW;
  const need = xpToNext(s.level);

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

  const ic = (Comp: typeof IconUser) => <Comp size={22} color={c.text} />;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
        {/* 배너 · 프사 · 이름 */}
        <Photo photo={sc.persona.banner} table="banner" fallback={sc.world.color} style={{ width: '100%', height: 92 + insets.top }} />
        <View style={styles.head}>
          <View style={{ marginTop: -36 }}>
            <Avatar avatar={sc.persona.avatar} size={72} ring={4} onPress={() => nav.navigate('MyProfile')} label="내 계정" />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
            <Text style={{ color: c.text, fontSize: font.h2, fontWeight: '900', flexShrink: 1 }} numberOfLines={1}>
              {sc.persona.name}
            </Text>
            <VerifiedBadge kind={badge} size={19} />
          </View>
          <Text style={{ color: c.subtext, fontSize: font.body }}>@{sc.persona.handle}</Text>
          <Text style={{ color: c.subtext, fontSize: font.body, marginTop: 8 }}>
            <Text style={{ color: c.text, fontWeight: '800' }}>{formatCount(following)}</Text> 팔로우 중{'    '}
            <Text style={{ color: c.text, fontWeight: '800' }}>{formatCount(s.followers)}</Text> 팔로워
          </Text>

          {/* 레벨·경험치·평판 */}
          <View style={[styles.stat, { borderColor: c.border }]} accessibilityLabel={`레벨 ${s.level}, 경험치 ${s.xp} / ${need}`}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <Text style={{ color: c.text, fontWeight: '800', fontSize: font.body, flexShrink: 1 }} numberOfLines={1}>
                Lv.{s.level} · {sc.persona.role}
              </Text>
              <Text style={{ color: c.subtext, fontSize: font.small }}>
                {s.xp.toLocaleString('ko-KR')} / {need.toLocaleString('ko-KR')} XP
              </Text>
            </View>
            <ProgressBar value={s.xp} max={need} />
            <Text style={{ color: c.subtext, fontSize: font.small }}>
              평판 {s.reputation} ({STATUS_LABEL[s.status]}) · 아우라 {s.aura} · 유머 {s.humor} · 게시물 {s.posts}
            </Text>
            <Text style={{ color: c.subtext, fontSize: font.small }} numberOfLines={1}>
              {sc.world.emoji} {sc.world.name} · {formatClock(sc.clock)}
            </Text>
          </View>
        </View>

        <Divider />
        <MenuRow icon={ic(IconUser)} title="내 프로필" onPress={() => nav.navigate('MyProfile')} />
        <MenuRow icon={ic(IconUserPen)} title="프로필 수정" onPress={() => nav.navigate('ProfileEdit')} />
        <MenuRow
          icon={ic(IconBackpack)}
          title="아이템"
          desc={armed ? '🚀 바이럴 모먼트 대기 중 · 다음 행동에 적용' : '선물 · 바이럴 모먼트 · 되돌리기 · 시간 건너뛰기 (무제한)'}
          onPress={() => nav.navigate('Items')}
        />
        <MenuRow icon={ic(IconSliders)} title="스탯 조정" desc="팔로워·아우라·유머·평판·레벨 직접 바꾸기" onPress={() => nav.navigate('StatsEditor')} />
        <MenuRow icon={ic(IconTarget)} title="미션" desc={`진행 중 ${doing} · 받을 보상 ${claimable}`} badge={claimable} onPress={() => nav.navigate('Quests')} />
        <MenuRow icon={ic(IconUsers)} title="공통 캐릭터" desc={rosterText} onPress={() => nav.navigate('Roster')} />
        <MenuRow icon={ic(IconBookmark)} title="북마크" onPress={() => nav.navigate('Bookmarks')} />
        <MenuRow icon={ic(IconScroll)} title="활동 기록" onPress={() => nav.navigate('Activity')} />
        <MenuRow icon={ic(IconUserPlus)} title="캐릭터 만들기" desc="유형·팔로워·특징만 고르면 이름·소개는 AI가" onPress={() => nav.navigate('CharacterEditor')} />

        <Divider thick />
        <MenuRow icon={ic(IconGlobe)} title="세계관 전체 수정" desc="세계관 설정·내 계정·인물(인증 계정부터) 한 화면에서" onPress={() => nav.navigate('WorldEdit')} />
        <MenuRow icon={ic(IconGlobe)} title="세계관·세이브" desc={`${sc.world.emoji} ${sc.world.name} · 세이브 ${saves}개 · 화면 설정`} onPress={() => nav.navigate('Settings')} />
        <MenuRow icon={ic(IconBot)} title="AI 연결" desc={aiText} onPress={() => nav.navigate('AISettings')} />
        <MenuRow icon={sync.status === 'off' || sync.status === 'error' ? ic(IconCloudOff) : ic(IconCloud)} title="DB 동기화" desc={syncText} onPress={() => nav.navigate('SyncSettings')} />

        <Divider thick />
        <View style={styles.block}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <View style={styles.rowIcon}>{ic(IconGauge)}</View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.text, fontSize: font.title, fontWeight: '700' }}>난이도</Text>
              <Text style={{ color: c.subtext, fontSize: font.small, marginTop: 1 }}>{DIFFICULTY_DESC[difficulty]}</Text>
            </View>
          </View>
          <Segmented<Difficulty>
            options={[
              { key: 'easy', label: DIFFICULTY_LABEL.easy },
              { key: 'normal', label: DIFFICULTY_LABEL.normal },
              { key: 'hard', label: DIFFICULTY_LABEL.hard },
            ]}
            value={difficulty}
            onChange={changeDifficulty}
          />
        </View>
        <View style={styles.block}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <View style={styles.rowIcon}>{ic(IconFlame)}</View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.text, fontSize: font.title, fontWeight: '700' }}>연애 수위</Text>
              <Text style={{ color: c.subtext, fontSize: font.small, marginTop: 1 }}>{ROMANCE_DESC[romanceLevel]}</Text>
            </View>
          </View>
          <Segmented<RomanceLevel>
            options={[
              { key: 'mild', label: ROMANCE_LABEL.mild },
              { key: 'racy', label: ROMANCE_LABEL.racy },
              { key: 'erotic', label: ROMANCE_LABEL.erotic },
            ]}
            value={romanceLevel}
            onChange={changeRomanceLevel}
          />
          <Text style={{ color: c.subtext, fontSize: font.tiny, lineHeight: 16, marginTop: 2 }}>
            공개 타임라인은 어느 단계든 암시까지이고, 에로틱 단계의 노골적 묘사는 쪽지에서만 나와요. 공통 캐릭터(실존 인물일 수 있음)·가족·10대 인물은 이 설정과 무관하게 연애 반응이 없어요.
          </Text>
        </View>
        <MenuRow
          icon={ic(IconMoon)}
          title="다크 모드"
          desc={theme === 'system' ? '기기 설정을 따르는 중' : undefined}
          right={
            <Switch
              accessibilityLabel="다크 모드"
              value={dark}
              onValueChange={(on) => setSettings({ theme: on ? 'dark' : 'light' })}
              trackColor={{ true: c.primary, false: c.border }}
            />
          }
        />
        {theme !== 'system' ? (
          <Pressable onPress={() => setSettings({ theme: 'system' })} accessibilityRole="button" accessibilityLabel="기기 설정 따르기" style={({ pressed }) => [styles.link, pressed && { opacity: 0.6 }]}>
            <Text style={{ color: c.primary, fontSize: font.small, fontWeight: '700' }}>기기 설정 따르기</Text>
          </Pressable>
        ) : null}

        <Text style={{ color: c.faint, fontSize: font.small, textAlign: 'center', lineHeight: 18, marginTop: 28 }}>AI-SNS · 앱공부 동아리용 클론</Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: space.lg, paddingBottom: space.md },
  stat: { borderWidth: 1, borderRadius: radius.lg, padding: space.md, gap: 6, marginTop: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: 13 },
  rowIcon: { width: 28, alignItems: 'center' },
  badge: { minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  block: { paddingHorizontal: space.lg, paddingVertical: 13, gap: space.md },
  link: { alignSelf: 'flex-start', marginLeft: space.lg + 28 + space.md, paddingVertical: 4 },
});
