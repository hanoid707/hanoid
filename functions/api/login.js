/**
 * POST /api/login  — 비밀번호 확인(서버에서만)
 *
 * 비밀번호는 Cloudflare 환경변수(APP_PASSWORD)에만 있고 번들에는 없다.
 * 맞으면 동기화 코드를 내려 준다 → 앱이 그걸로 Supabase에 붙는다.
 * 따라서 동기화 코드도 번들에 넣을 필요가 없다.
 *
 * 필요한 환경변수(Cloudflare Pages > Settings > Variables and Secrets):
 *   APP_PASSWORD      로그인 비밀번호
 *   AISNS_SYNC_KEY    Supabase 동기화 코드
 */

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

/** 길이·내용이 달라도 비교 시간이 같게(비번을 한 글자씩 맞춰 보는 공격 차단) */
function sameSecret(a, b) {
  const ba = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  let diff = ba.length ^ bb.length;
  const n = Math.max(ba.length, bb.length);
  for (let i = 0; i < n; i++) diff |= (ba[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

export async function onRequestPost({ request, env }) {
  if (!env.APP_PASSWORD) return json({ ok: false, error: 'not_configured' }, 500);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'bad_request' }, 400);
  }

  const password = typeof body?.password === 'string' ? body.password : '';
  if (!sameSecret(password, env.APP_PASSWORD)) {
    // 무차별 대입 속도를 떨어뜨린다(응답을 조금 늦춘다)
    await new Promise((r) => setTimeout(r, 600));
    return json({ ok: false, error: 'wrong_password' }, 401);
  }

  return json({ ok: true, syncKey: env.AISNS_SYNC_KEY ?? '' });
}

export async function onRequest() {
  return json({ ok: false, error: 'method_not_allowed' }, 405);
}
