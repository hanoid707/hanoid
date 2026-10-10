/** 세계관 파일의 사진 설명(photo·scenes·banners) → photo_specs.json
 * 사용: npx tsx tools/photo_gen/step1_describe.ts photo_specs.json
 */
import { WORLDS } from '../../src/data/worlds';
import { writeFileSync } from 'node:fs';
const worlds = WORLDS;
const out = worlds.map((w) => ({
  id: w.id, name: w.name, color: w.color,
  cast: w.cast.map((c) => ({ key: c.key, tier: c.tier, name: c.name, handle: c.handle, archetype: c.archetype, photo: c.photo, color: c.color, org: !!c.org, verified: !!c.verified, posts: c.posts.length, media: c.posts.filter((p) => typeof p !== 'string').length })),
  scenes: w.scenes, banners: w.banners,
}));
writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
const handles = new Set<string>();
for (const w of worlds) {
  const keys = new Set<string>();
  const sceneKeys = new Set(w.scenes.map((s) => s.key));
  for (const c of w.cast) {
    if (keys.has(c.key)) console.log('DUP KEY', w.id, c.key);
    keys.add(c.key);
    if (!/^[a-z0-9_]{4,15}$/.test(c.handle)) console.log('BAD HANDLE', w.id, c.handle);
    if (handles.has(c.handle)) console.log('DUP HANDLE ACROSS WORLDS', w.id, c.handle);
    handles.add(c.handle);
    for (const p of c.posts) if (typeof p !== 'string' && !sceneKeys.has(p.media)) console.log('BAD MEDIA', w.id, c.key, p.media);
  }
  for (const e of w.events) for (const k of e.involved ?? []) if (!keys.has(k)) console.log('BAD INVOLVED', w.id, e.key, k);
  const core = w.cast.filter((c) => c.tier === 'core').length;
  console.log(w.id, w.name, 'core', core, 'crowd', w.cast.length - core, 'events', w.events.length, 'scenes', w.scenes.length, 'banners', w.banners.length,
    'faces', w.cast.filter((c) => c.photo.kind === 'face').length, 'faceless', w.cast.filter((c) => c.photo.kind === 'faceless').length, 'logo', w.cast.filter((c) => c.photo.kind === 'logo').length);
}
