/**
 * 데모용 예제 일반약 상자·약국 영수증 (모두 가상 — 실제 제품·약국 아님)
 * 데모에서는 사진 인식(OCR) 대신 이 글자를 '읽은 것'으로 사용합니다 → 화면에 '데모용 예시'로 표시
 */
export const EXAMPLE_BOX = {
  title: "가상진통정500밀리그램",
  sub: "아세트아미노펜 500mg",
  badge: "일반의약품",
  count: "10정",
  note: "데모용 가상 제품 상자",
};

export function exampleBoxText(): string {
  const b = EXAMPLE_BOX;
  return [b.badge, b.title, b.sub, b.count, "효능·효과: (가상) 두통, 치통, 생리통", "저장방법: 실온 보관"].join("\n");
}

export const EXAMPLE_RECEIPT = {
  shop: "가상온누리약국 (가상)",
  date: "2026-11-20",
  lines: [
    { name: "가상소화정", qty: 1, price: "3,000" },
    { name: "가상알레르정10밀리그램", qty: 1, price: "5,500" },
    { name: "가상파스", qty: 1, price: "4,000" },
    { name: "생수 500ml", qty: 1, price: "1,000" },
  ],
  total: "13,500",
};

export function exampleReceiptText(): string {
  const r = EXAMPLE_RECEIPT;
  return [`${r.shop}`, `일시 ${r.date} 14:20`, ...r.lines.map((l) => `${l.name} ${l.qty} ${l.price}`), `합계 ${r.total}`, "카드 결제"].join("\n");
}
