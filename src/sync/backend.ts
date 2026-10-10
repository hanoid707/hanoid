/**
 * DB 동기화 백엔드 2종 — 같은 Supabase(aisns 스키마)를 서로 다른 길로 부른다.
 *  ① REST: 폰 앱·PC 웹. 공개 키 + 동기화 코드로 public.aisns_* 함수를 부른다.
 *  ② MCP : 클로드 아티팩트 페이지. 외부 인터넷이 막혀 있어서, 사용자의 Supabase 커넥터(execute_sql)로 부른다.
 * 어느 쪽이든 결과 모양은 같다(PullResult 등).
 */
import { CONFIG, getArtifactCapability } from '../config';
import type { Scenario } from '../types';
import { safeJson } from '../utils';

export interface PullResult {
  now: number;
  scenarios: { id: string; title: string; updatedTs: number; deleted: boolean; serverMs: number }[];
  media: string[];
  /** 공간 설정(지금은 공통 캐릭터 목록) — 바뀐 게 있을 때만 */
  settings?: { data: { roster?: unknown } | null; updatedTs: number } | null;
}

export interface RemoteScenario {
  id: string;
  title: string;
  data: Scenario | null;
  updatedTs: number;
  deleted: boolean;
}

export interface PushItem {
  id: string;
  title: string;
  data: Scenario | null;
  updatedTs: number;
  deleted: boolean;
}

export interface MediaItem {
  id: string;
  kind: string;
  mime: string;
  /** base64(접두어 없이) */
  data: string;
  w?: number;
  h?: number;
}

export interface SyncBackend {
  readonly kind: 'rest' | 'mcp';
  pull(since: number): Promise<PullResult>;
  get(ids: string[]): Promise<RemoteScenario[]>;
  push(items: PushItem[]): Promise<{ now: number; applied: string[]; stale: string[] }>;
  mediaPut(m: MediaItem): Promise<void>;
  mediaGet(ids: string[]): Promise<{ id: string; mime: string; data: string }[]>;
  /** 공간 설정 올리기(공통 캐릭터 목록 등) */
  settingsPut(data: object, updatedTs: number): Promise<void>;
}

/** 동기화 오류. blocked = 사용자가 직접 풀어야 하는 상태(승인·커넥터 연결 등) */
export class SyncError extends Error {
  constructor(
    message: string,
    public code: string,
    public blocked = false,
  ) {
    super(message);
  }
}

// ───────────────────────── ① REST

export function createRestBackend(url: string, apiKey: string, syncKey: string): SyncBackend {
  const headers: Record<string, string> = { apikey: apiKey, 'content-type': 'application/json' };
  if (apiKey.startsWith('eyJ')) headers.Authorization = `Bearer ${apiKey}`; // 구형 anon 키
  const rpc = async <T>(fn: string, body: Record<string, unknown>): Promise<T> => {
    let res: Response;
    try {
      res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: safeJson({ p_key: syncKey, ...body }) });
    } catch (e) {
      throw new SyncError(`네트워크 오류: ${(e as Error).message}`, 'network');
    }
    if (!res.ok) {
      let msg = `${res.status}`;
      try {
        const j = (await res.json()) as { message?: string };
        msg = j.message ?? msg;
      } catch {
        /* 무시 */
      }
      throw new SyncError(`DB 오류: ${msg}`, `http_${res.status}`, res.status === 400 && /key/i.test(msg));
    }
    return (await res.json()) as T;
  };
  return {
    kind: 'rest',
    pull: (since) => rpc<PullResult>('aisns_pull', { p_since: Math.max(0, Math.floor(since)) }),
    get: (ids) => rpc<RemoteScenario[]>('aisns_get', { p_ids: ids }),
    push: (items) => rpc('aisns_push', { p_items: items }),
    async mediaPut(m) {
      await rpc('aisns_media_put', { p_id: m.id, p_kind: m.kind, p_mime: m.mime, p_data: m.data, p_w: m.w ?? null, p_h: m.h ?? null });
    },
    mediaGet: (ids) => rpc('aisns_media_get', { p_ids: ids }),
    async settingsPut(data, updatedTs) {
      await rpc('aisns_settings_put', { p_data: data, p_updated_ts: Math.floor(updatedTs) });
    },
  };
}

// ───────────────────────── ② MCP(클로드 아티팩트 → Supabase 커넥터)

interface McpLike {
  callTool(server: string, tool: string, input?: unknown, options?: { cache?: false }): Promise<{ payload?: unknown; content?: { type: string; text?: string }[] }>;
}

/** 문자열 → UTF-8 → 16진수. SQL 안에 데이터를 넣을 때 키워드(drop·delete 등) 오인 차단을 피하려고 16진수로만 보낸다 */
function utf8Hex(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

function base64ToHex(b64: string): string {
  const bin = atob(b64);
  let out = '';
  for (let i = 0; i < bin.length; i++) out += bin.charCodeAt(i).toString(16).padStart(2, '0');
  return out;
}

/** execute_sql 결과(설명 문구 + <untrusted-data-…> 안의 JSON 행 목록)에서 행만 꺼낸다 */
export function parseSqlRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload as Record<string, unknown>[];
  let text: string | null = null;
  if (typeof payload === 'string') text = payload;
  else if (payload && typeof payload === 'object' && typeof (payload as { result?: unknown }).result === 'string') text = (payload as { result: string }).result;
  else if (payload && typeof payload === 'object' && Array.isArray((payload as { result?: unknown }).result)) return (payload as { result: Record<string, unknown>[] }).result;
  if (text === null) throw new SyncError('DB 응답을 읽지 못했어요', 'parse');
  // 안내 문장 안에도 같은 태그 이름이 한 번 나온다("…within the below <untrusted-data-…> boundaries").
  // → 여는 태그 바로 뒤가 '[' (JSON 행 목록)인 곳만 데이터로 본다. 같은 ID의 닫는 태그까지.
  const m = text.match(/<untrusted-data-([A-Za-z0-9-]+)>\s*(\[[\s\S]*?\])\s*<\/untrusted-data-\1>/);
  const body = m ? m[2] : text.trim().startsWith('[') ? text : null;
  if (body === null) {
    // 결과 없음/잘림 등: 앞뒤 일부를 남겨 원인 파악을 돕는다
    throw new SyncError(`DB 응답 해석 실패(데이터 영역 없음, ${text.length}자): …${text.slice(-160)}`, 'parse');
  }
  try {
    return JSON.parse(body) as Record<string, unknown>[];
  } catch {
    throw new SyncError(`DB 응답 해석 실패(JSON 오류, ${body.length}자): ${body.slice(0, 80)}…${body.slice(-80)}`, 'parse');
  }
}

const MCP_HINT: Record<string, string> = {
  approval_required: 'Supabase 커넥터 사용 승인이 필요해요',
  not_in_manifest: '이 페이지에서 Supabase 커넥터가 허용되지 않았어요',
  server_not_connected: 'claude.ai 설정 → 커넥터에서 Supabase를 연결해 주세요',
  needs_reauth: 'claude.ai 설정 → 커넥터에서 Supabase를 다시 연결해 주세요',
  selection_required: 'Supabase 커넥터를 하나 골라 주세요',
  not_granted: '이 페이지에 커넥터 권한이 없어요',
  capability_disabled: '이 화면에서는 커넥터를 쓸 수 없어요',
  blocked_by_policy: '조직 정책으로 커넥터가 막혀 있어요',
};

export function createMcpBackend(mcp: McpLike, projectId: string, label: string): SyncBackend {
  const lbl = label.replace(/[^A-Za-z0-9_-]/g, '');
  const sql = async (query: string): Promise<Record<string, unknown>[]> => {
    try {
      const res = await mcp.callTool('Supabase', 'execute_sql', { project_id: projectId, query }, { cache: false });
      const payload = res.payload ?? res.content?.find((b) => b.type === 'text')?.text;
      return parseSqlRows(payload);
    } catch (e) {
      if (e instanceof SyncError) throw e;
      const err = e as { code?: string; message?: string };
      const code = err.code ?? 'upstream_error';
      const blocked = code in MCP_HINT;
      throw new SyncError(MCP_HINT[code] ?? `커넥터 오류: ${err.message ?? code}`, code, blocked);
    }
  };
  const one = async <T>(query: string): Promise<T> => {
    const rows = await sql(query);
    return rows[0]?.r as T;
  };
  const idsExpr = (ids: string[]) => `array(select jsonb_array_elements_text(convert_from(decode('${utf8Hex(safeJson(ids))}', 'hex'), 'UTF8')::jsonb))`;
  return {
    kind: 'mcp',
    pull: (since) => one<PullResult>(`select aisns.pull_label('${lbl}', ${Math.max(0, Math.floor(since))}) as r`),
    get: (ids) => one<RemoteScenario[]>(`select aisns.get_label('${lbl}', ${idsExpr(ids)}) as r`),
    push: (items) => one(`select aisns.push_label('${lbl}', convert_from(decode('${utf8Hex(safeJson(items))}', 'hex'), 'UTF8')::jsonb) as r`),
    async mediaPut(m) {
      const meta = utf8Hex(safeJson({ id: m.id, kind: m.kind, mime: m.mime }));
      await one(
        `select aisns.media_put_label('${lbl}', (convert_from(decode('${meta}', 'hex'), 'UTF8')::jsonb)->>'id', (convert_from(decode('${meta}', 'hex'), 'UTF8')::jsonb)->>'kind', ` +
          `(convert_from(decode('${meta}', 'hex'), 'UTF8')::jsonb)->>'mime', translate(encode(decode('${base64ToHex(m.data)}', 'hex'), 'base64'), E'\\n', ''), ${m.w ?? 'null'}, ${m.h ?? 'null'}) as r`,
      );
    },
    mediaGet: (ids) => one(`select aisns.media_get_label('${lbl}', ${idsExpr(ids)}) as r`),
    async settingsPut(data, updatedTs) {
      await one(`select aisns.settings_put_label('${lbl}', convert_from(decode('${utf8Hex(safeJson(data))}', 'hex'), 'UTF8')::jsonb, ${Math.floor(updatedTs)}) as r`);
    },
  };
}

// ───────────────────────── 아티팩트에서 제미나이 부르기(Supabase 경유)
// claude.ai 페이지는 외부 인터넷이 막혀 있어서, 커넥터로 DB 함수 aisns.gemini_label 을 부르고
// DB(http 확장)가 제미나이를 대신 호출한다. 키는 DB 금고(vault)에만 있고 페이지에는 없다.

let mcpPromise: Promise<McpLike | null> | null = null;
async function artifactMcp(): Promise<McpLike | null> {
  if (!mcpPromise) mcpPromise = getArtifactCapability<McpLike>('mcp');
  return mcpPromise;
}

/** 아티팩트 안에서 제미나이 generateContent 호출(응답 본문 그대로) */
export async function geminiViaDb(model: string, body: object): Promise<{ status: number; body: unknown }> {
  const mcp = await artifactMcp();
  if (!mcp || !CONFIG.supabaseProject) throw new SyncError('이 화면에서는 Supabase 커넥터를 쓸 수 없어요', 'unavailable', true);
  const lbl = CONFIG.spaceLabel.replace(/[^A-Za-z0-9_-]/g, '');
  const mdl = model.replace(/[^A-Za-z0-9._-]/g, '');
  const query = `select aisns.gemini_label('${lbl}', '${mdl}', convert_from(decode('${utf8Hex(safeJson(body))}', 'hex'), 'UTF8')::jsonb) as r`;
  let res: { payload?: unknown; content?: { type: string; text?: string }[] };
  try {
    res = await mcp.callTool('Supabase', 'execute_sql', { project_id: CONFIG.supabaseProject, query }, { cache: false });
  } catch (e) {
    const err = e as { code?: string; message?: string };
    const code = err.code ?? 'upstream_error';
    throw new SyncError(MCP_HINT[code] ?? `커넥터 오류: ${err.message ?? code}`, code, code in MCP_HINT);
  }
  const rows = parseSqlRows(res.payload ?? res.content?.find((b) => b.type === 'text')?.text);
  const r = rows[0]?.r as { status?: number; body?: unknown } | undefined;
  if (!r) throw new SyncError('제미나이(DB 경유) 응답이 비어 있어요', 'parse');
  return { status: r.status ?? 0, body: r.body };
}
