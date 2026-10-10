/**
 * POST /api/gemini  — 제미나이 대리 호출(키는 서버에만)
 *
 * 앱은 키 없이 이 주소로만 요청하고, 서버가 키를 붙여 구글에 보낸다.
 * 그래서 번들에도 브라우저 개발자도구에도 API 키가 나타나지 않는다.
 *
 * 아무나 불러서 요금을 태우지 못하게, 로그인해야 받을 수 있는
 * 동기화 코드를 x-sync-key 헤더로 요구한다.
 *
 * 필요한 환경변수(Cloudflare Pages > Settings > Variables and Secrets):
 *   GEMINI_API_KEY    구글 AI Studio 키
 *   AISNS_SYNC_KEY    Supabase 동기화 코드(= 호출 암호 역할)
 *
 * 요청:  { "model": "gemini-3.5-flash-lite", "body": { ...generateContent 본문... } }
 * 응답:  { "status": 200, "body": { ...구글 응답... } }
 */

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

function sameSecret(a, b) {
  const ba = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  let diff = ba.length ^ bb.length;
  const n = Math.max(ba.length, bb.length);
  for (let i = 0; i < n; i++) diff |= (ba[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

const MODEL_OK = /^[A-Za-z0-9._-]{3,64}$/;

export async function onRequestPost({ request, env }) {
  if (!env.GEMINI_API_KEY) return json({ status: 500, body: { error: { message: 'GEMINI_API_KEY not set' } } }, 500);

  const given = request.headers.get('x-sync-key') ?? '';
  if (!env.AISNS_SYNC_KEY || !sameSecret(given, env.AISNS_SYNC_KEY)) {
    return json({ status: 401, body: { error: { message: 'unauthorized' } } }, 401);
  }

  let req;
  try {
    req = await request.json();
  } catch {
    return json({ status: 400, body: { error: { message: 'bad json' } } }, 400);
  }

  const model = typeof req?.model === 'string' ? req.model : '';
  if (!MODEL_OK.test(model)) return json({ status: 400, body: { error: { message: 'bad model' } } }, 400);
  if (!req?.body || typeof req.body !== 'object') return json({ status: 400, body: { error: { message: 'bad body' } } }, 400);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 40_000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify(req.body),
      signal: controller.signal,
    });
    const text = await res.text();
    let parsed = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* JSON이 아니면 문자열 그대로 */
    }
    return json({ status: res.status, body: parsed }, 200);
  } catch (e) {
    const timedOut = e?.name === 'AbortError';
    return json({ status: timedOut ? 504 : 502, body: { error: { message: timedOut ? 'timeout' : String(e?.message ?? e) } } }, 200);
  } finally {
    clearTimeout(timer);
  }
}

export async function onRequest() {
  return json({ status: 405, body: { error: { message: 'method_not_allowed' } } }, 405);
}
