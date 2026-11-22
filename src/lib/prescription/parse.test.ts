import { describe, expect, it } from "vitest";
import type { DrugItem } from "@/lib/drug-search-client";
import { evaluateCandidates } from "./match";
import { baseName, normalizeStrength, parsePrescriptionText, searchName, toFormFields } from "./parse";

/** 가상 처방전 (실제 환자·약 아님) — PDF 텍스트·OCR 결과처럼 머리글·기관 정보가 섞여 있음 */
export const VIRTUAL_RX = `처 방 전
환자 성명 가상환자   주민등록번호 000000-0000000
의료기관 명칭 케어가상의원  전화번호 000-0000-0000
처방 의약품의 명칭  1회 투약량  1일 투여횟수  총 투약일수  용법
600000011 케어가상정500밀리그램(가상성분) 1 3 5 식후 30분
케어가상캡슐 10 mg 1 2 7 아침 저녁 식후
600000033 케어가상코프시럽 10 3 5
케어가상서방정75밀리그램 1/2 1 30 취침 전
| 없는가상연고 | 1 | 2 | 7 |
조제약사 가상약사  조제 연월일 2026-11-23`;

const item = (over: Partial<DrugItem>): DrugItem => ({
  itemSeq: "200000001", name: "케어가상정500밀리그램(가상성분)", company: "가상제약", ingredient: "가상성분",
  category: "일반의약품", productType: "", permitDate: "20200101", canceled: false, ...over,
});

describe("처방전 텍스트 → 약 목록", () => {
  const rows = parsePrescriptionText(VIRTUAL_RX);

  it("머리글·환자·기관·약사 줄은 건너뛰고 약 5개만", () => {
    expect(rows.map((r) => r.name)).toEqual([
      "케어가상정500밀리그램(가상성분)",
      "케어가상캡슐 10mg",
      "케어가상코프시럽",
      "케어가상서방정75밀리그램",
      "없는가상연고",
    ]);
  });

  it("보험코드는 9자리가 명확할 때만, 함량·제형·투약량·횟수·일수·용법", () => {
    expect(rows[0]).toMatchObject({ ediCode: "600000011", strength: "500mg", form: "정", dose: "1", timesPerDay: "3", days: "5", usage: "식후 30분" });
    expect(rows[1]).toMatchObject({ ediCode: undefined, strength: "10mg", form: "캡슐", dose: "1", timesPerDay: "2", days: "7", usage: "아침 저녁 식후" });
    expect(rows[2]).toMatchObject({ ediCode: "600000033", form: "시럽", dose: "10", timesPerDay: "3", days: "5" });
    expect(rows[3]).toMatchObject({ strength: "75mg", form: "정", dose: "0.5", timesPerDay: "1", days: "30", usage: "취침 전" });
    expect(rows[4]).toMatchObject({ form: "외용", dose: "1", timesPerDay: "2", days: "7" });
  });

  it("미리보기 칸: 있는 값만 채우고 없는 값은 빈칸", () => {
    expect(toFormFields(rows[0])).toEqual({ name: "케어가상정500밀리그램(가상성분)", strength: "500mg", dosage: "1회 1정", schedule: "하루 3회 · 식후 30분", duration: "5일분" });
    expect(toFormFields(rows[2])).toMatchObject({ strength: "", dosage: "1회 10mL", schedule: "하루 3회", duration: "5일분" });
    expect(toFormFields({ key: "x", raw: "", name: "가상정" })).toEqual({ name: "가상정", strength: "", dosage: "", schedule: "", duration: "" });
  });

  it("같은 약이 두 번 읽히면 한 번만, 잘린 코드(8자리)는 보험코드로 보지 않음", () => {
    const r = parsePrescriptionText("600000011 케어가상정500밀리그램 1 3 5\n600000011 케어가상정500밀리그램 1 3 5\n60000001 케어가상정250밀리그램 1 1 1");
    expect(r).toHaveLength(2);
    expect(r[1].ediCode).toBeUndefined();
  });

  it("글자 조각이 나뉘어 읽혀도(PDF 글꼴 변경·OCR 띄어쓰기) 함량을 투약량으로 오해하지 않음", () => {
    const [r] = parsePrescriptionText("600000011 케어가상정 500 밀리그램(가상성분) 1 3 5 식후 30 분");
    expect(r).toMatchObject({ name: "케어가상정 500밀리그램(가상성분)", strength: "500mg", dose: "1", timesPerDay: "3", days: "5", usage: "식후 30분" });
    const [s2] = parsePrescriptionText("케어가상서방정 75 밀리그램 1/2 1 30 취침 전");
    expect(s2).toMatchObject({ strength: "75mg", dose: "0.5", timesPerDay: "1", days: "30", usage: "취침 전" });
  });

  it("함량·검색 이름 정리", () => {
    expect(normalizeStrength("가상정 2.5 밀리그램")).toBe("2.5mg");
    expect(normalizeStrength("가상시럽 5ml")).toBe("5mL");
    expect(searchName("케어가상정500밀리그램(가상성분)")).toBe("케어가상정500밀리그램");
    expect(baseName("케어가상정500밀리그램(가상성분)")).toBe("케어가상정");
  });
});

describe("제품 후보 판정", () => {
  const [tab, cap, , sr] = parsePrescriptionText(VIRTUAL_RX);

  it("보험코드로 1개 → 확인됨 (자동 선택)", () => {
    expect(evaluateCandidates(tab, [item({})], "edi")).toMatchObject({ status: "confirmed", selected: "200000001" });
  });
  it("이름으로 1개 + 함량 일치 → 확인됨 / 함량이 다르면 확인 필요", () => {
    expect(evaluateCandidates(cap, [item({ itemSeq: "200000010", name: "케어가상캡슐10밀리그램" })], "name").status).toBe("confirmed");
    const r = evaluateCandidates(sr, [item({ itemSeq: "200000020", name: "케어가상서방정150밀리그램" })], "name");
    expect(r.status).toBe("review");
    expect(r.candidates[0].strengthMatch).toBe(false);
  });
  it("후보 여럿(비슷한 이름·다른 함량·다른 업체) → 확인 필요, 함량 일치·허가 유지가 먼저", () => {
    const r = evaluateCandidates(
      cap,
      [
        item({ itemSeq: "200000011", name: "케어가상캡슐20밀리그램" }),
        item({ itemSeq: "200000012", name: "케어가상캡슐10밀리그램", canceled: true }),
        item({ itemSeq: "200000010", name: "케어가상캡슐10밀리그램", company: "다른가상제약" }),
      ],
      "name",
    );
    expect(r.status).toBe("review");
    expect(r.selected).toBeUndefined();
    expect(r.candidates.map((c) => c.item.itemSeq)).toEqual(["200000010", "200000011", "200000012"]);
  });
  it("제형이 다르면 확인 필요, 결과 없음은 직접 입력", () => {
    expect(evaluateCandidates(tab, [item({ name: "케어가상캡슐500밀리그램" })], "name").status).toBe("review");
    expect(evaluateCandidates(tab, [], "name").status).toBe("not_found");
  });
});

describe("사진 OCR 결과 (실제 인식 결과를 옮긴 예 — 일부 글자가 틀림)", () => {
  // 가상 처방전 이미지를 표 선 제거 + PSM 6 으로 읽은 결과
  const OCR = `처 방 전
의료기관 명칭 케어가상의원 (가상)
보험코드          처방 의약품의 명칭         1회 투약량 1일 투여횟수 충 투약일수 _ 용법
600000011 케어가상정500밀리그램(가상성분) 1        3         5        식후 30분
케어가상캠숄 10009               1          2            7           아침 저녁 식후
600000033 케어가상코프시럽                 10         3            5
케어가상서방정75밀리그램         12         1            30          취침 전
없는가상연고                     1          2            7`;
  it("틀리게 읽힌 줄도 약 5개로 — 틀린 값은 미리보기에서 사용자가 고침", () => {
    const rows = parsePrescriptionText(OCR);
    expect(rows.map((r) => [r.ediCode ?? "", r.form ?? "", r.dose, r.timesPerDay, r.days])).toEqual([
      ["600000011", "정", "1", "3", "5"],
      ["", "캡슐", "1", "2", "7"],
      ["600000033", "시럽", "10", "3", "5"],
      ["", "정", "12", "1", "30"], // "1/2"가 "12"로 읽힘 → 사용자가 미리보기에서 수정
      ["", "외용", "1", "2", "7"],
    ]);
  });
});

describe("PDF 글자 조각 → 줄", () => {
  it("붙어 있는 조각은 띄어쓰기 없이, 떨어진 칸은 한 칸 띄워 한 행으로", async () => {
    const { itemsToLines } = await import("./read-file");
    const t = (str: string, x: number, y: number, width: number) => ({ str, transform: [1, 0, 0, 10, x, y], width, height: 10 });
    const lines = itemsToLines([
      t("케어가상정", 100, 500, 50),
      t("500", 150, 500, 15), // 바로 붙은 조각 (글꼴 변경)
      t("밀리그램", 165, 500, 40),
      t("1", 300, 500, 5),
      t("3", 340, 500, 5),
      t("처 방 전", 100, 700, 60),
    ]);
    expect(lines).toEqual(["처 방 전", "케어가상정500밀리그램 1 3"]);
  });
});
