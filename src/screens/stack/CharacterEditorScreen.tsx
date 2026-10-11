/**
 * 캐릭터 만들기·고치기
 *   만들기: 사진 프리셋(맨 위) · 유형 · 팔로워(누르거나 직접 입력) · 나이대 · 상세 특징만 쓰면 끝 → 이름·아이디는 AI가 짓는다(작은 호출 1번)
 *           성별 칸은 없다 — 고른 사진의 성별을 따른다(직접 올린 사진일 때만 성별 칸이 나온다). 나이대 기본은 20대
 *           성격 유형(16)·말투는 드롭다운에서 고르고 싶을 때만. 나머지(이름·사진·배지·관계 메모·말투/관계 고정)는 "더 설정하기" 안에
 *   고치기: 같은 칸 + 이름·아이디 · 지금 관계·말투 · 관계 수치 · 다른 인물을 향한 사랑(슬라이더)·사랑에 관심 없음 · 삭제
 *   한줄소개(자기소개) 칸은 없다 — 프로필에는 AI가 쓰는 짧은 속마음만 보인다(여성 + 호감도가 세계관 설정의 기준 이상일 때)
 * 위치 칸은 없앴다. 관계·말투는 호감도·설렘으로 자동으로 바뀌고, 원하면 고정할 수 있다.
 */
import { splitAvoid } from '../../game/avoid';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Avatar } from '../../components/Avatar';
import { FacePicker } from '../../components/FacePicker';
import { VerifiedBadge } from '../../components/Badge';
import { Dropdown } from '../../components/Dropdown';
import { IconCamera, IconChevronRight, IconTrash } from '../../components/icons';
import { Photo } from '../../components/Photo';
import { usePhotoPicker } from '../../components/PhotoCropper';
import { RelationChip } from '../../components/RelationChip';
import { StatSlider } from '../../components/StatSlider';
import { Screen, TopBar } from '../../components/Screen';
import { Button, Chip, Field, FormLabel, MeterBar } from '../../components/ui';
import { AVATAR_COLORS, AVATAR_EMOJIS } from '../../data/avatars';
import { faceGender, usedFaceKeys } from '../../data/facePool';
import { createQuickCharacter, deleteCharacter, saveCharacter } from '../../game/actions';
import { lovable, lovables, loveOf } from '../../game/love';
import {
  AGE_GROUPS,
  CORE_TYPES,
  CROWD_TYPES,
  FOLLOWER_PRESETS,
  PERSONALITY_PRESETS,
  REGISTER_LABEL,
  registerOf,
  SPEECH_PRESETS,
  typeDefaults,
  typeLabel,
} from '../../game/relationship';
import { CHARACTER_CAP } from '../../game/rules';
import type { RootNav, RootStackParamList } from '../../navigation/types';
import { getActive, useActive, useGame } from '../../store/game';
import { font, radius, space, useTheme } from '../../theme';
import type { AgeGroup, BadgeKind, Character, CharacterType, Gender, PhotoRef, SpeechRegister } from '../../types';
import { formatCount, sanitizeHandle } from '../../utils';

type BadgeChoice = BadgeKind | 'none' | 'auto';
const BADGES: { key: BadgeChoice; label: string }[] = [
  { key: 'auto', label: '자동' },
  { key: 'none', label: '없음' },
  { key: 'blue', label: '파랑(개인)' },
  { key: 'gold', label: '금색(단체)' },
  { key: 'gray', label: '회색(기관)' },
];
const REGISTERS: { key: SpeechRegister | 'auto'; label: string }[] = [
  { key: 'auto', label: '자동' },
  { key: 'banmal', label: REGISTER_LABEL.banmal },
  { key: 'haeyo', label: REGISTER_LABEL.haeyo },
  { key: 'formal', label: REGISTER_LABEL.formal },
];
/** 자주 쓰는 특징(누르면 상세 특징에 붙는다) */
const TRAIT_PRESETS = ['말수 적음', '드립 장인', '츤데레', '다정다감', '승부욕 강함', '허세 있음', '눈치 빠름', '걱정 많음', '팩폭러', '새벽 감성', '먹방 좋아함', '운동 마니아', '게임 덕후', '패션 감각 좋음', '커피 중독', '집순이·집돌이'];

const PERSONALITY_OPTIONS = PERSONALITY_PRESETS.map((p) => ({ id: p.id, label: p.label, desc: p.desc }));
const SPEECH_OPTIONS = SPEECH_PRESETS.map((p) => ({ id: p.id, label: p.label, desc: p.desc }));

/** 지금 캐릭터의 유형(관계 또는 분류) */
function typeOf(ch: Character): CharacterType {
  if (ch.tier !== 'crowd' && !ch.isNews && ch.relation) return ch.relation;
  return ch.crowdRole ?? (ch.isNews ? 'news' : ch.tier === 'crowd' ? 'public' : 'acquaintance');
}

const badgeOf = (ch: Character): BadgeKind | null => (ch.badge === undefined ? (ch.isNews ? 'gold' : ch.verified ? 'blue' : null) : ch.badge);

export function CharacterEditorScreen() {
  const { c } = useTheme();
  const nav = useNavigation<RootNav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'CharacterEditor'>>();
  const sc = useActive();
  const showToast = useGame((s) => s.showToast);
  const picker = usePhotoPicker();
  const editing = params?.characterId ? sc?.characters[params.characterId] : undefined;
  const isEdit = !!editing;
  const initType = editing ? typeOf(editing) : 'friend';

  const [type, setType] = useState<CharacterType>(initType);
  const [followers, setFollowers] = useState(String(editing?.followers ?? 1000));
  // 성별은 사진을 따른다(사진 프리셋을 고르면 그 얼굴의 성별). 나이대는 기본 20대 — 원래 나이대가 없던 인물은 직접 눌렀을 때만 저장한다(설명 속 나이와 어긋나지 않게)
  const [gender, setGender] = useState<Gender | undefined>(editing ? (editing.gender ?? faceGender(editing.avatar.photo)) : undefined);
  const [ageGroup, setAgeGroup] = useState<AgeGroup>(editing?.ageGroup ?? 20);
  const [ageTouched, setAgeTouched] = useState(false);
  const [traits, setTraits] = useState(editing?.description ?? '');
  const [personality, setPersonality] = useState<string | undefined>(editing?.personality);
  const [speechStyle, setSpeechStyle] = useState<string | undefined>(editing?.speechStyle);
  const [more, setMore] = useState(false);
  const [name, setName] = useState(editing?.name ?? '');
  const [handle, setHandle] = useState(editing?.handle ?? '');
  const [emoji, setEmoji] = useState(editing?.avatar.emoji ?? '🙂');
  const [color, setColor] = useState(editing?.avatar.color ?? AVATAR_COLORS[1]);
  const [photo, setPhoto] = useState<PhotoRef>(editing ? { photo: editing.avatar.photo, mediaId: editing.avatar.mediaId, url: editing.avatar.url } : {});
  const [banner, setBanner] = useState<PhotoRef | undefined>(editing?.banner);
  const [badge, setBadge] = useState<BadgeChoice>(editing ? (badgeOf(editing) ?? 'none') : 'auto');
  const [relations, setRelations] = useState(editing?.relations ?? '');
  const [avoidText, setAvoidText] = useState((editing?.avoid ?? []).join(', '));
  const [rankTitle, setRankTitle] = useState(editing?.title ?? '');
  const [ageText, setAgeText] = useState(editing?.age ? String(editing.age) : '');
  const [register, setRegister] = useState<SpeechRegister | 'auto'>(editing?.registerOverride ?? 'auto');
  const [relationLocked, setRelationLocked] = useState(!!editing?.relationLocked);
  const [followsMe, setFollowsMe] = useState(editing?.followsMe ?? true);
  const [aff, setAff] = useState(editing?.affinity ?? 0);
  const [rom, setRom] = useState(editing?.romance ?? 0);
  const [dev, setDev] = useState(editing?.devotion ?? 0);
  const [saving, setSaving] = useState(false);
  // 다른 인물을 향한 사랑(상대 ID → 수치) · 사랑에 관심 없음
  const [loves, setLoves] = useState<Record<string, number>>(() => ({ ...(editing?.loves ?? {}) }));
  const [loveOff, setLoveOff] = useState(!!editing?.loveOff);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // 이 세계에서 다른 인물이 이미 쓰는 기본 사진(프리셋에서 뺀다)
  const usedFaces = useMemo(() => usedFaceKeys(Object.values(sc?.characters ?? {}).filter((ch) => ch.id !== editing?.id)), [sc?.characters, editing?.id]);

  if (!sc) return null;

  const clean = sanitizeHandle(handle);
  const handleTaken = !!clean && sc.cast.some((id) => id !== editing?.id && sc.characters[id]?.handle === clean);
  const followersNum = Math.max(0, Math.min(1_000_000_000, Number(followers.replace(/[^0-9]/g, '')) || 0));
  const valid = isEdit ? name.trim().length >= 1 && clean.length >= 3 && !handleTaken : traits.trim().length >= 2 && (!clean || (clean.length >= 3 && !handleTaken));
  const hasPhoto = !!(photo.mediaId || photo.photo || photo.url);
  const previewAvatar = { emoji, color, ...photo };
  const badgeValue: BadgeKind | null | undefined = badge === 'auto' ? undefined : badge === 'none' ? null : badge;
  const shownBadge = badgeValue === undefined ? typeDefaults(type).badge : badgeValue;
  // 마음을 주고받는 인물(이야기의 중심 인물)만 사랑 스탯을 가진다
  const canLove = !!editing && lovable(editing);

  const addTrait = (t: string) => {
    if (traits.includes(t)) return;
    const base = traits.trim();
    setTraits(base ? `${base.replace(/[.,·\s]+$/, '')}, ${t}` : t);
  };

  const create = async () => {
    if (!valid || saving) return;
    if (sc.cast.length >= CHARACTER_CAP) {
      showToast(`캐릭터는 최대 ${CHARACTER_CAP}명까지 만들 수 있어요`, 'error');
      return;
    }
    setSaving(true);
    try {
      const id = await createQuickCharacter({
        type,
        // 사진을 안 골랐으면 성별도 자동(그 성별에 맞는 얼굴이 자동으로 붙는다)
        gender: gender ?? (Math.random() < 0.5 ? 'f' : 'm'),
        ageGroup,
        followers: followersNum,
        traits: traits.trim(),
        personality,
        speechStyle,
        name: name.trim() || undefined,
        handle: clean || undefined,
        photo: hasPhoto ? photo : undefined,
        banner,
        badge: badgeValue,
        relations: relations.trim() || undefined,
        avoid: splitAvoid(avoidText).slice(0, 12),
        title: rankTitle.trim() || undefined,
        age: Number(ageText) || undefined,
        registerOverride: register === 'auto' ? null : register,
        relationLocked,
      });
      if (!id) {
        showToast('캐릭터를 만들지 못했어요. 잠시 뒤 다시 해 주세요', 'error');
        return;
      }
      const made = getActive()?.characters[id];
      showToast(`${made?.name ?? '새 캐릭터'} 등장!`, 'success');
      nav.replace('CharacterProfile', { characterId: id });
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = () => {
    if (!editing || !valid) return;
    const typeChanged = type !== initType;
    const r = saveCharacter(
      {
        name: name.trim(),
        handle,
        emoji,
        color,
        archetype: typeChanged ? typeDefaults(type).archetype : editing.archetype,
        // 한줄소개는 더 입력받지 않는다(프로필에는 속마음만 보인다) — 저장된 값은 그대로 둔다
        bio: editing.bio,
        description: traits.trim() || editing.description,
        relations: relations.trim(),
        badge: badgeValue === undefined ? badgeOf(editing) : badgeValue,
        followers: followersNum,
        followsMe,
        avatar: photo,
        banner,
        type: typeChanged ? type : undefined,
        gender,
        ageGroup: editing.ageGroup || ageTouched ? ageGroup : undefined,
        personality,
        speechStyle,
        avoid: splitAvoid(avoidText).slice(0, 12),
        title: rankTitle,
        age: Number(ageText) || 0,
        registerOverride: register === 'auto' ? null : register,
        relationLocked,
        stats:
          aff !== editing.affinity || rom !== (editing.romance ?? 0) || dev !== (editing.devotion ?? 0)
            ? { affinity: aff, romance: rom, devotion: dev }
            : undefined,
        ...(canLove ? { loves, loveOff } : {}),
      },
      editing.id,
    );
    if (r.ok) {
      showToast('캐릭터 설정을 저장했어요', 'success');
      nav.goBack();
    } else showToast('저장하지 못했어요', 'error');
  };

  const save = () => (isEdit ? saveEdit() : void create());

  const remove = () => {
    if (!editing) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    deleteCharacter(editing.id);
    showToast(`${editing.name}을(를) 삭제했어요`);
    nav.goBack();
    nav.goBack();
  };

  const pickAvatar = async () => {
    const id = await picker.pick('avatar');
    if (id) setPhoto({ mediaId: id });
  };
  const pickBanner = async () => {
    const id = await picker.pick('banner');
    if (id) setBanner({ mediaId: id });
  };

  // ── 부품
  const typeChips = (
    <View style={{ gap: 10 }}>
      <FormLabel hint={isEdit ? '바꾸면 관계·말투가 바로 다시 정해져요' : '나와의 관계 또는 계정 분류'}>유형</FormLabel>
      <Text style={[styles.sub, { color: c.subtext }]}>인증 캐릭터 · 나와의 관계</Text>
      <View style={styles.wrap}>
        {CORE_TYPES.map((t) => (
          <Chip key={t} small label={typeLabel(t)} selected={type === t} onPress={() => setType(t)} accessibilityLabel={`유형 ${typeLabel(t)}`} />
        ))}
      </View>
      <Text style={[styles.sub, { color: c.subtext }]}>일반 계정 · 분류</Text>
      <View style={styles.wrap}>
        {CROWD_TYPES.map((t) => (
          <Chip key={t} small label={typeLabel(t)} selected={type === t} onPress={() => setType(t)} accessibilityLabel={`유형 ${typeLabel(t)}`} />
        ))}
      </View>
    </View>
  );

  const followerBox = (
    <View style={{ gap: 8 }}>
      <FormLabel hint={`${formatCount(followersNum)}명`}>팔로워</FormLabel>
      <View style={styles.wrap}>
        {FOLLOWER_PRESETS.map((n) => (
          <Chip key={n} small label={formatCount(n)} selected={followersNum === n} onPress={() => setFollowers(String(n))} accessibilityLabel={`팔로워 ${formatCount(n)}`} />
        ))}
      </View>
      <Field label="팔로워 수(직접 입력)" value={followers} onChangeText={(t) => setFollowers(t.replace(/[^0-9]/g, ''))} keyboardType="number-pad" maxLength={10} />
    </View>
  );

  // 직접 올린 사진은 성별을 알 수 없어서 그때만 성별 칸을 보여 준다
  const ownPhoto = !!(photo.mediaId || photo.url);
  const genderAge = (
    <View style={{ gap: 10 }}>
      {ownPhoto ? (
        <View style={{ gap: 8 }}>
          <FormLabel hint="직접 올린 사진이라 골라 주세요">성별</FormLabel>
          <View style={styles.wrap}>
            <Chip small label="여" selected={gender === 'f'} onPress={() => setGender('f')} accessibilityLabel="성별 여" />
            <Chip small label="남" selected={gender === 'm'} onPress={() => setGender('m')} accessibilityLabel="성별 남" />
          </View>
        </View>
      ) : null}
      <View style={{ gap: 8 }}>
        <FormLabel>나이대</FormLabel>
        <View style={styles.wrap}>
          {AGE_GROUPS.map((a) => (
            <Chip
              key={a}
              small
              label={`${a}대`}
              selected={ageGroup === a}
              onPress={() => {
                setAgeGroup(a);
                setAgeTouched(true);
              }}
            />
          ))}
        </View>
      </View>
    </View>
  );

  const traitBox = (
    <View style={{ gap: 8 }}>
      <Field
        label={isEdit ? '성격·특징(AI가 가장 먼저 지키는 설정)' : '상세 특징(필수)'}
        value={traits}
        onChangeText={setTraits}
        multiline
        numberOfLines={8}
        style={styles.traitInput}
        maxLength={800}
        counter
        placeholder="예) 28살 사수 선배. 칭찬은 짧게, 걱정은 길게. 커피는 무조건 아아."
        hint={isEdit ? undefined : 'AI가 이 캐릭터를 연기할 때 가장 먼저 읽어요. 이름·아이디는 AI가 지어 줘요.'}
      />
      <View style={styles.wrap}>
        {TRAIT_PRESETS.map((t) => (
          <Chip key={t} small label={`+ ${t}`} selected={traits.includes(t)} onPress={() => addTrait(t)} accessibilityLabel={`특징 넣기: ${t}`} />
        ))}
      </View>
      <Dropdown label="성격 유형(선택)" value={personality} options={PERSONALITY_OPTIONS} onChange={setPersonality} />
      <Dropdown label="말투(선택)" value={speechStyle} options={SPEECH_OPTIONS} onChange={setSpeechStyle} />
    </View>
  );

  const photoRow = (
    <View style={{ gap: 8 }}>
      <FormLabel hint="사진을 직접 올리거나 배너를 바꿔요">직접 올린 사진 · 배너</FormLabel>
      <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
        <Pressable onPress={pickAvatar} accessibilityRole="button" accessibilityLabel="프로필 사진 바꾸기">
          <Avatar avatar={previewAvatar} size={64} square={shownBadge === 'gold'} />
          <View style={[styles.camOverlay, { borderRadius: shownBadge === 'gold' ? 13 : 32 }]}>
            <IconCamera size={18} color="#fff" />
          </View>
        </Pressable>
        <Pressable onPress={pickBanner} accessibilityRole="button" accessibilityLabel="배너 사진 바꾸기" style={{ flex: 1 }}>
          <Photo photo={banner} table="banner" fallback={c.surfaceAlt} style={{ height: 64, borderRadius: radius.md }} />
          <View style={[styles.camOverlay, { borderRadius: radius.md }]}>
            <IconCamera size={18} color="#fff" />
          </View>
        </Pressable>
      </View>
      {hasPhoto ? (
        <Pressable onPress={() => setPhoto({})} accessibilityRole="button" accessibilityLabel="사진 지우기">
          <Text style={{ color: c.danger, fontSize: font.small }}>{isEdit ? '사진 지우고 이모지 아바타 쓰기' : '사진 지우기(기본 사진 쓰기)'}</Text>
        </Pressable>
      ) : null}
    </View>
  );

  const emojiPicker =
    isEdit && !hasPhoto ? (
      <View style={{ gap: 8 }}>
        <FormLabel>이모지 아바타</FormLabel>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {AVATAR_EMOJIS.map((e) => (
            <Pressable key={e} onPress={() => setEmoji(e)} accessibilityRole="button" accessibilityLabel={`이모지 ${e}`} style={[styles.cell, { borderColor: emoji === e ? c.primary : c.border }]}>
              <Text style={{ fontSize: 22 }}>{e}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {AVATAR_COLORS.map((col) => (
            <Pressable key={col} onPress={() => setColor(col)} accessibilityRole="button" accessibilityLabel={`배경색 ${col}`} style={[styles.color, { backgroundColor: col, borderColor: color === col ? c.text : 'transparent' }]} />
          ))}
        </View>
      </View>
    ) : null;

  const nameHandle = (
    <>
      <Field label="이름" value={name} onChangeText={setName} maxLength={30} counter placeholder={isEdit ? '표시 이름' : '비우면 AI가 지어 줘요'} />
      <Field
        label="아이디(@)"
        value={handle}
        onChangeText={(t) => setHandle(sanitizeHandle(t))}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={15}
        placeholder={isEdit ? '영문 소문자·숫자·밑줄' : '비우면 AI가 지어 줘요'}
        hint={handleTaken ? '이미 있는 아이디예요' : clean && clean.length < 3 ? '3자 이상' : undefined}
      />
    </>
  );

  const advanced = (
    <View style={{ gap: space.lg }}>
      {!isEdit ? nameHandle : null}
      {!isEdit ? photoRow : null}
      {emojiPicker}
      <View style={{ gap: 8 }}>
        <FormLabel>인증 배지</FormLabel>
        <View style={styles.wrap}>
          {BADGES.filter((b) => !isEdit || b.key !== 'auto').map((b) => (
            <Chip key={b.key} small label={b.label} selected={badge === b.key} onPress={() => setBadge(b.key)} accessibilityLabel={`배지 ${b.label}`} />
          ))}
        </View>
      </View>
      <Field label="관계 메모(다른 인물·나와의 사이)" value={relations} onChangeText={setRelations} multiline maxLength={300} counter placeholder="예) 나와 같은 날 입사한 동기. 강해솔 팀장을 어려워함." />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Field testID="char-title" label="계급·직급(프로필 이름 옆)" value={rankTitle} onChangeText={setRankTitle} placeholder="예) 상병 / 중대장 / 부장 / 기자" maxLength={4} />
        </View>
        <View style={{ width: 84 }}>
          <Field testID="char-age" label="나이" value={ageText} onChangeText={(t) => setAgeText(t.replace(/[^0-9]/g, '').slice(0, 2))} keyboardType="number-pad" placeholder="24" maxLength={2} />
        </View>
      </View>
      <Field
        testID="char-avoid"
        label="꺼내지 않을 화제(쉼표로 구분)"
        hint="이 인물은 여기 적은 낱말·소재를 글·답글·쪽지에서 말하지 않아요. 세계관 전체에서 빼려면 세계관 설정의 '빼 둘 화제'에 적어요"
        value={avoidText}
        onChangeText={setAvoidText}
        placeholder="예) 떡볶이, 전 남친"
        maxLength={200}
      />
      <View style={{ gap: 8 }}>
        <FormLabel hint="자동 = 관계·호감도에 맞춰 바뀜">말투 고정</FormLabel>
        <View style={styles.wrap}>
          {REGISTERS.map((r) => (
            <Chip key={r.key} small label={r.label} selected={register === r.key} onPress={() => setRegister(r.key)} accessibilityLabel={`말투 ${r.label}`} />
          ))}
        </View>
      </View>
      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.text, fontWeight: '700', fontSize: font.body }}>관계 고정</Text>
          <Text style={{ color: c.subtext, fontSize: font.small }}>호감도가 바뀌어도 지금 유형(관계)을 유지해요</Text>
        </View>
        <Switch value={relationLocked} onValueChange={setRelationLocked} trackColor={{ true: c.primary, false: c.border }} accessibilityLabel="관계 고정" />
      </View>
      {isEdit ? (
        <View style={styles.switchRow}>
          <Text style={{ color: c.text, fontWeight: '700', flex: 1, fontSize: font.body }}>나를 팔로우함</Text>
          <Switch value={followsMe} onValueChange={setFollowsMe} trackColor={{ true: c.primary, false: c.border }} accessibilityLabel="나를 팔로우함" />
        </View>
      ) : null}
    </View>
  );

  // 다른 인물을 향한 사랑: 지금 좋아하는 인물·이 인물을 좋아하는 인물은 바로 보이고, 그 밖의 인물은 "대상 추가"로 넣는다
  const loveTargets = canLove && editing ? lovables(sc).filter((o) => o.id !== editing.id && o.relationBase !== 'family') : [];
  const shownTargets = loveTargets.filter((o) => loves[o.id] !== undefined || loveOf(o, editing!.id) > 0);
  const addable = loveTargets.filter((o) => !shownTargets.includes(o));
  const loveBox =
    canLove && editing && loveTargets.length ? (
      <View testID="love-box" style={[styles.statsBox, { borderColor: c.border }]}>
        <Text style={{ color: c.text, fontSize: font.body, fontWeight: '800' }}>다른 인물을 향한 사랑</Text>
        <Text style={{ color: c.subtext, fontSize: font.tiny, lineHeight: 16 }}>
          한쪽만 높으면 짝사랑이에요. 여러 명을 좋아하면 수치가 가장 높은 쪽(나를 향한 설렘 포함)을 따라가요. 이야기 속 사건으로 한 번에 +20~+38씩 오르고 77부터는 천천히 올라요.
        </Text>
        {shownTargets.map((o) => (
          <StatSlider
            key={o.id}
            label={`${o.name} 사랑`}
            value={loves[o.id] ?? 0}
            min={0}
            max={100}
            color={c.like}
            disabled={loveOff}
            onChange={(v) => setLoves((m) => ({ ...m, [o.id]: v }))}
            hint={loveOf(o, editing.id) > 0 ? `${o.name} → ${editing.name} 사랑 ${loveOf(o, editing.id)}` : undefined}
          />
        ))}
        {addable.length && !loveOff ? (
          <Dropdown
            label="대상 추가"
            value={undefined}
            placeholder="좋아하는 인물 고르기"
            options={addable.map((o) => ({ id: o.id, label: o.name, desc: [o.title, o.age ? `${o.age}살` : ''].filter(Boolean).join(' · ') || undefined }))}
            allowClear={false}
            onChange={(id) => id && setLoves((m) => ({ ...m, [id]: 30 }))}
          />
        ) : null}
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.text, fontWeight: '700', fontSize: font.body }}>사랑에 관심 없음</Text>
            <Text style={{ color: c.subtext, fontSize: font.small }}>일·자기 생활이 먼저인 사람. 특별한 사건이 없으면 누구도 좋아하지 않아요</Text>
          </View>
          <Switch
            value={loveOff}
            onValueChange={(v) => {
              setLoveOff(v);
              if (v) setLoves({});
            }}
            trackColor={{ true: c.primary, false: c.border }}
            accessibilityLabel="사랑에 관심 없음"
          />
        </View>
      </View>
    ) : null;

  const moreToggle = (
    <Pressable onPress={() => setMore((m) => !m)} accessibilityRole="button" accessibilityLabel="더 설정하기" accessibilityState={{ expanded: more }} style={[styles.moreRow, { borderColor: c.border }]}>
      <Text style={{ color: c.text, fontWeight: '800', fontSize: font.body, flex: 1 }}>더 설정하기</Text>
      <Text style={{ color: c.subtext, fontSize: font.small }}>{isEdit ? '배지·관계 메모·고정' : '이름·사진·배지·고정'}</Text>
      <View style={{ transform: [{ rotate: more ? '-90deg' : '90deg' }] }}>
        <IconChevronRight size={18} color={c.subtext} />
      </View>
    </Pressable>
  );

  return (
    <Screen>
      <TopBar
        title={isEdit ? '캐릭터 설정' : '캐릭터 만들기'}
        close
        right={<Button title="저장" size="sm" variant="ink" disabled={!valid} loading={saving} loadingTitle="만드는 중…" onPress={save} />}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ paddingBottom: 56 }} keyboardShouldPersistTaps="handled">
          {isEdit && editing ? (
            <>
              <Pressable onPress={pickBanner} accessibilityRole="button" accessibilityLabel="배너 사진 바꾸기">
                <Photo photo={banner} table="banner" fallback={color} style={{ width: '100%', height: 120 }} />
                <View style={styles.camOverlay}>
                  <IconCamera size={22} color="#fff" />
                </View>
              </Pressable>
              <View style={{ paddingHorizontal: space.lg }}>
                <Pressable onPress={pickAvatar} style={{ marginTop: -36, alignSelf: 'flex-start' }} accessibilityRole="button" accessibilityLabel="프로필 사진 바꾸기">
                  <Avatar avatar={previewAvatar} size={76} ring={4} square={shownBadge === 'gold'} />
                  <View style={[styles.camOverlay, { borderRadius: shownBadge === 'gold' ? 15 : 38, top: 4, left: 4, right: 4, bottom: 4 }]}>
                    <IconCamera size={20} color="#fff" />
                  </View>
                </Pressable>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                  <Text style={{ color: c.text, fontWeight: '900', fontSize: font.h2, flexShrink: 1 }} numberOfLines={1}>
                    {name || '이름'}
                  </Text>
                  <VerifiedBadge kind={shownBadge} size={19} />
                </View>
                <Text style={{ color: c.subtext }}>@{clean || 'handle'}</Text>
                {hasPhoto && (
                  <Pressable onPress={() => setPhoto({})} style={{ marginTop: 6 }} accessibilityRole="button" accessibilityLabel="사진 지우기">
                    <Text style={{ color: c.danger, fontSize: font.small }}>사진 지우고 이모지 아바타 쓰기</Text>
                  </Pressable>
                )}
                {/* 지금 관계·말투 */}
                <View style={[styles.relCard, { borderColor: c.border, backgroundColor: c.surfaceAlt }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <RelationChip ch={editing} size="md" />
                    <Text style={{ color: c.text, fontSize: font.small, fontWeight: '700' }}>
                      {REGISTER_LABEL[registerOf(editing)]} 사용 중{editing.registerOverride ? ' (고정)' : ''}
                      {editing.relationLocked ? ' · 관계 고정' : ''}
                    </Text>
                  </View>
                  <View style={styles.barRow}>
                    <Text style={[styles.barLabel, { color: c.subtext }]}>호감도</Text>
                    <View style={{ flex: 1 }}>
                      <MeterBar value={editing.affinity} min={-100} max={100} color={c.success} />
                    </View>
                    <Text style={[styles.barNum, { color: c.text }]}>{editing.affinity}</Text>
                  </View>
                  {editing.tier !== 'crowd' && editing.relationBase !== 'family' ? (
                    <View style={styles.barRow}>
                      <Text style={[styles.barLabel, { color: c.subtext }]}>설렘</Text>
                      <View style={{ flex: 1 }}>
                        <MeterBar value={editing.romance ?? 0} min={0} max={100} color={c.like} />
                      </View>
                      <Text style={[styles.barNum, { color: c.text }]}>{editing.romance ?? 0}</Text>
                    </View>
                  ) : null}
                  <Text style={{ color: c.subtext, fontSize: font.tiny, lineHeight: 16 }}>관계·말투는 호감도·설렘에 따라 자동으로 바뀌어요(하루 한 번까지). 고정하려면 "더 설정하기"에서.</Text>
                </View>
              </View>
            </>
          ) : (
            <View style={{ paddingHorizontal: space.lg, paddingTop: space.lg, gap: 4 }}>
              <Text style={{ color: c.text, fontSize: font.h1, fontWeight: '900' }}>누구를 등장시킬까요?</Text>
              <Text style={{ color: c.subtext, fontSize: font.body, lineHeight: 21 }}>유형·팔로워·특징만 정하면 이름·아이디는 AI가 지어 줘요.</Text>
            </View>
          )}

          <View style={{ padding: space.lg, gap: space.lg }}>
            <FacePicker
              value={photo.mediaId || photo.url ? undefined : photo.photo}
              exclude={usedFaces}
              onPick={(key) => {
                setPhoto({ photo: key });
                setGender(faceGender(key) ?? gender);
              }}
              hint={isEdit ? '성별은 고른 사진을 따라가요' : '성별은 사진을 따라가요 · 안 고르면 자동'}
            />
            {isEdit ? nameHandle : null}
            {typeChips}
            {followerBox}
            {genderAge}
            {traitBox}
            {isEdit && editing ? (
              <View style={[styles.statsBox, { borderColor: c.border }]}>
                <Text style={{ color: c.text, fontSize: font.body, fontWeight: '800' }}>관계 수치</Text>
                <StatSlider label="호감도" value={aff} min={-100} max={100} color={c.success} onChange={setAff} hint="-55 이하 적 · -15 이하 라이벌 · 35 이상 친구 · 75 이상 베프" />
                <StatSlider
                  label="설렘"
                  value={rom}
                  min={0}
                  max={100}
                  color={c.like}
                  onChange={setRom}
                  disabled={!!editing.rosterId || editing.relationBase === 'family'}
                  hint={editing.rosterId ? '공통 캐릭터(실존 인물일 수 있음)는 설렘을 쓰지 않아요' : '40 이상 + 호감 20 이상 매콤함 · 75 이상 + 호감 60 이상 연인'}
                />
                <StatSlider label="정복도" value={dev} min={0} max={100} color={c.aura} onChange={setDev} hint="높을수록 내 부탁을 기꺼이 들어주고 먼저 더 해 줘요(열성 팬처럼)" />
              </View>
            ) : null}
            {loveBox}
            {moreToggle}
            {more ? advanced : null}
            {isEdit ? (
              <Button title="저장" size="lg" full disabled={!valid} onPress={save} />
            ) : (
              <Button title="세계에 등장시키기" size="lg" full disabled={!valid} loading={saving} loadingTitle="AI가 이름을 짓는 중…" onPress={save} />
            )}
            {!isEdit && !valid && !saving ? (
              <Text style={{ color: c.subtext, fontSize: font.small, textAlign: 'center' }}>{handleTaken ? '이미 있는 아이디예요' : '상세 특징을 적어 주세요'}</Text>
            ) : null}
            {isEdit && (
              <Button title={confirmDelete ? '정말 삭제할까요? 한 번 더 누르세요' : '이 캐릭터 삭제'} variant="danger" full icon={<IconTrash size={16} color={c.danger} />} onPress={remove} />
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      {picker.modal}
    </Screen>
  );
}

const styles = StyleSheet.create({
  statsBox: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 14 },
  /** 성격·특징 입력 칸: 넉넉하게(긴 설정도 한눈에) */
  traitInput: { minHeight: 180 },
  camOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  cell: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  color: { width: 30, height: 30, borderRadius: 15, borderWidth: 3 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  sub: { fontSize: font.small, fontWeight: '700' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  moreRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 14 },
  relCard: { borderWidth: 1, borderRadius: radius.md, padding: space.md, gap: 8, marginTop: 12 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barLabel: { fontSize: font.tiny, fontWeight: '700', width: 36 },
  barNum: { fontSize: font.tiny, fontWeight: '800', width: 30, textAlign: 'right', fontVariant: ['tabular-nums'] },
});
