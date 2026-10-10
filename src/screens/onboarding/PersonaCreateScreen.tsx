/** 2단계: 내 계정 만들기 (원본: "누구든 될 수 있어요") — 프로필 사진(선택→크롭) · 이름 · @아이디 · 역할 · 소개 · 설정 */
import { useNavigation } from '@react-navigation/native';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '../../components/Avatar';
import { FacePicker } from '../../components/FacePicker';
import { IconCamera } from '../../components/icons';
import { usePhotoPicker } from '../../components/PhotoCropper';
import { Screen, TopBar } from '../../components/Screen';
import { Button, Chip, Field } from '../../components/ui';
import { AVATAR_COLORS, AVATAR_EMOJIS } from '../../data/avatars';
import { getWorldTemplate } from '../../data/worlds';
import type { RootNav } from '../../navigation/types';
import { useDraft } from '../../store/draft';
import { font, space, useTheme } from '../../theme';
import { sanitizeHandle } from '../../utils';

export function PersonaCreateScreen() {
  const { c } = useTheme();
  const nav = useNavigation<RootNav>();
  const draft = useDraft();
  const picker = usePhotoPicker();
  const tpl = getWorldTemplate(draft.templateId);
  const roles = tpl?.roles ?? ['주인공', '신입', '인플루언서', '비밀 요원'];
  const takenHandles = useMemo(
    () => new Set((tpl ? tpl.cast.map((x) => x.handle) : (draft.customCast ?? []).map((x) => x.handle)).map((h) => h.toLowerCase())),
    [tpl, draft.customCast],
  );

  const [name, setName] = useState(draft.persona?.name ?? '');
  const [handle, setHandle] = useState(draft.persona?.handle ?? '');
  const [emoji, setEmoji] = useState(draft.persona?.avatar.emoji ?? '😎');
  const [color, setColor] = useState(draft.persona?.avatar.color ?? AVATAR_COLORS[0]);
  const [mediaId, setMediaId] = useState<string | undefined>(draft.persona?.avatar.mediaId);
  const [photo, setPhoto] = useState<string | undefined>(draft.persona?.avatar.photo);
  // 이 세계 인물이 쓰는 기본 사진은 프리셋에서 뺀다
  const usedFaces = useMemo(() => new Set(tpl ? tpl.cast.map((x) => `${tpl.id}__${x.key}`) : []), [tpl]);
  const [role, setRole] = useState(draft.persona?.role ?? roles[0]);
  const [bio, setBio] = useState(draft.persona?.bio ?? tpl?.personaHint.bio ?? '');
  const [desc, setDesc] = useState(draft.persona?.description ?? tpl?.personaHint.description ?? '');

  const cleanHandle = sanitizeHandle(handle);
  const handleTaken = takenHandles.has(cleanHandle);
  const valid = name.trim().length >= 1 && cleanHandle.length >= 3 && !handleTaken;
  const avatar = { emoji, color, mediaId, ...(mediaId ? {} : { photo }) };

  const next = () => {
    draft.set({
      persona: {
        name: name.trim(),
        handle: cleanHandle,
        avatar,
        role: role.trim() || roles[0],
        bio: bio.trim() || `${role}입니다.`,
        description: desc.trim() || `${role}. 아직 아무도 나를 모른다.`,
      },
    });
    nav.navigate('FirstFollower');
  };

  return (
    <Screen>
      <TopBar title="계정 만들기" subtitle="2 / 3" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
          <Text style={{ color: c.text, fontSize: font.h1, fontWeight: '900' }}>프로필 사진 고르기</Text>
          <Text style={{ color: c.subtext, fontSize: font.body, marginTop: -8 }}>사진을 고르고 원하는 부분만 잘라 쓸 수 있어요.</Text>
          <View style={{ alignItems: 'center', gap: 8 }}>
            <Pressable
              onPress={async () => {
                const id = await picker.pick('avatar');
                if (id) {
                  setMediaId(id);
                  setPhoto(undefined);
                }
              }}
              accessibilityLabel="사진 선택"
            >
              <Avatar avatar={avatar} size={112} />
              <View style={styles.cam}>
                <IconCamera size={26} color="#fff" />
              </View>
            </Pressable>
            {mediaId || photo ? (
              <Pressable
                onPress={() => {
                  setMediaId(undefined);
                  setPhoto(undefined);
                }}
              >
                <Text style={{ color: c.danger, fontSize: font.small }}>사진 지우기</Text>
              </Pressable>
            ) : null}
          </View>
          {!mediaId && <FacePicker value={photo} exclude={usedFaces} onPick={setPhoto} />}
          {!mediaId && !photo && (
            <View style={{ gap: 8 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {AVATAR_EMOJIS.map((e) => (
                  <Pressable key={e} onPress={() => setEmoji(e)} style={[styles.emojiCell, { borderColor: emoji === e ? c.primary : c.border }]}>
                    <Text style={{ fontSize: 22 }}>{e}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {AVATAR_COLORS.map((col) => (
                  <Pressable key={col} accessibilityLabel={`배경색 ${col}`} onPress={() => setColor(col)} style={[styles.color, { backgroundColor: col, borderColor: color === col ? c.text : 'transparent' }]} />
                ))}
              </View>
            </View>
          )}

          <Field label="이름" value={name} onChangeText={setName} maxLength={30} counter />
          <Field
            label="아이디(@)"
            value={handle}
            onChangeText={(t) => setHandle(sanitizeHandle(t))}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={15}
            hint={handleTaken ? '이미 이 세계에서 쓰는 아이디예요' : '영문 소문자·숫자·밑줄 3~15자'}
          />
          <View style={{ gap: 8 }}>
            <Text style={{ color: c.text, fontWeight: '700', fontSize: font.body }}>역할</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {roles.map((r) => (
                <Chip key={r} label={r} selected={role === r} onPress={() => setRole(r)} />
              ))}
            </View>
          </View>
          <Field label="자기소개" value={bio} onChangeText={setBio} maxLength={160} counter multiline />
          <Field label="내 설정(성격·배경)" value={desc} onChangeText={setDesc} multiline maxLength={600} counter hint="AI가 나를 이해하는 데 쓰여요. 사람들의 반응이 달라져요." />
          <Button title="다음" size="lg" variant="ink" full disabled={!valid} onPress={next} />
        </ScrollView>
      </KeyboardAvoidingView>
      {picker.modal}
    </Screen>
  );
}

const styles = StyleSheet.create({
  cam: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 56, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  emojiCell: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  color: { width: 30, height: 30, borderRadius: 15, borderWidth: 3 },
});
