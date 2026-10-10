/**
 * 자라는 숫자(좋아요·재게시·조회수) — 게임은 최종 값을 바로 저장하고 post.growFrom(시작 값·시각·기간)을 남긴다.
 * 화면은 시작 값 → 최종 값으로 ms 동안 올라가게 보여 준다(처음에 확 오르고 점점 느려짐 = SNS 느낌).
 * 자라는 동안만 1초에 4번 다시 그리고, 다 자라면 멈춘다. 토큰·저장 0.
 */
import { useEffect, useState } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import type { Post } from '../types';
import { formatCount, viewsOf } from '../utils';

const TICK_MS = 250;

export interface Growth {
  likes: number;
  reposts: number;
  views: number;
  /** 아직 자라는 중 */
  growing: boolean;
}

/** 처음에 빠르고 끝에 느린 곡선 */
const ease = (t: number) => 1 - Math.pow(1 - t, 2.4);

/** 지금 시각의 숫자(순수 함수) */
export function growthAt(post: Post, now: number): Growth {
  const views = viewsOf(post);
  const g = post.growFrom;
  if (!g || !g.ms) return { likes: post.likes, reposts: post.reposts, views, growing: false };
  const t = (now - g.ts) / g.ms;
  if (t >= 1) return { likes: post.likes, reposts: post.reposts, views, growing: false };
  const e = ease(Math.max(0, t));
  // 시작 값보다 작아졌으면(마음에 들어요 취소 등) 그냥 지금 값
  const lerp = (a: number, b: number) => (b <= a ? b : Math.floor(a + (b - a) * e));
  return { likes: lerp(g.likes, post.likes), reposts: lerp(g.reposts, post.reposts), views: lerp(g.views, views), growing: true };
}

/** 글 하나의 자라는 숫자(자라는 동안만 다시 그림) */
export function useGrowth(post: Post): Growth {
  const g = post.growFrom;
  const end = g ? g.ts + g.ms : 0;
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!g || Date.now() >= end) return;
    const id = setInterval(() => {
      setTick((n) => n + 1);
      if (Date.now() >= end) clearInterval(id);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [g, end]);
  return growthAt(post, Date.now());
}

/** 숫자 하나만 따로 자라게 보여 줄 때 */
export function GrowingCount({ post, field, style, zeroBlank }: { post: Post; field: 'likes' | 'reposts' | 'views'; style?: StyleProp<TextStyle>; zeroBlank?: boolean }) {
  const n = useGrowth(post)[field];
  return <Text style={[{ fontVariant: ['tabular-nums'] }, style]}>{zeroBlank && n <= 0 ? '' : formatCount(n)}</Text>;
}
