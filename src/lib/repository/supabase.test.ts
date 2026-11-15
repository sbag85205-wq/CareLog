import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSupabasePatientRepository, toCareLogError } from "./supabase";

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

/** supabase-js 질의 체인을 흉내 내는 가짜 클라이언트 */
function fakeClient(opts: { rpcResult?: { data: unknown; error: unknown } } = {}) {
  const tables: Record<string, unknown> = {
    patients: { id: "pid-a", display_name: "가상 환자 A", birth_year: 1970, sex: "F", department: "", care_mode: "outpatient", next_visit_date: null },
    admissions: [],
    health_records: [row("2026-11-14", 4)],
  };
  const calls: { table?: string; fn?: string; filters: unknown[] }[] = [];
  const from = (table: string) => {
    const call = { table, filters: [] as unknown[] };
    calls.push(call);
    const result = { data: tables[table], error: null };
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (c: string, v: unknown) => (call.filters.push(["eq", c, v]), builder),
      is: (c: string, v: unknown) => (call.filters.push(["is", c, v]), builder),
      gte: (c: string, v: unknown) => (call.filters.push(["gte", c, v]), builder),
      order: () => builder,
      maybeSingle: async () => result,
      then: (res: (v: unknown) => void) => res(result),
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

describe("Supabase 환자 저장소 (DB 모드)", () => {
  it("로그인 사용자 기준으로 환자·기록을 불러와 앱 형식으로 변환", async () => {
    const { client, calls } = fakeClient();
    const repo = createSupabasePatientRepository(client, "user-a", { today: () => TODAY });
    expect(repo.getSnapshot()).toBeNull();
    await repo.load();
    expect(repo.getLoadState()).toEqual({ state: "ready" });
    const d = repo.getSnapshot()!;
    expect(d.patients[0]).toMatchObject({ id: "pid-a", name: "가상 환자 A", isDemo: false });
    expect(d.records[0]).toMatchObject({ date: "2026-11-14", condition: 4, mealIntake: 75, recordedIn: "outpatient" });
    expect(d.records[0].createdAt).toBe("2026-11-14T11:00:00.000Z");
    expect(calls.find((c) => c.table === "patients")!.filters).toContainEqual(["eq", "profile_id", "user-a"]);
    expect(calls.find((c) => c.table === "health_records")!.filters).toContainEqual(["gte", "record_date", "2026-08-18"]);
  });

  it("같은 날짜 재저장은 화면에서도 1건으로 교체", async () => {
    const { client, calls } = fakeClient({ rpcResult: { data: row("2026-11-14", 1), error: null } });
    const repo = createSupabasePatientRepository(client, "user-a", { today: () => TODAY });
    await repo.load();
    await repo.upsertHealthRecord({
      patientId: "pid-a", date: "2026-11-14", condition: 1, pain: 1, fatigue: 2, sleep: 3,
      mealIntake: 75, digestion: "good", symptoms: [], memo: "", recordedIn: "outpatient",
    });
    expect(repo.getSnapshot()!.records).toHaveLength(1);
    expect(repo.getSnapshot()!.records[0].condition).toBe(1);
    expect(calls.find((c) => c.fn === "upsert_health_record")!.filters[0]).toMatchObject({ p_patient_id: "pid-a", p_record_date: "2026-11-14" });
  });

  it("연결된 환자가 없으면 오류 상태", async () => {
    const { client } = fakeClient();
    (client as unknown as { from: (t: string) => unknown }).from = () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    });
    const repo = createSupabasePatientRepository(client, "user-x", { today: () => TODAY });
    await repo.load();
    expect(repo.getLoadState()).toMatchObject({ state: "error", message: expect.stringContaining("환자 정보가 없습니다") });
  });

  it("DB 오류를 사용자 안내 오류로 변환 (RLS 거부 포함)", async () => {
    expect(toCareLogError({ message: "invalid_input: 미래 날짜에는 기록할 수 없습니다" })).toMatchObject({ code: "invalid_input", message: "미래 날짜에는 기록할 수 없습니다" });
    expect(toCareLogError({ code: "42501", message: 'new row violates row-level security policy for table "health_records"' })).toMatchObject({ code: "forbidden" });
    expect(toCareLogError({ message: "fetch failed" })).toMatchObject({ code: "write_failed" });
    const { client } = fakeClient({ rpcResult: { data: null, error: { code: "42501", message: "row-level security" } } });
    const repo = createSupabasePatientRepository(client, "user-a", { today: () => TODAY });
    await repo.load();
    await expect(repo.setCareMode("pid-a", "inpatient")).rejects.toMatchObject({ code: "not_supported" });
    await expect(
      repo.upsertHealthRecord({ patientId: "pid-b", date: TODAY, condition: 3, pain: 0, fatigue: 1, sleep: 1, mealIntake: 0, digestion: "good", symptoms: [], memo: "", recordedIn: "outpatient" }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });
});
