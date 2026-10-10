/**
 * 사진 선택 → 자르기(크롭) → 저장
 *   1) 사진 앨범/파일에서 고르고
 *   2) 틀 안에서 끌어서 위치를 맞추고 +/−로 확대한 뒤
 *   3) "적용"하면 작은 JPEG로 줄여 사진 저장소(기기 + DB)에 넣고 사진 ID를 돌려준다.
 * 웹은 캔버스, 폰은 expo-image-manipulator로 자른다.
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Modal, PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { putMedia } from '../store/media';
import { font, radius, space, useTheme } from '../theme';
import { IconClose, IconZoomIn, IconZoomOut } from './icons';
import { Button } from './ui';

export type CropKind = 'avatar' | 'banner' | 'post';
const SPEC: Record<CropKind, { aspect: number; outW: number; title: string }> = {
  avatar: { aspect: 1, outW: 400, title: '프로필 사진 자르기' },
  banner: { aspect: 3, outW: 900, title: '배너 자르기' },
  post: { aspect: 16 / 10, outW: 960, title: '사진 자르기' },
};

async function pickUri(): Promise<string | null> {
  try {
    if (Platform.OS !== 'web') {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return null;
    }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, allowsEditing: false });
    if (r.canceled || !r.assets?.[0]) return null;
    return r.assets[0].uri;
  } catch {
    return null;
  }
}

function getSize(uri: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => Image.getSize(uri, (w, h) => resolve({ w, h }), reject));
}

async function cropToDataUri(uri: string, rect: { x: number; y: number; w: number; h: number }, outW: number, outH: number): Promise<string> {
  if (Platform.OS === 'web') {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new (globalThis as unknown as { Image: { new (): HTMLImageElement } }).Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = uri;
    });
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const g = canvas.getContext('2d')!;
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, rect.x, rect.y, rect.w, rect.h, 0, 0, outW, outH);
    return canvas.toDataURL('image/jpeg', 0.84);
  }
  const ctx = ImageManipulator.manipulate(uri);
  ctx.crop({ originX: Math.round(rect.x), originY: Math.round(rect.y), width: Math.round(rect.w), height: Math.round(rect.h) });
  ctx.resize({ width: outW, height: outH });
  const ref = await ctx.renderAsync();
  const res = await ref.saveAsync({ compress: 0.84, format: SaveFormat.JPEG, base64: true });
  return `data:image/jpeg;base64,${res.base64}`;
}

function CropModal({ uri, kind, onDone, onCancel }: { uri: string; kind: CropKind; onDone: (dataUri: string) => void; onCancel: () => void }) {
  const { c } = useTheme();
  const spec = SPEC[kind];
  const frameW = 300;
  const frameH = Math.round(frameW / spec.aspect);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const start = useRef({ x: 0, y: 0 });
  const live = useRef({ pos, zoom, size });
  live.current = { pos, zoom, size };

  useEffect(() => {
    getSize(uri)
      .then((s) => setSize(s))
      .catch(() => setSize({ w: frameW, h: frameH }));
  }, [uri, frameH]);

  const scale = size ? Math.max(frameW / size.w, frameH / size.h) * zoom : 1;
  const dispW = size ? size.w * scale : frameW;
  const dispH = size ? size.h * scale : frameH;
  const clampPos = useCallback(
    (p: { x: number; y: number }, w: number, h: number) => ({ x: Math.min(0, Math.max(frameW - w, p.x)), y: Math.min(0, Math.max(frameH - h, p.y)) }),
    [frameH],
  );

  // 처음·확대할 때 가운데 맞추기
  useEffect(() => {
    if (!size) return;
    setPos((p) => clampPos(p.x === 0 && p.y === 0 ? { x: (frameW - dispW) / 2, y: (frameH - dispH) / 2 } : p, dispW, dispH));
  }, [size, dispW, dispH, clampPos, frameH]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          start.current = { ...live.current.pos };
        },
        onPanResponderMove: (_e, g) => {
          const { size: s, zoom: z } = live.current;
          if (!s) return;
          const sc = Math.max(frameW / s.w, frameH / s.h) * z;
          setPos(clampPos({ x: start.current.x + g.dx, y: start.current.y + g.dy }, s.w * sc, s.h * sc));
        },
      }),
    [clampPos, frameH],
  );

  const setZoomKeepCenter = (z: number) => {
    if (!size) return;
    const nz = Math.max(1, Math.min(4, z));
    const s0 = Math.max(frameW / size.w, frameH / size.h);
    const cx = (frameW / 2 - pos.x) / (s0 * zoom);
    const cy = (frameH / 2 - pos.y) / (s0 * zoom);
    const nw = size.w * s0 * nz;
    const nh = size.h * s0 * nz;
    setZoom(nz);
    setPos(clampPos({ x: frameW / 2 - cx * s0 * nz, y: frameH / 2 - cy * s0 * nz }, nw, nh));
  };

  const apply = async () => {
    if (!size) return;
    setBusy(true);
    try {
      const rect = { x: -pos.x / scale, y: -pos.y / scale, w: frameW / scale, h: frameH / scale };
      const outH = Math.round(spec.outW / spec.aspect);
      onDone(await cropToDataUri(uri, rect, spec.outW, outH));
    } catch (e) {
      console.warn('[사진] 자르기 실패', e);
      onCancel();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.sheet, { backgroundColor: c.bg }]}>
      <View style={styles.head}>
        <Pressable onPress={onCancel} hitSlop={10} accessibilityLabel="취소">
          <IconClose size={22} color={c.text} />
        </Pressable>
        <Text style={{ color: c.text, fontSize: font.title, fontWeight: '800', flex: 1, marginLeft: 16 }}>{spec.title}</Text>
        <Button title="적용" size="sm" variant="ink" loading={busy} disabled={!size} onPress={apply} />
      </View>
      <View style={styles.stage}>
        <View
          {...pan.panHandlers}
          style={{ width: frameW, height: frameH, overflow: 'hidden', borderRadius: kind === 'avatar' ? frameW / 2 : 8, backgroundColor: '#000', borderWidth: 2, borderColor: c.primary }}
        >
          {size ? <Image source={{ uri }} style={{ position: 'absolute', left: pos.x, top: pos.y, width: dispW, height: dispH }} /> : null}
        </View>
        <Text style={{ color: c.subtext, fontSize: font.small, marginTop: 12 }}>끌어서 위치를 맞추고 +/−로 확대하세요</Text>
        <View style={styles.zoomRow}>
          <Pressable onPress={() => setZoomKeepCenter(zoom - 0.25)} style={[styles.zoomBtn, { borderColor: c.borderStrong }]} accessibilityLabel="축소">
            <IconZoomOut size={20} color={c.text} />
          </Pressable>
          <Text style={{ color: c.text, fontWeight: '700', width: 56, textAlign: 'center' }}>{Math.round(zoom * 100)}%</Text>
          <Pressable onPress={() => setZoomKeepCenter(zoom + 0.25)} style={[styles.zoomBtn, { borderColor: c.borderStrong }]} accessibilityLabel="확대">
            <IconZoomIn size={20} color={c.text} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/**
 * 사용법:
 *   const picker = usePhotoPicker();
 *   const id = await picker.pick('avatar');   // 사진 ID(취소하면 null)
 *   return <>{...}{picker.modal}</>;
 */
export function usePhotoPicker() {
  const [state, setState] = useState<{ uri: string; kind: CropKind; resolve: (id: string | null) => void } | null>(null);

  const pick = useCallback(async (kind: CropKind): Promise<string | null> => {
    const uri = await pickUri();
    if (!uri) return null;
    return new Promise<string | null>((resolve) => setState({ uri, kind, resolve }));
  }, []);

  const modal = state ? (
    <Modal visible transparent animationType="slide" onRequestClose={() => (state.resolve(null), setState(null))}>
      <View style={styles.backdrop}>
        <CropModal
          uri={state.uri}
          kind={state.kind}
          onCancel={() => {
            state.resolve(null);
            setState(null);
          }}
          onDone={async (dataUri) => {
            const outW = SPEC[state.kind].outW;
            const id = await putMedia(dataUri, state.kind === 'post' ? 'post' : state.kind, { w: outW, h: Math.round(outW / SPEC[state.kind].aspect) });
            state.resolve(id);
            setState(null);
          }}
        />
      </View>
    </Modal>
  ) : null;

  return { pick, modal };
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  sheet: { width: '100%', maxWidth: 420, borderRadius: radius.lg, paddingBottom: space.xl, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: space.md },
  stage: { alignItems: 'center', paddingTop: space.md },
  zoomRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  zoomBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
