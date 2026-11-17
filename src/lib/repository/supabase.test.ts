import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSupabaseRepository, toCareLogError } from "./supabase";

const TODAY = "2026-11-15";
const row = (date: string, condition: number) => ({
  id: `r-${date}`,
  patient_id: "pid-a",
  record_date: date,
  condition,
  pain: 1,
  fatigue: 2,
  sleep: 3,
  meal_intake: 75,
  digestion: "good",
  symptoms: [],
  memo: "",
  recorded_in: "outpatient",
  created_at: `${date}T11:00:00+00:00`,
  updated_at: `${date}T11:00:00+00:00`,
});

type Tables = Record<string, unknown>;

/** supabase-js 질의 체인을 흉내 내는 가짜 클라이언트 (RLS 결과를 테이블별로 지정) */
function fakeClient(opts: { tables?: Tables; rpcResult?: { data: unknown; error: unknown }; writeRows?: unknown[] } = {}) {
  const tables: Tables = {
    profiles: { id: "user-a", role: "patient", display_name: "" },
    patients: [{ id: "pid-a", display_name: "가상 환자 A", birth_year: 1970, sex: "F", department: "", care_mode: "outpatient", next_visit_date: null }],
    admissions: [],
    health_records: [row("2026-11-14", 4)],
    ...opts.tables,
  };
  const calls: { table?: string; fn?: string; op?: string; filters: unknown[]; payload?: unknown }[] = [];
  const from = (table: string) => {
    const call: (typeof calls)[number] = { table, op: "select", filters: [] };
    calls.push(call);
    const result = () => {
      if (call.op !== "select") return { data: opts.writeRows ?? [{ id: "x" }], error: null };
      const v = tables[table];
      return { data: v === undefined ? [] : v, error: null };
    };
    const builder: Record<string, unknown> = {
      select: () => builder,
      insert: (p: unknown) => ((call.op = "insert"), (call.payload = p), builder),
      update: (p: unknown) => ((call.op = "update"), (call.payload = p), builder),
      delete: () => ((call.op = "delete"), builder),
      eq: (c: string, v: unknown) => (call.filters.push(["eq", c, v]), builder),
      in: (c: string, v: unknown) => (call.filters.push(["in", c, v]), builder),
      is: (c: string, v: unknown) => (call.filters.push(["is", c, v]), builder),
      gte: (c: string, v: unknown) => (call.filters.push(["gte", c, v]), builder),
      order: () => builder,
      limit: () => builder,
      maybeSingle: async () => {
        const r = result();
        return { ...r, data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data };
      },
      single: async () => {
        const r = result();
        return { ...r, data: Array.isArray(r.data) ? r.data[0] : r.data };
      },
      then: (res: (v: unknown) => void) => res(result()),
    };
    return builder;
  };
  const rpc = async (fn: string, args: unknown) => {
    calls.push({ fn, filters: [args] });
    return opts.rpcResult ?? { data: row(TODAY, 2), error: null };
  };
  return { client: { from, rpc } as unknown as SupabaseClient, calls };
}

// DB 모드에서는 건강기록을 localStorage에 저장하지 않음 → 접근하면 즉시 실패
let touched = false;
beforeEach(() => {
  touched = false;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      touched = true;
      throw new Error("localStorage 접근 금지");
    },
  });
});
afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
  expect(touched).toBe(false);
});

describe("Supabase 저장소 (DB 모드)", () => {
  it("환자: 본인 환자 행만 요청하고 앱 형식으로 변환", async () => {
    const { client, calls } = fakeClient();
    const repo = createSupabaseRepository(client, "user-a", { today: () => TODAY });
    expect(repo.getSnapshot()).toBeNull();
    await repo.load();
    expect(repo.getLoadState()).toEqual({ state: "ready" });
    const d = repo.getSnapshot()!;
    expect(d.viewer).toEqual({ userId: "user-a", role: "patient", displayName: "" });
    expect(d.patients[0]).toMatchObject({ id: "pid-a", name: "가상 환자 A", isDemo: false });
    expect(d.records[0]).toMatchObject({ date: "2026-11-14", condition: 4, mealIntake: 75, recordedIn: "outpatient" });
    expect(d.records[0].createdAt).toBe("2026-11-14T11:00:00.000Z");
    expect(calls.find((c) => c.table === "patients")!.filters).toContainEqual(["eq", "profile_id", "user-a"]);
    expect(calls.find((c) => c.table === "health_records")!.filters).toContainEqual(["gte", "record_date", "2026-08-18"]);
    // 환자는 내부 검토 메모를 요청조차 하지 않음
    expect(calls.some((c) => c.table === "staff_review_notes")).toBe(false);
  });

  it("의료진·보호자: 역할은 profiles(서버 값)에서 결정, 환자 목록은 RLS 결과 그대로", async () => {
    const { client, calls } = fakeClient({
      tables: {
        profiles: { id: "staff-1", role: "staff", display_name: "가상 간호사" },
        staff_assignments: [{ patient_id: "pid-a", staff_id: "staff-1" }],
        staff_review_notes: [{ review_id: "rv1", note: "(가상) 내부 메모" }],
        staff_reviews: [{ id: "rv1", patient_id: "pid-a", staff_id: "staff-1", action: "checked", created_at: "2026-11-15T01:00:00Z" }],
      },
    });
    const repo = createSupabaseRepository(client, "staff-1", { today: () => TODAY });
    await repo.load();
    const d = repo.getSnapshot()!;
    expect(d.viewer.role).toBe("staff");
    expect(d.patients[0].assignedStaffIds).toEqual(["staff-1"]);
    expect(d.reviews[0]).toMatchObject({ action: "checked", note: "(가상) 내부 메모" });
    expect(calls.find((c) => c.table === "patients")!.filters).toEqual([]); // 담당 범위는 RLS가 결정

    const g = fakeClient({ tables: { profiles: { id: "g-1", role: "guardian", display_name: "" }, patients: [] } });
    const grepo = createSupabaseRepository(g.client, "g-1", { today: () => TODAY });
    await grepo.load();
    expect(grepo.getLoadState()).toEqual({ state: "ready" }); // 공유받은 환자가 없어도 오류 아님
    expect(grepo.getSnapshot()!.patients).toEqual([]);
    expect(g.calls.some((c) => c.table === "health_records")).toBe(false); // 볼 환자가 없으면 조회 생략
  });

  it("같은 날짜 재저장은 화면에서도 1건으로 교체", async () => {
    const { client, calls } = fakeClient({ rpcResult: { data: row("2026-11-14", 1), error: null } });
    const repo = createSupabaseRepository(client, "user-a", { today: () => TODAY });
    await repo.load();
    await repo.upsertHealthRecord({
      patientId: "pid-a", date: "2026-11-14", condition: 1, pain: 1, fatigue: 2, sleep: 3,
      mealIntake: 75, digestion: "good", symptoms: [], memo: "", recordedIn: "outpatient",
    });
    expect(repo.getSnapshot()!.records).toHaveLength(1);
    expect(repo.getSnapshot()!.records[0].condition).toBe(1);
    expect(calls.find((c) => c.fn === "upsert_health_record")!.filters[0]).toMatchObject({ p_patient_id: "pid-a", p_record_date: "2026-11-14" });
  });

  it("모드 전환·요청 상태·검토·공유는 검증된 RPC로 호출", async () => {
    const { client, calls } = fakeClient({ rpcResult: { data: { token: "t", expires_at: "2026-11-22T00:00:00Z" }, error: null } });
    const repo = createSupabaseRepository(client, "user-a", { today: () => TODAY });
    await repo.load();
    await repo.setCareMode("pid-a", "inpatient", { ward: "가상 병동", room: "301" });
    await repo.updateRequestStatus("req-1", "received", "acknowledged", "ignored");
    await repo.inviteGuardian("pid-a", "guardian@example.test", ["records"]);
    await repo.revokeGuardianAccess("grant-1");
    const fns = calls.filter((c) => c.fn).map((c) => c.fn);
    expect(fns).toEqual(["set_care_mode", "advance_request_status", "invite_guardian", "revoke_guardian_access"]);
    expect(calls.find((c) => c.fn === "set_care_mode")!.filters[0]).toMatchObject({ p_mode: "inpatient", p_ward: "가상 병동", p_room: "301" });
    expect(calls.find((c) => c.fn === "advance_request_status")!.filters[0]).toEqual({ p_request_id: "req-1", p_expected: "received", p_to: "acknowledged" });
  });

  it("내 약 추가는 기본 비공개, 0행 변경은 권한 없음으로 안내", async () => {
    const { client, calls } = fakeClient();
    const repo = createSupabaseRepository(client, "user-a", { today: () => TODAY });
    await repo.load();
    await repo.addMedication("pid-a", { name: " 가상 약 ", dosage: "1정", schedule: "아침", caution: "" });
    expect(calls.find((c) => c.table === "medications" && c.op === "insert")!.payload).toMatchObject({ name: "가상 약", visible_to_guardian: false });

    const z = fakeClient({ writeRows: [] });
    const zrepo = createSupabaseRepository(z.client, "user-a", { today: () => TODAY });
    await zrepo.load();
    await expect(zrepo.deleteMedication("med-of-other")).rejects.toMatchObject({ code: "not_found" });
  });

  it("연결된 환자가 없으면 오류 상태", async () => {
    const { client } = fakeClient({ tables: { patients: [] } });
    const repo = createSupabaseRepository(client, "user-x", { today: () => TODAY });
    await repo.load();
    expect(repo.getLoadState()).toMatchObject({ state: "error", message: expect.stringContaining("환자 정보가 없습니다") });
  });

  it("DB 오류를 사용자 안내 오류로 변환 (RLS 거부 포함)", async () => {
    expect(toCareLogError({ message: "invalid_input: 미래 날짜에는 기록할 수 없습니다" })).toMatchObject({ code: "invalid_input", message: "미래 날짜에는 기록할 수 없습니다" });
    expect(toCareLogError({ code: "42501", message: 'new row violates row-level security policy for table "health_records"' })).toMatchObject({ code: "forbidden" });
    expect(toCareLogError({ message: "stale_state: 이미 acknowledged 상태로 변경된 요청입니다" })).toMatchObject({ code: "stale_state" });
    expect(toCareLogError({ message: "fetch failed" })).toMatchObject({ code: "write_failed" });
    const { client } = fakeClient({ rpcResult: { data: null, error: { code: "42501", message: "row-level security" } } });
    const repo = createSupabaseRepository(client, "user-a", { today: () => TODAY });
    await repo.load();
    await expect(repo.resetDemoData()).rejects.toMatchObject({ code: "not_supported" });
    await expect(
      repo.upsertHealthRecord({ patientId: "pid-b", date: TODAY, condition: 3, pain: 0, fatigue: 1, sleep: 1, mealIntake: 0, digestion: "good", symptoms: [], memo: "", recordedIn: "outpatient" }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });
});
