import { describe, expect, it } from "vitest";
import { exampleBoxText, exampleReceiptText } from "@/lib/demo/example-otc";
import { extractBoxNames, extractReceiptLines } from "./product-text";

describe("일반약 상자 글자 → 제품명 후보", () => {
  it("예제 상자: 제품명이 첫 후보, 효능·저장방법·구분 문구는 제외", () => {
    const names = extractBoxNames(exampleBoxText());
    expect(names[0]).toBe("가상진통정500밀리그램");
    expect(names.join()).not.toMatch(/일반의약품|효능|저장/);
  });

  it("OCR 잡음(기호·줄바꿈·수량)이 섞여도 제품명 줄을 앞에", () => {
    const noisy = ["| 일반의약품 |", "“가상소화정”", "10정", "판크레아틴 · 비오디아스타제", "www.example.test", "사용상의 주의사항"].join("\n");
    expect(extractBoxNames(noisy)[0]).toBe("가상소화정");
  });

  it("제품명이 없으면 빈 목록 (추측하지 않음)", () => {
    expect(extractBoxNames("일반의약품\n효능·효과\n10")).toEqual([]);
  });
});

describe("약국 영수증 글자 → 제품 줄", () => {
  it("예제 영수증: 제품 3줄만, 생수·합계·카드·약국 정보 제외", () => {
    expect(extractReceiptLines(exampleReceiptText()).map((l) => l.name)).toEqual(["가상소화정", "가상알레르정10밀리그램", "가상파스"]);
  });

  it("금액 표기 변형 (원·x수량·쉼표 없음)", () => {
    const t = ["가상감기시럽 x1 4,500원", "가상진통정500밀리그램 2 6000", "조제료 1 2,000", "합계 12,500"].join("\n");
    expect(extractReceiptLines(t).map((l) => l.name)).toEqual(["가상감기시럽", "가상진통정500밀리그램"]);
  });
});
