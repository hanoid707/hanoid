/**
 * 선물 창 — 쪽지 대화·캐릭터 프로필에서만 연다(아이템 화면에는 없다).
 * 선물은 3종, 효과는 고른 수치 하나만 고정 +18: 👗 옷(호감도) · 💐 꽃(설렘) · 🧪 마법의 물약(정복도)
 * 고르면 바로 쪽지로 보내고 닫힌다.
 */
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { sendGift, type ActionResult } from '../game/actions';
import { GIFT_AMOUNT, giftBlocked, GIFTS, type GiftDef } from '../game/items';
import { useGame } from '../store/game';
import { font, radius, space, useTheme } from '../theme';
import type { Character } from '../types';
import { IconClose } from './icons';

const GIFT_FAIL: Record<Exclude<ActionResult, { ok: true }>['reason'], string> = {
  left: '지금은 대화방을 나간 상태예요. 나중에 다시 보내 보세요',
  busy: '답장을 기다리는 중이에요. 잠시 후에 다시 보내 주세요',
  none: '지금은 선물을 보낼 수 없어요',
  empty: '선물을 골라 주세요',
  limit: '지금은 선물을 보낼 수 없어요',
};

export function GiftSheet({ ch, open, onClose, onSent }: { ch: Character; open: boolean; onClose: () => void; onSent?: () => void }) {
  const { c } = useTheme();
  const showToast = useGame((s) => s.showToast);
  if (!open) return null;

  const send = (g: GiftDef) => {
    const r = sendGift(ch.id, g.id);
    if (!r.ok) {
      showToast(GIFT_FAIL[r.reason], 'error');
      return;
    }
    showToast(`${g.emoji} ${g.name} 선물 · ${g.statLabel} +${GIFT_AMOUNT}`);
    onClose();
    onSent?.();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: c.overlay }]}>
        {/* 바깥을 누르면 닫힘 — 창과 형제로 둬서 창 안을 눌러도 닫히지 않게 */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="선물 창 닫기" />
        <View style={[styles.sheet, { backgroundColor: c.bg, borderColor: c.border }]}>
          <View style={styles.head}>
            <Text style={{ color: c.text, fontSize: font.title, fontWeight: '800', flex: 1 }} numberOfLines={1}>
              {ch.name}님에게 선물
            </Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="선물 창 닫기">
              <IconClose size={20} color={c.text} />
            </Pressable>
          </View>
          <View style={styles.gifts}>
            {GIFTS.map((g) => {
              const blocked = giftBlocked(ch, g);
              return (
                <Pressable
                  key={g.id}
                  testID={`gift-${g.id}`}
                  onPress={() => send(g)}
                  disabled={!!blocked}
                  accessibilityRole="button"
                  accessibilityLabel={`${g.name} 선물하기, ${g.statLabel} +${GIFT_AMOUNT}`}
                  accessibilityState={{ disabled: !!blocked }}
                  style={({ pressed }) => [styles.gift, { borderColor: c.border, backgroundColor: pressed ? c.hover : c.bg, opacity: blocked ? 0.4 : 1 }]}
                >
                  <Text style={{ fontSize: 28 }}>{g.emoji}</Text>
                  <Text style={{ color: c.text, fontWeight: '800', fontSize: font.small, textAlign: 'center' }} numberOfLines={1}>
                    {g.name}
                  </Text>
                  <Text style={{ color: blocked ? c.subtext : c.like, fontSize: font.tiny, fontWeight: '700', textAlign: 'center' }} numberOfLines={2}>
                    {blocked ?? `${g.statLabel} +${GIFT_AMOUNT}`}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg },
  sheet: { width: '100%', maxWidth: 360, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space.lg, gap: space.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  gifts: { flexDirection: 'row', gap: 8 },
  gift: { flex: 1, minWidth: 0, alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 6, paddingVertical: 12 },
});
