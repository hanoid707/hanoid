/**
 * 세계관 전체 수정(v3.2) — 한 화면에서 세계관·내 계정·모든 인물을 펼쳐 보고 바로 고친다
 *   ① 세계관: 이름·이모지·한 줄 소개·설정·분위기·해시태그·자주 쓰는 말
 *   ② 내 계정: 이름·아이디·역할·소개·설정
 *   ③ 인물: 인증 계정 / 핵심 인물 / 전체 — 카드를 누르면 펼쳐져 이름·아이디·성별·나이대·유형·팔로워·배지·소개·특징·관계·호감도·설렘·정복도 수정
 */
import { useNavigation } from '@react-navigation/native';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '../../components/Avatar';
import { VerifiedBadge } from '../../components/Badge';
import { Dropdown } from '../../components/Dropdown';
import { IconChevronDown, IconChevronRight } from '../../components/icons';
import { Screen, TopBar } from '../../components/Screen';
import { StatSlider } from '../../components/StatSlider';
import { Button, Chip, Field, Segmented } from '../../components/ui';
import { saveCharacter, savePersona, saveWorld } from '../../game/actions';
import { AGE_GROUPS, CORE_TYPES, CROWD_TYPES, typeDefaults, typeLabel } from '../../game/relationship';
import type { RootNav } from '../../navigation/types';
import { useActive, useGame } from '../../store/game';
import { font, radius, space, useTheme } from '../../theme';
import type { AgeGroup, BadgeKind, Character, CharacterType, Gender } from '../../types';
import { formatCount, sanitizeHandle } from '../../utils';

type Filter = 'verified' | 'core' | 'all';
type BadgeChoice = 'none' | BadgeKind;

const TYPE_OPTIONS = [...CORE_TYPES, ...CROWD_TYPES].map((t) => ({ id: t, label: typeLabel(t) }));
const BADGES: { key: BadgeChoice; label: string }[] = [
  { key: 'none', label: '없음' },
  { key: 'blue', label: '파랑' },
  { key: 'gold', label: '금색' },
  { key: 'gray', label: '회색' },
];

const badgeOf = (ch: Character): BadgeKind | null => (ch.badge === undefined ? (ch.isNews ? 'gold' : ch.verified ? 'blue' : null) : ch.badge);
function typeOf(ch: Character): CharacterType {
  if (ch.tier !== 'crowd' && !ch.isNews && ch.relation) return ch.relation;
  return ch.crowdRole ?? (ch.isNews ? 'news' : ch.tier === 'crowd' ? 'public' : 'acquaintance');
}

/** 접었다 펴는 구역 */
function Section({ title, desc, open, onToggle, children }: { title: string; desc?: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={[styles.section, { borderColor: c.border }]}>
      <Pressable onPress={onToggle} accessibilityRole="button" accessibilityLabel={`${title} ${open ? '접기' : '펼치기'}`} accessibilityState={{ expanded: open }} style={styles.sectionHead}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: c.text, fontSize: font.h2, fontWeight: '800' }}>{title}</Text>
          {desc ? <Text style={{ color: c.subtext, fontSize: font.small }}>{desc}</Text> : null}
        </View>
        {open ? <IconChevronDown size={20} color={c.subtext} /> : <IconChevronRight size={20} color={c.subtext} />}
      </Pressable>
      {open ? <View style={{ gap: space.md, paddingTop: space.sm }}>{children}</View> : null}
    </View>
  );
}

function WorldForm() {
  const sc = useActive()!;
  const showToast = useGame((s) => s.showToast);
  const w = sc.world;
  const [name, setName] = useState(w.name);
  const [emoji, setEmoji] = useState(w.emoji);
  const [tagline, setTagline] = useState(w.tagline);
  const [setting, setSetting] = useState(w.setting);
  const [tone, setTone] = useState(w.tone);
  const [tag, setTag] = useState(w.tag);
  const [vocab, setVocab] = useState(w.vocab.join(', '));
  const save = () => {
    saveWorld({ name, emoji, tagline, setting, tone, tag, vocab: vocab.split(/[,\n]/) });
    showToast('세계관 설정을 저장했어요 — 다음 반응부터 AI가 바로 반영해요', 'success');
  };
  return (
    <>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <View style={{ width: 90 }}>
          <Field label="이모지" value={emoji} onChangeText={setEmoji} maxLength={8} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="세계관 이름" value={name} onChangeText={setName} maxLength={30} />
        </View>
      </View>
      <Field label="한 줄 소개" value={tagline} onChangeText={setTagline} maxLength={120} />
      <Field label="세계관 설정(AI가 가장 먼저 읽는 배경)" value={setting} onChangeText={setSetting} multiline numberOfLines={10} style={{ minHeight: 220 }} maxLength={3000} counter />
      <Field label="분위기" value={tone} onChangeText={setTone} maxLength={300} />
      <Field label="대표 해시태그" value={tag} onChangeText={setTag} maxLength={30} />
      <Field label="자주 쓰는 말(쉼표로 구분)" value={vocab} onChangeText={setVocab} multiline style={{ minHeight: 80 }} />
      <Button title="세계관 저장" variant="ink" onPress={save} disabled={!name.trim() || !setting.trim()} />
    </>
  );
}

function PersonaForm() {
  const sc = useActive()!;
  const showToast = useGame((s) => s.showToast);
  const p = sc.persona;
  const [name, setName] = useState(p.name);
  const [handle, setHandle] = useState(p.handle);
  const [role, setRole] = useState(p.role ?? '');
  const [bio, setBio] = useState(p.bio ?? '');
  const [desc, setDesc] = useState(p.description ?? '');
  const save = () => {
    savePersona({ name: name.trim() || p.name, handle, role: role.trim() || p.role, bio, description: desc });
    showToast('내 계정 설정을 저장했어요', 'success');
  };
  return (
    <>
      <Field label="이름" value={name} onChangeText={setName} maxLength={30} />
      <Field label="아이디" value={handle} onChangeText={setHandle} autoCapitalize="none" maxLength={15} />
      <Field label="역할" value={role} onChangeText={setRole} maxLength={40} />
      <Field label="자기소개" value={bio} onChangeText={setBio} multiline maxLength={160} counter />
      <Field label="내 설정(AI가 참고)" value={desc} onChangeText={setDesc} multiline numberOfLines={6} style={{ minHeight: 140 }} maxLength={800} counter />
      <Button title="내 계정 저장" variant="ink" onPress={save} />
    </>
  );
}

/** 인물 한 명(펼치면 수정) */
function CharacterCard({ ch, open, onToggle }: { ch: Character; open: boolean; onToggle: () => void }) {
  const { c } = useTheme();
  const nav = useNavigation<RootNav>();
  const sc = useActive()!;
  const showToast = useGame((s) => s.showToast);
  const initType = typeOf(ch);
  const [name, setName] = useState(ch.name);
  const [handle, setHandle] = useState(ch.handle);
  const [gender, setGender] = useState<Gender | undefined>(ch.gender);
  const [ageGroup, setAgeGroup] = useState<AgeGroup | undefined>(ch.ageGroup);
  const [type, setType] = useState<CharacterType>(initType);
  const [followers, setFollowers] = useState(String(ch.followers));
  const [badge, setBadge] = useState<BadgeChoice>(badgeOf(ch) ?? 'none');
  const [bio, setBio] = useState(ch.bio);
  const [desc, setDesc] = useState(ch.description);
  const [relations, setRelations] = useState(ch.relations ?? '');
  const [aff, setAff] = useState(ch.affinity);
  const [rom, setRom] = useState(ch.romance ?? 0);
  const [dev, setDev] = useState(ch.devotion ?? 0);

  const clean = sanitizeHandle(handle);
  const taken = !!clean && sc.cast.some((id) => id !== ch.id && sc.characters[id]?.handle === clean);
  const valid = !!name.trim() && clean.length >= 3 && !taken;

  const save = () => {
    if (!valid) return;
    const typeChanged = type !== initType;
    const r = saveCharacter(
      {
        name: name.trim(),
        handle: clean,
        emoji: ch.avatar.emoji,
        color: ch.avatar.color,
        archetype: typeChanged ? typeDefaults(type).archetype : ch.archetype,
        bio: bio.trim(),
        description: desc.trim() || ch.description,
        relations: relations.trim(),
        badge: badge === 'none' ? null : badge,
        followers: Math.max(0, Number(followers.replace(/[^0-9]/g, '')) || 0),
        followsMe: ch.followsMe,
        avatar: { photo: ch.avatar.photo, mediaId: ch.avatar.mediaId, url: ch.avatar.url },
        banner: ch.banner,
        type: typeChanged ? type : undefined,
        gender,
        ageGroup,
        personality: ch.personality,
        speechStyle: ch.speechStyle,
        stats: { affinity: aff, romance: rom, devotion: dev },
      },
      ch.id,
    );
    showToast(r.ok ? `${name.trim()} 설정을 저장했어요` : '저장하지 못했어요', r.ok ? 'success' : 'error');
  };

  const b = badgeOf(ch);
  return (
    <View style={[styles.card, { borderColor: open ? c.primary : c.border }]}>
      <Pressable onPress={onToggle} accessibilityRole="button" accessibilityLabel={`${ch.name} ${open ? '접기' : '펼치기'}`} accessibilityState={{ expanded: open }} style={styles.cardHead}>
        <Avatar avatar={ch.avatar} size={36} square={b === 'gold'} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={{ color: c.text, fontWeight: '800', fontSize: font.body, flexShrink: 1 }} numberOfLines={1}>
              {ch.name}
            </Text>
            {b ? <VerifiedBadge kind={b} size={14} /> : null}
          </View>
          <Text style={{ color: c.subtext, fontSize: font.small }} numberOfLines={1}>
            @{ch.handle} · {typeLabel(initType)} · 팔로워 {formatCount(ch.followers)} · 호감 {ch.affinity}
            {(ch.romance ?? 0) > 0 ? ` · 설렘 ${ch.romance}` : ''}
            {(ch.devotion ?? 0) > 0 ? ` · 정복 ${ch.devotion}` : ''}
          </Text>
        </View>
        {open ? <IconChevronDown size={18} color={c.subtext} /> : <IconChevronRight size={18} color={c.subtext} />}
      </Pressable>
      {open ? (
        <View style={{ gap: space.md, paddingTop: space.sm }}>
          <Field label="이름" value={name} onChangeText={setName} maxLength={30} />
          <Field label="아이디" value={handle} onChangeText={setHandle} autoCapitalize="none" maxLength={15} hint={taken ? '이미 있는 아이디예요' : undefined} />
          <View style={styles.wrap}>
            {(['f', 'm'] as Gender[]).map((g) => (
              <Chip key={g} small label={g === 'f' ? '여' : '남'} selected={gender === g} onPress={() => setGender(g)} accessibilityLabel={`${ch.name} 성별 ${g === 'f' ? '여' : '남'}`} />
            ))}
            {AGE_GROUPS.map((a) => (
              <Chip key={a} small label={`${a}대`} selected={ageGroup === a} onPress={() => setAgeGroup(a)} />
            ))}
          </View>
          <Dropdown label="유형(나와의 관계·계정 분류)" value={type} options={TYPE_OPTIONS} allowClear={false} onChange={(t) => t && setType(t as CharacterType)} />
          <Field label="팔로워" value={followers} onChangeText={(t) => setFollowers(t.replace(/[^0-9]/g, ''))} keyboardType="number-pad" maxLength={10} />
          <View style={styles.wrap}>
            <Text style={{ color: c.subtext, fontSize: font.small }}>인증 배지</Text>
            {BADGES.map((x) => (
              <Chip key={x.key} small label={x.label} selected={badge === x.key} onPress={() => setBadge(x.key)} />
            ))}
          </View>
          <Field label="자기소개" value={bio} onChangeText={setBio} multiline maxLength={160} counter />
          <Field label="특징(AI가 가장 먼저 읽는 설정)" value={desc} onChangeText={setDesc} multiline numberOfLines={8} style={{ minHeight: 180 }} maxLength={800} counter />
          <Field label="다른 인물과의 관계" value={relations} onChangeText={setRelations} multiline style={{ minHeight: 80 }} maxLength={400} />
          <StatSlider label="호감도" value={aff} min={-100} max={100} color={c.success} onChange={setAff} />
          <StatSlider label="설렘" value={rom} min={0} max={100} color={c.like} onChange={setRom} disabled={!!ch.rosterId || ch.relationBase === 'family'} hint={ch.rosterId ? '공통 캐릭터(실존 인물일 수 있음)는 설렘을 쓰지 않아요' : undefined} />
          <StatSlider label="정복도" value={dev} min={0} max={100} color={c.aura} onChange={setDev} />
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button title="저장" variant="ink" onPress={save} disabled={!valid} style={{ flex: 1 }} />
            <Button title="사진·말투 등 더 보기" variant="outline" onPress={() => nav.navigate('CharacterEditor', { characterId: ch.id })} style={{ flex: 1 }} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

export function WorldEditScreen() {
  const { c } = useTheme();
  const sc = useActive();
  const [openWorld, setOpenWorld] = useState(true);
  const [openMe, setOpenMe] = useState(false);
  const [filter, setFilter] = useState<Filter>('verified');
  const [openId, setOpenId] = useState<string | null>(null);
  const list = useMemo(() => {
    if (!sc) return [];
    const all = sc.cast.map((id) => sc.characters[id]).filter((x): x is Character => !!x && !x.inactive);
    const pick = filter === 'verified' ? all.filter((x) => !!badgeOf(x)) : filter === 'core' ? all.filter((x) => x.tier !== 'crowd') : all;
    return pick.sort((a, b) => b.followers - a.followers);
  }, [sc, filter]);
  if (!sc) return null;

  return (
    <Screen>
      <TopBar title="세계관 전체 수정" subtitle={`${sc.world.emoji} ${sc.world.name}`} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 80 }} keyboardShouldPersistTaps="handled">
        <Section title="세계관" desc="이름·설정·분위기·해시태그·자주 쓰는 말" open={openWorld} onToggle={() => setOpenWorld((v) => !v)}>
          <WorldForm />
        </Section>
        <Section title="내 계정" desc={`${sc.persona.name} @${sc.persona.handle}`} open={openMe} onToggle={() => setOpenMe((v) => !v)}>
          <PersonaForm />
        </Section>
        <View style={{ gap: space.sm }}>
          <Text style={{ color: c.text, fontSize: font.h2, fontWeight: '800' }}>인물 {list.length}명</Text>
          <Segmented<Filter>
            options={[
              { key: 'verified', label: '인증 계정' },
              { key: 'core', label: '핵심 인물' },
              { key: 'all', label: '전체' },
            ]}
            value={filter}
            onChange={setFilter}
          />
          <Text style={{ color: c.subtext, fontSize: font.small }}>카드를 누르면 펼쳐져요. 인물마다 따로 저장해요.</Text>
          {list.map((ch) => (
            <CharacterCard key={ch.id} ch={ch} open={openId === ch.id} onToggle={() => setOpenId((v) => (v === ch.id ? null : ch.id))} />
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { borderWidth: 1, borderRadius: radius.lg, padding: space.md },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  card: { borderWidth: 1, borderRadius: radius.md, padding: space.md },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
});
