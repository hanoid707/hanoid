/**
 * 클로드 엔진 — 클로드 아티팩트 페이지(claude.ai) 안에서만 동작한다.
 * 페이지 런타임의 sample 기능으로 "보는 사람 본인의 Claude 사용량"을 써서 답을 받는다.
 * - 첫 호출 때 허용 창이 한 번 뜬다. 거절하면 이번 접속 동안은 클로드를 건너뛴다(다른 AI가 없으면 그 반응은 비워 둠).
 * - 프롬프트·응답 정리는 제미나이 엔진과 같다(src/ai/prompts.ts, normalize.ts).
 * - 모델 등급: 짧은 반응(답글·쪽지·댓글·제안·캐릭터)은 quick, 세계를 움직이는 일(하루 정산·이벤트)은 default(균형 모드 기준).
 * - 사용량: 토큰 수를 알려 주지 않아서 글자 수로 추정(한국어 ≈ 1.25자/토큰), 요금은 0(Claude 요금제 사용량에서 차감).
 */
import { getArtifactCapability } from '../../config';
import { recordUsage } from '../../store/usage';
import type { AISettings } from '../../types';
import { clamp, hashStr, wellFormed } from '../../utils';
import * as N from '../normalize';
import * as P from '../prompts';
import type { AIContext, AIEngine } from '../types';

type Raw = Record<string, unknown>;
type Tier = 'quick' | 'default' | 'complex';
interface SampleFn {
  (input: string, opts?: Record<string, unknown>): Promise<{ text: string; truncated: boolean }>;
  json<T>(input: string, opts?: Record<string, unknown>): Promise<T>;
}

let samplePromise: Promise<SampleFn | null> | null = null;
function getSample(): Promise<SampleFn | null> {
  if (!samplePromise) samplePromise = getArtifactCapability<SampleFn>('sample');
  return samplePromise;
}

/** 이 화면에서 클로드를 쓸 수 있는지(허용 여부는 첫 호출 때 결정) */
export async function claudeAvailable(): Promise<boolean> {
  return !!(await getSample());
}

/** 클로드 오류. permanent = 다시 시도해도 안 되는 오류(이번 접속 동안 클로드 끄기) */
export class ClaudeError extends Error {
  constructor(
    message: string,
    public code: string,
    public permanent: boolean,
  ) {
    super(message);
  }
}

const HINT: Record<string, [string, boolean]> = {
  not_granted: ['클로드 사용이 허용되지 않았어요', true],
  sampling_disabled: ['이 계정에서는 클로드를 쓸 수 없어요', true],
  not_declared: ['이 페이지에 클로드 기능이 없어요', true],
  capability_disabled: ['이 화면에서는 클로드를 쓸 수 없어요', true],
  capability_removed: ['이 화면에서는 클로드를 쓸 수 없어요', true],
  rate_limited: ['클로드 사용량이 잠시 꽉 찼어요. 조금 뒤 다시', false],
  session_expired: ['claude.ai에 다시 로그인해 주세요', true],
  invalid_json: ['클로드 응답 형식이 어긋났어요', false],
  refused: ['클로드가 이 요청을 거절했어요', false],
};

/** 짧은 반응 = quick, 세계를 움직이는 일 = default */
const WORLD_KINDS = new Set(['tick', 'event', 'newEvent', 'cast']);
/** 글자 수 → 토큰 추정(한국어). 클로드 토크나이저 실측 0.75~0.86 토큰/자 → 약 1.25자/토큰 */
const estTokens = (chars: number) => Math.round(chars / 1.25);

export function createClaudeEngine(settings: AISettings): AIEngine {
  const mode = settings.claudeMode ?? 'balanced';
  const tierFor = (kind: string): Tier => (mode === 'fast' ? 'quick' : mode === 'quality' ? 'default' : WORLD_KINDS.has(kind) ? 'default' : 'quick');

  const call = async (ctx: AIContext | null, prompt: string, shape: string, kind: string): Promise<Raw> => {
    const sample = await getSample();
    if (!sample) throw new ClaudeError('이 화면에서는 클로드를 쓸 수 없어요', 'unavailable', true);
    const tier = tierFor(kind);
    const input = wellFormed(`${ctx ? P.systemFor(ctx) : P.LITE_SYSTEM}\n\n${prompt}\n\n[응답 형식]\n아래 모양의 JSON 값 하나만 출력한다(설명·코드펜스 없이). 글자 값은 자리일 뿐이니 새로 쓰고, <…> 자리는 [할 일]의 범위 안 정수로 바꿔 쓴다.\n${shape}`);
    const t0 = Date.now();
    const usage = (ok: boolean, out: number) =>
      recordUsage({ provider: 'claude', model: `claude-${tier}`, kind, inTok: estTokens(input.length), outTok: out, ms: Date.now() - t0, ok, via: 'sample', estimated: true });
    try {
      const r = await sample.json<Raw>(input, { modelTier: tier, cache: false });
      if (!r || typeof r !== 'object') throw new ClaudeError('클로드 응답이 비어 있어요', 'empty', false);
      usage(true, estTokens(JSON.stringify(r).length));
      return r;
    } catch (e) {
      usage(false, 0);
      if (e instanceof ClaudeError) throw e;
      const err = e as { code?: string; message?: string };
      const [msg, permanent] = HINT[err.code ?? ''] ?? [`클로드 오류: ${err.message ?? err.code ?? '알 수 없음'}`, false];
      throw new ClaudeError(msg, err.code ?? 'unknown', permanent);
    }
  };

  return {
    id: 'claude',

    async reactToPost(ctx, post, o) {
      const n = clamp(Math.round(o?.replies ?? 6), 1, 6);
      return N.normReact(ctx, await call(ctx, P.reactPrompt(ctx, post, n), P.SHAPES.react, 'react'), { n, seed: post.id });
    },

    async replyInThread(ctx, { target, reply, thread }) {
      const r = await call(ctx, P.threadPrompt(ctx, { target, reply, thread: thread ?? [] }), P.SHAPES.thread, 'thread');
      return N.normThread(ctx, r, `t${hashStr(reply)}`);
    },

    async dmReply(ctx, { characterId, history, message, priorSummary }) {
      if (!ctx.cast.some((x) => x.id === characterId)) return { mood: 'neutral', messages: [], leave: false, affinityDelta: 0, romanceDelta: 0, devotionDelta: 0 };
      const reg = ctx.cast.find((x) => x.id === characterId)?.register;
      const r = N.normDM(await call(ctx, P.dmPrompt(ctx, { characterId, history, message, priorSummary }), P.SHAPES.dm, 'dm'), reg);
      if (!r.messages.length && !r.leave) throw new ClaudeError('빈 답장이 왔어요', 'empty', false);
      return r;
    },

    async ambientPosts(ctx, count) {
      return N.normAmbient(ctx, await call(ctx, P.ambientPrompt(ctx, count), P.SHAPES.ambient, 'ambient'), count);
    },

    async worldTick(ctx, { day, returned }) {
      return N.normTick(ctx, await call(ctx, P.tickPrompt(ctx, day, returned), P.SHAPES.tick, 'tick'));
    },

    async resolveEvent(ctx, { event, choiceId, customText }) {
      return N.normOutcome(ctx, await call(ctx, P.outcomePrompt(ctx, event, choiceId, customText), P.SHAPES.outcome, 'event'), event);
    },

    async newEvent(ctx, { avoidTitles }) {
      const ev = N.normEventDraft(ctx, await call(ctx, P.newEventPrompt(ctx, avoidTitles), P.SHAPES.event, 'newEvent'));
      if (!ev || avoidTitles.includes(ev.title)) throw new ClaudeError('새 이벤트를 만들지 못했어요', 'empty', false);
      return ev;
    },

    async threadComments(ctx, { post, count, existing }) {
      const n = clamp(Math.round(count), 1, 6);
      const r = await call(ctx, P.commentsPrompt(ctx, post, n, existing), P.SHAPES.comments, 'threadComments');
      return N.normComments(ctx, r, { count: n, seed: `c${hashStr(post.text)}`, authorId: post.authorId });
    },

    async firstDM(ctx, { characterId }) {
      const c = ctx.cast.find((x) => x.id === characterId);
      if (!c) return [];
      return N.normFirstDM(await call(ctx, P.firstDMPrompt(ctx, characterId), P.SHAPES.firstDM, 'firstDM'), c.register);
    },

    async draftCharacter(ctx, args) {
      const r = await call(ctx, P.draftPrompt(ctx, args), P.SHAPES.draft, 'draft');
      return N.normDraft(r, args, `${args.name ?? ''}${args.traits}${Date.now()}`);
    },

    async generateCast(world) {
      return N.normCast(await call(null, P.castPrompt(world), P.SHAPES.cast, 'cast'));
    },
  };
}
