-- ============================================================================
-- AI-SNS — Supabase 저장소(스키마 aisns) · Supabase 프로젝트 'aisns'(서울)에 적용
-- 기존 테이블과 섞이지 않도록 별도 스키마에 만든다. SQL Editor에 통째로 붙여 실행하면 된다.
--   spaces    : 동기화 코드(해시)별 공간
--   scenarios : 세이브 전체(JSON) — 마지막 수정 시각(updated_ts)이 더 최신인 쪽이 이김
--   media     : 직접 고른 사진(base64 JPEG)
--   settings  : 공간 설정 — 지금은 공통 캐릭터 목록(data.roster)
--   prompts   : AI 지시문 저장소 — 연애 수위 단계별 문구(팀 공용, 공간과 무관)
-- 접근: 앱은 public.aisns_* 함수(코드 필요)만 부를 수 있다. 테이블 직접 접근은 RLS로 차단.
--       claude.ai 웹 페이지는 Supabase 커넥터로 aisns.*_label 함수(공간 이름)를 부른다.
--       웹 페이지의 제미나이 호출은 aisns.gemini_label → http 확장 → Google API (키는 vault 금고에만).
-- ============================================================================
create schema if not exists aisns;
revoke all on schema aisns from public, anon, authenticated;

create table if not exists aisns.spaces (
  id uuid primary key default gen_random_uuid(),
  key_hash text not null unique,
  label text,
  created_at timestamptz not null default now()
);
create unique index if not exists spaces_label_unique on aisns.spaces (label) where label is not null;

create table if not exists aisns.scenarios (
  space_id uuid not null references aisns.spaces(id) on delete cascade,
  id text not null,
  title text,
  data jsonb,
  updated_ts bigint not null default 0,
  deleted boolean not null default false,
  server_ms bigint not null default (extract(epoch from clock_timestamp()) * 1000)::bigint,
  primary key (space_id, id)
);
create index if not exists scenarios_space_server_ms on aisns.scenarios (space_id, server_ms);

create table if not exists aisns.media (
  space_id uuid not null references aisns.spaces(id) on delete cascade,
  id text not null,
  kind text not null default 'avatar',
  mime text not null default 'image/jpeg',
  data text not null,
  width int,
  height int,
  bytes int,
  server_ms bigint not null default (extract(epoch from clock_timestamp()) * 1000)::bigint,
  primary key (space_id, id)
);
create index if not exists media_space_server_ms on aisns.media (space_id, server_ms);

create table if not exists aisns.settings (
  space_id uuid primary key references aisns.spaces(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_ts bigint not null default 0,
  server_ms bigint not null default (extract(epoch from clock_timestamp()) * 1000)::bigint
);

alter table aisns.spaces enable row level security;
alter table aisns.scenarios enable row level security;
alter table aisns.media enable row level security;
alter table aisns.settings enable row level security;
revoke all on all tables in schema aisns from public, anon, authenticated;

create or replace function aisns._now_ms() returns bigint
language sql stable set search_path = '' as $$ select (extract(epoch from clock_timestamp()) * 1000)::bigint $$;

-- 동기화 코드 → 공간 ID (없으면 새로 만든다)
create or replace function aisns._space(p_key text, p_create boolean default true) returns uuid
language plpgsql security definer set search_path = '' as $$
declare h text; sid uuid;
begin
  if p_key is null or length(p_key) < 24 then raise exception 'invalid sync key'; end if;
  h := encode(sha256(convert_to(p_key, 'UTF8')), 'hex');
  select s.id into sid from aisns.spaces s where s.key_hash = h;
  if sid is null and p_create then
    insert into aisns.spaces(key_hash) values (h) on conflict (key_hash) do nothing returning id into sid;
    if sid is null then select s.id into sid from aisns.spaces s where s.key_hash = h; end if;
  end if;
  if sid is null then raise exception 'unknown space'; end if;
  return sid;
end $$;

create or replace function aisns._space_label(p_label text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare sid uuid;
begin
  select s.id into sid from aisns.spaces s where s.label = p_label;
  if sid is null then raise exception 'unknown space label'; end if;
  return sid;
end $$;

-- 코드로 찾은 공간에 이름 붙이기(웹 페이지가 이름으로 찾음)
create or replace function aisns.claim_label(p_key text, p_label text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare sid uuid := aisns._space(p_key);
begin
  update aisns.spaces set label = null where label = p_label and id <> sid;
  update aisns.spaces set label = p_label where id = sid;
  return jsonb_build_object('ok', true, 'space', sid);
end $$;

-- ───────── 공간 ID 기준 내부 함수
create or replace function aisns.pull_sid(sid uuid, p_since bigint) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'now', aisns._now_ms(),
    'scenarios', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'updatedTs', s.updated_ts, 'deleted', s.deleted, 'serverMs', s.server_ms) order by s.server_ms)
      from aisns.scenarios s where s.space_id = sid and s.server_ms > coalesce(p_since, 0)), '[]'::jsonb),
    'media', coalesce((select jsonb_agg(m.id) from aisns.media m where m.space_id = sid and m.server_ms > coalesce(p_since, 0)), '[]'::jsonb),
    'settings', (select jsonb_build_object('data', st.data, 'updatedTs', st.updated_ts) from aisns.settings st where st.space_id = sid and st.server_ms > coalesce(p_since, 0))
  )
$$;

create or replace function aisns.get_sid(sid uuid, p_ids text[]) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'data', s.data, 'updatedTs', s.updated_ts, 'deleted', s.deleted))
    from aisns.scenarios s where s.space_id = sid and s.id = any(p_ids)), '[]'::jsonb)
$$;

create or replace function aisns.push_sid(sid uuid, p_items jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare it jsonb; applied text[] := '{}'; stale text[] := '{}'; n int;
begin
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    insert into aisns.scenarios as s (space_id, id, title, data, updated_ts, deleted, server_ms)
    values (sid, it->>'id', it->>'title', case when coalesce((it->>'deleted')::boolean, false) then null else it->'data' end,
            coalesce((it->>'updatedTs')::bigint, 0), coalesce((it->>'deleted')::boolean, false), aisns._now_ms())
    on conflict (space_id, id) do update
      set title = excluded.title, data = excluded.data, updated_ts = excluded.updated_ts, deleted = excluded.deleted, server_ms = excluded.server_ms
      where s.updated_ts < excluded.updated_ts;
    get diagnostics n = row_count;
    if n > 0 then applied := applied || (it->>'id'); else stale := stale || (it->>'id'); end if;
  end loop;
  return jsonb_build_object('now', aisns._now_ms(), 'applied', to_jsonb(applied), 'stale', to_jsonb(stale));
end $$;

create or replace function aisns.media_put_sid(sid uuid, p_id text, p_kind text, p_mime text, p_data text, p_w int, p_h int) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if p_data is null or length(p_data) > 3000000 then raise exception 'media too large'; end if;
  insert into aisns.media as m (space_id, id, kind, mime, data, width, height, bytes, server_ms)
  values (sid, p_id, coalesce(p_kind, 'avatar'), coalesce(p_mime, 'image/jpeg'), p_data, p_w, p_h, (length(p_data) * 3 / 4), aisns._now_ms())
  on conflict (space_id, id) do update set kind = excluded.kind, mime = excluded.mime, data = excluded.data, width = excluded.width,
    height = excluded.height, bytes = excluded.bytes, server_ms = excluded.server_ms;
  return jsonb_build_object('ok', true, 'id', p_id);
end $$;

create or replace function aisns.media_get_sid(sid uuid, p_ids text[]) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'mime', m.mime, 'data', m.data))
    from aisns.media m where m.space_id = sid and m.id = any(p_ids)), '[]'::jsonb)
$$;

create or replace function aisns.settings_put_sid(sid uuid, p_data jsonb, p_updated_ts bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  insert into aisns.settings as st (space_id, data, updated_ts, server_ms) values (sid, coalesce(p_data, '{}'::jsonb), p_updated_ts, aisns._now_ms())
  on conflict (space_id) do update set data = excluded.data, updated_ts = excluded.updated_ts, server_ms = excluded.server_ms
  where st.updated_ts < excluded.updated_ts;
  return jsonb_build_object('ok', true);
end $$;

-- ───────── 앱(REST)용: 동기화 코드 필요
create or replace function public.aisns_pull(p_key text, p_since bigint default 0) returns jsonb
language sql security definer set search_path = '' as $$ select aisns.pull_sid(aisns._space(p_key), p_since) $$;
create or replace function public.aisns_get(p_key text, p_ids text[]) returns jsonb
language sql security definer set search_path = '' as $$ select aisns.get_sid(aisns._space(p_key), p_ids) $$;
create or replace function public.aisns_push(p_key text, p_items jsonb) returns jsonb
language sql security definer set search_path = '' as $$ select aisns.push_sid(aisns._space(p_key), p_items) $$;
create or replace function public.aisns_media_put(p_key text, p_id text, p_kind text, p_mime text, p_data text, p_w int default null, p_h int default null) returns jsonb
language sql security definer set search_path = '' as $$ select aisns.media_put_sid(aisns._space(p_key), p_id, p_kind, p_mime, p_data, p_w, p_h) $$;
create or replace function public.aisns_media_get(p_key text, p_ids text[]) returns jsonb
language sql security definer set search_path = '' as $$ select aisns.media_get_sid(aisns._space(p_key), p_ids) $$;
create or replace function public.aisns_settings_put(p_key text, p_data jsonb, p_updated_ts bigint) returns jsonb
language sql security definer set search_path = '' as $$ select aisns.settings_put_sid(aisns._space(p_key), p_data, p_updated_ts) $$;

-- ───────── 웹 페이지(커넥터)용: 공간 이름
create or replace function aisns.pull_label(p_label text, p_since bigint default 0) returns jsonb
language sql security definer set search_path = '' as $$ select aisns.pull_sid(aisns._space_label(p_label), p_since) $$;
create or replace function aisns.get_label(p_label text, p_ids text[]) returns jsonb
language sql security definer set search_path = '' as $$ select aisns.get_sid(aisns._space_label(p_label), p_ids) $$;
create or replace function aisns.push_label(p_label text, p_items jsonb) returns jsonb
language sql security definer set search_path = '' as $$ select aisns.push_sid(aisns._space_label(p_label), p_items) $$;
create or replace function aisns.media_put_label(p_label text, p_id text, p_kind text, p_mime text, p_data text, p_w int default null, p_h int default null) returns jsonb
language sql security definer set search_path = '' as $$ select aisns.media_put_sid(aisns._space_label(p_label), p_id, p_kind, p_mime, p_data, p_w, p_h) $$;
create or replace function aisns.media_get_label(p_label text, p_ids text[]) returns jsonb
language sql security definer set search_path = '' as $$ select aisns.media_get_sid(aisns._space_label(p_label), p_ids) $$;
create or replace function aisns.settings_put_label(p_label text, p_data jsonb, p_updated_ts bigint) returns jsonb
language sql security definer set search_path = '' as $$ select aisns.settings_put_sid(aisns._space_label(p_label), p_data, p_updated_ts) $$;

-- ───────── 권한: 내부·이름 경로는 닫고, 코드 경로만 연다
do $$
declare f text;
begin
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'aisns' loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;
revoke all on function public.aisns_pull(text, bigint) from public;
revoke all on function public.aisns_get(text, text[]) from public;
revoke all on function public.aisns_push(text, jsonb) from public;
revoke all on function public.aisns_media_put(text, text, text, text, text, int, int) from public;
revoke all on function public.aisns_media_get(text, text[]) from public;
revoke all on function public.aisns_settings_put(text, jsonb, bigint) from public;
grant execute on function public.aisns_pull(text, bigint) to anon, authenticated;
grant execute on function public.aisns_get(text, text[]) to anon, authenticated;
grant execute on function public.aisns_push(text, jsonb) to anon, authenticated;
grant execute on function public.aisns_media_put(text, text, text, text, text, int, int) to anon, authenticated;
grant execute on function public.aisns_media_get(text, text[]) to anon, authenticated;
grant execute on function public.aisns_settings_put(text, jsonb, bigint) to anon, authenticated;

-- ───────── 프롬프트 저장소: 연애 수위 단계별 지시문(팀 공용·공간과 무관)
--   key: romance.mild / romance.racy / romance.erotic / romance.common
--   앱은 시작할 때·5분마다 받아 쓰고, 못 받으면 코드에 든 기본 문구(src/ai/prompts.ts)로 돌아간다.
--   수정: 대시보드 Table Editor → 스키마 aisns → prompts 에서 content 를 고치면 version·updated_at 이 자동으로 오른다.
create table if not exists aisns.prompts (
  key text primary key,
  content text not null,
  note text,
  version int not null default 1,
  updated_at timestamptz not null default now()
);
alter table aisns.prompts enable row level security;
revoke all on aisns.prompts from public, anon, authenticated;

create or replace function aisns._prompts_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists prompts_touch on aisns.prompts;
create trigger prompts_touch before update of content on aisns.prompts
  for each row when (old.content is distinct from new.content) execute function aisns._prompts_touch();

create or replace function aisns.prompts_all() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('key', p.key, 'content', p.content, 'version', p.version) order by p.key), '[]'::jsonb) from aisns.prompts p
$$;
-- 앱(REST)용: 동기화 코드 필요
create or replace function public.aisns_prompts(p_key text) returns jsonb
language sql stable security definer set search_path = '' as $$ select case when aisns._space(p_key, false) is not null then aisns.prompts_all() end $$;
-- 웹 페이지(커넥터)용: 공간 이름
create or replace function aisns.prompts_label(p_label text) returns jsonb
language sql stable security definer set search_path = '' as $$ select case when aisns._space_label(p_label) is not null then aisns.prompts_all() end $$;

insert into aisns.prompts (key, content, note) values
('romance.mild', $p$[연애 수위]
단계: 기본. 감정=플러팅에 수줍어하고 쑥스러워함 / 신체= 툭 치기·어깨 밀기 등 친근한 스킨십 / 설렘 없는 친근한 태도.
- 칭찬을 들으면 솔직하게 기뻐함. 플러팅엔 얼굴이 붉어지며 부끄러워 함(싫어한다면 그렇지 않음). 챙김은 친절한 행동과 따뜻한 말로 표현.$p$, '연애 수위 1단계(나 탭: 기본)'),
('romance.racy', $p$[연애 수위]
단계: 앙큼. 감정=대담한 밀당·앙큼한 도발 / 신체= 어깨동무나 팔짱 끼면서 가슴닿게 하기, 허리·목선 밀착 스킨십 / 먼저 섹시한 농담과 분위기를 주도.
- 은근한 시선과 밀착 터치로 플레이어를 안달 나게 만듦. 수위 높은 농담엔 한 수 위로 도발하거나 앙큼하게 받아치며 흐름을 리드함.$p$, '연애 수위 2단계(나 탭: 앙큼)'),
('romance.erotic', $p$[연애 수위]
단계: 에로틱. 감정=유혹·노골적인 욕망 / 신체=주도적으로 덮치듯 밀착, 더 자극적인 장소나 상황으로 끌어들여 유혹함.$p$, '연애 수위 3단계(나 탭: 에로틱)'),
('romance.common', $p$[연애 공통]
- ⛔ 연애X 표시(실존 인물일 수 있음)·가족·10대: 어떤 수위에서도 연애·성적 반응 없이 팬·동료·가족으로만. rom 0.
- 설렘 표현은 수치만큼: 0~15 아직 좋아하기 보단 호기심 · 15~29 약간 좋아하는데 헷갈려 함 · 30~50 좋아하는 티를 냄 · 51~74 좋아하고 스킨십하고 싶어함 · 75↑ 완전히 무조건적인 사랑에 빠짐.$p$, '연애 수위 공통(모든 단계 뒤에 붙음)')
on conflict (key) do nothing;

revoke all on function aisns.prompts_all() from public, anon, authenticated;
revoke all on function aisns.prompts_label(text) from public, anon, authenticated;
revoke all on function aisns._prompts_touch() from public, anon, authenticated;
revoke all on function public.aisns_prompts(text) from public;
grant execute on function public.aisns_prompts(text) to anon, authenticated;

-- ───────── 대시보드에서 보기 쉬운 읽기 전용 뷰
create or replace view aisns.v_scenarios with (security_invoker = true) as
select s.space_id, s.id, s.title, to_timestamp(s.updated_ts / 1000.0) as updated_at, s.deleted,
  s.data->'world'->>'name' as world, s.data->'persona'->>'name' as player,
  jsonb_array_length(coalesce(s.data->'cast', '[]'::jsonb)) as characters,
  (select count(*) from jsonb_object_keys(coalesce(s.data->'posts', '{}'::jsonb))) as posts
from aisns.scenarios s;

create or replace view aisns.v_characters with (security_invoker = true) as
select s.space_id, s.id as scenario_id, s.title as scenario, c.key as character_id,
  c.value->>'name' as name, c.value->>'handle' as handle, c.value->>'badge' as badge,
  c.value->>'bio' as bio, c.value->>'description' as description,
  (c.value->>'affinity')::int as affinity, (c.value->>'followsMe')::boolean as follows_me, (c.value->>'iFollow')::boolean as i_follow
from aisns.scenarios s, jsonb_each(coalesce(s.data->'characters', '{}'::jsonb)) c
where not s.deleted;

create or replace view aisns.v_dms with (security_invoker = true) as
select s.space_id, s.id as scenario_id, d.key as character_id,
  s.data->'characters'->d.key->>'name' as with_name,
  m.value->>'from' as sender, m.value->>'text' as text,
  to_timestamp((m.value->>'ts')::bigint / 1000.0) as sent_at
from aisns.scenarios s, jsonb_each(coalesce(s.data->'dms', '{}'::jsonb)) d, jsonb_array_elements(coalesce(d.value->'messages', '[]'::jsonb)) m
where not s.deleted;

create or replace view aisns.v_posts with (security_invoker = true) as
select s.space_id, s.id as scenario_id, p.key as post_id, p.value->>'authorId' as author_id,
  coalesce(s.data->'characters'->(p.value->>'authorId')->>'name', p.value->'ghost'->>'name', case when p.value->>'authorId' = 'me' then s.data->'persona'->>'name' else p.value->>'authorId' end) as author,
  p.value->>'kind' as kind, p.value->>'text' as text, (p.value->>'likes')::int as likes,
  to_timestamp((p.value->>'ts')::bigint / 1000.0) as posted_at
from aisns.scenarios s, jsonb_each(coalesce(s.data->'posts', '{}'::jsonb)) p
where not s.deleted;

create or replace view aisns.v_roster with (security_invoker = true) as
select st.space_id, e.value->>'name' as name, e.value->>'handle' as handle, e.value->>'type' as type,
  (e.value->>'followers')::bigint as followers, e.value->>'bio' as bio, e.value->>'traits' as traits,
  to_timestamp((e.value->>'updatedTs')::bigint / 1000.0) as updated_at
from aisns.settings st, jsonb_array_elements(coalesce(st.data->'roster'->'entries', '[]'::jsonb)) e;

revoke all on all tables in schema aisns from public, anon, authenticated;

-- ───────── 웹 페이지(claude.ai 아티팩트)의 제미나이 호출 대리(외부 인터넷이 막힌 페이지용)
-- 페이지 → Supabase 커넥터(execute_sql) → 이 함수 → http 확장 → Google generateContent
-- 키는 vault 금고에만 둔다(코드·페이지에 없음). 공개 키(anon)로는 부를 수 없다(커넥터 = 프로젝트 소유자 권한만).
create extension if not exists http with schema extensions;

create or replace function aisns.gemini_label(p_label text, p_model text, p_body jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare k text; r extensions.http_response;
begin
  perform aisns._space_label(p_label); -- 등록된 공간 이름만
  if p_model !~ '^[A-Za-z0-9._-]{3,64}$' then raise exception 'bad model'; end if;
  select ds.decrypted_secret into k from vault.decrypted_secrets ds where ds.name = 'gemini_api_key' limit 1;
  if k is null then return jsonb_build_object('status', 401, 'body', jsonb_build_object('error', jsonb_build_object('message', 'gemini_api_key not set in vault'))); end if;
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', '40');
  select * into r from extensions.http((
    'POST',
    'https://generativelanguage.googleapis.com/v1beta/models/' || p_model || ':generateContent',
    array[extensions.http_header('x-goog-api-key', k)],
    'application/json',
    p_body::text
  )::extensions.http_request);
  return jsonb_build_object('status', r.status, 'body', case when r.content is null or r.content = '' then null else r.content::jsonb end);
exception when others then
  return jsonb_build_object('status', 599, 'body', jsonb_build_object('error', jsonb_build_object('message', sqlerrm)));
end $$;
revoke all on function aisns.gemini_label(text, text, jsonb) from public, anon, authenticated;

-- 처음 한 번(설치 직후):
-- 1) 내 동기화 코드 공간에 이름 'main' 붙이기(웹 페이지가 이 이름으로 찾음)
--    select aisns.claim_label('<동기화 코드>', 'main');
-- 2) 제미나이 키를 금고에 넣기(웹 페이지에서 제미나이를 쓸 때만)
--    select vault.create_secret('<Gemini API 키>', 'gemini_api_key');
