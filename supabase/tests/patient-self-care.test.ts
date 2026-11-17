/**
 * migration 8 — 환자 본인의 내 약 관리 + 다음 진료일 (가상 계정·가상 데이터)
 *
 * 환자 A·B, 보호자(A가 records·medications 공유), 의료진 A(A 담당)·B(B 담당)
 */
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, createTestDb, expectFail, signUp } from "./support/db";

type U = { id: string; email: string };
let db: PGlite;
let patientA: U, patientB: U, guardian: U, staffA: U, staffB: U;
let pidA: string, pidB: string;
let staffMedB: string;

const count = async (actor: U, sql: string, params: unknown[] = []) =>
  (await as<{ n: number }>(db, actor, `select count(*)::int n from (${sql}) q`, params))[0].n;

beforeAll(async () => {
  db = await createTestDb();
  patientA = await signUp(db, "self-a@example.test");
  patientB = await signUp(db, "self-b@example.test");
  guardian = await signUp(db, "self-guardian@example.test");
  staffA = await signUp(db, "self-staff-a@example.test");
  staffB = await signUp(db, "self-staff-b@example.test");
  for (const s of [staffA, staffB]) await as(db, "service_role", "select private.admin_set_role($1, 'staff')", [s.id]);
  for (const g of [guardian]) await as(db, "service_role", "select private.admin_set_role($1, 'guardian')", [g.id]);
  const issue = async (u: U, name: string) =>
    (await as<{ id: string }>(db, "service_role", "insert into public.patients (profile_id, display_name) values ($1, $2) returning id", [u.id, name]))[0].id;
  pidA = await issue(patientA, "환자A (가상)");
  pidB = await issue(patientB, "환자B (가상)");
  await as(db, "service_role", "insert into public.staff_assignments (patient_id, staff_id) values ($1, $2), ($3, $4)", [pidA, staffA.id, pidB, staffB.id]);
  staffMedB = (await as<{ id: string }>(db, staffB, "insert into public.medications (patient_id, name) values ($1, '(가상) 의료진 등록 약') returning id", [pidB]))[0].id;

  const inv = (await as<{ j: { token: string } }>(db, patientA, `select public.invite_guardian($1, $2, '{records,medications}') j`, [pidA, guardian.email]))[0].j;
  await as(db, "superuser", "update auth.users set email_confirmed_at = now() where id = $1", [guardian.id]);
  await as(db, guardian, "select public.accept_guardian_invitation($1)", [inv.token]);
});

describe("내 약: 환자 본인이 직접 추가·수정·삭제", () => {
  it("추가한 약은 기본 비공개, 이름·용량·복용 시간·메모 수정, 삭제", async () => {
    const id = (await as<{ id: string }>(db, patientA,
      "insert into public.medications (patient_id, name, dosage, schedule, caution) values ($1, '(가상) 내 약', '1정', '아침 식후', '(가상) 메모') returning id", [pidA]))[0].id;
    const row = (await as<{ visible_to_guardian: boolean; source: string }>(db, patientA, "select visible_to_guardian, source from public.medications where id = $1", [id]))[0];
    expect(row).toEqual({ visible_to_guardian: false, source: "manual" });
    expect(await count(guardian, "select * from public.medications where patient_id = $1", [pidA])).toBe(0);

    expect(await as(db, patientA, "update public.medications set dosage = '2정', schedule = '저녁 식후' where id = $1 returning id", [id])).toHaveLength(1);
    await as(db, patientA, "update public.medications set visible_to_guardian = true where id = $1", [id]);
    expect(await count(guardian, "select * from public.medications where patient_id = $1", [pidA])).toBe(1);
    // 담당 의료진은 조회 가능, 공개 여부는 바꿀 수 없음 (기존 트리거)
    expect(await count(staffA, "select * from public.medications where id = $1", [id])).toBe(1);
    expect(await expectFail(as(db, staffA, "update public.medications set visible_to_guardian = false where id = $1", [id]))).toMatch(/forbidden/);

    expect(await as(db, patientA, "delete from public.medications where id = $1 returning id", [id])).toHaveLength(1);
    expect(await count(guardian, "select * from public.medications where patient_id = $1", [pidA])).toBe(0);
  });

  it("다른 환자의 약은 추가·수정·삭제·조회 불가", async () => {
    expect(await expectFail(as(db, patientA, "insert into public.medications (patient_id, name) values ($1, '(가상)')", [pidB]))).toMatch(/row-level security/);
    expect(await as(db, patientA, "update public.medications set name = '변조' where id = $1 returning id", [staffMedB])).toEqual([]);
    expect(await as(db, patientA, "delete from public.medications where id = $1 returning id", [staffMedB])).toEqual([]);
    expect(await count(patientA, "select * from public.medications where id = $1", [staffMedB])).toBe(0);
  });

  it("다른 환자 소유로 옮길 수 없음, 보호자·비담당 의료진은 쓰기 불가", async () => {
    const id = (await as<{ id: string }>(db, patientA, "insert into public.medications (patient_id, name) values ($1, '(가상) 옮기기 시도') returning id", [pidA]))[0].id;
    expect(await expectFail(as(db, patientA, "update public.medications set patient_id = $2 where id = $1", [id, pidB]))).toMatch(/permission denied|forbidden/);
    expect(await expectFail(as(db, guardian, "insert into public.medications (patient_id, name) values ($1, '(가상)')", [pidA]))).toMatch(/row-level security/);
    expect(await expectFail(as(db, staffB, "insert into public.medications (patient_id, name) values ($1, '(가상)')", [pidA]))).toMatch(/row-level security/);
    expect(await as(db, staffB, "delete from public.medications where id = $1 returning id", [id])).toEqual([]);
  });
});

describe("다음 진료일: 환자 본인도 기록", () => {
  it("본인만 수정, 다른 컬럼(이름·모드)은 바꿀 수 없음", async () => {
    expect(await as(db, patientA, "update public.patients set next_visit_date = '2026-12-04' where id = $1 returning id", [pidA])).toHaveLength(1);
    expect(await as(db, patientA, "update public.patients set next_visit_date = '2026-12-04' where id = $1 returning id", [pidB])).toEqual([]);
    expect(await expectFail(as(db, patientA, "update public.patients set display_name = '변조' where id = $1", [pidA]))).toMatch(/permission denied/);
    expect(await expectFail(as(db, patientA, "update public.patients set care_mode = 'inpatient' where id = $1", [pidA]))).toMatch(/permission denied/);
    expect(await as(db, guardian, "update public.patients set next_visit_date = '2026-12-05' where id = $1 returning id", [pidA])).toEqual([]);
  });
});
