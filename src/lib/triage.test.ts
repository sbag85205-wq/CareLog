import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSeedData, DEMO_STAFF_ID } from "@/data/mock-data";
import { summarizeAll } from "./triage";

// 한국 2026-11-11 12:00
beforeEach(() => vi.useFakeTimers({ now: new Date("2026-11-11T03:00:00Z") }));
afterEach(() => vi.useRealTimers());

describe("시연용 분류 기준 (의료적 판정 아님) — 기존 결과 유지", () => {
  it("가상 환자별 분류", () => {
    const d = createSeedData("2026-11-11");
    const flags = Object.fromEntries(summarizeAll(d, DEMO_STAFF_ID).map((s) => [s.patient.id, s.flags]));
    expect(flags).toEqual({
      P002: ["review"],
      P004: ["change"],
      P003: ["insufficient"],
      P001: ["stable"],
      P005: ["stable"],
    });
  });

  it("입원 환자 요약에는 진행 중인 입원 이력이 포함", () => {
    const d = createSeedData("2026-11-11");
    const p2 = summarizeAll(d, DEMO_STAFF_ID).find((s) => s.patient.id === "P002")!;
    expect(p2.admission).toMatchObject({ room: "703호", admittedOn: "2026-10-30" });
    expect(summarizeAll(d, DEMO_STAFF_ID).find((s) => s.patient.id === "P001")!.admission).toBeUndefined();
  });
});
