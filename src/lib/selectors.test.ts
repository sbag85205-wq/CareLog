import { afterEach, describe, expect, it, vi } from "vitest";
import { createSeedData, DEMO_OTHER_STAFF_ID, DEMO_STAFF_ID } from "@/data/mock-data";
import { requestsForStaff, requestsOf } from "./selectors";
import { summarizeAll } from "./triage";
import type { CareLogData, LifeRequest, Patient } from "@/types";

const TODAY = "2026-11-11";

function patient(id: string, staff: string[]): Patient {
  return {
    id,
    name: `${id} (가상)`,
    birthYear: 1970,
    gender: "F",
    department: "내과 (가상)",
    careMode: "inpatient",
    assignedStaffIds: staff,
    isDemo: true,
  };
}

function request(id: string, patientId: string, createdAt: string, status: LifeRequest["status"] = "received"): LifeRequest {
  return { id, patientId, category: "water", detail: "(데모)", status, createdAt, updatedAt: createdAt, isDemo: true };
}

/** 의료진 3명 · 환자 4명 (1명은 두 의료진 공동 담당) */
function multiStaffFixture(): CareLogData {
  const base = createSeedData(TODAY);
  return {
    ...base,
    patients: [patient("A", ["S1"]), patient("B", ["S2"]), patient("C", ["S1", "S2"]), patient("D", ["S3"])],
    requests: [
      request("qa", "A", "2026-11-11T00:00:00.000Z"),
      request("qb", "B", "2026-11-11T00:05:00.000Z"),
      request("qc", "C", "2026-11-11T00:10:00.000Z"),
      request("qd", "D", "2026-11-11T00:15:00.000Z", "completed"),
    ],
  };
}

describe("[버그 A] 의료진은 담당 환자의 생활 요청만 조회", () => {
  it("여러 의료진·환자 상황", () => {
    const d = multiStaffFixture();
    expect(requestsForStaff(d, "S1").map((r) => r.id)).toEqual(["qc", "qa"]);
    expect(requestsForStaff(d, "S2").map((r) => r.id)).toEqual(["qc", "qb"]);
    expect(requestsForStaff(d, "S3").map((r) => r.id)).toEqual(["qd"]);
    expect(requestsForStaff(d, "담당 없음")).toEqual([]);
  });

  it("가상 데이터: 이케어 간호사에게 다른 병동 환자(P006) 요청이 보이지 않음", () => {
    const d = createSeedData(TODAY);
    const mine = requestsForStaff(d, DEMO_STAFF_ID);
    const other = requestsForStaff(d, DEMO_OTHER_STAFF_ID);
    expect(mine.some((r) => r.patientId === "P006")).toBe(false);
    expect(mine.filter((r) => r.status !== "completed")).toHaveLength(3);
    expect(other.map((r) => r.patientId)).toEqual(["P006"]);
    // 전체 요청 수와 비교해 실제로 걸러졌는지 확인
    expect(requestsOf(d).length).toBe(mine.length + other.length);
  });

  it("환자 목록 요약도 담당 환자만", () => {
    const d = createSeedData(TODAY);
    expect(summarizeAll(d, DEMO_STAFF_ID).map((s) => s.patient.id).sort()).toEqual(["P001", "P002", "P003", "P004", "P005"]);
    expect(summarizeAll(d, DEMO_OTHER_STAFF_ID).map((s) => s.patient.id)).toEqual(["P006"]);
  });
});

describe("[버그 B1] 요청 최신순 정렬", () => {
  afterEach(() => vi.useRealTimers());

  it("v1 형식 시드와 새 UTC 요청이 섞여도 실제 시각 순서", () => {
    vi.useFakeTimers({ now: new Date("2026-11-11T03:00:00Z") }); // KST 12:00 → Q-001 = 10:45 (75분 전)
    const d = createSeedData(TODAY);
    d.requests.push(request("legacy", "P002", "2026-11-11T11:50:00")); // KST 11:50 (v1 형식, 시간대 없음)
    d.requests.push(request("new", "P002", "2026-11-11T03:05:00.000Z")); // KST 12:05 (UTC)
    const ids = requestsOf(d, "P002").map((r) => r.id);
    expect(ids.slice(0, 3)).toEqual(["new", "legacy", "Q-001"]);
  });

  it("[추가 발견] 새벽에 생성한 가상 데이터에도 미래 시각이 없음", () => {
    vi.useFakeTimers({ now: new Date("2026-11-10T17:20:00Z") }); // KST 02:20
    const d = createSeedData("2026-11-11");
    const now = Date.now();
    const stamps = [...d.requests.flatMap((r) => [r.createdAt, r.updatedAt]), ...d.records.map((r) => r.createdAt), ...d.mealLogs.map((m) => m.updatedAt)];
    expect(stamps.filter((s) => Date.parse(s) > now)).toEqual([]);
  });
});
