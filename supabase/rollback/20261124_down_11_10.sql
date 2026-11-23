-- ============================================================================
-- 되돌리기: migration 11(FeelPill 확장) → 10(처방 이력) 순서로 제거, migration 1–9 상태로 복구
--
-- ⚠️ 별도 승인 후 사람이 직접 실행 (자동 실행 스크립트 없음). 한 트랜잭션 — 중간 실패 시 아무것도 바뀌지 않음
-- ⚠️ 10·11 적용 이후에 쌓인 약 기록·복용 경험·복용 체크·선택 공유·관계 이름·질문↔처방 연결은 함께 삭제됨
--    (1–9의 기존 표·행 — 환자·계정·건강기록·약 목록·진료 질문 본문·보호자 공유 — 은 그대로)
-- 검증: supabase/tests/rollback-10-11.test.ts (PGlite에서 1–9 카탈로그와 기존 데이터 보존 확인)
-- 적용 후 supabase_migrations.schema_migrations 에서 두 버전 기록도 지워야 CLI 상태가 맞음 (맨 아래)
-- ============================================================================
begin;

-- ── 11 ──
drop function if exists public.shared_records_for_me();
drop function if exists public.revoke_record_share(uuid);
drop function if exists public.share_record(uuid, uuid, text[], timestamptz);
drop function if exists public.set_grant_relation(uuid, text);
drop function if exists public.create_med_record(uuid, uuid, text, text, date, text, text, text, jsonb);
drop table if exists public.record_shares;
drop table if exists public.intake_logs;
drop function if exists private.check_intake_link();
alter table public.access_grants drop column if exists relation;

-- ── 10 ── (처방 이력 표를 지우면 11이 더한 컬럼·인덱스·정책도 함께 사라짐)
drop trigger if exists visit_questions_check_rx_link on public.visit_questions;
alter table public.visit_questions drop column if exists prescription_id;
drop function if exists public.create_prescription(uuid, uuid, date, text, text, text, jsonb);
drop table if exists public.prescription_notes;
drop table if exists public.prescription_items;
drop table if exists public.prescriptions;
drop function if exists private.rx_shared_with_me(uuid);
drop function if exists private.check_rx_links();

-- CLI 이력 정리 (Supabase에서만 — PGlite 테스트에는 이 스키마가 없어 건너뜀)
do $$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version in ('20261123090000', '20261124090000');
  end if;
end
$$;

commit;
