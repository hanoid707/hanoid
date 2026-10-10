/**
 * 공통 캐릭터 — 모든 세계관에 넣을 수 있는 내 계정 목록(내가 직접 입력하거나 붙여 넣은 내용만 쓴다)
 *   ① 이 세계관에서: 켜기 · 끄기 · 골라 넣기(체크한 계정만)
 *   ② 새 이야기 기본값: 새 세계관을 시작할 때 목록 전체를 넣을지
 *   ③ 목록: 사진 · 이름 · @아이디 · 유형 · 팔로워 → 누르면 고치기
 *   ④ 새 계정 추가 · 붙여 넣어 가져오기(스프레드시트 표·JSON)
 * 목록이 바뀌면 applyRosterToActive()로 지금 세계관에 바로 반영한다.
 */
import { useNavigation } from '@react-navigation/native';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Clipboard, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Avatar } from '../../components/Avatar';
import { VerifiedBadge } from '../../components/Badge';
import { IconCheck, IconChevronRight, IconClose, IconCopy, IconImage, IconPlus, IconSearch, IconUserPlus } from '../../components/icons';
import { usePhotoPicker } from '../../components/PhotoCropper';
import { CategoryChip } from '../../components/RelationChip';
import { Screen, TopBar } from '../../components/Screen';
import { Button, Chip, Divider, Field, IconButton, Segmented } from '../../components/ui';
import { applyRosterToActive, setRosterUse } from '../../game/actions';
import { AGE_GROUPS, CORE_TYPES, CROWD_TYPES, FOLLOWER_PRESETS, PERSONALITY_PRESETS, SPEECH_PRESETS, typeDefaults, typeLabel, type MentionCategory } from '../../game/relationship';
import type { RootNav } from '../../navigation/types';
import { getActive, useActive, useGame } from '../../store/game';
import { deleteRosterEntry, importRoster, rosterTemplate, saveRosterEntry, setRosterDefaultMode, useRoster, type ImportResult } from '../../store/roster';
import { font, noOutline, radius, space, useTheme } from '../../theme';
import type { AgeGroup, Avatar as AvatarData, BadgeKind, CharacterType, Gender, ID, PhotoRef, RosterEntry, RosterUse } from '../../types';
import { clamp, formatCount, hashStr, sanitizeHandle } from '../../utils';

// ───────────────────────── 표시 도우미

const ORG_TYPES: CharacterType[] = ['news', 'magazine', 'broadcaster', 'sponsor'];

/** 유형 → 색 분류(멘션 색과 같은 규칙) */
function entryCategory(e: Pick<RosterEntry, 'type' | 'badge'>): MentionCategory {
  if (e.badge === 'gold' || ORG_TYPES.includes(e.type)) return 'business';
  switch (e.type) {
    case 'friend':
    case 'bestie':
    case 'lover':
    case 'spicy':
    case 'family':
      return 'friend';
    case 'celeb':
      return 'celeb';
    case 'fan':
    case 'superfan':
      return 'fan';
    case 'antifan':
      return 'anti';
    case 'public':
      return 'public';
    default:
      return 'industry';
  }
}

const COLORS = ['#F4B4C4', '#B4D8F4', '#C9B4F4', '#B4F4C9', '#F4E1B4', '#F4C9B4', '#B4F0F4', '#D9D9D9'];
const colorFor = (seed: string) => COLORS[hashStr(seed || 'x') % COLORS.length];
const EMOJI_BY_TYPE: Partial<Record<CharacterType, string>> = { celeb: '⭐', fan: '💖', superfan: '💖', antifan: '😈', news: '📰', magazine: '📰', broadcaster: '📺', sponsor: '💼' };
const defaultEmoji = (t: CharacterType) => EMOJI_BY_TYPE[t] ?? '🙂';
const EMOJI_CHOICES = ['⭐', '🙂', '😎', '🎤', '🎬', '📸', '🎮', '⚽', '💼', '🌸', '🐱', '🔥'];

function avatarOf(e: { photo?: PhotoRef; emoji?: string; color?: string; type: CharacterType; name: string }): AvatarData {
  return { emoji: e.emoji || defaultEmoji(e.type), color: e.color || colorFor(e.name), ...(e.photo ?? {}) };
}

/** 배지(지정 안 했으면 유형 기본값: 셀럽·관계 = 파랑, 언론·협찬 = 금색) */
const badgeOf = (e: Pick<RosterEntry, 'type' | 'badge'>): BadgeKind | null => (e.badge === undefined ? typeDefaults(e.type).badge : e.badge);

/** 일반 계정 분류(셀럽 먼저) · 나와의 관계 */
const CROWD_ORDER: CharacterType[] = ['celeb', ...CROWD_TYPES.filter((t) => t !== 'celeb')];

const BADGE_CHOICES: { key: 'auto' | 'none' | BadgeKind; label: string }[] = [
  { key: 'auto', label: '자동' },
  { key: 'none', label: '없음' },
  { key: 'blue', label: '파랑' },
  { key: 'gold', label: '금색' },
  { key: 'gray', label: '회색' },
];

/** 클립보드 복사(웹: 브라우저 클립보드 → 예전 방식, 폰: 기본 클립보드). 막혀 있으면 false */
async function copyText(text: string): Promise<boolean> {
  try {
    if (Platform.OS === 'web') {
      const nav = (globalThis as unknown as { navigator?: { clipboard?: { writeText?: (t: string) => Promise<void> } } }).navigator;
      if (nav?.clipboard?.writeText) {
        try {
          await nav.clipboard.writeText(text);
          return true;
        } catch {
          // 권한이 막힌 페이지면 아래 방법으로
        }
      }
      return (Clipboard.setString(text) as unknown) !== false;
    }
    Clipboard.setString(text);
    return true;
  } catch {
    return false;
  }
}

// ───────────────────────── 입력 양식 상태

interface FormState {
  id?: ID;
  name: string;
  handle: string;
  gender?: Gender;
  ageGroup: AgeGroup;
  type: CharacterType;
  followers: string;
  following: string;
  bio: string;
  traits: string;
  personality?: string;
  speechStyle?: string;
  /** 앨범에서 고른 사진(mediaId) 또는 앱 기본 사진 키 */
  photo?: PhotoRef;
  /** 인터넷 사진 주소 입력칸 */
  photoUrl: string;
  banner?: PhotoRef;
  /** undefined = 자동 */
  badge?: BadgeKind | null;
  emoji: string;
  color?: string;
  memo: string;
}

const blankForm = (): FormState => ({ name: '', handle: '', ageGroup: 20, type: 'celeb', followers: '100000', following: '', bio: '', traits: '', photoUrl: '', emoji: '', memo: '' });

const formOf = (e: RosterEntry): FormState => ({
  id: e.id,
  name: e.name,
  handle: e.handle,
  gender: e.gender,
  ageGroup: e.ageGroup ?? 20,
  type: e.type,
  followers: String(e.followers ?? 0),
  following: e.following !== undefined ? String(e.following) : '',
  bio: e.bio ?? '',
  traits: e.traits ?? '',
  personality: e.personality,
  speechStyle: e.speechStyle,
  photo: e.photo?.mediaId || e.photo?.photo ? { mediaId: e.photo.mediaId, photo: e.photo.photo } : undefined,
  photoUrl: e.photo?.url ?? '',
  banner: e.banner,
  badge: e.badge,
  emoji: e.emoji ?? '',
  color: e.color,
  memo: e.memo ?? '',
});

const digits = (t: string) => t.replace(/[^0-9]/g, '');

// ───────────────────────── 작은 부품

function Label({ children, hint }: { children: ReactNode; hint?: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
      <Text style={{ color: c.text, fontWeight: '800', fontSize: font.body }}>{children}</Text>
      {hint ? (
        <Text style={{ color: c.subtext, fontSize: font.small, flex: 1 }} numberOfLines={1}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

function EntryRow({ e, selectMode, checked, onToggle, onPress }: { e: RosterEntry; selectMode: boolean; checked: boolean; onToggle: () => void; onPress: () => void }) {
  const { c } = useTheme();
  const badge = badgeOf(e);
  return (
    <View style={[styles.entry, { borderBottomColor: c.border, paddingLeft: selectMode ? space.lg : 0 }]}>
      {selectMode ? (
        <Pressable
          onPress={onToggle}
          accessibilityRole="checkbox"
          accessibilityState={{ checked }}
          accessibilityLabel={`${e.name} 이 세계관에 넣기`}
          hitSlop={10}
          style={[styles.check, { borderColor: checked ? c.primary : c.borderStrong, backgroundColor: checked ? c.primary : 'transparent' }]}
        >
          {checked ? <IconCheck size={14} color="#fff" strokeWidth={3} /> : null}
        </Pressable>
      ) : null}
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${e.name} 고치기`}
        style={({ pressed }) => [styles.entryMain, { paddingLeft: selectMode ? space.md : space.lg }, pressed && { backgroundColor: c.hover }]}
      >
        <Avatar avatar={avatarOf(e)} size={44} square={badge === 'gold'} />
        <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ color: c.text, fontWeight: '800', fontSize: font.body, flexShrink: 1 }} numberOfLines={1}>
              {e.name}
            </Text>
            <VerifiedBadge kind={badge} size={15} />
          </View>
          <Text style={{ color: c.subtext, fontSize: font.small }} numberOfLines={1}>
            @{e.handle} · 팔로워 {formatCount(e.followers)}
          </Text>
          {e.traits || e.bio ? (
            <Text style={{ color: c.subtext, fontSize: font.small }} numberOfLines={1}>
              {e.traits || e.bio}
            </Text>
          ) : null}
        </View>
        <CategoryChip cat={entryCategory(e)} label={typeLabel(e.type)} size="sm" />
        <IconChevronRight size={16} color={c.subtext} />
      </Pressable>
    </View>
  );
}

// ───────────────────────── 추가·고치기

function RosterForm({ initial, onClose, onSaved, onDelete }: { initial: FormState; onClose: () => void; onSaved: (id: ID, isNew: boolean) => void; onDelete: (id: ID) => void }) {
  const { c } = useTheme();
  const showToast = useGame((s) => s.showToast);
  const entries = useRoster((s) => s.entries);
  const picker = usePhotoPicker();
  const [f, setF] = useState<FormState>(initial);
  const [more, setMore] = useState(!!(initial.personality || initial.speechStyle || initial.memo || initial.badge !== undefined || initial.following));
  const [confirmDel, setConfirmDel] = useState(false);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (!confirmDel) return;
    const t = setTimeout(() => setConfirmDel(false), 3000);
    return () => clearTimeout(t);
  }, [confirmDel]);

  const url = f.photoUrl.trim();
  const preview: PhotoRef | undefined = f.photo?.mediaId ? { mediaId: f.photo.mediaId } : url ? { url } : f.photo?.photo ? { photo: f.photo.photo } : undefined;
  const followersN = clamp(parseInt(digits(f.followers), 10) || 0, 0, 1_000_000_000);

  const pickPhoto = async () => {
    const id = await picker.pick('avatar');
    if (id) setF((p) => ({ ...p, photo: { mediaId: id }, photoUrl: '' }));
  };

  const save = () => {
    const name = f.name.trim();
    if (!name) {
      showToast('이름을 입력해 주세요', 'error');
      return;
    }
    const handle = sanitizeHandle(f.handle) || `user_${(hashStr(name) % 46_656 ** 2).toString(36)}`;
    const dup = Object.values(entries).find((e) => e.handle === handle && e.id !== f.id);
    if (dup) {
      showToast(`@${handle} 아이디는 이미 목록에 있어요(${dup.name})`, 'error');
      return;
    }
    if (url && !/^https?:\/\/\S+$/i.test(url)) {
      showToast('사진 주소는 http:// 또는 https://로 시작해야 해요', 'error');
      return;
    }
    const followingN = parseInt(digits(f.following), 10);
    const id = saveRosterEntry({
      id: f.id,
      name,
      handle,
      gender: f.gender,
      ageGroup: f.ageGroup,
      type: f.type,
      followers: followersN,
      following: Number.isFinite(followingN) ? followingN : undefined,
      bio: f.bio.trim(),
      traits: f.traits.trim(),
      personality: f.personality,
      speechStyle: f.speechStyle,
      photo: preview,
      banner: f.banner,
      badge: f.badge,
      emoji: f.emoji || undefined,
      color: f.color ?? colorFor(name),
      memo: f.memo.trim() || undefined,
    });
    onSaved(id, !f.id);
  };

  const remove = () => {
    if (!f.id) return;
    if (!confirmDel) {
      setConfirmDel(true);
      return;
    }
    onDelete(f.id);
  };

  const badgeKey: (typeof BADGE_CHOICES)[number]['key'] = f.badge === undefined ? 'auto' : f.badge === null ? 'none' : f.badge;

  return (
    <Screen>
      <TopBar
        title={f.id ? '공통 캐릭터 고치기' : '공통 캐릭터 추가'}
        subtitle="모든 세계관에서 쓰는 계정"
        left={
          <IconButton label="닫기" onPress={onClose}>
            <IconClose size={22} color={c.text} />
          </IconButton>
        }
        right={<Button title="저장" size="sm" variant="ink" disabled={!f.name.trim()} onPress={save} />}
      />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 64 }} keyboardShouldPersistTaps="handled">
        {/* 사진 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
          <Avatar avatar={avatarOf({ ...f, name: f.name || 'x', photo: preview })} size={72} square={badgeOf(f) === 'gold'} />
          <View style={{ flex: 1, gap: 8 }}>
            <Button title="앨범에서 고르기" size="sm" variant="outline" icon={<IconImage size={15} color={c.text} />} onPress={() => void pickPhoto()} style={{ alignSelf: 'flex-start' }} />
            {preview ? <Button title="사진 지우기" size="sm" variant="ghost" onPress={() => setF((p) => ({ ...p, photo: undefined, photoUrl: '' }))} style={{ alignSelf: 'flex-start' }} /> : null}
          </View>
        </View>
        <Field
          label="사진 주소(URL)"
          value={f.photoUrl}
          onChangeText={(t) => setF((p) => ({ ...p, photoUrl: t, photo: t.trim() ? undefined : p.photo }))}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="https://…"
          hint="인터넷 이미지 주소도 돼요(폰·PC 앱에서 보여요. 못 불러오면 이모지로 보여요)"
        />
        {!preview ? (
          <View style={{ gap: 6 }}>
            <Label hint="사진이 없을 때">이모지</Label>
            <View style={styles.wrap}>
              {EMOJI_CHOICES.map((e) => (
                <Chip key={e} label={e} small selected={(f.emoji || defaultEmoji(f.type)) === e} accessibilityLabel={`이모지 ${e}`} onPress={() => set('emoji', e)} />
              ))}
            </View>
          </View>
        ) : null}

        <Field label="이름" value={f.name} onChangeText={(t) => set('name', t)} maxLength={30} placeholder="(표시 이름)" />
        <Field
          label="아이디"
          value={f.handle}
          onChangeText={(t) => set('handle', sanitizeHandle(t))}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="영문 소문자·숫자·밑줄"
          hint="@ 없이 15자까지 · 비우면 자동으로 만들어요"
        />

        <Label>성별</Label>
        <View style={styles.wrap}>
          {(
            [
              ['f', '여'],
              ['m', '남'],
            ] as const
          ).map(([g, l]) => (
            <Chip key={g} label={l} small selected={f.gender === g} accessibilityLabel={`성별 ${l}`} onPress={() => set('gender', f.gender === g ? undefined : g)} />
          ))}
        </View>

        <Label>나이대</Label>
        <View style={styles.wrap}>
          {AGE_GROUPS.map((a) => (
            <Chip key={a} label={`${a}대`} small selected={f.ageGroup === a} onPress={() => set('ageGroup', a)} />
          ))}
        </View>

        <Label hint="기본 셀럽">유형</Label>
        <Text style={{ color: c.subtext, fontSize: font.small }}>일반 계정</Text>
        <View style={styles.wrap}>
          {CROWD_ORDER.map((t) => (
            <Chip key={t} label={typeLabel(t)} small selected={f.type === t} accessibilityLabel={`유형 ${typeLabel(t)}`} onPress={() => set('type', t)} />
          ))}
        </View>
        <Text style={{ color: c.subtext, fontSize: font.small }}>나와의 관계(인증 캐릭터)</Text>
        <View style={styles.wrap}>
          {CORE_TYPES.map((t) => (
            <Chip key={t} label={typeLabel(t)} small selected={f.type === t} accessibilityLabel={`유형 ${typeLabel(t)}`} onPress={() => set('type', t)} />
          ))}
        </View>

        <Label hint={`= ${formatCount(followersN)}명`}>팔로워</Label>
        <View style={styles.wrap}>
          {FOLLOWER_PRESETS.map((n) => (
            <Chip key={n} label={formatCount(n)} small selected={followersN === n} accessibilityLabel={`팔로워 ${formatCount(n)}`} onPress={() => set('followers', String(n))} />
          ))}
        </View>
        <Field label="팔로워 직접 입력" value={f.followers} onChangeText={(t) => set('followers', digits(t))} keyboardType="number-pad" maxLength={10} />

        <Field label="자기소개" value={f.bio} onChangeText={(t) => set('bio', t)} multiline maxLength={160} counter placeholder="(프로필에 보이는 한 줄 소개)" />
        <Field
          label="특징"
          value={f.traits}
          onChangeText={(t) => set('traits', t)}
          multiline
          numberOfLines={8}
          style={{ minHeight: 180 }}
          maxLength={400}
          counter
          placeholder="(핵심 특징 1~2문장: 정체·성격·나와의 관계)"
          hint="AI가 이 계정을 연기할 때 가장 먼저 읽어요"
        />

        <Pressable onPress={() => setMore((v) => !v)} accessibilityRole="button" accessibilityLabel="더 설정하기" accessibilityState={{ expanded: more }} style={styles.moreBtn}>
          <Text style={{ color: c.primary, fontWeight: '700', fontSize: font.body }}>{more ? '간단히 보기 ▴' : '더 설정하기 ▾'}</Text>
        </Pressable>
        {more ? (
          <View style={{ gap: space.md }}>
            <Label hint="선택">성격 유형</Label>
            <View style={styles.wrap}>
              {PERSONALITY_PRESETS.map((p) => (
                <Chip key={p.id} label={p.label} small selected={f.personality === p.id} accessibilityLabel={`성격 ${p.label}: ${p.desc}`} onPress={() => set('personality', f.personality === p.id ? undefined : p.id)} />
              ))}
            </View>
            {f.personality ? <Text style={{ color: c.subtext, fontSize: font.small }}>{PERSONALITY_PRESETS.find((p) => p.id === f.personality)?.desc}</Text> : null}
            <Label hint="선택">말투</Label>
            <View style={styles.wrap}>
              {SPEECH_PRESETS.map((p) => (
                <Chip key={p.id} label={p.label} small selected={f.speechStyle === p.id} accessibilityLabel={`말투 ${p.label}: ${p.desc}`} onPress={() => set('speechStyle', f.speechStyle === p.id ? undefined : p.id)} />
              ))}
            </View>
            {f.speechStyle ? <Text style={{ color: c.subtext, fontSize: font.small }}>{SPEECH_PRESETS.find((p) => p.id === f.speechStyle)?.desc}</Text> : null}
            <Label hint="자동 = 유형에 맞게">인증 배지</Label>
            <View style={styles.wrap}>
              {BADGE_CHOICES.map((b) => (
                <Chip
                  key={b.key}
                  label={b.label}
                  small
                  selected={badgeKey === b.key}
                  accessibilityLabel={`배지 ${b.label}`}
                  onPress={() => set('badge', b.key === 'auto' ? undefined : b.key === 'none' ? null : b.key)}
                />
              ))}
            </View>
            <Field label="팔로잉" value={f.following} onChangeText={(t) => set('following', digits(t))} keyboardType="number-pad" maxLength={9} placeholder="(비우면 자동)" />
            <Field label="메모" value={f.memo} onChangeText={(t) => set('memo', t)} multiline maxLength={200} placeholder="(분류·출처 등 — AI에는 안 넘겨요)" />
          </View>
        ) : null}

        {f.id ? (
          <Button title={confirmDel ? '정말 지울까요?' : '이 계정 지우기'} variant="danger" onPress={remove} style={{ alignSelf: 'flex-start', marginTop: space.md }} />
        ) : null}
      </ScrollView>
      {picker.modal}
    </Screen>
  );
}

// ───────────────────────── 붙여 넣어 가져오기

function RosterImport({ onClose, onImported }: { onClose: () => void; onImported: (r: ImportResult) => void }) {
  const { c } = useTheme();
  const showToast = useGame((s) => s.showToast);
  const [text, setText] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [showTpl, setShowTpl] = useState(false);
  const tpl = useMemo(() => rosterTemplate(), []);

  const copy = async () => {
    setShowTpl(true);
    const ok = await copyText(tpl);
    showToast(ok ? '양식을 복사했어요 — 스프레드시트에 붙여 넣어 채워 보세요' : '복사가 막혀 있어요. 아래 양식을 직접 복사해 주세요', ok ? 'success' : 'info');
  };

  const run = () => {
    if (!text.trim()) return;
    const r = importRoster(text);
    setResult(r);
    if (r.added || r.updated) {
      onImported(r);
      if (!r.errors.length) setText('');
    }
  };

  return (
    <Screen>
      <TopBar
        title="붙여 넣어 가져오기"
        subtitle="스프레드시트 표 · JSON"
        left={
          <IconButton label="닫기" onPress={onClose}>
            <IconClose size={22} color={c.text} />
          </IconButton>
        }
      />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 64 }} keyboardShouldPersistTaps="handled">
        <Text style={{ color: c.text, fontSize: font.body, lineHeight: 22 }}>
          구글 시트·엑셀에서 <Text style={{ fontWeight: '800' }}>머리글(첫 줄)까지</Text> 복사해 붙여 넣거나 JSON 배열을 넣으세요. 같은 아이디는 새 내용으로 바뀌어요.
        </Text>
        <Text style={{ color: c.subtext, fontSize: font.small, lineHeight: 19 }}>
          머리글: 이름 · 아이디 · 성별(남/여) · 나이대 · 유형(셀럽·팬·친구…) · 팔로워(1.2만, 3,400) · 자기소개 · 특징 · 사진주소 — 영어 머리글(name, handle…)도 돼요.
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Button title="양식 복사" size="sm" variant="outline" icon={<IconCopy size={15} color={c.text} />} onPress={() => void copy()} />
          <Button title="입력칸에 양식 넣기" size="sm" variant="ghost" onPress={() => setText(tpl)} />
        </View>
        {showTpl ? (
          <View style={[styles.tpl, { borderColor: c.border, backgroundColor: c.surfaceAlt }]}>
            <Text selectable style={{ color: c.text, fontSize: font.small, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>
              {tpl}
            </Text>
          </View>
        ) : null}
        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          placeholder={'이름\t아이디\t성별\t나이대\t유형\t팔로워\t…\n(여기에 붙여 넣기)'}
          placeholderTextColor={c.faint}
          accessibilityLabel="붙여 넣을 내용"
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.paste, noOutline, { borderColor: c.borderStrong, color: c.text }]}
        />
        <Button title="가져오기" disabled={!text.trim()} onPress={run} full />
        {result ? (
          <View style={[styles.result, { borderColor: result.errors.length ? c.warning : c.repost }]} accessibilityLiveRegion="polite">
            <Text style={{ color: c.text, fontWeight: '800', fontSize: font.body }}>
              추가 {result.added} · 수정 {result.updated}
              {result.errors.length ? ` · 오류 ${result.errors.length}` : ''}
            </Text>
            {result.errors.slice(0, 8).map((e, i) => (
              <Text key={i} style={{ color: c.warning, fontSize: font.small, lineHeight: 18 }}>
                · {e}
              </Text>
            ))}
            {result.errors.length > 8 ? <Text style={{ color: c.subtext, fontSize: font.small }}>…외 {result.errors.length - 8}개</Text> : null}
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

// ───────────────────────── 목록(기본 화면)

type View_ = { kind: 'list' } | { kind: 'form'; form: FormState } | { kind: 'import' };

export function RosterScreen() {
  const { c } = useTheme();
  const nav = useNavigation<RootNav>();
  const sc = useActive();
  const entries = useRoster((s) => s.entries);
  const defaultMode = useRoster((s) => s.defaultMode);
  const showToast = useGame((s) => s.showToast);
  const [view, setView] = useState<View_>({ kind: 'list' });
  const [q, setQ] = useState('');

  // 고치기·가져오기 화면이 열려 있으면 '뒤로'(안드로이드 뒤로 키 포함)는 목록으로
  const sub = view.kind !== 'list';
  useEffect(() => {
    nav.setOptions({ gestureEnabled: !sub });
    if (!sub) return;
    return nav.addListener('beforeRemove', (e) => {
      e.preventDefault();
      setView({ kind: 'list' });
    });
  }, [nav, sub]);

  const list = useMemo(() => Object.values(entries).sort((a, b) => a.name.localeCompare(b.name, 'ko')), [entries]);
  const k = q.trim().toLowerCase().replace(/^@/, '');
  const shown = k ? list.filter((e) => e.name.toLowerCase().includes(k) || e.handle.toLowerCase().includes(k) || (e.memo ?? '').toLowerCase().includes(k)) : list;
  const use: RosterUse = sc?.roster ?? { mode: 'off', ids: [] };
  const picked = new Set(use.ids);
  const inWorld = use.mode === 'on' ? list.length : use.mode === 'select' ? list.filter((e) => picked.has(e.id)).length : 0;

  const changeMode = (mode: RosterUse['mode']) => {
    if (!sc || mode === use.mode) return;
    if (mode === 'select') setRosterUse('select', use.mode === 'on' ? list.map((e) => e.id) : use.ids.filter((id) => entries[id]));
    else setRosterUse(mode);
    showToast(mode === 'on' ? '이 세계관에 공통 캐릭터를 모두 넣었어요' : mode === 'off' ? '이 세계관에서 공통 캐릭터를 뺐어요(지난 글은 남아요)' : '체크한 계정만 이 세계관에 나와요');
  };
  const toggle = (id: ID) => {
    const next = new Set(use.ids);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setRosterUse('select', [...next]);
  };

  const onSaved = (id: ID, isNew: boolean) => {
    const cur = getActive()?.roster;
    if (isNew && id && cur?.mode === 'select' && !cur.ids.includes(id)) setRosterUse('select', [...cur.ids, id]);
    applyRosterToActive();
    showToast(isNew ? '공통 캐릭터를 추가했어요' : '공통 캐릭터를 고쳤어요');
    setView({ kind: 'list' });
  };
  const onDelete = (id: ID) => {
    deleteRosterEntry(id);
    const cur = getActive()?.roster;
    if (cur?.mode === 'select' && cur.ids.includes(id)) setRosterUse('select', cur.ids.filter((x) => x !== id));
    applyRosterToActive();
    showToast('공통 캐릭터를 지웠어요(이미 올라간 글은 남아요)');
    setView({ kind: 'list' });
  };
  const onImported = (r: ImportResult) => {
    applyRosterToActive();
    showToast(`가져왔어요: 추가 ${r.added} · 수정 ${r.updated}${r.errors.length ? ` · 오류 ${r.errors.length}` : ''}`, r.errors.length ? 'info' : 'success');
  };

  if (view.kind === 'form') return <RosterForm key={view.form.id ?? 'new'} initial={view.form} onClose={() => setView({ kind: 'list' })} onSaved={onSaved} onDelete={onDelete} />;
  if (view.kind === 'import') return <RosterImport onClose={() => setView({ kind: 'list' })} onImported={onImported} />;

  const modeDesc =
    use.mode === 'on'
      ? `목록 전체(${list.length}명)가 이 세계관에 나와요`
      : use.mode === 'select'
        ? `체크한 계정만 나와요 · ${inWorld}명`
        : '이 세계관에는 나오지 않아요(켰다 끄면 지난 글은 남아요)';

  return (
    <Screen>
      <TopBar
        title="공통 캐릭터"
        subtitle="모든 세계관에 넣을 수 있는 내 계정 목록"
        right={
          <IconButton label="공통 캐릭터 추가" onPress={() => setView({ kind: 'form', form: blankForm() })}>
            <IconPlus size={22} color={c.text} />
          </IconButton>
        }
      />
      <ScrollView contentContainerStyle={{ paddingBottom: 64 }} keyboardShouldPersistTaps="handled">
        {sc ? (
          <View style={styles.section}>
            <Text style={{ color: c.text, fontSize: font.title, fontWeight: '800' }} accessibilityRole="header">
              이 세계관에서
            </Text>
            <Text style={{ color: c.subtext, fontSize: font.small }} numberOfLines={1}>
              {sc.world.emoji} {sc.world.name}
            </Text>
            <Segmented<RosterUse['mode']>
              options={[
                { key: 'on', label: '켜기' },
                { key: 'off', label: '끄기' },
                { key: 'select', label: '골라 넣기' },
              ]}
              value={use.mode}
              onChange={changeMode}
            />
            <Text style={{ color: c.subtext, fontSize: font.small, lineHeight: 18 }}>{modeDesc}</Text>
          </View>
        ) : null}
        <Divider />
        <View style={[styles.section, { flexDirection: 'row', alignItems: 'center', gap: space.md }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.text, fontSize: font.body, fontWeight: '700' }}>새 이야기 기본값</Text>
            <Text style={{ color: c.subtext, fontSize: font.small, lineHeight: 18 }}>
              {defaultMode === 'on' ? '새 세계관을 시작하면 목록 전체를 넣어요' : '새 세계관에는 넣지 않아요(세계관마다 켤 수 있어요)'}
            </Text>
          </View>
          <Switch
            accessibilityLabel="새 이야기에 기본으로 넣기"
            value={defaultMode === 'on'}
            onValueChange={(on) => setRosterDefaultMode(on ? 'on' : 'off')}
            trackColor={{ true: c.primary, false: c.border }}
          />
        </View>
        <Divider thick />

        <View style={[styles.section, { flexDirection: 'row', gap: 8, flexWrap: 'wrap' }]}>
          <Button title="새 계정 추가" size="sm" variant="ink" icon={<IconUserPlus size={15} color={c.onInk} />} onPress={() => setView({ kind: 'form', form: blankForm() })} />
          <Button title="붙여 넣어 가져오기" size="sm" variant="outline" icon={<IconCopy size={15} color={c.text} />} onPress={() => setView({ kind: 'import' })} />
        </View>

        {list.length > 6 ? (
          <View style={[styles.search, { backgroundColor: c.surfaceAlt }]}>
            <IconSearch size={16} color={c.subtext} />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="이름·아이디·메모 검색"
              placeholderTextColor={c.subtext}
              accessibilityLabel="공통 캐릭터 검색"
              autoCapitalize="none"
              style={[{ flex: 1, color: c.text, fontSize: font.body, paddingVertical: 8 }, noOutline]}
            />
          </View>
        ) : null}

        <Text style={{ color: c.subtext, fontSize: font.small, paddingHorizontal: space.lg, paddingVertical: 6 }}>
          목록 {list.length}명{sc ? ` · 이 세계관에 ${inWorld}명` : ''}
        </Text>
        {shown.length ? (
          shown.map((e) => (
            <EntryRow key={e.id} e={e} selectMode={!!sc && use.mode === 'select'} checked={picked.has(e.id)} onToggle={() => toggle(e.id)} onPress={() => setView({ kind: 'form', form: formOf(e) })} />
          ))
        ) : list.length ? (
          <Text style={{ color: c.subtext, fontSize: font.body, paddingHorizontal: space.lg, paddingVertical: space.lg }}>"{q}"에 맞는 계정이 없어요</Text>
        ) : (
          <View style={{ paddingHorizontal: space.xl, paddingVertical: space.xxl, gap: 8 }}>
            <Text style={{ color: c.text, fontSize: font.h2, fontWeight: '800' }}>아직 등록한 계정이 없어요</Text>
            <Text style={{ color: c.subtext, fontSize: font.body, lineHeight: 21 }}>새 계정을 직접 추가하거나, 스프레드시트 표를 붙여 넣어 한 번에 가져오세요. 여기 넣은 계정은 어느 세계관에서든 켜고 끌 수 있어요.</Text>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: space.lg, paddingVertical: space.md, gap: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  entry: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  entryMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingRight: space.lg },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.pill, paddingHorizontal: 14, height: 38, marginHorizontal: space.lg, marginBottom: 4 },
  moreBtn: { alignSelf: 'flex-start', paddingVertical: 6 },
  tpl: { borderWidth: 1, borderRadius: radius.sm, padding: space.md },
  paste: { borderWidth: 1, borderRadius: radius.sm, minHeight: 160, padding: space.md, fontSize: font.small, textAlignVertical: 'top' },
  result: { borderWidth: 1, borderRadius: radius.md, padding: space.md, gap: 4 },
});
