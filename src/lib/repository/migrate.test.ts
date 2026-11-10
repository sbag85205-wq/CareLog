import { describe, expect, it } from "vitest";
import { createSeedData } from "@/data/mock-data";
import { DATA_VERSION, migrateData } from "./migrate";

/** 최초 프로토타입(v1)이 localStorage에 저장하던 형태의 가상 데이터 */
function v1Fixture() {
  return {
    version: 1,
    seededAt: "2026-11-09T02:00:00.000Z",
    users: [],
    patients: [
      {
        id: "P001",
        name: "김하늘 (가상)",
        birthYear: 1958,
        gender: "F",
        department: "내과 (가상)",
        careMode: "outpatient",
        // 입원했다가 통원으로 돌아온 상태 (v1은 입원 정보를 남겨 둠)
        ward: "데모병동 7층",
        room: "701호",
        admissionDate: "2026-11-09",
        assignedStaffIds: ["U-STAFF-01"],
        isDemo: true,
      },
      {
        id: "P002",
        name: "박데모 (가상)",
        birthYear: 1949,
        gender: "M",
        department: "내과 (가상)",
        careMode: "inpatient",
        ward: "데모병동 7층",
        room: "703호",
        admissionDate: "2026-10-28",
        assignedStaffIds: ["U-STAFF-01"],
        isDemo: true,
      },
    ],
    records: [
      {
        id: "R-1",
        patientId: "P001",
        date: "2026-11-08",
        condition: 4,
        pain: 1,
        fatigue: 2,
        sleep: 4,
        mealIntake: 75,
        digestion: "good",
        symptoms: [],
        memo: "(데모) 사용자가 입력한 기록",
        recordedIn: "outpatient",
        createdAt: "2026-11-08T20:15:00",
        updatedAt: "2026-11-08T20:15:00",
        isDemo: true,
      },
    ],
    medications: [],
    visitQuestions: [{ id: "VQ-1", patientId: "P001", text: "(예시)", done: false, createdAt: "2026-11-08T21:10:00" }],
    mealLogs: [],
    requests: [
      {
        id: "Q-seed",
        patientId: "P002",
        category: "water",
        detail: "(데모)",
        status: "received",
        createdAt: "2026-11-11T09:10:00",
        updatedAt: "2026-11-11T09:10:00",
        isDemo: true,
      },
      {
        id: "Q-new",
        patientId: "P002",
        category: "bedding",
        detail: "(데모)",
        status: "received",
        createdAt: "2026-11-11T00:20:00.000Z",
        updatedAt: "2026-11-11T00:20:00.000Z",
        isDemo: true,
      },
    ],
    reviews: [],
    accessGrants: [],
  };
}

describe("localStorage 데이터 마이그레이션 v1 → v2", () => {
  it("사용자 기록은 보존하고 시각은 UTC ISO로 통일", () => {
    const v2 = migrateData(v1Fixture(), "2026-11-11")!;
    expect(v2.version).toBe(DATA_VERSION);
    expect(v2.records).toHaveLength(1);
    expect(v2.records[0].memo).toBe("(데모) 사용자가 입력한 기록");
    expect(v2.records[0].createdAt).toBe("2026-11-08T11:15:00.000Z");
    expect(v2.visitQuestions[0].createdAt).toBe("2026-11-08T12:10:00.000Z");
    expect(v2.requests.find((r) => r.id === "Q-seed")!.createdAt).toBe("2026-11-11T00:10:00.000Z");
    expect(v2.requests.find((r) => r.id === "Q-new")!.createdAt).toBe("2026-11-11T00:20:00.000Z");
  });

  it("입원 정보를 admissions 이력으로 옮김 (입원 중 = 진행 중, 통원 = 퇴원 처리)", () => {
    const v2 = migrateData(v1Fixture(), "2026-11-11")!;
    const p1 = v2.admissions.find((a) => a.patientId === "P001")!;
    const p2 = v2.admissions.find((a) => a.patientId === "P002")!;
    expect(p1).toMatchObject({ room: "701호", admittedOn: "2026-11-09", dischargedOn: "2026-11-11", source: "self_reported" });
    expect(p2).toMatchObject({ room: "703호", admittedOn: "2026-10-28", source: "self_reported" });
    expect(p2.dischargedOn).toBeUndefined();
    for (const p of v2.patients) {
      expect(p).not.toHaveProperty("ward");
      expect(p).not.toHaveProperty("room");
      expect(p).not.toHaveProperty("admissionDate");
    }
  });

  it("현재 버전은 그대로 통과, 알 수 없는 데이터는 null", () => {
    const seed = createSeedData("2026-11-11");
    expect(migrateData(seed)).toBe(seed);
    expect(migrateData(null)).toBeNull();
    expect(migrateData({ version: 99, patients: [], records: [] })).toBeNull();
    expect(migrateData("문자열")).toBeNull();
  });
});
