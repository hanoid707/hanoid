/** 글쓴이 정보 통일: 나 / 캐릭터 / 시스템을 같은 모양으로 다룬다 */
import { GHOST, ME, SYSTEM, type Avatar, type BadgeKind, type ID, type Post, type Scenario } from '../types';

export interface AuthorInfo {
  id: ID;
  name: string;
  handle: string;
  avatar: Avatar;
  badge: BadgeKind | null;
  isNews: boolean;
  isMe: boolean;
  isSystem: boolean;
  /** 단체 계정(금색 배지) → 네모 아바타 */
  isOrg: boolean;
}

/** post를 같이 넘기면 임시 계정(GHOST) 작성자도 이름·사진을 보여 준다 */
export function authorOf(sc: Scenario, id: ID, post?: Pick<Post, 'ghost'>): AuthorInfo {
  if (id === GHOST) {
    const g = post?.ghost;
    return { id, name: g?.name ?? '익명', handle: g?.handle ?? 'user', avatar: { emoji: g?.emoji ?? '🙂', color: g?.color ?? '#94A3B8', photo: g?.photo }, badge: null, isNews: false, isMe: false, isSystem: false, isOrg: false };
  }
  if (id === ME) {
    return { id, name: sc.persona.name, handle: sc.persona.handle, avatar: sc.persona.avatar, badge: sc.persona.badge ?? (sc.stats.followers >= 10_000 ? 'blue' : null), isNews: false, isMe: true, isSystem: false, isOrg: false };
  }
  if (id === SYSTEM) {
    return { id, name: sc.world.name, handle: 'system', avatar: { emoji: sc.world.emoji, color: sc.world.color }, badge: 'gray', isNews: false, isMe: false, isSystem: true, isOrg: true };
  }
  const c = sc.characters[id];
  if (!c) return { id, name: '알 수 없는 계정', handle: 'unknown', avatar: { emoji: '❔', color: '#94A3B8' }, badge: null, isNews: false, isMe: false, isSystem: false, isOrg: false };
  const badge = c.badge === undefined ? (c.isNews ? 'gold' : c.verified ? 'blue' : null) : c.badge;
  return { id, name: c.name, handle: c.handle, avatar: c.avatar, badge, isNews: !!c.isNews, isMe: false, isSystem: false, isOrg: badge === 'gold' };
}
