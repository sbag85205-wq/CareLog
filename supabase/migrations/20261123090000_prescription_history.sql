-- ============================================================================
-- CareLog migration 10 — 처방 이력 · 복용 경험 · 진료 질문 연결 (추가 방식)
--
-- * 기존 테이블·데이터·정책은 바꾸지 않습니다. 새 테이블 3개 + visit_questions 에 선택 컬럼 1개 추가.
--   → 이 migration 이 적용되지 않은 DB에서도 기존 앱(약 목록·건강기록·로그인)은 그대로 동작
-- * 처방(prescriptions) 1건 = 처방일·진료과 + 그때 확인해 저장한 약(prescription_items)
-- * 복용 경험(prescription_notes) = 환자 본인이 남긴 태그·메모 (처방 전체 또는 특정 약)
-- * 같은 등록 요청(request_id)은 한 건만 — create_prescription() 이 중복 생성을 막음
-- * 보호자: 환자가 처방별로 '보호자 공유'를 켜고, 보호자에게 '약 정보' 공유 범위가 있을 때만 조회
-- ============================================================================

create table public.prescriptions (
  id                  uuid primary key default gen_random_uuid(),
  patient_id          uuid not null references public.patients (id) on delete cascade,
  request_id          uuid not null,
  prescribed_on       date not null check (prescribed_on between date '1990-01-01' and date '2100-12-31'),
  department          text not null default '' check (char_length(department) <= 30),
  clinic              text not null default '' check (char_length(clinic) <= 60),
  guidance            text not null default '' check (char_length(guidance) <= 1000),
  starred             boolean not null default false,
  visible_to_guardian boolean not null default false,
  created_by          uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint prescriptions_one_per_request unique (patient_id, request_id)
);
create index prescriptions_patient_date on public.prescriptions (patient_id, prescribed_on desc);
alter table public.prescriptions enable row level security;
revoke all on table public.prescriptions from anon, authenticated;
create trigger prescriptions_set_updated_at before update on public.prescriptions
  for each row execute function private.set_updated_at();

create table public.prescription_items (
  id                uuid primary key default gen_random_uuid(),
  prescription_id   uuid not null references public.prescriptions (id) on delete cascade,
  patient_id        uuid not null references public.patients (id) on delete cascade,
  name              text not null check (char_length(btrim(name)) between 1 and 100),
  strength          text not null default '' check (char_length(strength) <= 50),
  dosage            text not null default '' check (char_length(dosage) <= 50),
  frequency         text not null default '' check (char_length(frequency) <= 50),
  timing            text not null default '' check (char_length(timing) <= 100),
  duration          text not null default '' check (char_length(duration) <= 50),
  caution_rx        text not null default '' check (char_length(caution_rx) <= 1000),   -- 처방전·복약 안내 출처
  caution_mfds      text not null default '' check (char_length(caution_mfds) <= 1000), -- 식약처 제품 정보 출처
  external_item_seq text check (external_item_seq ~ '^[0-9]{6,12}$'),
  active            boolean not null default true,  -- 지금 복용 중
  sort              smallint not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index prescription_items_prescription on public.prescription_items (prescription_id, sort);
create index prescription_items_patient_active on public.prescription_items (patient_id) where active;
alter table public.prescription_items enable row level security;
revoke all on table public.prescription_items from anon, authenticated;
create trigger prescription_items_set_updated_at before update on public.prescription_items
  for each row execute function private.set_updated_at();

create table public.prescription_notes (
  id              uuid primary key default gen_random_uuid(),
  prescription_id uuid not null references public.prescriptions (id) on delete cascade,
  patient_id      uuid not null references public.patients (id) on delete cascade,
  item_id         uuid references public.prescription_items (id) on delete set null,  -- null = 처방 전체
  tags            text[] not null default '{}' check (cardinality(tags) <= 20),
  memo            text not null default '' check (char_length(memo) <= 1000),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint prescription_notes_not_empty check (cardinality(tags) > 0 or char_length(btrim(memo)) > 0)
);
create index prescription_notes_prescription on public.prescription_notes (prescription_id, created_at desc);
alter table public.prescription_notes enable row level security;
revoke all on table public.prescription_notes from anon, authenticated;
create trigger prescription_notes_set_updated_at before update on public.prescription_notes
  for each row execute function private.set_updated_at();

-- 진료 질문 ↔ 처방 연결 (선택) — "다음 진료 질문에 담기"
alter table public.visit_questions
  add column prescription_id uuid references public.prescriptions (id) on delete set null;

-- ── 같은 환자의 처방·약만 서로 연결 (다른 환자 처방에 약·메모·질문을 붙일 수 없음) ──
create function private.check_rx_links()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  if tg_table_name = 'visit_questions' then
    if new.prescription_id is null then return new; end if;
    select patient_id into v_owner from public.prescriptions where id = new.prescription_id;
    if v_owner is distinct from new.patient_id then
      raise exception 'invalid_input: 다른 환자의 처방에는 질문을 연결할 수 없습니다' using errcode = '23514';
    end if;
    return new;
  end if;
  select patient_id into v_owner from public.prescriptions where id = new.prescription_id;
  if v_owner is distinct from new.patient_id then
    raise exception 'invalid_input: 처방과 환자가 일치하지 않습니다' using errcode = '23514';
  end if;
  if tg_table_name = 'prescription_notes' then
    -- (item_id 는 메모 테이블에만 있는 컬럼 — 테이블별로 나눠서 확인)
    if (to_jsonb(new) ->> 'item_id') is not null
       and not exists (
         select 1 from public.prescription_items i
         where i.id = (to_jsonb(new) ->> 'item_id')::uuid and i.prescription_id = new.prescription_id
       ) then
      raise exception 'invalid_input: 이 처방의 약에만 메모를 붙일 수 있습니다' using errcode = '23514';
    end if;
  end if;
  return new;
end
$$;
revoke execute on function private.check_rx_links() from public, anon, authenticated;
create trigger prescription_items_check_links before insert or update on public.prescription_items
  for each row execute function private.check_rx_links();
create trigger prescription_notes_check_links before insert or update on public.prescription_notes
  for each row execute function private.check_rx_links();
create trigger visit_questions_check_rx_link before insert or update of prescription_id on public.visit_questions
  for each row execute function private.check_rx_links();

-- 보호자에게 공유된 처방인가 (처방 공유를 켰고, 보호자에게 '약 정보' 범위가 있음)
create function private.rx_shared_with_me(p_prescription_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.prescriptions p
    where p.id = p_prescription_id and p.visible_to_guardian and private.guardian_has(p.patient_id, 'medications')
  )
$$;
revoke execute on function private.rx_shared_with_me(uuid) from public, anon;
grant execute on function private.rx_shared_with_me(uuid) to authenticated;

-- ── 권한 ───────────────────────────────────────────────────────────────────
grant select on public.prescriptions, public.prescription_items, public.prescription_notes to authenticated;
grant insert (patient_id, request_id, prescribed_on, department, clinic, guidance) on public.prescriptions to authenticated;
grant update (prescribed_on, department, clinic, guidance, starred, visible_to_guardian) on public.prescriptions to authenticated;
grant insert (prescription_id, patient_id, name, strength, dosage, frequency, timing, duration, caution_rx, caution_mfds, external_item_seq, active, sort)
  on public.prescription_items to authenticated;
grant update (name, strength, dosage, frequency, timing, duration, caution_rx, active) on public.prescription_items to authenticated;
grant insert (prescription_id, patient_id, item_id, tags, memo) on public.prescription_notes to authenticated;
grant update (item_id, tags, memo) on public.prescription_notes to authenticated;
grant delete on public.prescription_notes to authenticated;
grant insert (prescription_id) on public.visit_questions to authenticated;
grant update (prescription_id) on public.visit_questions to authenticated;

create policy prescriptions_select on public.prescriptions for select to authenticated
  using (private.is_patient_self(patient_id) or private.is_assigned_staff(patient_id) or private.rx_shared_with_me(id));
create policy prescriptions_insert_self on public.prescriptions for insert to authenticated
  with check (private.is_patient_self(patient_id));
create policy prescriptions_update_self on public.prescriptions for update to authenticated
  using (private.is_patient_self(patient_id)) with check (private.is_patient_self(patient_id));

create policy prescription_items_select on public.prescription_items for select to authenticated
  using (private.is_patient_self(patient_id) or private.is_assigned_staff(patient_id) or private.rx_shared_with_me(prescription_id));
create policy prescription_items_insert_self on public.prescription_items for insert to authenticated
  with check (private.is_patient_self(patient_id));
create policy prescription_items_update_self on public.prescription_items for update to authenticated
  using (private.is_patient_self(patient_id)) with check (private.is_patient_self(patient_id));

create policy prescription_notes_select on public.prescription_notes for select to authenticated
  using (private.is_patient_self(patient_id) or private.is_assigned_staff(patient_id) or private.rx_shared_with_me(prescription_id));
create policy prescription_notes_insert_self on public.prescription_notes for insert to authenticated
  with check (private.is_patient_self(patient_id));
create policy prescription_notes_update_self on public.prescription_notes for update to authenticated
  using (private.is_patient_self(patient_id)) with check (private.is_patient_self(patient_id));
create policy prescription_notes_delete_self on public.prescription_notes for delete to authenticated
  using (private.is_patient_self(patient_id));

-- ── 처방 한 건 등록 (약까지 한 번에, 같은 request_id 는 기존 처방 ID 반환) — invoker: RLS 가 본인만 허용 ──
create function public.create_prescription(
  p_patient_id uuid,
  p_request_id uuid,
  p_prescribed_on date,
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
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 30 then
    raise exception 'invalid_input: 약은 1~30개까지 한 번에 등록할 수 있습니다' using errcode = '22023';
  end if;
  insert into public.prescriptions (patient_id, request_id, prescribed_on, department, clinic, guidance)
  values (p_patient_id, p_request_id, p_prescribed_on, btrim(coalesce(p_department, '')), btrim(coalesce(p_clinic, '')), btrim(coalesce(p_guidance, '')))
  on conflict on constraint prescriptions_one_per_request do nothing
  returning id into v_id;
  if v_id is null then
    -- 이미 처리한 등록 (다시 누름·재시도) → 약을 다시 만들지 않음
    select id into v_id from public.prescriptions where patient_id = p_patient_id and request_id = p_request_id;
    return v_id;
  end if;
  insert into public.prescription_items
    (prescription_id, patient_id, name, strength, dosage, frequency, timing, duration, caution_rx, caution_mfds, external_item_seq, active, sort)
  select v_id, p_patient_id, btrim(coalesce(e.item ->> 'name', '')),
         coalesce(e.item ->> 'strength', ''), coalesce(e.item ->> 'dosage', ''), coalesce(e.item ->> 'frequency', ''),
         coalesce(e.item ->> 'timing', ''), coalesce(e.item ->> 'duration', ''), coalesce(e.item ->> 'caution_rx', ''),
         coalesce(e.item ->> 'caution_mfds', ''), nullif(e.item ->> 'external_item_seq', ''),
         coalesce((e.item ->> 'active')::boolean, true), (e.ord - 1)::smallint
  from jsonb_array_elements(p_items) with ordinality as e(item, ord);
  return v_id;
end
$$;
revoke execute on function public.create_prescription(uuid, uuid, date, text, text, text, jsonb) from public, anon;
grant execute on function public.create_prescription(uuid, uuid, date, text, text, text, jsonb) to authenticated;
