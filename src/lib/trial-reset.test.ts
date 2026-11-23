/**
 * 체험 계정 초기화 안전 장치 — 가짜 Supabase 클라이언트로 검증 (실제 DB 접속 없음)
 */
import { describe, expect, it } from "vitest";
import { applyReset, countPlan, parseTargets, RESET_TABLES, verifyTargets } from "../../scripts/trial/reset-core.mjs";

const P1 = "11111111-1111-4111-8111-111111111111";
const U1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const P2 = "22222222-2222-4222-8222-222222222222";
const U2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

type Row = Record<string, unknown>;
function fake(db: { patients: Row[]; profiles: Row[]; admin_users: Row[]; users: Row[]; rows: Record<string, Row[]> }) {
  const deletes: { table: string; col: string; val: unknown }[] = [];
  const from = (table: string) => {
    let mode: "select" | "delete" = "select";
    let head = false;
    const filters: [string, unknown][] = [];
    const src = () => (table in db ? (db as unknown as Record<string, Row[]>)[table] : (db.rows[table] ?? []));
    const matched = () => src().filter((r) => filters.every(([c, v]) => r[c] === v));
    const b: Record<string, unknown> = {
      select: (_c: string, o?: { head?: boolean }) => ((head = Boolean(o?.head)), b),
      delete: () => ((mode = "delete"), b),
      eq: (c: string, v: unknown) => (filters.push([c, v]), b),
      maybeSingle: async () => ({ data: matched()[0] ?? null, error: null }),
      then: (res: (v: unknown) => void) => {
        if (mode === "delete") {
          if (filters.length !== 1 || filters[0][0] !== "patient_id") throw new Error("patient_id 조건 없는 삭제");
          deletes.push({ table, col: filters[0][0], val: filters[0][1] });
          const keep = src().filter((r) => r.patient_id !== filters[0][1]);
          const n = src().length - keep.length;
          db.rows[table] = keep;
          return res({ count: n, error: null });
        }
        return res({ data: head ? null : matched(), count: matched().length, error: null });
      },
    };
    return b;
  };
  const client = {
    from,
    auth: { admin: { getUserById: async (id: string) => ({ data: { user: db.users.find((u) => u.id === id) ?? null }, error: null }) } },
  };
  return { client, deletes };
}

const base = () => ({
  patients: [
    { id: P1, profile_id: U1, display_name: "(체험) 김체험" },
    { id: P2, profile_id: U2, display_name: "기존 환자" },
  ],
  profiles: [
    { id: U1, role: "patient" },
    { id: U2, role: "patient" },
  ],
  admin_users: [] as Row[],
  users: [
    { id: U1, app_metadata: { carelog_test: true } },
    { id: U2, app_metadata: {} },
  ],
  rows: {
    prescriptions: [{ patient_id: P1 }, { patient_id: P1 }, { patient_id: P2 }],
    health_records: [{ patient_id: P1 }, { patient_id: P2 }, { patient_id: P2 }],
    visit_questions: [{ patient_id: P2 }],
  } as Record<string, Row[]>,
});

describe("체험 계정 초기화 — 대상 확인", () => {
  it("설정 형식: 쌍·UUID·1~10개·중복 금지", () => {
    expect(parseTargets(`${P1}:${U1}`)).toEqual([{ patientId: P1, authUserId: U1 }]);
    expect(() => parseTargets("")).toThrow();
    expect(() => parseTargets(P1)).toThrow();
    expect(() => parseTargets(`${P1}:${U1}:x`)).toThrow();
    expect(() => parseTargets(`${P1}:${U1},${P1}:${U2}`)).toThrow();
    expect(() => parseTargets(Array.from({ length: 11 }, () => `${P1}:${U1}`).join(","))).toThrow();
  });

  it("체험 계정은 통과, 이름·테스트 표시·계정 ID·역할·관리자 중 하나라도 어긋나면 실패", async () => {
    expect((await verifyTargets(fake(base()).client, [{ patientId: P1, authUserId: U1 }])).ok).toBe(true);

    const noMark = base();
    noMark.patients[0].display_name = "김체험";
    expect((await verifyTargets(fake(noMark).client, [{ patientId: P1, authUserId: U1 }])).ok).toBe(false);

    const notTest = base();
    notTest.users[0].app_metadata = {};
    expect((await verifyTargets(fake(notTest).client, [{ patientId: P1, authUserId: U1 }])).ok).toBe(false);

    // 이름에 (체험)을 붙여도 테스트 계정이 아닌 기존 환자는 거부
    const renamed = base();
    renamed.patients[1].display_name = "(체험) 기존 환자";
    expect((await verifyTargets(fake(renamed).client, [{ patientId: P2, authUserId: U2 }])).ok).toBe(false);

    expect((await verifyTargets(fake(base()).client, [{ patientId: P1, authUserId: U2 }])).ok).toBe(false); // ID 쌍 불일치

    const isAdmin = base();
    isAdmin.admin_users.push({ user_id: U1 });
    expect((await verifyTargets(fake(isAdmin).client, [{ patientId: P1, authUserId: U1 }])).ok).toBe(false);

    const staff = base();
    staff.profiles[0].role = "staff";
    expect((await verifyTargets(fake(staff).client, [{ patientId: P1, authUserId: U1 }])).ok).toBe(false);

    // 하나라도 실패하면 전체 실패
    const r = await verifyTargets(fake(base()).client, [
      { patientId: P1, authUserId: U1 },
      { patientId: P2, authUserId: U2 },
    ]);
    expect(r.ok).toBe(false);
    expect(r.errors).toHaveLength(1);
  });
});

describe("체험 계정 초기화 — 삭제", () => {
  it("미리 보기는 세기만, 삭제는 체험 환자 기록만 (다른 환자 기록은 그대로)", async () => {
    const db = base();
    const { client, deletes } = fake(db);
    const { verified } = await verifyTargets(client, [{ patientId: P1, authUserId: U1 }]);
    const plan = await countPlan(client, verified);
    expect(plan[P1].prescriptions).toBe(2);
    expect(plan[P1].health_records).toBe(1);
    expect(deletes).toHaveLength(0);

    const deleted = await applyReset(client, verified);
    expect(deleted[P1].prescriptions).toBe(2);
    expect(deletes.every((d) => d.col === "patient_id" && d.val === P1)).toBe(true);
    expect(deletes.map((d) => d.table)).toEqual(RESET_TABLES);
    expect(db.rows.prescriptions).toEqual([{ patient_id: P2 }]);
    expect(db.rows.health_records).toHaveLength(2);
    expect(db.rows.visit_questions).toEqual([{ patient_id: P2 }]);
    expect(db.patients).toHaveLength(2); // 환자 행·계정은 지우지 않음
  });
});
