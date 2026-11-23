/**
 * CareLog DB 권한 테스트 (RLS · 컬럼 권한 · RPC · 권한 상승 방지)
 *
 * 가상 계정: 환자 A, 환자 B, 보호자(환자 A가 초대·승인), 의료진 A(환자 A 담당), 의료진 B(환자 B 담당)
 *           + 공동 담당 환자 C(의료진 A·B 모두 담당) — 동시 수정 충돌 검증용
 * 모든 이메일·이름·기록은 가상 데이터입니다.
 */
import { statSync } from "node:fs";
import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, createTestDb, expectFail, MIGRATIONS_DIR, migrationFiles, signUp } from "./support/db";

type U = { id: string; email: string };
let db: PGlite;
let patientA: U, patientB: U, patientC: U, guardian: U, staffA: U, staffB: U, stranger: U;
let pidA: string, pidB: string, pidC: string;
let medA1: string, medA2: string, medB1: string;
let reqA: string, reqMealA: string, reqB: string, reqC: string;
let reviewA: string;
let grantId: string;

const today = async () => (await as<{ d: string }>(db, "superuser", "select private.today_kst()::text d"))[0].d;
const count = async (actor: U | "anon", sql: string, params: unknown[] = []) =>
  (await as<{ n: number }>(db, actor, `select count(*)::int n from (${sql}) q`, params))[0].n;
const record = (pid: string, date: string, condition = 3) =>
  `select public.upsert_health_record('${pid}', '${date}', ${condition}::smallint, 2::smallint, 2::smallint, 3::smallint, 50::smallint, 'normal', '{}', '(가상) 메모')`;

beforeAll(async () => {
  db = await createTestDb();

  patientA = await signUp(db, "patient-a@example.test");
  patientB = await signUp(db, "patient-b@example.test");
  patientC = await signUp(db, "patient-c@example.test");
  guardian = await signUp(db, "guardian@example.test");
  staffA = await signUp(db, "staff-a@example.test");
  staffB = await signUp(db, "staff-b@example.test");
  stranger = await signUp(db, "stranger@example.test");

  // 의료진 권한은 관리자(service_role)만 부여
  for (const s of [staffA, staffB]) {
    await as(db, "service_role", "select private.admin_set_role($1, 'staff')", [s.id]);
  }

  // 환자 프로필은 서버(service_role)가 발급 — migration 7부터 가입자의 자가 생성 경로 없음
  const issue = async (u: U, name: string) =>
    (await as<{ id: string }>(db, "service_role", "insert into public.patients (profile_id, display_name) values ($1, $2) returning id", [u.id, name]))[0].id;
  pidA = await issue(patientA, "환자A (가상)");
  pidB = await issue(patientB, "환자B (가상)");
  pidC = await issue(patientC, "환자C (가상)");

  // 담당 배정은 서버(service_role)만
  await as(
    db,
    "service_role",
    `insert into public.staff_assignments (patient_id, staff_id) values ($1, $2), ($3, $4), ($5, $2), ($5, $4)`,
    [pidA, staffA.id, pidB, staffB.id, pidC],
  );

  // 약은 담당 의료진이 등록 (공개 요청해도 기본 비공개로 저장됨)
  medA1 = (await as<{ id: string }>(db, staffA, `insert into public.medications (patient_id, name, visible_to_guardian) values ($1, '예시 약품 A (가상)', true) returning id`, [pidA]))[0].id;
  medA2 = (await as<{ id: string }>(db, staffA, `insert into public.medications (patient_id, name) values ($1, '예시 약품 B (가상)') returning id`, [pidA]))[0].id;
  medB1 = (await as<{ id: string }>(db, staffB, `insert into public.medications (patient_id, name) values ($1, '예시 약품 C (가상)') returning id`, [pidB]))[0].id;

  const d = await today();
  await as(db, patientA, record(pidA, d, 4));
  await as(db, patientB, record(pidB, d, 2));

  reqA = (await as<{ id: string }>(db, patientA, `insert into public.life_requests (patient_id, category, detail) values ($1, 'water', '(가상) 물') returning id`, [pidA]))[0].id;
  reqMealA = (await as<{ id: string }>(db, patientA, `insert into public.life_requests (patient_id, category, detail, meal_change_date, meal_change_slot, meal_change_to_type) values ($1, 'meal_change', '(가상) 점심 죽', $2, 'lunch', 'porridge') returning id`, [pidA, d]))[0].id;
  reqB = (await as<{ id: string }>(db, patientB, `insert into public.life_requests (patient_id, category, detail) values ($1, 'bedding', '(가상) 침구') returning id`, [pidB]))[0].id;
  reqC = (await as<{ id: string }>(db, patientC, `insert into public.life_requests (patient_id, category, detail) values ($1, 'water', '(가상) 물') returning id`, [pidC]))[0].id;

  await as(db, patientA, `insert into public.visit_questions (patient_id, text) values ($1, '(가상) 비공개 질문')`, [pidA]);
  await as(db, patientA, `insert into public.visit_questions (patient_id, text, shared_with_staff) values ($1, '(가상) 공유한 질문', true)`, [pidA]);

  reviewA = (await as<{ id: string }>(db, staffA, `select public.add_staff_review($1, 'consult_needed', '(가상) 내부 메모') id`, [pidA]))[0].id;

  // 보호자: 환자 A가 초대(기록·약·요청 범위) → 보호자가 수락
  const inv = (await as<{ j: { token: string } }>(db, patientA, `select public.invite_guardian($1, 'GUARDIAN@example.test', '{records,medications,requests}') j`, [pidA]))[0].j;
  grantId = (await as<{ id: string }>(db, guardian, "select (public.accept_guardian_invitation($1)).id", [inv.token]))[0].id;
}, 120_000);

describe("8. 로그인하지 않은 사용자(anon)", () => {
  const tables = [
    "profiles", "patients", "admissions", "staff_assignments", "guardian_invitations", "access_grants",
    "health_records", "medications", "drug_info_cache", "visit_questions", "meal_menus", "meal_logs",
    "life_requests", "staff_reviews", "staff_review_notes",
  ];
  it.each(tables)("%s 조회 불가", async (t) => {
    expect(await expectFail(as(db, "anon", `select * from public.${t}`))).toMatch(/permission denied/);
  });
  it("RPC 호출 불가", async () => {
    expect(await expectFail(as(db, "anon", record(pidA, "2026-01-01")))).toMatch(/permission denied/);
    expect(await expectFail(as(db, "anon", "select public.advance_request_status($1, 'received', 'acknowledged')", [reqA]))).toMatch(/permission denied/);
  });
});

describe("1·7. 환자는 자신의 건강기록만 작성·수정", () => {
  it("본인 기록 저장, 같은 날짜는 1건으로 수정(upsert)", async () => {
    const d = await today();
    await as(db, patientA, record(pidA, d, 5));
    const rows = await as<{ condition: number }>(db, patientA, "select condition from public.health_records where patient_id = $1 and record_date = $2", [pidA, d]);
    expect(rows).toEqual([{ condition: 5 }]);
  });
  it("미래 날짜(한국 기준) 기록 거부", async () => {
    expect(await expectFail(as(db, patientA, record(pidA, "2999-01-01")))).toMatch(/invalid_input: 미래 날짜/);
  });
  it("다른 환자 ID로 기록 작성 거부 (RPC·직접 INSERT 모두)", async () => {
    const d = await today();
    expect(await expectFail(as(db, patientA, record(pidB, d)))).toMatch(/row-level security/);
    expect(
      await expectFail(as(db, patientA, `insert into public.health_records (patient_id, record_date, condition, pain, fatigue, sleep, meal_intake, digestion, recorded_in) values ($1, '2026-01-02', 3, 0, 1, 1, 0, 'good', 'outpatient')`, [pidB])),
    ).toMatch(/row-level security/);
  });
  it("다른 환자 기록 조회 0건, 수정 0건, 삭제 불가", async () => {
    expect(await count(patientA, "select * from public.health_records where patient_id = $1", [pidB])).toBe(0);
    const updated = await as(db, patientA, "update public.health_records set memo = '변조' where patient_id = $1 returning id", [pidB]);
    expect(updated).toEqual([]);
    expect(await expectFail(as(db, patientA, "delete from public.health_records where patient_id = $1", [pidB]))).toMatch(/permission denied/);
    expect(await expectFail(as(db, patientA, "delete from public.health_records where patient_id = $1", [pidA]))).toMatch(/permission denied/);
    // 환자 B의 기록은 그대로
    expect((await as<{ memo: string }>(db, "superuser", "select memo from public.health_records where patient_id = $1", [pidB]))[0].memo).toBe("(가상) 메모");
  });
  it("자기 기록을 다른 환자 소유로 옮기기 불가 (patient_id 컬럼 수정 권한 없음)", async () => {
    expect(await expectFail(as(db, patientA, "update public.health_records set patient_id = $1 where patient_id = $2", [pidB, pidA]))).toMatch(/permission denied/);
  });
  it("의료진·보호자는 환자 대신 기록 작성 불가", async () => {
    const d = await today();
    expect(await expectFail(as(db, staffA, record(pidA, d)))).toMatch(/row-level security/);
    expect(await expectFail(as(db, guardian, record(pidA, d)))).toMatch(/row-level security/);
  });
  it("다른 환자 정보 자체도 조회 불가 (환자·입원·요청·약)", async () => {
    expect(await count(patientA, "select * from public.patients where id = $1", [pidB])).toBe(0);
    expect(await count(patientA, "select * from public.life_requests where patient_id = $1", [pidB])).toBe(0);
    expect(await count(patientA, "select * from public.medications where patient_id = $1", [pidB])).toBe(0);
    expect(await count(stranger, "select * from public.patients")).toBe(0);
    expect(await count(stranger, "select * from public.health_records")).toBe(0);
  });
});

describe("3. 의료진은 배정된 환자의 허용 정보만", () => {
  it("담당 환자 기록 조회 가능, 비담당 환자는 0건", async () => {
    expect(await count(staffA, "select * from public.health_records where patient_id = $1", [pidA])).toBe(1);
    expect(await count(staffA, "select * from public.health_records where patient_id = $1", [pidB])).toBe(0);
    expect(await count(staffB, "select * from public.health_records where patient_id = $1", [pidA])).toBe(0);
  });
  it("진료 질문은 환자가 공유한 것만", async () => {
    const rows = await as<{ text: string }>(db, staffA, "select text from public.visit_questions where patient_id = $1", [pidA]);
    expect(rows.map((r) => r.text)).toEqual(["(가상) 공유한 질문"]);
    expect(await count(patientA, "select * from public.visit_questions where patient_id = $1", [pidA])).toBe(2);
  });
  it("비담당 환자의 약 등록·수정·삭제 불가", async () => {
    expect(await expectFail(as(db, staffA, "insert into public.medications (patient_id, name) values ($1, '(가상)')", [pidB]))).toMatch(/row-level security/);
    expect(await as(db, staffA, "update public.medications set name = '변조' where id = $1 returning id", [medB1])).toEqual([]);
    expect(await as(db, staffA, "delete from public.medications where id = $1 returning id", [medB1])).toEqual([]);
  });
  it("다음 진료일은 담당 환자만 수정, care_mode 직접 수정 불가", async () => {
    expect(await as(db, staffA, "update public.patients set next_visit_date = '2026-12-01' where id = $1 returning id", [pidA])).toHaveLength(1);
    expect(await as(db, staffA, "update public.patients set next_visit_date = '2026-12-01' where id = $1 returning id", [pidB])).toEqual([]);
    expect(await expectFail(as(db, staffA, "update public.patients set care_mode = 'inpatient' where id = $1", [pidA]))).toMatch(/permission denied/);
  });
  it("비담당 환자 검토 기록 불가", async () => {
    expect(await expectFail(as(db, staffA, "select public.add_staff_review($1, 'checked')", [pidB]))).toMatch(/forbidden/);
  });
});

describe("2·5. 보호자는 승인된 환자의 허용 정보만", () => {
  it("승인 범위(records) 조회 가능, 다른 환자는 0건", async () => {
    expect(await count(guardian, "select * from public.health_records where patient_id = $1", [pidA])).toBe(1);
    expect(await count(guardian, "select * from public.health_records where patient_id = $1", [pidB])).toBe(0);
    expect(await count(guardian, "select * from public.patients")).toBe(1);
  });
  it("[5] 약은 기본 비공개 — 의료진이 공개로 등록해도 비공개로 저장", async () => {
    const vis = await as<{ visible_to_guardian: boolean }>(db, "superuser", "select visible_to_guardian from public.medications where id = $1", [medA1]);
    expect(vis[0].visible_to_guardian).toBe(false);
    expect(await count(guardian, "select * from public.medications where patient_id = $1", [pidA])).toBe(0);
  });
  it("[5] 환자가 명시적으로 허용한 약만 보호자에게 공개", async () => {
    await as(db, patientA, "select public.set_medication_guardian_visibility($1, true)", [medA1]);
    const rows = await as<{ id: string }>(db, guardian, "select id from public.medications where patient_id = $1", [pidA]);
    expect(rows.map((r) => r.id)).toEqual([medA1]);
    expect(rows.map((r) => r.id)).not.toContain(medA2);
  });
  it("의료진은 보호자 공개 여부를 바꿀 수 없음, 다른 환자의 약 공개 설정도 불가", async () => {
    expect(await expectFail(as(db, staffA, "update public.medications set visible_to_guardian = false where id = $1", [medA1]))).toMatch(/forbidden: 보호자 공개 여부/);
    expect(await expectFail(as(db, patientA, "select public.set_medication_guardian_visibility($1, true)", [medB1]))).toMatch(/not_found/);
  });
  it("승인되지 않은 범위(meals)·진료 질문·검토 정보는 0건", async () => {
    await as(db, patientA, "select public.upsert_meal_intake($1, private.today_kst(), 'breakfast', 50::smallint)", [pidA]);
    expect(await count(patientA, "select * from public.meal_logs where patient_id = $1", [pidA])).toBe(1);
    expect(await count(guardian, "select * from public.meal_logs where patient_id = $1", [pidA])).toBe(0);
    expect(await count(guardian, "select * from public.visit_questions")).toBe(0);
    expect(await count(guardian, "select * from public.staff_reviews")).toBe(0);
    expect(await count(guardian, "select * from public.staff_review_notes")).toBe(0);
  });
  it("보호자는 기록 작성·요청 등록 불가", async () => {
    expect(await expectFail(as(db, guardian, `insert into public.life_requests (patient_id, category, detail) values ($1, 'water', 'x')`, [pidA]))).toMatch(/row-level security/);
  });
  it("환자가 범위를 줄이면 즉시 반영, 철회하면 모든 조회 0건", async () => {
    await as(db, patientA, "select public.update_guardian_scopes($1, '{medications}')", [grantId]);
    expect(await count(guardian, "select * from public.health_records where patient_id = $1", [pidA])).toBe(0);
    expect(await count(guardian, "select * from public.medications where patient_id = $1", [pidA])).toBe(1);
    await as(db, patientA, "select public.revoke_guardian_access($1)", [grantId]);
    expect(await count(guardian, "select * from public.medications")).toBe(0);
    expect(await count(guardian, "select * from public.patients")).toBe(0);
  });
  it("다른 사람의 grant는 변경·철회 불가", async () => {
    expect(await expectFail(as(db, patientB, "select public.revoke_guardian_access($1)", [grantId]))).toMatch(/not_found/);
    expect(await expectFail(as(db, guardian, "select public.update_guardian_scopes($1, '{records}')", [grantId]))).toMatch(/not_found/);
  });
});

describe("보호자 초대 흐름의 비정상 시도", () => {
  it("다른 환자 대신 초대 불가, 토큰 해시는 조회 불가", async () => {
    expect(await expectFail(as(db, patientB, "select public.invite_guardian($1, 'x@example.test', '{records}')", [pidA]))).toMatch(/forbidden/);
    expect(await expectFail(as(db, patientA, "select token_hash from public.guardian_invitations"))).toMatch(/permission denied/);
  });
  it("초대받지 않은 이메일·미확인 계정·재사용 토큰은 수락 불가", async () => {
    const tok = async () =>
      (await as<{ j: { token: string } }>(db, patientA, "select public.invite_guardian($1, 'invitee@example.test', '{records}') j", [pidA]))[0].j.token;
    const t1 = await tok();
    expect(await expectFail(as(db, stranger, "select public.accept_guardian_invitation($1)", [t1]))).toMatch(/초대받은 이메일/);

    const unconfirmed = await signUp(db, "invitee@example.test", { confirmed: false });
    expect(await expectFail(as(db, unconfirmed, "select public.accept_guardian_invitation($1)", [t1]))).toMatch(/이메일 확인/);

    const invitee = await signUp(db, "invitee2@example.test");
    const t2 = (await as<{ j: { token: string } }>(db, patientA, "select public.invite_guardian($1, 'invitee2@example.test', '{records}') j", [pidA]))[0].j.token;
    await as(db, invitee, "select public.accept_guardian_invitation($1)", [t2]);
    expect(await expectFail(as(db, invitee, "select public.accept_guardian_invitation($1)", [t2]))).toMatch(/유효하지 않거나 만료/);
    expect(await expectFail(as(db, invitee, "select public.accept_guardian_invitation($1)", ["추측한-토큰"]))).toMatch(/유효하지 않거나 만료/);
  });
  it("본인 이메일 초대·만료된 초대 거부", async () => {
    expect(await expectFail(as(db, patientA, "select public.invite_guardian($1, 'patient-a@example.test', '{records}')", [pidA]))).toMatch(/본인 이메일/);
    const late = await signUp(db, "late@example.test");
    const t = (await as<{ j: { token: string; invitation_id: string } }>(db, patientA, "select public.invite_guardian($1, 'late@example.test', '{records}', 1) j", [pidA]))[0].j;
    await as(db, "superuser", "update public.guardian_invitations set expires_at = now() - interval '1 minute' where id = $1", [t.invitation_id]);
    expect(await expectFail(as(db, late, "select public.accept_guardian_invitation($1)", [t.token]))).toMatch(/만료/);
  });
});

describe("6. 의료진 내부 검토 메모는 환자에게 비공개", () => {
  it("환자는 검토 상태만 보고 메모는 0건", async () => {
    const rows = await as<{ action: string }>(db, patientA, "select action from public.staff_reviews where patient_id = $1", [pidA]);
    expect(rows).toEqual([{ action: "consult_needed" }]);
    expect(await count(patientA, "select * from public.staff_review_notes")).toBe(0);
  });
  it("담당 의료진은 메모 조회, 비담당 의료진·다른 환자는 0건", async () => {
    expect(await count(staffA, "select * from public.staff_review_notes where review_id = $1", [reviewA])).toBe(1);
    expect(await count(staffB, "select * from public.staff_review_notes where review_id = $1", [reviewA])).toBe(0);
    expect(await count(patientB, "select * from public.staff_reviews")).toBe(0);
  });
  it("검토 기록을 직접 INSERT로 위조할 수 없음 (staff_id 사칭 불가)", async () => {
    expect(await expectFail(as(db, staffA, "insert into public.staff_reviews (patient_id, staff_id, action) values ($1, $2, 'checked')", [pidA, staffB.id]))).toMatch(/permission denied/);
  });
});

describe("C. 생활 요청 상태 RPC", () => {
  it("환자는 상태를 직접 지정·변경할 수 없음", async () => {
    expect(await expectFail(as(db, patientA, `insert into public.life_requests (patient_id, category, detail, status) values ($1, 'water', 'x', 'completed')`, [pidA]))).toMatch(/permission denied/);
    expect(await expectFail(as(db, patientA, "update public.life_requests set status = 'completed' where id = $1", [reqA]))).toMatch(/permission denied/);
    expect(await expectFail(as(db, patientA, "select public.advance_request_status($1, 'received', 'acknowledged')", [reqA]))).toMatch(/not_found/);
  });
  it("식사 변경 요청 필드 조합이 틀리면 거부", async () => {
    expect(await expectFail(as(db, patientA, `insert into public.life_requests (patient_id, category, detail, meal_change_slot) values ($1, 'water', 'x', 'lunch')`, [pidA]))).toMatch(/life_requests_meal_change_fields/);
  });
  it("비담당 의료진은 처리 불가 (요청 존재 여부도 노출 안 함)", async () => {
    expect(await expectFail(as(db, staffB, "select public.advance_request_status($1, 'received', 'acknowledged')", [reqA]))).toMatch(/not_found/);
    expect(await expectFail(as(db, staffA, "select public.advance_request_status($1, 'received', 'acknowledged')", ["00000000-0000-0000-0000-000000000000"]))).toMatch(/not_found/);
  });
  it("접수 → 직원 확인 → 처리 완료 순서만, 처리자는 auth.uid()", async () => {
    expect(await expectFail(as(db, staffA, "select public.advance_request_status($1, 'received', 'completed')", [reqA]))).toMatch(/invalid_transition/);
    await as(db, staffA, "select public.advance_request_status($1, 'received', 'acknowledged')", [reqA]);
    await as(db, staffA, "select public.advance_request_status($1, 'acknowledged', 'completed')", [reqA]);
    const r = await as<{ status: string; handled_by: string; version: number }>(db, "superuser", "select status, handled_by, version from public.life_requests where id = $1", [reqA]);
    expect(r[0]).toEqual({ status: "completed", handled_by: staffA.id, version: 3 });
    expect(await expectFail(as(db, staffA, "select public.advance_request_status($1, 'completed', 'received')", [reqA]))).toMatch(/invalid_transition/);
  });
  it("식사 변경은 처리 완료 시에만, 같은 트랜잭션에서 식사 형태 반영", async () => {
    const mealType = async () =>
      (await as<{ meal_type: string }>(db, "superuser", "select meal_type from public.meal_logs where patient_id = $1 and slot = 'lunch'", [pidA]))[0]?.meal_type;
    await as(db, staffA, "select public.advance_request_status($1, 'received', 'acknowledged')", [reqMealA]);
    expect(await mealType()).toBeUndefined();
    await as(db, staffA, "select public.advance_request_status($1, 'acknowledged', 'completed')", [reqMealA]);
    expect(await mealType()).toBe("porridge");
  });
  it("환자는 식사 형태를 직접 바꿀 수 없음", async () => {
    expect(await expectFail(as(db, patientA, "update public.meal_logs set meal_type = 'liquid' where patient_id = $1", [pidA]))).toMatch(/permission denied/);
  });
  it("공동 담당 의료진 두 명이 동시에 처리: 먼저 처리한 한 명만 성공 (stale_state)", async () => {
    await as(db, staffA, "select public.advance_request_status($1, 'received', 'acknowledged')", [reqC]);
    expect(await expectFail(as(db, staffB, "select public.advance_request_status($1, 'received', 'acknowledged')", [reqC]))).toMatch(/stale_state/);
    const r = await as<{ status: string; handled_by: string }>(db, "superuser", "select status, handled_by from public.life_requests where id = $1", [reqC]);
    expect(r[0]).toEqual({ status: "acknowledged", handled_by: staffA.id });
  });
  it("실패한 상태 변경은 데이터를 바꾸지 않음", async () => {
    const before = await as(db, "superuser", "select status, version, updated_at from public.life_requests where id = $1", [reqB]);
    await expectFail(as(db, staffB, "select public.advance_request_status($1, 'acknowledged', 'completed')", [reqB]));
    expect(await as(db, "superuser", "select status, version, updated_at from public.life_requests where id = $1", [reqB])).toEqual(before);
  });
});

describe("통원·입원 모드와 입원 이력", () => {
  it("입원 → 퇴원 → 재입원: 새 이력, 과거 이력 보존, 자기기록 표시", async () => {
    await as(db, patientB, "select public.set_care_mode($1, 'inpatient', '데모병동 7층', '701호')", [pidB]);
    await as(db, patientB, "select public.set_care_mode($1, 'outpatient')", [pidB]);
    await as(db, patientB, "select public.set_care_mode($1, 'inpatient', '데모병동 7층', '702호')", [pidB]);
    const rows = await as<{ room: string; discharged_on: string | null; source: string }>(
      db, patientB, "select room, discharged_on::text, source from public.admissions where patient_id = $1 order by created_at", [pidB],
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ room: "701호", source: "self_reported" });
    expect(rows[0].discharged_on).not.toBeNull();
    expect(rows[1]).toMatchObject({ room: "702호", discharged_on: null });
    expect(await count(patientB, "select * from public.health_records where patient_id = $1", [pidB])).toBe(1);
  });
  it("다른 환자·비담당 의료진은 모드 변경 불가, 이력 직접 수정 불가", async () => {
    expect(await expectFail(as(db, patientA, "select public.set_care_mode($1, 'outpatient')", [pidB]))).toMatch(/forbidden/);
    expect(await expectFail(as(db, staffA, "select public.set_care_mode($1, 'outpatient')", [pidB]))).toMatch(/forbidden/);
    expect(await expectFail(as(db, patientB, "update public.admissions set room = '999호' where patient_id = $1", [pidB]))).toMatch(/permission denied/);
    expect(await expectFail(as(db, patientB, "delete from public.admissions where patient_id = $1", [pidB]))).toMatch(/permission denied/);
  });
});

describe("4. 권한 상승 시도 차단", () => {
  it("가입 정보에 role=staff를 넣어도 patient로 생성", async () => {
    const sneaky = await signUp(db, "sneaky@example.test", { meta: { role: "staff", display_name: "가상" } });
    const r = await as<{ role: string }>(db, sneaky, "select role from public.profiles where id = $1", [sneaky.id]);
    expect(r[0].role).toBe("patient");
  });
  it("본인 역할을 staff로 변경 불가 (컬럼 권한), 표시 이름만 변경 가능", async () => {
    expect(await expectFail(as(db, patientA, "update public.profiles set role = 'staff' where id = $1", [patientA.id]))).toMatch(/permission denied/);
    expect(await as(db, patientA, "update public.profiles set display_name = '가상 이름' where id = $1 returning id", [patientA.id])).toHaveLength(1);
  });
  it("관리자 함수 직접 호출 불가", async () => {
    expect(await expectFail(as(db, patientA, "select private.admin_set_role($1, 'staff')", [patientA.id]))).toMatch(/permission denied/);
  });
  it("스스로 담당 배정·보호자 grant 생성 불가", async () => {
    expect(await expectFail(as(db, patientA, "insert into public.staff_assignments (patient_id, staff_id) values ($1, $2)", [pidB, patientA.id]))).toMatch(/permission denied/);
    expect(await expectFail(as(db, stranger, "insert into public.access_grants (patient_id, grantee_id, scopes) values ($1, $2, '{records}')", [pidA, stranger.id]))).toMatch(/permission denied/);
  });
  it("일반 사용자(환자·의료진·외부인)는 환자 프로필을 직접 만들 수 없음 — 서버 발급만 (migration 7)", async () => {
    for (const u of [patientA, staffA, stranger]) {
      expect(await expectFail(as(db, u, "select public.create_my_patient_profile('x')"))).toMatch(/permission denied/);
      expect(await expectFail(as(db, u, "insert into public.patients (profile_id, display_name) values ($1, 'x')", [u.id]))).toMatch(/permission denied/);
    }
  });
  it("관리자가 아닌 계정으로는 담당자 지정 대상이 될 수 없음", async () => {
    expect(await expectFail(as(db, "service_role", "insert into public.staff_assignments (patient_id, staff_id) values ($1, $2)", [pidA, stranger.id]))).toMatch(/의료진 계정만/);
  });
});

describe("Security Advisor: 로그인 사용자가 실행 가능한 SECURITY DEFINER 함수 10개 — 내부 역할·소유권 검사", () => {
  it("관계없는 로그인 사용자가 환자 A의 ID로 호출하면 모두 거부되고 데이터는 그대로", async () => {
    const inv = (await as<{ j: { invitation_id: string } }>(db, patientA, "select public.invite_guardian($1, 'pending-check@example.test', '{records}') j", [pidA]))[0].j;
    const snapshot = async () =>
      as(db, "superuser", `select
        (select count(*) from public.admissions) adm, (select count(*) from public.staff_reviews) rv,
        (select string_agg(status::text || version, ',' order by id) from public.life_requests) req,
        (select string_agg(visible_to_guardian::text, ',' order by id) from public.medications) med,
        (select string_agg(status::text, ',' order by id) from public.guardian_invitations) inv,
        (select string_agg(coalesce(revoked_at::text, '-') || array_to_string(scopes, '+'), ',' order by id) from public.access_grants) grants,
        (select count(*) from public.patients) pts`);
    const before = await snapshot();
    const calls: [string, string, unknown[]][] = [
      ["create_my_patient_profile", "select public.create_my_patient_profile('x')", []],
      ["set_care_mode", "select public.set_care_mode($1, 'inpatient')", [pidA]],
      ["advance_request_status", "select public.advance_request_status($1, 'received', 'acknowledged')", [reqMealA]],
      ["add_staff_review", "select public.add_staff_review($1, 'checked')", [pidA]],
      ["set_medication_guardian_visibility", "select public.set_medication_guardian_visibility($1, false)", [medA1]],
      ["invite_guardian", "select public.invite_guardian($1, 'x@example.test', '{records}')", [pidA]],
      ["accept_guardian_invitation", "select public.accept_guardian_invitation($1)", ["0".repeat(64)]],
      ["revoke_guardian_invitation", "select public.revoke_guardian_invitation($1)", [inv.invitation_id]],
      ["update_guardian_scopes", "select public.update_guardian_scopes($1, '{records}')", [grantId]],
      ["revoke_guardian_access", "select public.revoke_guardian_access($1)", [grantId]],
    ];
    expect(calls).toHaveLength(10);
    for (const [name, sql, params] of calls) {
      const msg = await expectFail(as(db, stranger, sql, params));
      expect(msg, name).toMatch(/permission denied|forbidden|not_found|invalid_input/);
    }
    expect(await snapshot()).toEqual(before);
    // 초대는 환자 본인만 취소 가능
    await as(db, patientA, "select public.revoke_guardian_invitation($1)", [inv.invitation_id]);
    expect((await as<{ status: string }>(db, "superuser", "select status from public.guardian_invitations where id = $1", [inv.invitation_id]))[0].status).toBe("revoked");
  });
});

describe("migration 파일 점검", () => {
  it("빈 migration 파일이 없음 (중단된 migration new 흔적 방지)", () => {
    const empty = migrationFiles().filter((f) => statSync(path.join(MIGRATIONS_DIR, f)).size === 0);
    expect(empty).toEqual([]);
  });
});

describe("C. SECURITY DEFINER·실행 권한 점검 (카탈로그 검사)", () => {
  it("모든 public 테이블에 RLS 활성화, anon 권한 없음", async () => {
    const rows = await as<{ relname: string; rls: boolean; anon: boolean }>(
      db, "superuser",
      `select c.relname, c.relrowsecurity rls,
              has_table_privilege('anon', c.oid, 'select,insert,update,delete') anon
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'`,
    );
    expect(rows).toHaveLength(19); // migration 9: admin_users, migration 10: 처방 이력 3개
    expect(rows.filter((r) => !r.rls)).toEqual([]);
    expect(rows.filter((r) => r.anon)).toEqual([]);
  });
  it("SECURITY DEFINER 함수는 모두 search_path='' 고정", async () => {
    const rows = await as<{ fn: string; cfg: string[] | null }>(
      db, "superuser",
      `select p.proname fn, p.proconfig cfg from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public', 'private') and p.prosecdef`,
    );
    expect(rows.length).toBeGreaterThan(10);
    expect(rows.filter((r) => !(r.cfg ?? []).some((c) => c === 'search_path=""' || c === "search_path="))).toEqual([]);
  });
  it("anon·PUBLIC은 어떤 함수도 실행 불가, 관리자 함수는 service_role만", async () => {
    const rows = await as<{ fn: string; anon: boolean; auth: boolean; svc: boolean }>(
      db, "superuser",
      `select n.nspname || '.' || p.proname fn,
              has_function_privilege('anon', p.oid, 'execute') anon,
              has_function_privilege('authenticated', p.oid, 'execute') auth,
              has_function_privilege('service_role', p.oid, 'execute') svc
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public', 'private')`,
    );
    expect(rows.filter((r) => r.anon).map((r) => r.fn)).toEqual([]);
    const admin = rows.find((r) => r.fn === "private.admin_set_role")!;
    expect(admin).toMatchObject({ auth: false, svc: true });
    // 트리거 전용 함수는 로그인 사용자도 직접 실행 불가
    for (const fn of ["private.handle_new_user", "private.guard_profile_update", "private.ensure_staff_profile"]) {
      expect(rows.find((r) => r.fn === fn)).toMatchObject({ auth: false });
    }
  });
});
