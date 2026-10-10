/**
 * 드롭다운(목록 창) — 웹·폰 공통. 누르면 화면 가운데에 목록이 뜨고, 고르면 닫힌다.
 * 성격 유형(16가지)·말투 프리셋처럼 "골라도 되고 안 골라도 되는" 값에 쓴다.
 */
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { font, radius, space, useTheme } from '../theme';
import { IconCheck, IconChevronRight, IconClose } from './icons';

export interface DropdownOption {
  id: string;
  label: string;
  desc?: string;
}

export function Dropdown({
  label,
  value,
  options,
  onChange,
  placeholder = '선택 안 함',
  clearLabel = '선택 안 함',
  allowClear = true,
}: {
  label: string;
  value?: string | null;
  options: DropdownOption[];
  onChange: (id: string | undefined) => void;
  placeholder?: string;
  clearLabel?: string;
  allowClear?: boolean;
}) {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  const sel = options.find((o) => o.id === value);
  const choose = (id: string | undefined) => {
    onChange(id);
    setOpen(false);
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label} 고르기`}
        accessibilityValue={{ text: sel?.label ?? placeholder }}
        style={({ pressed }) => [styles.field, { borderColor: c.borderStrong, backgroundColor: pressed ? c.hover : 'transparent' }]}
      >
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={{ color: c.subtext, fontSize: font.small }}>{label}</Text>
          <Text style={{ color: sel ? c.text : c.faint, fontSize: font.body + 1, fontWeight: sel ? '700' : '400' }} numberOfLines={1}>
            {sel ? sel.label : placeholder}
            {sel?.desc ? <Text style={{ color: c.subtext, fontSize: font.small, fontWeight: '400' }}>{`  ${sel.desc}`}</Text> : null}
          </Text>
        </View>
        <View style={{ transform: [{ rotate: '90deg' }] }}>
          <IconChevronRight size={18} color={c.subtext} />
        </View>
      </Pressable>
      {open ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <View style={[styles.backdrop, { backgroundColor: c.overlay }]}>
            {/* 바깥(어두운 곳)을 누르면 닫힘 — 목록과 형제로 둬서 목록 안을 눌러도 닫히지 않게(웹은 클릭이 부모로 전달됨) */}
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} accessibilityLabel="목록 닫기" />
            <View style={[styles.sheet, { backgroundColor: c.bg, borderColor: c.border }]}>
              <View style={[styles.head, { borderBottomColor: c.border }]}>
                <Text style={{ color: c.text, fontSize: font.title, fontWeight: '800', flex: 1 }}>{label}</Text>
                <Pressable onPress={() => setOpen(false)} hitSlop={10} accessibilityRole="button" accessibilityLabel="목록 닫기">
                  <IconClose size={20} color={c.text} />
                </Pressable>
              </View>
              <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ paddingVertical: 4 }}>
                {allowClear ? (
                  <Row label={clearLabel} selected={!sel} onPress={() => choose(undefined)} muted />
                ) : null}
                {options.map((o) => (
                  <Row key={o.id} label={o.label} desc={o.desc} selected={o.id === value} onPress={() => choose(o.id)} />
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>
      ) : null}
    </>
  );
}

function Row({ label, desc, selected, onPress, muted }: { label: string; desc?: string; selected: boolean; onPress: () => void; muted?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.hover : selected ? c.primarySoft : 'transparent' }]}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: muted ? c.subtext : c.text, fontSize: font.body, fontWeight: '700' }}>{label}</Text>
        {desc ? <Text style={{ color: c.subtext, fontSize: font.small, marginTop: 1 }}>{desc}</Text> : null}
      </View>
      {selected ? <IconCheck size={18} color={c.primary} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 8, minHeight: 56 },
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg },
  sheet: { width: '100%', maxWidth: 420, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: space.lg, paddingVertical: 11 },
});
