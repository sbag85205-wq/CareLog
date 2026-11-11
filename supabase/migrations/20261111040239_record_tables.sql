-- ============================================================================
-- CareLog migration 4/6 — 건강기록·약·진료 질문·식사·생활 요청·의료진 검토
-- ============================================================================

-- ── health_records: 환자별·한국 날짜별 1건 ──────────────────────────────────
create table public.health_records (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid not null references public.patients (id) on delete cascade,
  record_date date not null,  -- 한국(Asia/Seoul) 날짜
  condition   smallint not null check (condition between 1 and 5),
  pain        smallint not null check (pain between 0 and 10),
  fatigue     smallint not null check (fatigue between 1 and 5),
  sleep       smallint not null check (sleep between 1 and 5),
  meal_intake smallint not null check (meal_intake in (0, 25, 50, 75, 100)),
  digestion   public.digestion not null,
  symptoms    text[] not null default '{}' check (cardinality(symptoms) <= 20),
  memo        text not null default '' check (char_length(memo) <= 500),
  recorded_in public.care_mode not null,  -- 기록 당시 모드 (통원→입원 연속 조회)
  created_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint health_records_one_per_day unique (patient_id, record_date)
);
-- unique 제약의 인덱스 (patient_id, record_date)가 환자별 기간 조회에도 쓰임

alter table public.health_records enable row level security;
revoke all on table public.health_records from anon, authenticated;
create trigger health_records_set_updated_at before update on public.health_records
  for each row execute function private.set_updated_at();

create function private.check_record_date()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.record_date > private.today_kst() then
    raise exception 'invalid_input: 미래 날짜에는 기록할 수 없습니다' using errcode = '23514';
  end if;
  return new;
end
$$;
create trigger health_records_no_future before insert or update on public.health_records
  for each row execute function private.check_record_date();

-- ── medications: 환자별 복용 약 (병원·의료진 관리) ──────────────────────────
create table public.medications (
  id                  uuid primary key default gen_random_uuid(),
  patient_id          uuid not null references public.patients (id) on delete cascade,
  name                text not null check (char_length(name) between 1 and 100),
  purpose             text not null default '' check (char_length(purpose) <= 200),
  dosage              text not null default '' check (char_length(dosage) <= 50),
  schedule            text not null default '' check (char_length(schedule) <= 100),
  caution             text not null default '' check (char_length(caution) <= 500),  -- 병원 안내 (식약처 원문과 구분)
  source              public.med_source not null default 'manual',
  external_item_seq   text check (external_item_seq ~ '^[0-9]{6,12}$'),  -- 식약처 품목기준코드
  visible_to_guardian boolean not null default false,  -- 결정 2: 기본 비공개, 환자 본인만 변경
  is_active           boolean not null default true,
  created_by          uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint medications_external_source check (source = 'manual' or external_item_seq is not null)
);
create index medications_patient_active on public.medications (patient_id) where is_active;
create index medications_item_seq on public.medications (external_item_seq);

alter table public.medications enable row level security;
revoke all on table public.medications from anon, authenticated;
create trigger medications_set_updated_at before update on public.medications
  for each row execute function private.set_updated_at();

-- 보호자 공개 여부는 환자 본인만 결정 (의료진이 등록·수정해도 공개로 바뀌지 않음)
create function private.guard_medication_visibility()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.visible_to_guardian and not private.is_patient_self(new.patient_id) then
      new.visible_to_guardian := false;
    end if;
  elsif new.visible_to_guardian is distinct from old.visible_to_guardian
        and not private.is_patient_self(new.patient_id) then
    raise exception 'forbidden: 보호자 공개 여부는 환자 본인만 바꿀 수 있습니다' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.patient_id is distinct from old.patient_id then
    raise exception 'forbidden: 다른 환자에게 약을 옮길 수 없습니다' using errcode = '42501';
  end if;
  return new;
end
$$;
create trigger medications_guard_visibility before insert or update on public.medications
  for each row execute function private.guard_medication_visibility();

-- ── drug_info_cache: 식약처 API 응답 캐시 (공개 참고 정보, 서버만 기록) ─────
create table public.drug_info_cache (
  item_seq          text not null check (item_seq ~ '^[0-9]{6,12}$'),
  provider          public.med_source not null check (provider <> 'manual'),
  payload           jsonb not null,
  source_updated_on date,
  fetched_at        timestamptz not null default now(),
  primary key (item_seq, provider)
);
alter table public.drug_info_cache enable row level security;
revoke all on table public.drug_info_cache from anon, authenticated;

-- ── visit_questions: 진료 질문 메모 (결정 4: 기본 본인만, 공유한 것만 의료진) ─
create table public.visit_questions (
  id                uuid primary key default gen_random_uuid(),
  patient_id        uuid not null references public.patients (id) on delete cascade,
  text              text not null check (char_length(text) between 1 and 200),
  done              boolean not null default false,
  shared_with_staff boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index visit_questions_patient on public.visit_questions (patient_id, created_at);

alter table public.visit_questions enable row level security;
revoke all on table public.visit_questions from anon, authenticated;
create trigger visit_questions_set_updated_at before update on public.visit_questions
  for each row execute function private.set_updated_at();

-- ── meal_menus: 날짜·끼니·형태별 메뉴 (참고 정보, 서버만 기록) ─────────────
create table public.meal_menus (
  menu_date date not null,
  slot      public.meal_slot not null,
  meal_type public.meal_type not null,
  items     text[] not null check (cardinality(items) between 1 and 12),
  primary key (menu_date, slot, meal_type)
);
alter table public.meal_menus enable row level security;
revoke all on table public.meal_menus from anon, authenticated;

-- ── meal_logs: 입원 중 끼니별 섭취 기록 ──────────────────────────────────────
create table public.meal_logs (
  id         uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  meal_date  date not null,
  slot       public.meal_slot not null,
  meal_type  public.meal_type not null default 'regular',  -- 환자 직접 변경 불가 (식사 변경 요청 완료 시에만)
  intake     smallint check (intake in (0, 25, 50, 75, 100)),
  digestion  public.digestion,
  updated_at timestamptz not null default now(),
  constraint meal_logs_one_per_slot unique (patient_id, meal_date, slot)
);
alter table public.meal_logs enable row level security;
revoke all on table public.meal_logs from anon, authenticated;
create trigger meal_logs_set_updated_at before update on public.meal_logs
  for each row execute function private.set_updated_at();

-- ── life_requests: 비긴급 생활 요청 ─────────────────────────────────────────
create table public.life_requests (
  id                  uuid primary key default gen_random_uuid(),
  patient_id          uuid not null references public.patients (id) on delete cascade,
  category            public.request_category not null,
  detail              text not null check (char_length(btrim(detail)) between 1 and 300),
  status              public.request_status not null default 'received',  -- 변경은 advance_request_status()만
  meal_change_date    date,
  meal_change_slot    public.meal_slot,
  meal_change_to_type public.meal_type,
  version             integer not null default 1,  -- 상태가 바뀔 때마다 증가 (동시 수정 감지·감사용)
  created_by          uuid references public.profiles (id) on delete set null default auth.uid(),
  handled_by          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint life_requests_meal_change_fields check (
    (category = 'meal_change') = (meal_change_date is not null)
    and (meal_change_date is null) = (meal_change_slot is null)
    and (meal_change_slot is null) = (meal_change_to_type is null)
  )
);
create index life_requests_patient_created on public.life_requests (patient_id, created_at desc);
create index life_requests_open_queue on public.life_requests (created_at desc) where status <> 'completed';

alter table public.life_requests enable row level security;
revoke all on table public.life_requests from anon, authenticated;
create trigger life_requests_set_updated_at before update on public.life_requests
  for each row execute function private.set_updated_at();

-- ── staff_reviews (환자에게 공개되는 상태) / staff_review_notes (내부 메모) ──
create table public.staff_reviews (
  id         uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  staff_id   uuid not null references public.profiles (id) on delete cascade,
  action     public.review_action not null,
  created_at timestamptz not null default now()
);
create index staff_reviews_patient_created on public.staff_reviews (patient_id, created_at desc);

alter table public.staff_reviews enable row level security;
revoke all on table public.staff_reviews from anon, authenticated;

-- RLS는 행 단위라 같은 행의 메모 컬럼만 숨길 수 없음 → 내부 메모는 별도 테이블로 분리
create table public.staff_review_notes (
  review_id uuid primary key references public.staff_reviews (id) on delete cascade,
  note      text not null check (char_length(note) between 1 and 300)
);
alter table public.staff_review_notes enable row level security;
revoke all on table public.staff_review_notes from anon, authenticated;
