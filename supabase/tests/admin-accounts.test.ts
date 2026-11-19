/**
 * migration 9 — 계정 비활성화(로그인한 세션도 즉시 차단) · 관리자 목록 · 이전 방식 환자 전환
 * 가상 계정: 환자 A, 간호사(A 담당), 보호자(A가 records·requests 공유), 관리자
 */
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { generateLoginCode } from "@/lib/patient-auth/rules";
import { as, createTestDb, expectFail, signUp } from "./support/db";

type U = { id: string; email: string };
let db: PGlite;
let patientA: U, staff: U, guardian: U, admin: U, other: U;
let pidA: string, reqA: string;

const count = async (actor: U, sql: string, params: unknown[] = []) =>
  (await as<{ n: number }>(db, actor, `select count(*)::int n from (${sql}) q`, params))[0].n;
const record = (pid: string) =>
  `select public.upsert_health_record('${pid}', private.today_kst(), 3::smallint, 2::smallint, 2::smallint, 3::smallint, 50::smallint, 'normal')`;
const setDisabled = (u: U, on: boolean) =>
  as(db, "service_role", `update public.profiles set disabled_at = ${on ? "now()" : "null"} where id = $1`, [u.id]);

beforeAll(async () => {
  db = await createTestDb();
  patientA = await signUp(db, "admin-test-a@example.test");
  staff = await signUp(db, "admin-test-staff@example.test");
  guardian = await signUp(db, "admin-test-guardian@example.test");
  admin = await signUp(db, "admin-test-admin@example.test");
  other = await signUp(db, "admin-test-other@example.test");
  await as(db, "service_role", "select private.admin_set_role($1, 'staff')", [staff.id]);
  await as(db, "service_role", "select private.admin_set_role($1, 'guardian')", [guardian.id]);
  await as(db, "service_role", "insert into public.admin_users (user_id) values ($1)", [admin.id]);
  pidA = (await as<{ id: string }>(db, "service_role", "insert into public.patients (profile_id, display_name) values ($1, '환자A (가상)') returning id", [patientA.id]))[0].id;
  await as(db, "service_role", "insert into public.staff_assignments (patient_id, staff_id) values ($1, $2)", [pidA, staff.id]);
  await as(db, patientA, record(pidA));
  reqA = (await as<{ id: string }>(db, patientA, "insert into public.life_requests (patient_id, category, detail) values ($1, 'water', '(가상) 물') returning id", [pidA]))[0].id;
  const inv = (await as<{ j: { token: string } }>(db, patientA, "select public.invite_guardian($1, $2, '{records,requests}') j", [pidA, guardian.email]))[0].j;
  await as(db, guardian, "select public.accept_guardian_invitation($1)", [inv.token]);
});

describe("비활성화: 이미 로그인한 세션도 다음 조회부터 차단, 복구하면 그대로 이어짐", () => {
  it("환자", async () => {
    expect(await count(patientA, "select * from public.health_records where patient_id = $1", [pidA])).toBe(1);
    await setDisabled(patientA, true);
    for (const t of ["patients", "health_records", "life_requests", "access_grants", "staff_assignments", "guardian_invitations"]) {
      expect(await count(patientA, `select id from public.${t}`.replace("select id from public.staff_assignments", "select patient_id from public.staff_assignments")), t).toBe(0);
    }
    expect(await expectFail(as(db, patientA, record(pidA)))).toMatch(/row-level security/);
    expect(await expectFail(as(db, patientA, "select public.invite_guardian($1, 'x@example.test', '{records}')", [pidA]))).toMatch(/forbidden/);
    // 본인 계정 상태는 볼 수 있지만 스스로 풀 수 없음
    expect((await as<{ off: boolean }>(db, patientA, "select disabled_at is not null off from public.profiles where id = $1", [patientA.id]))[0].off).toBe(true);
    expect(await expectFail(as(db, patientA, "update public.profiles set disabled_at = null where id = $1", [patientA.id]))).toMatch(/permission denied/);
    await setDisabled(patientA, false);
    expect(await count(patientA, "select * from public.health_records where patient_id = $1", [pidA])).toBe(1);
  });

  it("간호사", async () => {
    expect(await count(staff, "select * from public.patients")).toBe(1);
    await setDisabled(staff, true);
    expect(await count(staff, "select * from public.patients")).toBe(0);
    expect(await count(staff, "select * from public.health_records")).toBe(0);
    expect(await count(staff, "select * from public.staff_assignments")).toBe(0);
    expect(await expectFail(as(db, staff, "select public.advance_request_status($1, 'received', 'acknowledged')", [reqA]))).toMatch(/not_found/);
    expect(await expectFail(as(db, staff, "select public.add_staff_review($1, 'checked')", [pidA]))).toMatch(/forbidden/);
    await setDisabled(staff, false);
    expect(await count(staff, "select * from public.patients")).toBe(1);
  });

  it("보호자 (공유는 유지되고 접근만 막힘)", async () => {
    expect(await count(guardian, "select * from public.health_records")).toBe(1);
    await setDisabled(guardian, true);
    for (const t of ["patients", "health_records", "life_requests", "access_grants"]) {
      expect(await count(guardian, `select * from public.${t}`), t).toBe(0);
    }
    expect(await count(patientA, "select * from public.access_grants where revoked_at is null")).toBe(1);
    await setDisabled(guardian, false);
    expect(await count(guardian, "select * from public.health_records")).toBe(1);
  });
});

describe("관리자 목록 (admin_users)", () => {
  it("본인 행만 보이고, 일반 사용자는 추가·변경 불가", async () => {
    expect(await count(admin, "select * from public.admin_users")).toBe(1);
    expect(await count(other, "select * from public.admin_users")).toBe(0);
    expect(await count(patientA, "select * from public.admin_users")).toBe(0);
    expect(await expectFail(as(db, other, "insert into public.admin_users (user_id) values ($1)", [other.id]))).toMatch(/permission denied/);
    expect(await expectFail(as(db, admin, "delete from public.admin_users where user_id = $1", [admin.id]))).toMatch(/permission denied/);
  });
  it("관리자 계정도 RLS로 환자 데이터를 직접 읽지 못함 (계정 관리는 서버 키로만)", async () => {
    for (const t of ["patients", "health_records", "medications", "life_requests"]) {
      expect(await count(admin, `select * from public.${t}`), t).toBe(0);
    }
  });
});

describe("이전 방식(환자 코드) 환자 전환", () => {
  it("비밀번호를 정하지 않은 코드 환자도 관리자가 비밀번호를 정하면 본인 기록 사용 가능 (서버 키만)", async () => {
    const u = await signUp(db, "admin-test-legacy@example.test");
    const pid = (await as<{ id: string }>(db, "service_role", "insert into public.patients (profile_id, display_name) values ($1, '이전 방식 (가상)') returning id", [u.id]))[0].id;
    await as(db, "service_role", "select public.svc_register_patient_credential($1, $2, '1970-01-01'::date)", [pid, generateLoginCode()]);
    expect(await expectFail(as(db, u, record(pid)))).toMatch(/row-level security/);
    expect(await expectFail(as(db, u, "select public.svc_mark_password_set($1)", [pid]))).toMatch(/permission denied/);
    await as(db, "service_role", "select public.svc_mark_password_set($1)", [pid]);
    await as(db, u, record(pid));
    expect(await count(u, "select * from public.health_records where patient_id = $1", [pid])).toBe(1);
    // 다시 호출해도 처음 설정 시각은 유지
    const first = (await as<{ t: string }>(db, "superuser", "select password_set_at::text t from private.patient_credentials where patient_id = $1", [pid]))[0].t;
    await as(db, "service_role", "select public.svc_mark_password_set($1)", [pid]);
    expect((await as<{ t: string }>(db, "superuser", "select password_set_at::text t from private.patient_credentials where patient_id = $1", [pid]))[0].t).toBe(first);
  });
});
