/**
 * 식약처 제품 정보 → 저장할 약 한 개
 * 제품명·성분·함량·약효 분류·사용자용 약 종류를 서로 다른 칸에 (지어내지 않음 — 응답에 없는 값은 빈칸)
 */
import type { DrugItem } from "@/lib/drug-search-client";
import { normalizeStrength } from "@/lib/prescription/parse";
import { classify, mfdsClassText } from "./categories";
import type { RxItemInput } from "./model";

/** 식약처 제품 → 저장할 약 (제품명·성분·함량·약효 분류·사용자용 종류를 따로) */
export function productToItem(d: DrugItem): RxItemInput {
  const c = classify(d.classRaw ?? d.productType, d.ingredient);
  return {
    name: d.name.slice(0, 100),
    strength: (normalizeStrength(d.name) ?? "").slice(0, 50),
    ingredients: d.ingredient.slice(0, 300),
    company: d.company.slice(0, 60),
    drugClass: /일반/.test(d.category) ? "otc" : /전문/.test(d.category) ? "rx" : "",
    mfdsClass: mfdsClassText(d.classRaw ?? d.productType).slice(0, 60),
    categories: c.categories,
    categorySource: c.source,
    dosage: "",
    frequency: "",
    timing: "",
    duration: "",
    cautionRx: "",
    cautionMfds: "",
    externalItemSeq: d.itemSeq || undefined,
    active: false,
  };
}

/**
 * 식약처에서 찾지 못했거나 검색할 수 없을 때 — 사용자가 적은 이름(·함량)만으로 등록
 * 품목기준코드·성분·분류를 지어내지 않음: 제품 식별 없음(다른 기록과 합치지 않음), 약 종류는 '미분류 · 확인 필요'
 */
export function manualToItem(name: string, strength = ""): RxItemInput {
  return {
    name: name.trim().slice(0, 100),
    strength: strength.trim().slice(0, 50),
    ingredients: "",
    company: "",
    drugClass: "",
    mfdsClass: "",
    categories: ["unclassified"],
    categorySource: "none",
    dosage: "",
    frequency: "",
    timing: "",
    duration: "",
    cautionRx: "",
    cautionMfds: "",
    externalItemSeq: undefined,
    active: false,
  };
}
