/**
 * 로그인 문단속 (웹 전용)
 *
 * - 비밀번호는 Cloudflare 환경변수에만 있고 번들에는 없다 → /api/login 이 서버에서 확인한다.
 * - 맞으면 동기화 코드를 받아 저장한다. 그때부터
 *     · Supabase 동기화가 붙고
 *     · 제미나이는 /api/gemini 로 호출된다(내 키를 넣을 필요가 없다)
 * - 5회 틀리면 이 기기를 잠근다.
 * - /api/login 이 없는 환경(앱·GitHub Pages)에서는 그냥 통과시킨다 — 앱이 멈추지 않게.
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { getProxyKey, setProxyKey } from '../ai/gemini/client';
import { useGame } from '../store/game';
import { restartSync } from '../sync';
import { useTheme } from '../theme';

const MAX_TRIES = 5;
const FAIL_KEY = 'aisns:loginFails:v1';
const LOCK_KEY = 'aisns:loginLocked:v1';

const readNum = (k: string) => {
  try {
    return Number(globalThis.localStorage?.getItem(k) ?? '0') || 0;
  } catch {
    return 0;
  }
};
const write = (k: string, v: string) => {
  try {
    globalThis.localStorage?.setItem(k, v);
  } catch {
    /* 저장이 막혀 있어도 이번 접속 동안은 동작한다 */
  }
};

type Phase = 'checking' | 'need-login' | 'locked' | 'open';

export function LoginGate({ children }: { children: React.ReactNode }) {
  const { c } = useTheme();
  const setSync = useGame((s) => s.setSync);
  const [phase, setPhase] = useState<Phase>('checking');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [left, setLeft] = useState(MAX_TRIES);

  // 들어올 때: 앱이면 통과, 이미 로그인했으면 통과, 서버가 없으면 통과
  useEffect(() => {
    if (Platform.OS !== 'web') return setPhase('open');
    if (readNum(LOCK_KEY) === 1) return setPhase('locked');
    if (getProxyKey()) return setPhase('open');
    let alive = true;
    void (async () => {
      try {
        // 서버가 살아 있는지만 확인(GET 은 405 를 준다 → 함수가 있다는 뜻)
        const res = await fetch('/api/login', { method: 'GET' });
        if (!alive) return;
        setLeft(Math.max(0, MAX_TRIES - readNum(FAIL_KEY)));
        setPhase(res.status === 404 ? 'open' : 'need-login');
      } catch {
        if (alive) setPhase('open'); // 서버에 못 닿으면 막지 않는다
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const submit = useCallback(async () => {
    if (busy || !pw) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; syncKey?: string };
      if (data.ok) {
        write(FAIL_KEY, '0');
        if (data.syncKey) {
          setProxyKey(data.syncKey);
          setSync({ enabled: true, key: data.syncKey });
          void restartSync();
        }
        setPw('');
        setPhase('open');
        return;
      }
      const fails = readNum(FAIL_KEY) + 1;
      write(FAIL_KEY, String(fails));
      const remain = MAX_TRIES - fails;
      setLeft(Math.max(0, remain));
      if (remain <= 0) {
        write(LOCK_KEY, '1');
        setPhase('locked');
        return;
      }
      setPw('');
      setMsg(`비밀번호가 맞지 않아요 · ${remain}번 남음`);
    } catch {
      setMsg('서버에 연결하지 못했어요');
    } finally {
      setBusy(false);
    }
  }, [busy, pw, setSync]);

  if (phase === 'checking') {
    return (
      <View style={[s.center, { backgroundColor: c.bg }]}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  if (phase === 'locked') {
    return (
      <View style={[s.center, { backgroundColor: c.bg }]}>
        <Text style={[s.title, { color: c.text }]}>잠김</Text>
        <Text style={[s.sub, { color: c.subtext }]}>비밀번호를 {MAX_TRIES}번 틀려서 이 기기에서는 열 수 없어요.</Text>
        <Text style={[s.sub, { color: c.subtext }]}>브라우저 사이트 데이터를 지우면 다시 시도할 수 있어요.</Text>
      </View>
    );
  }

  if (phase === 'open') return <>{children}</>;

  return (
    <View style={[s.center, { backgroundColor: c.bg }]}>
      <View style={s.box}>
        <Text style={[s.brand, { color: c.text }]}>Xsta</Text>
        <Text style={[s.sub, { color: c.subtext }]}>비밀번호를 입력하세요</Text>

        <TextInput
          value={pw}
          onChangeText={setPw}
          onSubmitEditing={submit}
          secureTextEntry
          autoFocus
          placeholder="비밀번호"
          placeholderTextColor={c.subtext}
          style={[s.input, { color: c.text, borderColor: msg ? '#E5484D' : c.border, backgroundColor: c.surfaceAlt }]}
        />

        <Pressable
          onPress={submit}
          disabled={busy || !pw}
          style={({ pressed }) => [s.btn, { backgroundColor: c.primary, opacity: busy || !pw ? 0.5 : pressed ? 0.85 : 1 }]}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>로그인</Text>}
        </Pressable>

        {msg ? <Text style={[s.err, { color: '#E5484D' }]}>{msg}</Text> : <Text style={[s.err, { color: c.subtext }]}>{left}번 남음</Text>}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  box: { width: '100%', maxWidth: 320, gap: 12 },
  brand: { fontSize: 32, fontWeight: '900', letterSpacing: -1.5, textAlign: 'center' },
  title: { fontSize: 22, fontWeight: '800', marginBottom: 6 },
  sub: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, marginTop: 8 },
  btn: { borderRadius: 999, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  err: { fontSize: 12, textAlign: 'center' },
});
