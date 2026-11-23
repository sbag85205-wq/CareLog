/**
 * 일반약 상자·약국 영수증에서 읽은 글자 → 식약처 검색에 쓸 제품명 후보
 * - 여기서 제품을 확정하지 않음: 후보 이름으로 식약처 검색 → 사용자가 고름
 * - 알약 모양으로 추측하지 않음 (글자만 사용)
 * - 외부로 보내는 것은 제품명 후보 문자열뿐 (영수증 금액·약국 정보·사진은 보내지 않음)
 */

const FORM = /(정|캡슐|캅셀|연질캡슐|시럽|액|현탁액|산|과립|츄어블정|연고|크림|겔|로션|패치|플라스타|카타플라스마|스프레이|점안액|좌제|트로키)/;
const NOT_NAME =
  /(일반의약품|전문의약품|의약외품|효능|효과|용법|용량|사용상|주의|저장|보관|유효기간|사용기한|제조|수입|판매|원료|첨가제|성분|함량|포장|바코드|고객|상담|www|http|\.com|전화|주소|사업자|대표)/;
const RECEIPT_SKIP =
  /(합계|총액|총\s*금액|결제|카드|현금|부가세|과세|면세|공급가|거스름|받은|영수증|사업자|대표|전화|주소|약국|승인|일시|번호|조제료|조제|본인부담|보험|포인트|할인|봉투|마스크|밴드|반창고|생수|드링크|잡화)/;

const clean = (s: string) =>
  s
    .replace(/[\u0000-\u001f]/g, " ")
    .replace(/[|"'`“”‘’<>{}[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** 제품명처럼 보이는 정도 (높을수록 앞) */
function score(line: string): number {
  let s = 0;
  if (FORM.test(line)) s += 3;
  if (/\d+(\.\d+)?\s*(mg|㎎|밀리그램|밀리그람|g|ml|㎖|mcg|㎍|%)/i.test(line)) s += 2;
  if (/^[가-힣A-Za-z0-9]/.test(line)) s += 1;
  if (line.length > 25) s -= 2;
  return s;
}

/** 일반약 상자 글자 → 제품명 후보 (최대 3개, 그럴듯한 순) */
export function extractBoxNames(text: string): string[] {
  const lines = text
    .split(/\n+/)
    .map(clean)
    .filter((l) => /[가-힣]{2,}/.test(l) && l.length >= 2 && l.length <= 40 && !NOT_NAME.test(l));
  const ranked = lines
    .map((l, i) => ({ l: l.replace(/\s*\d+\s*(정|캡슐|포|개|매)\s*$/, "").trim(), s: score(l), i }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i);
  return [...new Set(ranked.map((x) => x.l))].slice(0, 3);
}

export interface ReceiptLine {
  raw: string;
  /** 검색에 쓸 제품명 (영수증에서 읽은 이름 그대로) */
  name: string;
}

/**
 * 약국 영수증 글자 → 제품 줄 (이름 + 수량·금액 형태의 줄만)
 * 제품명이 아닌 줄(합계·카드·조제료·잡화 등)은 뺌. 영수증이 있다고 '복용'으로 보지 않음.
 */
export function extractReceiptLines(text: string): ReceiptLine[] {
  const out: ReceiptLine[] = [];
  for (const raw of text.split(/\n+/).map(clean)) {
    if (!raw || RECEIPT_SKIP.test(raw)) continue;
    // "가상소화정 1 3,000" · "가상소화정 x1 3,000원" · "가상소화정 3,000"
    const m = raw.match(/^(.+?)\s+(?:x?\s*\d{1,3}\s+)?\d{1,3}(?:,\d{3})+\s*원?$|^(.+?)\s+x?\s*\d{1,3}\s+\d{3,7}\s*원?$/i);
    const name = clean((m?.[1] ?? m?.[2] ?? "").replace(/^\*+/, ""));
    if (!name || !/[가-힣]{2,}/.test(name) || name.length > 40) continue;
    out.push({ raw, name });
  }
  return out;
}
