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
