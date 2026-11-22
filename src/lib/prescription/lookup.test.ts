import { describe, expect, it } from "vitest";
import { createSeedData } from "@/data/mock-data";
import { demoDrugSearch } from "@/lib/demo/drug-catalog";
import { examplePrescriptionText } from "@/lib/demo/example-prescription";
import type { DrugSearchFn, DrugSearchQuery } from "@/lib/drug-search-client";
import { toDemoSnapshot } from "@/lib/repository/demo";
import { lookupDrug } from "./lookup";
import { parsePrescriptionText } from "./parse";

describe("예제 처방전 → 제품 후보 (데모 가상 검색)", () => {
  it("확인됨(보험코드) · 확인 필요(비슷한 이름·다른 함량) · 확인됨(이름) · 확인 필요(함량 다름) · 직접 입력", async () => {
    const queries: DrugSearchQuery[] = [];
    const spy: DrugSearchFn = (q) => (queries.push(q), demoDrugSearch(q));
    const rows = parsePrescriptionText(examplePrescriptionText());
    expect(rows).toHaveLength(5);
    const results = [];
    for (const r of rows) results.push(await lookupDrug(r, spy));
    expect(results.map((r) => r.status)).toEqual(["confirmed", "review", "confirmed", "review", "not_found"]);
    expect(results[0]).toMatchObject({ via: "edi", selected: "900000011" });
    expect(results[1].candidates.map((c) => [c.item.name, c.item.company, c.strengthMatch])).toEqual([
      ["케어가상캡슐10밀리그램", "가상제약(주)", true],
      ["케어가상캡슐10밀리그램", "다른가상약품", true],
      ["케어가상캡슐20밀리그램", "가상제약(주)", false],
    ]);
    expect(results[3].candidates[0].strengthMatch).toBe(false);
    // 외부(검색)로는 보험코드 또는 약 이름만
    for (const q of queries) expect(Object.keys(q)).toHaveLength(1);
    expect(queries[0]).toEqual({ edi: "600000011" });
  });

  it("검색 실패 → search_failed (직접 입력)", async () => {
    const fail: DrugSearchFn = async () => ({ ok: false, message: "가상 오류" });
    const [row] = parsePrescriptionText(examplePrescriptionText());
    expect(await lookupDrug(row, fail)).toMatchObject({ status: "search_failed", message: "가상 오류" });
  });
});

describe("데모 화면 필터 (로그인 버전 RLS 규칙 흉내)", () => {
  const d = createSeedData("2026-11-23");
  it("환자는 본인만, 의료진은 담당 환자·공유 질문만, 보호자는 공유 범위·공개 약만", () => {
    const p = toDemoSnapshot(d, "patient");
    expect(p.patients.map((x) => x.id)).toEqual(["P001"]);
    expect(p.reviews.every((r) => r.note === "")).toBe(true);
    const s = toDemoSnapshot(d, "staff");
    expect(s.patients.every((x) => x.assignedStaffIds.includes(s.viewer.userId))).toBe(true);
    expect(s.visitQuestions.every((q) => q.sharedWithStaff)).toBe(true);
    const withPrivate = { ...d, medications: d.medications.map((m, i) => (i === 0 ? { ...m, visibleToGuardian: false } : m)) };
    const g = toDemoSnapshot(withPrivate, "guardian");
    expect(g.patients.map((x) => x.id)).toEqual(["P001"]);
    expect(g.medications.some((m) => m.id === withPrivate.medications[0].id)).toBe(false);
    expect(g.visitQuestions).toEqual([]);
    // 공유 철회 → 아무것도 보이지 않음
    const revoked = toDemoSnapshot({ ...d, accessGrants: d.accessGrants.map((x) => ({ ...x, revokedAt: "2026-11-23T00:00:00Z" })) }, "guardian");
    expect([revoked.patients, revoked.records, revoked.medications, revoked.requests].every((a) => a.length === 0)).toBe(true);
  });
});
