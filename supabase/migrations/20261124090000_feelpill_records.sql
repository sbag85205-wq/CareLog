-- ============================================================================
-- CareLog migration 11 — FeelPill(가칭) 약 기록 확장 (추가 방식, migration 10 다음에 적용)
--
-- * 기존 테이블·데이터는 지우거나 바꾸지 않습니다. 컬럼 추가(모두 기본값 있음) + 새 테이블 2개 + 함수.
--   → 이 migration 이 없는 DB에서도 기존 앱(약 목록·건강기록·로그인)은 그대로 동작
-- * 처방전 관련 표(migration 10)를 재사용: 일반약 구매·등록도 같은 표에 kind='otc' 로 저장 (중복 표 없음)
--     prescriptions       = 등록 묶음 (처방전 한 장 또는 일반약 등록 한 번)
--     prescription_items  = 묶음 안의 약 (제품명·성분·함량·약효 분류·사용자용 약 종류 따로 저장)
--     prescription_notes  = 복용 경험 (원본 메모 memo 와 자동 정리 suggested_tags·summary 를 따로 저장)
-- * intake_logs   = 복용 체크 (사용자가 '먹었어요'라고 남긴 기록 — 등록·처방과 별개)
-- * record_shares = 선택 공유 (기록 1건 · 사람 1명 · 허용 항목 · 기간 · 철회)
-- * 공유받은 사람은 기록 표를 직접 조회하지 못함 → shared_records_for_me() 가 허용 항목만 돌려줌
--   (migration 10 의 '보호자 공유(visible_to_guardian)' 조회 경로는 항목을 고를 수 없어 닫음. 컬럼 값은 보존)
-- ============================================================================

-- ── 등록 묶음: 처방·일반약 구분, 등록 방법 ───────────────────────────────────
alter table public.prescriptions
  add column kind   text not null default 'prescription' check (kind in ('prescription', 'otc')),
  add column source text not null default 'prescription'
    check (source in ('prescription', 'otc_box', 'receipt', 'search', 'manual'));

-- ── 약: 제품 정보 · 약효 분류 · 사용자용 약 종류 (서로 다른 컬럼) ─────────────
alter table public.prescription_items
  add column ingredients     text not null default '' check (char_length(ingredients) <= 300),  -- 식약처 주성분
  add column company         text not null default '' check (char_length(company) <= 60),
  add column drug_class      text not null default '' check (drug_class in ('', 'otc', 'rx')),   -- 일반/전문
  add column mfds_class      text not null default '' check (char_length(mfds_class) <= 60),   -- 식약처 약효 분류 원문
  add column categories      text[] not null default '{unclassified}'
    check (cardinality(categories) between 1 and 6
           and categories <@ array['pain', 'antiinflam', 'cold', 'digest', 'stomach', 'allergy', 'skin', 'bp', 'diabetes',
                                   'antibiotic', 'vitamin', 'eye', 'other', 'unclassified']::text[]),
  add column category_source text not null default 'none' check (category_source in ('mfds', 'ingredient', 'user', 'none')),
  add column edi_code        text check (edi_code ~ '^[0-9]{9}$'),
  add column starred         boolean not null default false,
  add column schedule_slots  text[] not null default '{}'
    check (schedule_slots <@ array['morning', 'noon', 'evening', 'bedtime']::text[]);
create index prescription_items_product on public.prescription_items (patient_id, external_item_seq) where external_item_seq is not null;
create index prescription_items_categories on public.prescription_items using gin (categories);

-- ── 복용 경험: 복용한 날 · 자동 정리(원본과 분리) ───────────────────────────
alter table public.prescription_notes
  add column taken_on       date check (taken_on between date '1990-01-01' and date '2100-12-31'),
  add column suggested_tags text[] not null default '{}' check (cardinality(suggested_tags) <= 20),
  add column summary        text not null default '' check (char_length(summary) <= 500),
  add column summary_source text not null default '' check (summary_source in ('', 'rule', 'ai'));
create index prescription_notes_tags on public.prescription_notes using gin (tags);

grant insert (kind, source) on public.prescriptions to authenticated;
grant insert (ingredients, company, drug_class, mfds_class, categories, category_source, edi_code, starred, schedule_slots)
  on public.prescription_items to authenticated;
grant update (categories, category_source, starred, schedule_slots) on public.prescription_items to authenticated;
grant insert (taken_on, suggested_tags, summary, summary_source) on public.prescription_notes to authenticated;
grant update (taken_on, suggested_tags, summary, summary_source) on public.prescription_notes to authenticated;

-- ── 공유받은 사람의 기록 표 직접 조회 닫기 (항목 선택 공유로 대체) ────────────
drop policy prescriptions_select on public.prescriptions;
create policy prescriptions_select on public.prescriptions for select to authenticated
  using (private.is_patient_self(patient_id) or private.is_assigned_staff(patient_id));
drop policy prescription_items_select on public.prescription_items;
create policy prescription_items_select on public.prescription_items for select to authenticated
  using (private.is_patient_self(patient_id) or private.is_assigned_staff(patient_id));
drop policy prescription_notes_select on public.prescription_notes;
create policy prescription_notes_select on public.prescription_notes for select to authenticated
  using (private.is_patient_self(patient_id) or private.is_assigned_staff(patient_id));
drop function private.rx_shared_with_me(uuid);

-- ── 등록 한 건 (처방·일반약 공통, 약까지 한 번에, 같은 request_id 는 기존 ID) ─────
create function public.create_med_record(
  p_patient_id uuid,
  p_request_id uuid,
  p_kind text,
  p_source text,
  p_date date,
  p_department text,
  p_clinic text,
  p_guidance text,
  p_items jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_kind text := coalesce(p_kind, 'prescription');
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 30 then
    raise exception 'invalid_input: 약은 1~30개까지 한 번에 등록할 수 있습니다' using errcode = '22023';
  end if;
  insert into public.prescriptions (patient_id, request_id, kind, source, prescribed_on, department, clinic, guidance)
  values (
    p_patient_id, p_request_id, v_kind,
    coalesce(p_source, case when v_kind = 'otc' then 'search' else 'prescription' end),
    p_date,
    case when v_kind = 'otc' then '' else btrim(coalesce(p_department, '')) end,
    btrim(coalesce(p_clinic, '')), btrim(coalesce(p_guidance, ''))
  )
  on conflict on constraint prescriptions_one_per_request do nothing
  returning id into v_id;
  if v_id is null then
    -- 이미 처리한 등록 (다시 누름·재시도) → 약을 다시 만들지 않음
    select id into v_id from public.prescriptions where patient_id = p_patient_id and request_id = p_request_id;
    return v_id;
  end if;
  insert into public.prescription_items
    (prescription_id, patient_id, name, strength, dosage, frequency, timing, duration, caution_rx, caution_mfds, external_item_seq,
     active, sort, ingredients, company, drug_class, mfds_class, categories, category_source, edi_code, schedule_slots)
  select v_id, p_patient_id, btrim(coalesce(e.item ->> 'name', '')),
         coalesce(e.item ->> 'strength', ''), coalesce(e.item ->> 'dosage', ''), coalesce(e.item ->> 'frequency', ''),
         coalesce(e.item ->> 'timing', ''), coalesce(e.item ->> 'duration', ''), coalesce(e.item ->> 'caution_rx', ''),
         coalesce(e.item ->> 'caution_mfds', ''), nullif(e.item ->> 'external_item_seq', ''),
         -- 일반약은 등록했다고 복용 중으로 보지 않음 (기본 false)
         coalesce((e.item ->> 'active')::boolean, v_kind = 'prescription'), (e.ord - 1)::smallint,
         coalesce(e.item ->> 'ingredients', ''), coalesce(e.item ->> 'company', ''), coalesce(e.item ->> 'drug_class', ''),
         coalesce(e.item ->> 'mfds_class', ''),
         coalesce((select array_agg(x) from jsonb_array_elements_text(case when jsonb_typeof(e.item -> 'categories') = 'array' then e.item -> 'categories' end) x), '{unclassified}'),
         coalesce(e.item ->> 'category_source', 'none'), nullif(e.item ->> 'edi_code', ''),
         coalesce((select array_agg(x) from jsonb_array_elements_text(case when jsonb_typeof(e.item -> 'schedule_slots') = 'array' then e.item -> 'schedule_slots' end) x), '{}')
  from jsonb_array_elements(p_items) with ordinality as e(item, ord);
  return v_id;
end
$$;
revoke execute on function public.create_med_record(uuid, uuid, text, text, date, text, text, text, jsonb) from public, anon;
grant execute on function public.create_med_record(uuid, uuid, text, text, date, text, text, text, jsonb) to authenticated;

-- ── 복용 체크 ──────────────────────────────────────────────────────────────
create table public.intake_logs (
  id         uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  item_id    uuid not null references public.prescription_items (id) on delete cascade,
  taken_on   date not null check (taken_on between date '1990-01-01' and date '2100-12-31'),
  slot       text not null check (slot in ('morning', 'noon', 'evening', 'bedtime', 'prn')),
  created_at timestamptz not null default now()
);
-- 정해진 시간대는 하루 한 번, 필요할 때 먹는 약(prn)은 여러 번
create unique index intake_logs_one_per_slot on public.intake_logs (item_id, taken_on, slot) where slot <> 'prn';
create index intake_logs_patient_day on public.intake_logs (patient_id, taken_on desc);
alter table public.intake_logs enable row level security;
revoke all on table public.intake_logs from anon, authenticated;

create function private.check_intake_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.prescription_items i where i.id = new.item_id and i.patient_id = new.patient_id) then
    raise exception 'invalid_input: 본인 약에만 복용 체크를 남길 수 있습니다' using errcode = '23514';
  end if;
  return new;
end
$$;
revoke execute on function private.check_intake_link() from public, anon, authenticated;
create trigger intake_logs_check_link before insert on public.intake_logs
  for each row execute function private.check_intake_link();

grant select, delete on public.intake_logs to authenticated;
grant insert (patient_id, item_id, taken_on, slot) on public.intake_logs to authenticated;
create policy intake_logs_select_self on public.intake_logs for select to authenticated using (private.is_patient_self(patient_id));
create policy intake_logs_insert_self on public.intake_logs for insert to authenticated with check (private.is_patient_self(patient_id));
create policy intake_logs_delete_self on public.intake_logs for delete to authenticated using (private.is_patient_self(patient_id));

-- ── 공유 상대의 관계 이름 (가족·연인·친구·보호자) — 기존 행은 비어 있음 ───────────
alter table public.access_grants
  add column relation text check (relation in ('family', 'partner', 'friend', 'guardian'));

create function public.set_grant_relation(p_grant_id uuid, p_relation text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_grant public.access_grants;
begin
  select * into v_grant from public.access_grants where id = p_grant_id for update;
  if v_grant.id is null or not private.is_patient_self(v_grant.patient_id) then
    raise exception 'not_found: 공유 정보를 찾을 수 없거나 권한이 없습니다' using errcode = 'P0002';
  end if;
  if p_relation is null or p_relation not in ('family', 'partner', 'friend', 'guardian') then
    raise exception 'invalid_input: 관계를 골라 주세요' using errcode = '22023';
  end if;
  update public.access_grants set relation = p_relation where id = p_grant_id;
end
$$;
revoke execute on function public.set_grant_relation(uuid, text) from public, anon;
grant execute on function public.set_grant_relation(uuid, text) to authenticated;

-- ── 선택 공유 ──────────────────────────────────────────────────────────────
create table public.record_shares (
  id              uuid primary key default gen_random_uuid(),
  patient_id      uuid not null references public.patients (id) on delete cascade,
  prescription_id uuid not null references public.prescriptions (id) on delete cascade,
  grantee_id      uuid not null references public.profiles (id) on delete cascade,
  fields          text[] not null default '{experience}'
    check (fields <@ array['ingredients', 'strength', 'howto', 'experience', 'department']::text[]),
  expires_at      timestamptz,
  revoked_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index record_shares_one_active on public.record_shares (prescription_id, grantee_id) where revoked_at is null;
create index record_shares_grantee on public.record_shares (grantee_id) where revoked_at is null;
alter table public.record_shares enable row level security;
revoke all on table public.record_shares from anon, authenticated;
create trigger record_shares_set_updated_at before update on public.record_shares
  for each row execute function private.set_updated_at();
-- 기록 주인만 공유 목록을 봄 (쓰기는 아래 함수만)
grant select on public.record_shares to authenticated;
create policy record_shares_select_self on public.record_shares for select to authenticated using (private.is_patient_self(patient_id));

create function public.share_record(p_prescription_id uuid, p_grantee_id uuid, p_fields text[], p_expires_at timestamptz)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_patient uuid;
  v_id uuid;
begin
  select patient_id into v_patient from public.prescriptions where id = p_prescription_id;
  if v_patient is null or not private.is_patient_self(v_patient) then
    raise exception 'not_found: 기록을 찾을 수 없거나 권한이 없습니다' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.access_grants g
    where g.patient_id = v_patient and g.grantee_id = p_grantee_id and g.revoked_at is null
  ) then
    raise exception 'forbidden: 공유를 수락한 사람에게만 공유할 수 있습니다' using errcode = '42501';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'invalid_input: 공유 기간을 확인해 주세요' using errcode = '22023';
  end if;
  -- 같은 기록·같은 사람의 활성 공유는 하나 — 새 설정으로 바꿈
  update public.record_shares set revoked_at = now()
  where prescription_id = p_prescription_id and grantee_id = p_grantee_id and revoked_at is null;
  insert into public.record_shares (patient_id, prescription_id, grantee_id, fields, expires_at)
  values (v_patient, p_prescription_id, p_grantee_id, coalesce(p_fields, '{experience}'), p_expires_at)
  returning id into v_id;
  return v_id;
end
$$;
revoke execute on function public.share_record(uuid, uuid, text[], timestamptz) from public, anon;
grant execute on function public.share_record(uuid, uuid, text[], timestamptz) to authenticated;

create function public.revoke_record_share(p_share_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_patient uuid;
begin
  select patient_id into v_patient from public.record_shares where id = p_share_id;
  if v_patient is null or not private.is_patient_self(v_patient) then
    raise exception 'not_found: 공유를 찾을 수 없거나 권한이 없습니다' using errcode = 'P0002';
  end if;
  update public.record_shares set revoked_at = coalesce(revoked_at, now()) where id = p_share_id;
end
$$;
revoke execute on function public.revoke_record_share(uuid) from public, anon;
grant execute on function public.revoke_record_share(uuid) to authenticated;

-- 나에게 공유된 기록 — 허용한 항목만 담아 돌려줌 (허용하지 않은 항목은 결과에 아예 없음)
-- 조건: 공유가 철회·만료되지 않음 + 공유 관계(access_grants)가 살아 있음 + 내 계정이 활성
create function public.shared_records_for_me()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(q.rec order by q.d desc, q.created desc), '[]'::jsonb)
  from (
    select p.prescribed_on as d, s.created_at as created, jsonb_strip_nulls(jsonb_build_object(
      'share_id', s.id,
      'patient_id', p.patient_id,
      'kind', p.kind,
      'date', p.prescribed_on,
      'fields', to_jsonb(s.fields),
      'expires_at', s.expires_at,
      'department', case when 'department' = any (s.fields) then p.department end,
      'clinic', case when 'department' = any (s.fields) then p.clinic end,
      'items', (
        select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
          'name', i.name,
          'categories', to_jsonb(i.categories),
          'ingredients', case when 'ingredients' = any (s.fields) then i.ingredients end,
          'strength', case when 'strength' = any (s.fields) then i.strength end,
          'howto', case when 'howto' = any (s.fields)
                     then concat_ws(' · ', nullif(i.dosage, ''), nullif(i.frequency, ''), nullif(i.timing, ''), nullif(i.duration, '')) end
        )) order by i.sort), '[]'::jsonb)
        from public.prescription_items i where i.prescription_id = p.id
      ),
      'notes', case when 'experience' = any (s.fields) then (
        select coalesce(jsonb_agg(jsonb_build_object(
          'target', coalesce((select i2.name from public.prescription_items i2 where i2.id = n.item_id),
                             case when p.kind = 'otc' then '이 등록 전체' else '처방 전체' end),
          'taken_on', n.taken_on,
          'tags', to_jsonb(n.tags),
          'memo', n.memo,
          'created_at', n.created_at
        ) order by n.created_at desc), '[]'::jsonb)
        from public.prescription_notes n where n.prescription_id = p.id
      ) end
    )) as rec
    from public.record_shares s
    join public.prescriptions p on p.id = s.prescription_id and p.patient_id = s.patient_id
    join public.access_grants g on g.patient_id = s.patient_id and g.grantee_id = s.grantee_id and g.revoked_at is null
    where s.grantee_id = (select auth.uid())
      and s.revoked_at is null
      and (s.expires_at is null or s.expires_at > now())
      and private.is_active_user()
  ) q
$$;
revoke execute on function public.shared_records_for_me() from public, anon;
grant execute on function public.shared_records_for_me() to authenticated;
