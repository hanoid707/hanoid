/**
 * Worker 진입점
 *
 *   /api/login   → 비밀번호 확인(서버에서만). 맞으면 동기화 코드를 내려 준다.
 *   /api/gemini  → 서버가 키를 붙여 구글에 대신 요청한다.
 *   그 외          → dist 의 정적 파일(앱)
 *
 * 비밀값은 Cloudflare 환경변수(Secret)에만 있고 브라우저로 내려가지 않는다.
 */
import { onRequestPost as loginPost } from '../functions/api/login.js';
import { onRequestPost as geminiPost } from '../functions/api/gemini.js';

const notAllowed = (body) =>
  new Response(JSON.stringify(body), {
    status: 405,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);

    if (pathname === '/api/login') {
      if (request.method !== 'POST') return notAllowed({ ok: false, error: 'method_not_allowed' });
      return loginPost({ request, env, ctx });
    }

    if (pathname === '/api/gemini') {
      if (request.method !== 'POST') return notAllowed({ status: 405, body: { error: { message: 'method_not_allowed' } } });
      return geminiPost({ request, env, ctx });
    }

    return env.ASSETS.fetch(request);
  },
};
