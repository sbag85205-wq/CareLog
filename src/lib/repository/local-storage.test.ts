import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSeedData, DEMO_STAFF_ID } from "@/data/mock-data";
import { addDays } from "@/lib/date";
import type { DevFlags } from "@/lib/dev-flags";
import { admissionsOf, currentAdmission } from "@/lib/domain/admissions";
import { CareLogError } from "@/lib/errors";
import { MemoryStorage } from "@/test-utils/memory-storage";
import { createLocalStorageRepository, STORAGE_KEY } from "./local-storage";

const TODAY = "2026-11-11";

function setup(opts: { flags?: Partial<DevFlags>; storage?: MemoryStorage; today?: () => string } = {}) {
  const storage = opts.storage ?? new MemoryStorage();
  const flags: DevFlags = { latencyMs: 0, failWrites: false, ...opts.flags };
  let day = TODAY;
  const repo = createLocalStorageRepository({
    storage: () => storage,
    devFlags: () => flags,
    today: opts.today ?? (() => day),
  });
  return {
    repo,
    storage,
    flags,
    snap: () => repo.getSnapshot()!,
    stored: () => JSON.parse(storage.getItem(STORAGE_KEY)!),
    setDay: (d: string) => (day = d),
  };
}

beforeEach(() => vi.useFakeTimers({ now: new Date("2026-11-11T03:00:00Z") }));
afterEach(() => vi.useRealTimers());

describe("초기 로드", () => {
  it("저장된 데이터가 없으면 가상 데이터를 만들고 저장", () => {
    const t = setup();
    expect(t.snap().patients.length).toBeGreaterThan(0);
    expect(t.stored().version).toBe(2);
  });

  it("손상된 데이터는 새 가상 데이터로 대체", () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, "{깨진 JSON");
    const t = setup({ storage });
    expect(t.snap().version).toBe(2);
  });

  it("v1 데이터는 마이그레이션해서 다시 저장 (사용자 기록 보존)", () => {
    const storage = new MemoryStorage();
    const v1 = { ...createSeedData(TODAY), version: 1, admissions: undefined };
    v1.records[0] = { ...v1.records[0], memo: "(데모) 내가 쓴 메모", createdAt: "2026-11-01T20:00:00" };
    storage.setItem(STORAGE_KEY, JSON.stringify(v1));
    const t = setup({ storage });
    expect(t.snap().records[0].memo).toBe("(데모) 내가 쓴 메모");
    expect(t.snap().records[0].createdAt).toBe("2026-11-01T11:00:00.000Z");
    expect(t.stored().version).toBe(2);
  });
});

describe("[버그 C] 생활 요청 상태 역전 방지", () => {
  it("처리 완료 → 접수 변경은 거부되고 데이터는 그대로", async () => {
    const t = setup();
    t.snap(); // 첫 로드 (가상 데이터 저장)
    const before = t.storage.getItem(STORAGE_KEY);
    await expect(t.repo.updateRequestStatus("Q-004", "completed", "received", DEMO_STAFF_ID)).rejects.toMatchObject({
      code: "invalid_transition",
    });
    expect(t.snap().requests.find((r) => r.id === "Q-004")!.status).toBe("completed");
    expect(t.storage.getItem(STORAGE_KEY)).toBe(before);
  });

  it("접수 → 처리 완료 건너뛰기 거부", async () => {
    const t = setup();
    await expect(t.repo.updateRequestStatus("Q-001", "received", "completed", DEMO_STAFF_ID)).rejects.toBeInstanceOf(
      CareLogError,
    );
    expect(t.snap().requests.find((r) => r.id === "Q-001")!.status).toBe("received");
  });

  it("같은 요청을 연달아 '직원 확인'하면 두 번째는 stale_state로 거부", async () => {
    const t = setup({ flags: { latencyMs: 500 } });
    const first = t.repo.updateRequestStatus("Q-001", "received", "acknowledged", DEMO_STAFF_ID);
    const second = t.repo.updateRequestStatus("Q-001", "received", "acknowledged", DEMO_STAFF_ID);
    await expect(second).rejects.toMatchObject({ code: "stale_state" });
    await vi.advanceTimersByTimeAsync(500);
    await first;
    expect(t.stored().requests.find((r: { id: string }) => r.id === "Q-001").status).toBe("acknowledged");
  });

  it("정상 흐름 + 식사 변경은 처리 완료 시에만 반영", async () => {
    const t = setup();
    const mealOf = () => t.snap().mealLogs.find((m) => m.id === `ML-P004-${TODAY}-dinner`);
    expect(mealOf()).toBeUndefined();
    await t.repo.updateRequestStatus("Q-003", "received", "acknowledged", DEMO_STAFF_ID);
    expect(mealOf()).toBeUndefined();
    await t.repo.updateRequestStatus("Q-003", "acknowledged", "completed", DEMO_STAFF_ID);
    expect(mealOf()!.mealType).toBe("porridge");
  });
});

describe("[버그 D] 재입원 시 새 입원 이력", () => {
  it("통원 → 입원 → 통원 → 재입원: 과거 이력·건강기록 보존, 새 입원일·병실 사용", async () => {
    const t = setup();
    const recordsBefore = t.snap().records.filter((r) => r.patientId === "P001");

    await t.repo.setCareMode("P001", "inpatient");
    const first = currentAdmission(t.snap(), "P001")!;
    expect(first).toMatchObject({ admittedOn: TODAY, source: "self_reported" });

    t.setDay(addDays(TODAY, 3));
    await t.repo.setCareMode("P001", "outpatient");
    expect(currentAdmission(t.snap(), "P001")).toBeUndefined();

    t.setDay(addDays(TODAY, 10));
    await t.repo.setCareMode("P001", "inpatient");
    const history = admissionsOf(t.snap(), "P001");
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ id: first.id, admittedOn: TODAY, dischargedOn: addDays(TODAY, 3), room: first.room });
    expect(history[1]).toMatchObject({ admittedOn: addDays(TODAY, 10) });
    expect(history[1].dischargedOn).toBeUndefined();
    expect(history[1].room).not.toBe(first.room);
    expect(history[1].id).not.toBe(first.id);

    // 건강기록은 그대로 (기록 당시 모드 포함)
    expect(t.snap().records.filter((r) => r.patientId === "P001")).toEqual(recordsBefore);
    expect(t.stored().admissions.filter((a: { patientId: string }) => a.patientId === "P001")).toHaveLength(2);
  });

  it("같은 모드로 다시 전환하면 아무 것도 바뀌지 않음", async () => {
    const t = setup();
    const before = t.snap();
    await t.repo.setCareMode("P002", "inpatient");
    expect(t.snap()).toBe(before);
  });
});

describe("[E] 가상 네트워크 지연·실패 (식사 기록 버튼)", () => {
  const patch = { patientId: "P002", date: TODAY, slot: "lunch" as const };
  const lunch = (t: ReturnType<typeof setup>) => t.snap().mealLogs.find((m) => m.id === `ML-P002-${TODAY}-lunch`);
  const storedLunch = (t: ReturnType<typeof setup>) =>
    t.stored().mealLogs.find((m: { id: string }) => m.id === `ML-P002-${TODAY}-lunch`);

  it("지연 중에도 선택이 즉시 화면에 반영되고, 응답 후 저장", async () => {
    const t = setup({ flags: { latencyMs: 800 } });
    const p = t.repo.upsertMealLog({ ...patch, intake: 75 });
    expect(lunch(t)!.intake).toBe(75); // 즉시 반영
    expect(storedLunch(t)).toBeUndefined(); // 아직 저장 전
    await vi.advanceTimersByTimeAsync(800);
    await p;
    expect(storedLunch(t).intake).toBe(75);
  });

  it("저장 실패 시 이전 상태로 복구하고 오류 반환", async () => {
    const t = setup({ flags: { latencyMs: 300 } });
    const first = t.repo.upsertMealLog({ ...patch, intake: 50 });
    await vi.advanceTimersByTimeAsync(300);
    await first;
    t.flags.failWrites = true;
    const p = t.repo.upsertMealLog({ ...patch, intake: 100 });
    const assertion = expect(p).rejects.toMatchObject({ code: "write_failed" });
    expect(lunch(t)!.intake).toBe(100); // 낙관적 반영
    await vi.advanceTimersByTimeAsync(300);
    await assertion;
    expect(lunch(t)!.intake).toBe(50); // 복구
    expect(storedLunch(t).intake).toBe(50);
  });

  it("연속 클릭: 마지막 선택이 최종 값, 같은 값 중복 클릭은 저장 요청 없음", async () => {
    const t = setup({ flags: { latencyMs: 400 } });
    const a = t.repo.upsertMealLog({ ...patch, intake: 25 });
    const b = t.repo.upsertMealLog({ ...patch, intake: 75 });
    const c = t.repo.upsertMealLog({ ...patch, intake: 75 }); // 저장 중 같은 값 → noop
    let cDone = false;
    void c.then(() => (cDone = true));
    await vi.advanceTimersByTimeAsync(0); // 지연(400ms) 없이 바로 끝나야 함
    expect(cDone).toBe(true);
    expect(lunch(t)!.intake).toBe(75);
    await vi.advanceTimersByTimeAsync(400);
    await Promise.all([a, b]);
    expect(storedLunch(t).intake).toBe(75);
    // 섭취량과 소화 상태를 따로 눌러도 서로 덮어쓰지 않음
    const d = t.repo.upsertMealLog({ ...patch, digestion: "good" });
    await vi.advanceTimersByTimeAsync(400);
    await d;
    expect(storedLunch(t)).toMatchObject({ intake: 75, digestion: "good" });
  });

  it("폼 저장(요청 등록)은 확정 전에는 화면에 나타나지 않음", async () => {
    const t = setup({ flags: { latencyMs: 500 } });
    const count = () => t.snap().requests.length;
    const before = count();
    const p = t.repo.createRequest({ patientId: "P002", category: "water", detail: "(데모) 물" });
    expect(count()).toBe(before);
    await vi.advanceTimersByTimeAsync(500);
    const req = await p;
    expect(count()).toBe(before + 1);
    expect(req.createdAt).toMatch(/Z$/);
  });

  it("데모 초기화 중 진행되던 저장은 취소", async () => {
    const t = setup({ flags: { latencyMs: 500 } });
    const p = t.repo.upsertMealLog({ ...patch, intake: 25 });
    const assertion = expect(p).rejects.toMatchObject({ code: "cancelled" });
    await t.repo.resetDemoData();
    await vi.advanceTimersByTimeAsync(500);
    await assertion;
    expect(lunch(t)).toBeUndefined();
  });

  it("잘못된 입력은 저장 전에 거부", async () => {
    const t = setup();
    await expect(t.repo.createRequest({ patientId: "P002", category: "water", detail: "   " })).rejects.toMatchObject({
      code: "invalid_input",
    });
    await expect(
      t.repo.createRequest({ patientId: "P002", category: "water", detail: "x", mealChange: { date: TODAY, slot: "lunch", toType: "soft" } }),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });
});
