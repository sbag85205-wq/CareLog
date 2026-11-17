-- ============================================================================
-- CareLog migration 8 — 환자 본인의 "내 약" 관리 + 다음 진료일 기록
--
-- * 기존 migration(1~7)은 수정하지 않고 정책만 추가합니다. 테이블·데이터 변경 없음.
-- * 내 약: 환자 본인이 직접 추가·수정·삭제 (기존: 담당 의료진만)
--   - 보호자 공개 여부(visible_to_guardian)는 기존 트리거가 계속 "환자 본인만" 바꿀 수 있게 강제
--   - 환자가 추가한 약도 기본 비공개 (컬럼 기본값 false)
-- * 다음 진료일: 환자 본인도 기록 (기존: 담당 의료진만)
--   - patients 의 UPDATE 컬럼 권한은 next_visit_date 하나뿐이라 다른 컬럼(이름·모드)은 바꿀 수 없음
-- ============================================================================

create policy medications_insert_self on public.medications for insert to authenticated
  with check (private.is_patient_self(patient_id));
create policy medications_update_self on public.medications for update to authenticated
  using (private.is_patient_self(patient_id))
  with check (private.is_patient_self(patient_id));
create policy medications_delete_self on public.medications for delete to authenticated
  using (private.is_patient_self(patient_id));

create policy patients_update_self on public.patients for update to authenticated
  using (private.is_patient_self(id))
  with check (private.is_patient_self(id));
