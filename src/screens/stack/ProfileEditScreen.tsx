/** 내 프로필 수정(X 스타일) — 배너·프로필 사진(선택→크롭) · 이름 · 아이디 · 자기소개 · 위치 · 역할 · AI가 읽는 내 설정 · 인증 배지 */
import { useNavigation } from '@react-navigation/native';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '../../components/Avatar';
import { FacePicker } from '../../components/FacePicker';
import { IconCamera } from '../../components/icons';
import { Photo } from '../../components/Photo';
import { usePhotoPicker } from '../../components/PhotoCropper';
import { Screen, TopBar } from '../../components/Screen';
import { Button, Chip, Field } from '../../components/ui';
import { usedFaceKeys } from '../../data/facePool';
import { savePersona } from '../../game/actions';
import type { RootNav } from '../../navigation/types';
import { useActive, useGame } from '../../store/game';
import { font, space, useTheme } from '../../theme';
import type { Avatar as AvatarData, BadgeKind, PhotoRef } from '../../types';
import { sanitizeHandle } from '../../utils';

export function ProfileEditScreen() {
  const { c } = useTheme();
  const nav = useNavigation<RootNav>();
  const sc = useActive();
  const showToast = useGame((s) => s.showToast);
  const picker = usePhotoPicker();
  const p = sc?.persona;
  const [avatar, setAvatar] = useState<AvatarData | undefined>(p?.avatar);
  const [banner, setBanner] = useState<PhotoRef | undefined>(p?.banner);
  const [name, setName] = useState(p?.name ?? '');
  const [handle, setHandle] = useState(p?.handle ?? '');
  const [bio, setBio] = useState(p?.bio ?? '');
  const [location, setLocation] = useState(p?.location ?? '');
  const [role, setRole] = useState(p?.role ?? '');
  const [desc, setDesc] = useState(p?.description ?? '');
  const [badge, setBadge] = useState<BadgeKind | null>(p?.badge ?? null);
  // 이 세계에서 다른 인물이 쓰는 기본 사진은 프리셋에서 뺀다
  const usedFaces = useMemo(() => usedFaceKeys(Object.values(sc?.characters ?? {})), [sc?.characters]);
  if (!sc || !p || !avatar) return null;

  const save = () => {
    savePersona({ avatar, banner, name: name.trim() || p.name, handle, bio, location, role: role.trim() || p.role, description: desc, badge });
    showToast('프로필을 저장했어요', 'success');
    nav.goBack();
  };

  return (
    <Screen>
      <TopBar title="프로필 수정" close right={<Button title="저장" size="sm" variant="ink" disabled={!name.trim() || sanitizeHandle(handle).length < 3} onPress={save} />} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
          <Pressable onPress={async () => { const id = await picker.pick('banner'); if (id) setBanner({ mediaId: id }); }} accessibilityLabel="배너 바꾸기">
            <Photo photo={banner} table="banner" fallback={sc.world.color} style={{ width: '100%', height: 120 }} />
            <View style={styles.cam}>
              <IconCamera size={22} color="#fff" />
            </View>
          </Pressable>
          <Pressable onPress={async () => { const id = await picker.pick('avatar'); if (id) setAvatar({ ...avatar, mediaId: id, photo: undefined, image: undefined, url: undefined }); }} style={{ marginTop: -36, marginLeft: space.lg, alignSelf: 'flex-start' }} accessibilityLabel="프로필 사진 바꾸기">
            <Avatar avatar={avatar} size={76} ring={4} />
            <View style={[styles.cam, { borderRadius: 38, top: 4, left: 4, right: 4, bottom: 4 }]}>
              <IconCamera size={20} color="#fff" />
            </View>
          </Pressable>
          <View style={{ padding: space.lg, gap: space.lg }}>
            <FacePicker
              value={avatar.mediaId ? undefined : avatar.photo}
              exclude={usedFaces}
              onPick={(key) => setAvatar({ ...avatar, photo: key, mediaId: undefined, image: undefined, url: undefined })}
            />
            <Field label="이름" value={name} onChangeText={setName} maxLength={30} counter />
            <Field label="아이디(@)" value={handle} onChangeText={(t) => setHandle(sanitizeHandle(t))} autoCapitalize="none" maxLength={15} />
            <Field label="자기소개" value={bio} onChangeText={setBio} multiline maxLength={160} counter />
            <Field label="위치" value={location} onChangeText={setLocation} maxLength={30} />
            <Field label="역할" value={role} onChangeText={setRole} maxLength={20} />
            <Field label="내 설정(AI가 나를 이해하는 데 써요)" value={desc} onChangeText={setDesc} multiline maxLength={600} counter />
            <View style={{ gap: 8 }}>
              <Text style={{ color: c.text, fontWeight: '700', fontSize: font.body }}>인증 배지</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {(
                  [
                    ['none', '자동(팔로워 1만↑)'],
                    ['blue', '파랑'],
                    ['gold', '금색'],
                    ['gray', '회색'],
                  ] as const
                ).map(([k, label]) => (
                  <Chip key={k} label={label} selected={(badge ?? 'none') === k} onPress={() => setBadge(k === 'none' ? null : k)} />
                ))}
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      {picker.modal}
    </Screen>
  );
}

const styles = StyleSheet.create({
  cam: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
});
