/**
 * 데모용 가상 식약처 검색 (실제 API를 호출하지 않음) — 응답 형식만 실제 서버 검색과 같음
 * 예제 처방전으로 "확인됨 · 확인 필요(비슷한 이름·다른 함량) · 결과 없음"을 모두 체험할 수 있게 구성
 */
import type { DrugItem, DrugSearchFn } from "@/lib/drug-search-client";

const item = (o: Partial<DrugItem> & Pick<DrugItem, "itemSeq" | "name" | "company">): DrugItem => ({
  ingredient: "가상성분",
  category: "일반의약품",
  productType: "가상 분류",
  permitDate: "20200101",
  canceled: false,
  ediCode: "",
  ...o,
});

export const DEMO_DRUG_CATALOG: DrugItem[] = [
  item({ itemSeq: "900000011", name: "케어가상정500밀리그램(가상성분)", company: "가상제약(주)", ediCode: "600000011", category: "전문의약품" }),
  item({ itemSeq: "900000012", name: "케어가상정250밀리그램(가상성분)", company: "가상제약(주)", ediCode: "600000012", category: "전문의약품" }),
  item({ itemSeq: "900000021", name: "케어가상캡슐10밀리그램", company: "가상제약(주)" }),
  item({ itemSeq: "900000022", name: "케어가상캡슐20밀리그램", company: "가상제약(주)" }),
  item({ itemSeq: "900000023", name: "케어가상캡슐10밀리그램", company: "다른가상약품", permitDate: "20120505" }),
  item({ itemSeq: "900000031", name: "케어가상코프시럽(가상성분)", company: "가상헬스" }),
  item({ itemSeq: "900000041", name: "케어가상서방정150밀리그램", company: "가상제약(주)", category: "전문의약품" }),
  item({ itemSeq: "900000042", name: "케어가상정500밀리그램(구 제품)", company: "가상제약(주)", canceled: true, permitDate: "20050101" }),
  // 일반약 (FeelPill 데모 — 상자·영수증·직접 검색). 같은 이름·다른 회사 제품을 일부러 둠 → 사용자가 골라야 함
  item({
    itemSeq: "900000101",
    name: "가상진통정500밀리그램",
    company: "가상제약(주)",
    ingredient: "아세트아미노펜",
    productType: "해열.진통.소염제",
    classRaw: "[01140]해열.진통.소염제",
  }),
  item({
    itemSeq: "900000106",
    name: "가상진통정500밀리그램",
    company: "다른가상약품",
    ingredient: "아세트아미노펜",
    productType: "해열.진통.소염제",
    classRaw: "[01140]해열.진통.소염제",
    permitDate: "20150303",
  }),
  item({
    itemSeq: "900000102",
    name: "가상이부펜정200밀리그램",
    company: "가상헬스",
    ingredient: "이부프로펜",
    productType: "해열.진통.소염제",
    classRaw: "[01140]해열.진통.소염제",
  }),
  item({
    itemSeq: "900000103",
    name: "가상소화정",
    company: "가상제약(주)",
    ingredient: "판크레아틴, 비오디아스타제",
    productType: "건위소화제",
    classRaw: "[02330]건위소화제",
  }),
  item({
    itemSeq: "900000104",
    name: "가상알레르정10밀리그램",
    company: "가상헬스",
    ingredient: "세티리진염산염",
    productType: "항히스타민제",
    classRaw: "[01410]항히스타민제",
  }),
  item({
    itemSeq: "900000105",
    name: "가상생리통정",
    company: "가상제약(주)",
    ingredient: "이부프로펜, 파마브롬",
    productType: "해열.진통.소염제",
    classRaw: "[01140]해열.진통.소염제",
  }),
  item({ itemSeq: "900000107", name: "가상감기시럽", company: "가상헬스", ingredient: "", productType: "", classRaw: "" }),
];

const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();

export const demoDrugSearch: DrugSearchFn = async (query) => {
  await new Promise((r) => setTimeout(r, 250)); // 검색 중 표시를 볼 수 있게
  const items =
    "edi" in query
      ? DEMO_DRUG_CATALOG.filter((i) => (i.ediCode ?? "").split(",").includes(query.edi))
      : DEMO_DRUG_CATALOG.filter((i) => norm(i.name).includes(norm(query.q)));
  return { ok: true, items, total: items.length };
};

/** 데모용 가상 주의사항 (식약처 제품 정보 형식만 흉내) */
const DEMO_CAUTIONS: Record<string, string> = {
  "900000011": "(가상 요약) 1. 이 약에 과민증이 있는 사람은 복용하지 말 것 / 2. 정해진 용량을 넘기지 말 것",
  "900000021": "(가상 요약) 졸음이 올 수 있으므로 운전·기계 조작에 주의",
  "900000023": "(가상 요약) 졸음이 올 수 있으므로 운전·기계 조작에 주의",
  "900000031": "(가상 요약) 다른 감기약과 함께 먹을 때는 성분이 겹치지 않는지 확인",
};
export const demoDrugCaution: import("@/lib/drug-search-client").DrugCautionFn = async (itemSeq) => {
  await new Promise((r) => setTimeout(r, 150));
  return { ok: true, caution: DEMO_CAUTIONS[itemSeq] ?? "" };
};

/** 데모용 가상 e약은요 정보 — 화면에 '데모용 예시'로 표시 (실제 식약처 응답 아님) */
const DEMO_EASY: Record<string, import("@/lib/drug-search-client").EasyInfo> = {
  "900000101": {
    efficacy: "(데모용 예시) 두통, 치통, 생리통 등의 통증과 발열에 사용하는 약이에요.",
    usage: "(데모용 예시) 제품 설명서에 적힌 용량·간격을 지켜 복용해요.",
    beforeUse: "(데모용 예시) 이 약에 과민 반응이 있었던 사람은 복용 전 의사·약사와 상의해요.",
    caution: "(데모용 예시) 같은 성분이 든 다른 약과 함께 먹지 않도록 주의해요.",
  },
};
export const demoDrugEasyInfo: import("@/lib/drug-search-client").DrugEasyInfoFn = async (itemSeq) => {
  await new Promise((r) => setTimeout(r, 150));
  const info = DEMO_EASY[itemSeq];
  return info ? { ok: true, info, demo: true } : { ok: false, message: "이 제품의 e약은요 개요 정보가 없어요. (데모)" };
};
