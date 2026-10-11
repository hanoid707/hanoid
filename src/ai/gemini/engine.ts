/**
 * 제미나이 엔진 — AIEngine 인터페이스를 실제 구글 AI로 구현.
 * 프롬프트는 src/ai/prompts.ts, 응답 정리는 src/ai/normalize.ts(클로드 엔진과 공용).
 * 숫자 범위 검증은 게임 규칙(src/game/progress.ts)이 한 번 더 한다.
 *
 * 토큰 절약: 시스템 지시(규칙+세계관+플레이어)는 시나리오마다 고정 → 자동 캐시.
 * 호출 종류마다 출력 상한(maxOutputTokens)을 작게 잡고, 생각(thinking)은 최소로.
 */
import type { AISettings } from '../../types';
import { clamp, hashStr } from '../../utils';
import * as N from '../normalize';
import * as P from '../prompts';
import { DEFAULT_TUNE } from '../tune';
import type { AIContext, AIEngine } from '../types';
import { DEFAULT_GEMINI_MODEL, GeminiError, generateJSON, type GeminiVia } from './client';
import * as S from './schemas';

type Raw = Record<string, unknown>;

/** 호출 종류별 출력 토큰 상한 */
const MAX_OUT = {
  react: (n: number) => 380 + (n + 3) * 80,
  thread: 1200,
  dm: 460,
  ambient: (n: number) => 120 + n * 90,
  tick: 1500,
  event: 1400,
  newEvent: 600,
  comments: (n: number) => 120 + (n + 3) * 75,
  firstDM: 200,
  draft: 300,
  cast: 1800,
  bonds: 1700,
} as const;

export function createGeminiEngine(settings: AISettings, opts: { via?: GeminiVia } = {}): AIEngine {
  const model = settings.model?.trim() || DEFAULT_GEMINI_MODEL;
  const call = (ctx: AIContext | null, prompt: string, schema: object, kind: string, maxOutputTokens: number, temperature?: number) =>
    generateJSON<Raw>({ apiKey: settings.apiKey, model, system: ctx ? P.systemFor(ctx) : P.LITE_SYSTEM, prompt: prompt + P.avoidTail(ctx), schema, temperature, maxOutputTokens, kind, via: opts.via });

  return {
    id: 'gemini',

    async reactToPost(ctx, post, o) {
      const n = clamp(Math.round(o?.replies ?? 6), 1, 6);
      const tn = ctx.tune ?? DEFAULT_TUNE;
      const r = await call(ctx, P.reactPrompt(ctx, post, n), S.reactSchema(n, tn), 'react', MAX_OUT.react(n) + tn.echoPosts * 110 + tn.echoDMs * 80 + 60);
      return N.normReact(ctx, r, { n, seed: post.id });
    },

    async replyInThread(ctx, { target, reply, thread }) {
      const n = (ctx.tune ?? DEFAULT_TUNE).thread;
      const r = await call(ctx, P.threadPrompt(ctx, { target, reply, thread: thread ?? [] }), S.threadSchema(n), 'thread', MAX_OUT.thread);
      return N.normThread(ctx, r, `t${hashStr(reply)}`);
    },

    async dmReply(ctx, { characterId, history, message, priorSummary }) {
      if (!ctx.cast.some((x) => x.id === characterId)) return { mood: 'neutral', messages: [], leave: false, affinityDelta: 0, romanceDelta: 0, devotionDelta: 0 };
      const reg = ctx.cast.find((x) => x.id === characterId)?.register;
      const tn = ctx.tune ?? DEFAULT_TUNE;
      const bubbles = tn.dmBubbles;
      const cc = ctx.cast.find((x) => x.id === characterId);
      const heart = !!cc?.heartOk;
      const r = N.normDM(await call(ctx, P.dmPrompt(ctx, { characterId, history, message, priorSummary }), S.dmSchema(bubbles, !!tn.dmPost, heart), 'dm', MAX_OUT.dm + (tn.dmPost ? 110 : 0) + (heart ? 70 : 20)), reg, bubbles, ctx.avoid);
      if (!r.messages.length && !r.leave) throw new GeminiError('빈 답장이 왔어요', 200, false, 'empty');
      return r;
    },

    async ambientPosts(ctx, count) {
      return N.normAmbient(ctx, await call(ctx, P.ambientPrompt(ctx, count), S.ambientSchema(count), 'ambient', MAX_OUT.ambient(count), 1), count);
    },

    async worldTick(ctx, { day, returned }) {
      return N.normTick(ctx, await call(ctx, P.tickPrompt(ctx, day, returned), S.tickSchema(ctx.tune ?? DEFAULT_TUNE, returned?.length ?? 0, ctx.heartAsk?.length ?? 0), 'tick', MAX_OUT.tick + (ctx.heartAsk?.length ?? 0) * 60 + 60));
    },

    async resolveEvent(ctx, { event, choiceId, customText }) {
      const r = await call(ctx, P.outcomePrompt(ctx, event, choiceId, customText), S.outcomeSchema((ctx.tune ?? DEFAULT_TUNE).eventPosts), 'event', MAX_OUT.event, 0.8);
      return N.normOutcome(ctx, r, event);
    },

    async newEvent(ctx, { avoidTitles }) {
      const ev = N.normEventDraft(ctx, await call(ctx, P.newEventPrompt(ctx, avoidTitles), S.EVENT_SCHEMA, 'newEvent', MAX_OUT.newEvent, 1));
      if (!ev || avoidTitles.includes(ev.title)) throw new GeminiError('새 이벤트를 만들지 못했어요', 200, false, 'empty');
      return ev;
    },

    async threadComments(ctx, { post, count, existing }) {
      const n = clamp(Math.round(count), 1, 7);
      const r = await call(ctx, P.commentsPrompt(ctx, post, n, existing), S.commentsSchema(n), 'threadComments', MAX_OUT.comments(n), 1);
      return N.normComments(ctx, r, { count: n, seed: `c${hashStr(post.text)}`, authorId: post.authorId });
    },

    async firstDM(ctx, { characterId }) {
      const c = ctx.cast.find((x) => x.id === characterId);
      if (!c) return [];
      return N.normFirstDM(await call(ctx, P.firstDMPrompt(ctx, characterId), S.FIRST_DM_SCHEMA, 'firstDM', MAX_OUT.firstDM), c.register, ctx.avoid);
    },

    async draftCharacter(ctx, args) {
      const seed = `${args.name ?? ''}${args.traits}${Date.now()}`;
      const r = await call(ctx, P.draftPrompt(ctx, args), S.DRAFT_SCHEMA, 'draft', MAX_OUT.draft, 0.9);
      return N.normDraft(r, args, seed);
    },

    async generateCast(world) {
      return N.normCast(await call(null, P.castPrompt(world), S.CAST_SCHEMA, 'cast', MAX_OUT.cast, 1));
    },

    async castBonds(ctx) {
      return N.normBonds(ctx, await call(ctx, P.bondsPrompt(ctx), S.BONDS_SCHEMA, 'bonds', MAX_OUT.bonds, 0.8));
    },
  };
}

/** 설정 화면의 "연결 테스트"(아티팩트 안에서는 DB 경유) */
export async function pingGemini(settings: AISettings): Promise<string> {
  const r = await generateJSON<{ ok?: boolean; message?: string }>({
    apiKey: settings.apiKey,
    model: settings.model?.trim() || DEFAULT_GEMINI_MODEL,
    system: '짧게 답한다.',
    prompt: '연결 테스트다. ok=true, message에는 "연결 성공!"과 짧은 인사 한마디를 한국어로.',
    schema: S.PING_SCHEMA,
    temperature: 0.5,
    maxOutputTokens: 80,
    kind: 'ping',
  });
  return r.message || '연결 성공!';
}
