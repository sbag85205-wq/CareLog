-- ============================================================================
-- CareLog migration 5/6 — 테이블 권한(GRANT) + 행 단위 보안(RLS) 정책
--
-- 원칙
-- * anon(비로그인): 어떤 테이블도 권한 없음 → 환자정보 조회 불가
-- * authenticated: 필요한 동작·컬럼만 GRANT, 행 범위는 RLS로 제한
-- * 컬럼 단위 제한이 필요한 변경(역할, 요청 상태, 식사 형태, 보호자 공개 여부, grant 범위)은
--   GRANT에서 제외하고 6/6의 검증된 RPC로만 허용
-- * 정책의 auth.uid()는 (select auth.uid()) 형태로 써서 행마다 재평가하지 않음
-- ============================================================================

-- ── profiles ───────────────────────────────────────────────────────────────
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;  -- role 컬럼은 UPDATE 권한 없음

create policy profiles_select on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or exists (  -- 의료진: 담당 환자의 프로필
      select 1 from public.patients p
      where p.profile_id = profiles.id and private.is_assigned_staff(p.id)
    )
  );
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ── patients ───────────────────────────────────────────────────────────────
grant select on public.patients to authenticated;
grant update (next_visit_date) on public.patients to authenticated;  -- care_mode는 set_care_mode()만

create policy patients_select on public.patients for select to authenticated
  using (private.is_patient_self(id) or private.is_assigned_staff(id) or private.has_active_grant(id));
create policy patients_update_staff on public.patients for update to authenticated
  using (private.is_assigned_staff(id))
  with check (private.is_assigned_staff(id));

-- ── admissions (쓰기는 set_care_mode()만) ───────────────────────────────────
grant select on public.admissions to authenticated;
create policy admissions_select on public.admissions for select to authenticated
  using (
    private.is_patient_self(patient_id) or private.is_assigned_staff(patient_id)
    or private.has_active_grant(patient_id)
  );

-- ── staff_assignments (쓰기는 service_role만) ───────────────────────────────
grant select on public.staff_assignments to authenticated;
create policy staff_assignments_select on public.staff_assignments for select to authenticated
  using (staff_id = (select auth.uid()) or private.is_patient_self(patient_id));

-- ── guardian_invitations (쓰기는 invite/accept/revoke RPC만) ─────────────────
grant select (id, patient_id, invitee_email, scopes, status, expires_at, created_at, responded_at)
  on public.guardian_invitations to authenticated;  -- token_hash는 조회 불가
create policy guardian_invitations_select on public.guardian_invitations for select to authenticated
  using (private.is_patient_self(patient_id));

-- ── access_grants (쓰기는 RPC만) ────────────────────────────────────────────
grant select on public.access_grants to authenticated;
create policy access_grants_select on public.access_grants for select to authenticated
  using (private.is_patient_self(patient_id) or grantee_id = (select auth.uid()));

-- ── health_records: 작성·수정은 환자 본인만, 삭제 없음 ─────────────────────
grant select on public.health_records to authenticated;
grant insert (patient_id, record_date, condition, pain, fatigue, sleep, meal_intake, digestion, symptoms, memo, recorded_in)
  on public.health_records to authenticated;
grant update (condition, pain, fatigue, sleep, meal_intake, digestion, symptoms, memo)
  on public.health_records to authenticated;  -- patient_id·record_date·recorded_in은 수정 불가

create policy health_records_select on public.health_records for select to authenticated
  using (
    private.is_patient_self(patient_id) or private.is_assigned_staff(patient_id)
    or private.guardian_has(patient_id, 'records')
  );
create policy health_records_insert_self on public.health_records for insert to authenticated
  with check (private.is_patient_self(patient_id));
create policy health_records_update_self on public.health_records for update to authenticated
  using (private.is_patient_self(patient_id))
  with check (private.is_patient_self(patient_id));

-- ── medications: 관리는 담당 의료진, 보호자는 공개 허용된 약만 ──────────────
grant select on public.medications to authenticated;
grant insert (patient_id, name, purpose, dosage, schedule, caution, source, external_item_seq, visible_to_guardian, is_active)
  on public.medications to authenticated;
grant update (name, purpose, dosage, schedule, caution, source, external_item_seq, visible_to_guardian, is_active)
  on public.medications to authenticated;  -- visible_to_guardian 변경은 트리거가 환자 본인만 허용
grant delete on public.medications to authenticated;

create policy medications_select on public.medications for select to authenticated
  using (
    private.is_patient_self(patient_id) or private.is_assigned_staff(patient_id)
    or (visible_to_guardian and private.guardian_has(patient_id, 'medications'))
  );
create policy medications_insert_staff on public.medications for insert to authenticated
  with check (private.is_assigned_staff(patient_id));
create policy medications_update_staff on public.medications for update to authenticated
  using (private.is_assigned_staff(patient_id))
  with check (private.is_assigned_staff(patient_id));
create policy medications_delete_staff on public.medications for delete to authenticated
  using (private.is_assigned_staff(patient_id));

-- ── drug_info_cache / meal_menus: 로그인 사용자 공용 참고 정보 (쓰기는 서버만) ─
grant select on public.drug_info_cache to authenticated;
create policy drug_info_cache_select on public.drug_info_cache for select to authenticated using (true);

grant select on public.meal_menus to authenticated;
create policy meal_menus_select on public.meal_menus for select to authenticated using (true);

-- ── visit_questions: 본인만, 공유한 질문만 담당 의료진 조회 ─────────────────
grant select on public.visit_questions to authenticated;
grant insert (patient_id, text, shared_with_staff) on public.visit_questions to authenticated;
grant update (text, done, shared_with_staff) on public.visit_questions to authenticated;
grant delete on public.visit_questions to authenticated;

create policy visit_questions_select on public.visit_questions for select to authenticated
  using (private.is_patient_self(patient_id) or (shared_with_staff and private.is_assigned_staff(patient_id)));
create policy visit_questions_insert_self on public.visit_questions for insert to authenticated
  with check (private.is_patient_self(patient_id));
create policy visit_questions_update_self on public.visit_questions for update to authenticated
  using (private.is_patient_self(patient_id))
  with check (private.is_patient_self(patient_id));
create policy visit_questions_delete_self on public.visit_questions for delete to authenticated
  using (private.is_patient_self(patient_id));

-- ── meal_logs: 환자는 섭취량·소화만, 식사 형태는 요청 완료 RPC만 ───────────
grant select on public.meal_logs to authenticated;
grant insert (patient_id, meal_date, slot, intake, digestion) on public.meal_logs to authenticated;
grant update (intake, digestion) on public.meal_logs to authenticated;

create policy meal_logs_select on public.meal_logs for select to authenticated
  using (
    private.is_patient_self(patient_id) or private.is_assigned_staff(patient_id)
    or private.guardian_has(patient_id, 'meals')
  );
create policy meal_logs_insert_self on public.meal_logs for insert to authenticated
  with check (private.is_patient_self(patient_id));
create policy meal_logs_update_self on public.meal_logs for update to authenticated
  using (private.is_patient_self(patient_id))
  with check (private.is_patient_self(patient_id));

-- ── life_requests: 환자는 등록만(상태는 항상 '접수'), 상태 변경은 RPC만 ────
grant select on public.life_requests to authenticated;
grant insert (patient_id, category, detail, meal_change_date, meal_change_slot, meal_change_to_type)
  on public.life_requests to authenticated;  -- status·handled_by·version은 지정 불가

create policy life_requests_select on public.life_requests for select to authenticated
  using (
    private.is_patient_self(patient_id) or private.is_assigned_staff(patient_id)
    or private.guardian_has(patient_id, 'requests')
  );
create policy life_requests_insert_self on public.life_requests for insert to authenticated
  with check (private.is_patient_self(patient_id));

-- ── staff_reviews: 상태는 환자 본인에게 공개 / 내부 메모는 의료진만 ──────────
grant select on public.staff_reviews to authenticated;
create policy staff_reviews_select on public.staff_reviews for select to authenticated
  using (private.is_assigned_staff(patient_id) or private.is_patient_self(patient_id));

grant select on public.staff_review_notes to authenticated;
create policy staff_review_notes_select_staff on public.staff_review_notes for select to authenticated
  using (
    exists (
      select 1 from public.staff_reviews r
      where r.id = staff_review_notes.review_id and private.is_assigned_staff(r.patient_id)
    )
  );
