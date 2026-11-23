/**
 * migration 10 — 처방 이력·복용 경험·진료 질문 연결 (PGlite, 가상 계정)
 * 환자 A·B, 보호자(A가 '약 정보' 공유), 보호자2(A가 '건강기록'만 공유), 간호사(A 담당), 다른 간호사
 */
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, createTestDb, expectFail, signUp } from "./support/db";

type U = { id: string; email: string };
let db: PGlite;
let A: U, B: U, G: U, G2: U, S: U, S2: U;
let pidA: string, pidB: string;

const count = async (actor: U, sql: string, params: unknown[] = []) =>
  (await as<{ n: number }>(db, actor, `select count(*)::int n from (${sql}) q`, params))[0].n;
const ITEMS = JSON.stringify([
  { name: "(가상) 코감기정", dosage: "1회 1정", frequency: "하루 3회", timing: "식후 30분", duration: "5일분", caution_rx: "(가상) 졸릴 수 있음" },
  { name: "(가상) 위보호정", dosage: "1회 1정", frequency: "하루 3회", timing: "식후 30분", duration: "5일분", external_item_seq: "200000001", active: false },
]);
const create = (actor: U, pid: string, req: string, items = ITEMS) =>
  as<{ id: string }>(db, actor, "select public.create_prescription($1, $2::uuid, '2026-09-01', '이비인후과', '(가상)의원', '', $3::jsonb) id", [pid, req, items]);

beforeAll(async () => {
  db = await createTestDb();
  [A, B, G, G2, S, S2] = await Promise.all(
    ["rx-a", "rx-b", "rx-g", "rx-g2", "rx-s", "rx-s2"].map((n) => signUp(db, `${n}@example.test`)),
  );
  for (const s of [S, S2]) await as(db, "service_role", "select private.admin_set_role($1, 'staff')", [s.id]);
  const issue = async (u: U) => (await as<{ id: string }>(db, "service_role", "insert into public.patients (profile_id, display_name) values ($1, '(가상)') returning id", [u.id]))[0].id;
  pidA = await issue(A);
  pidB = await issue(B);
  await as(db, "service_role", "insert into public.staff_assignments (patient_id, staff_id) values ($1, $2)", [pidA, S.id]);
  for (const [g, scopes] of [[G, "{medications}"], [G2, "{records}"]] as const) {
    const inv = (await as<{ j: { token: string } }>(db, A, "select public.invite_guardian($1, $2, $3) j", [pidA, g.email, scopes]))[0].j;
    await as(db, g, "select public.accept_guardian_invitation($1)", [inv.token]);
  }
});

describe("처방 한 건 등록 (약까지 한 번에)", () => {
  it("같은 등록 요청을 다시 보내도 처방·약은 한 건, 약 순서·복용 중 여부 저장", async () => {
    const req = "11111111-1111-4111-8111-111111111111";
    const [{ id }] = await create(A, pidA, req);
    const [{ id: again }] = await create(A, pidA, req);
    expect(again).toBe(id);
    expect(await count(A, "select 1 from public.prescriptions where patient_id = $1", [pidA])).toBe(1);
    const items = await as<{ name: string; sort: number; active: boolean; external_item_seq: string | null }>(
      db, A, "select name, sort, active, external_item_seq from public.prescription_items where prescription_id = $1 order by sort", [id],
    );
    expect(items).toEqual([
      { name: "(가상) 코감기정", sort: 0, active: true, external_item_seq: null },
      { name: "(가상) 위보호정", sort: 1, active: false, external_item_seq: "200000001" },
    ]);
  });

  it("새 처방을 등록해도 이전 처방은 그대로 (처방일 최신순 조회)", async () => {
    await as(db, A, "select public.create_prescription($1, gen_random_uuid(), '2026-11-02', '내과', '', '', $2::jsonb)", [pidA, JSON.stringify([{ name: "(가상) 혈압정" }])]);
    const rows = await as<{ d: string; department: string }>(db, A, "select prescribed_on::text d, department from public.prescriptions where patient_id = $1 order by prescribed_on desc", [pidA]);
    expect(rows).toEqual([{ d: "2026-11-02", department: "내과" }, { d: "2026-09-01", department: "이비인후과" }]);
  });

  it("다른 환자 대신 등록 불가, 약이 없거나 30개 초과면 거부", async () => {
    expect(await expectFail(create(A, pidB, "22222222-2222-4222-8222-222222222222"))).toMatch(/row-level security/);
    expect(await expectFail(create(G, pidA, "33333333-3333-4333-8333-333333333333"))).toMatch(/row-level security/);
    expect(await expectFail(create(A, pidA, "44444444-4444-4444-8444-444444444444", "[]"))).toMatch(/invalid_input/);
    const many = JSON.stringify(Array.from({ length: 31 }, (_, i) => ({ name: `(가상) 약${i}` })));
    expect(await expectFail(create(A, pidA, "55555555-5555-4555-8555-555555555555", many))).toMatch(/invalid_input/);
  });
});

describe("복용 경험·별표·진료 질문", () => {
  let rx: string, item: string, rxB: string;
  beforeAll(async () => {
    rx = (await as<{ id: string }>(db, A, "select id from public.prescriptions where patient_id = $1 and department = '이비인후과'", [pidA]))[0].id;
    item = (await as<{ id: string }>(db, A, "select id from public.prescription_items where prescription_id = $1 order by sort limit 1", [rx]))[0].id;
    rxB = (await create(B, pidB, "66666666-6666-4666-8666-666666666666"))[0].id;
  });

  it("처방 전체·특정 약에 태그·메모, 빈 메모 거부, 다른 처방의 약에는 붙일 수 없음", async () => {
    await as(db, A, "insert into public.prescription_notes (prescription_id, patient_id, item_id, tags, memo) values ($1, $2, null, '{증상이 줄었어요,속쓰림}', '(가상) 메모')", [rx, pidA]);
    await as(db, A, "insert into public.prescription_notes (prescription_id, patient_id, item_id, tags) values ($1, $2, $3, '{졸림}')", [rx, pidA, item]);
    expect(await count(A, "select 1 from public.prescription_notes where prescription_id = $1", [rx])).toBe(2);
    expect(await expectFail(as(db, A, "insert into public.prescription_notes (prescription_id, patient_id) values ($1, $2)", [rx, pidA]))).toMatch(/prescription_notes_not_empty/);
    const otherItem = (await as<{ id: string }>(db, B, "select id from public.prescription_items where prescription_id = $1 limit 1", [rxB]))[0].id;
    expect(await expectFail(as(db, A, "insert into public.prescription_notes (prescription_id, patient_id, item_id, tags) values ($1, $2, $3, '{졸림}')", [rx, pidA, otherItem]))).toMatch(/invalid_input/);
    // 다른 환자의 처방에 내 메모를 붙일 수 없음
    expect(await expectFail(as(db, A, "insert into public.prescription_notes (prescription_id, patient_id, tags) values ($1, $2, '{졸림}')", [rxB, pidA]))).toMatch(/invalid_input/);
  });

  it("별표는 처방 한 건의 값 (별도 복사 없음), 본인만 변경", async () => {
    expect(await as(db, A, "update public.prescriptions set starred = true where id = $1 returning id", [rx])).toHaveLength(1);
    expect(await as(db, B, "update public.prescriptions set starred = true where id = $1 returning id", [rx])).toEqual([]);
    expect(await expectFail(as(db, A, "update public.prescriptions set patient_id = $2 where id = $1", [rx, pidB]))).toMatch(/permission denied/);
  });

  it("진료 질문을 처방에 연결 (같은 환자 처방만), 수정 시각 기록", async () => {
    const q = (await as<{ id: string }>(db, A, "insert into public.visit_questions (patient_id, text, prescription_id) values ($1, '(가상) 속쓰림 줄이는 방법?', $2) returning id", [pidA, rx]))[0].id;
    expect(await expectFail(as(db, A, "insert into public.visit_questions (patient_id, text, prescription_id) values ($1, 'x', $2)", [pidA, rxB]))).toMatch(/invalid_input/);
    const before = (await as<{ u: string }>(db, A, "select updated_at::text u from public.visit_questions where id = $1", [q]))[0].u;
    await new Promise((r) => setTimeout(r, 10));
    await as(db, A, "update public.visit_questions set text = '(가상) 수정한 질문' where id = $1", [q]);
    const after = (await as<{ u: string }>(db, A, "select updated_at::text u from public.visit_questions where id = $1", [q]))[0].u;
    expect(after > before).toBe(true);
  });
});

describe("보호자·의료진·다른 환자", () => {
  it("보호자: 환자가 처방 공유를 켜고 '약 정보' 범위가 있을 때만 처방·약·메모 조회", async () => {
    const rx = (await as<{ id: string }>(db, A, "select id from public.prescriptions where patient_id = $1 and department = '이비인후과'", [pidA]))[0].id;
    expect(await count(G, "select 1 from public.prescriptions")).toBe(0);
    await as(db, A, "update public.prescriptions set visible_to_guardian = true where id = $1", [rx]);
    expect(await count(G, "select 1 from public.prescriptions")).toBe(1);
    expect(await count(G, "select 1 from public.prescription_items")).toBe(2);
    expect(await count(G, "select 1 from public.prescription_notes")).toBe(2);
    expect(await count(G2, "select 1 from public.prescriptions")).toBe(0); // '건강기록'만 공유받은 보호자
    expect(await as(db, G, "update public.prescriptions set starred = false where id = $1 returning id", [rx])).toEqual([]); // 읽기 전용
    // 공유 철회 → 즉시 0건
    const grant = (await as<{ id: string }>(db, A, "select id from public.access_grants where grantee_id = $1", [G.id]))[0].id;
    await as(db, A, "select public.revoke_guardian_access($1)", [grant]);
    expect(await count(G, "select 1 from public.prescription_notes")).toBe(0);
  });

  it("담당 간호사만 조회, 비담당·다른 환자는 0건", async () => {
    expect(await count(S, "select 1 from public.prescriptions where patient_id = $1", [pidA])).toBe(2);
    expect(await count(S2, "select 1 from public.prescriptions")).toBe(0);
    expect(await count(B, "select 1 from public.prescriptions where patient_id = $1", [pidA])).toBe(0);
    expect(await count(B, "select 1 from public.prescription_notes where patient_id = $1", [pidA])).toBe(0);
    expect(await expectFail(as(db, S, "insert into public.prescription_notes (prescription_id, patient_id, tags) select id, patient_id, '{졸림}' from public.prescriptions where patient_id = $1 limit 1", [pidA]))).toMatch(/row-level security/);
  });

  it("로그인하지 않은 사용자는 아무것도 못 봄, 비활성화된 환자는 즉시 차단", async () => {
    expect(await expectFail(as(db, "anon", "select 1 from public.prescriptions"))).toMatch(/permission denied/);
    await as(db, "service_role", "update public.profiles set disabled_at = now() where id = $1", [A.id]);
    expect(await count(A, "select 1 from public.prescriptions")).toBe(0);
    await as(db, "service_role", "update public.profiles set disabled_at = null where id = $1", [A.id]);
    expect(await count(A, "select 1 from public.prescriptions")).toBe(2);
  });
});
