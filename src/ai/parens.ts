/** 괄호 속 사실 — 플레이어가 괄호 ( ) 안에 쓴 행동·상황은 그 세계에서 실제로 일어난 일(최우선). 의존성 없는 작은 모듈 */

/** 플레이어 글의 괄호 속 문장(행동·상황). (-단어)·(+단어) 명령과 이모티콘 (-_-)·(ㅋㅋ)는 뺀다 */
export function parenFacts(text: string | undefined): string[] {
  const out: string[] = [];
  for (const m of (text ?? '').matchAll(/[(（]([^()（）]{2,160})[)）]/g)) {
    const t = m[1].replace(/\s+/g, ' ').trim();
    if (/^[-+]/.test(t)) continue;
    if ((t.match(/[가-힣A-Za-z]/g) ?? []).length < 2 || /^[ㄱ-ㅎㅏ-ㅣ\s~!.?^_;:-]+$/.test(t)) continue;
    if (!out.includes(t)) out.push(t);
  }
  return out.slice(0, 6);
}

