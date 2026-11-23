/**
 * 약 종류 자동 분류 — 일반 사용자가 이해하기 쉬운 이름으로
 *
 * 분류 순서 (AI는 사용하지 않음 · 성분·효능을 지어내지 않음)
 * 1. 식약처 제품 허가정보의 약효 분류 번호 (PRDUCT_TYPE 예: "[01140]해열.진통.소염제" → 114)
 * 2. 식약처 제품 정보에 적힌 주성분 (공식 성분명이 있을 때만) — 조합제는 여러 종류에 함께 들어감
 * 3. 둘 다 없으면 '미분류 · 확인 필요' — 사용자가 직접 고를 수 있음
 *
 * 한 약이 여러 종류에 들어갈 수 있음 (예: 이부프로펜 → 진통·해열제 + 소염진통제)
 */
import type { CategorySource } from "./model";

export interface Category {
  id: string;
  label: string;
}

export const CATEGORIES: Category[] = [
  { id: "pain", label: "진통·해열제" },
  { id: "antiinflam", label: "소염진통제" },
  { id: "cold", label: "감기·기침약" },
  { id: "digest", label: "소화제" },
  { id: "stomach", label: "위장약" },
  { id: "allergy", label: "알레르기약" },
  { id: "skin", label: "피부·바르는 약" },
  { id: "bp", label: "혈압약" },
  { id: "diabetes", label: "당뇨약" },
  { id: "antibiotic", label: "항생제·항균제" },
  { id: "vitamin", label: "비타민·영양제" },
  { id: "eye", label: "눈 약" },
  { id: "other", label: "기타" },
  { id: "unclassified", label: "미분류" },
];

const LABEL = new Map(CATEGORIES.map((c) => [c.id, c.label]));
export const categoryLabel = (id: string) => LABEL.get(id) ?? id;
export const CATEGORY_IDS = CATEGORIES.map((c) => c.id);

/** 식약처 약효 분류 번호(3자리) → 사용자용 종류 */
const BY_CLASS: Record<string, string[]> = {
  "114": ["pain"], // 해열·진통·소염제 (성분으로 소염진통제 여부를 더함)
  "118": ["cold"], // 종합감기제
  "222": ["cold"], // 진해거담제
  "233": ["digest"], // 건위소화제
  "236": ["digest"], // 이담제
  "232": ["stomach"], // 소화성궤양용제
  "234": ["stomach"], // 제산제
  "235": ["stomach"], // 진토제
  "237": ["stomach"], // 정장제
  "238": ["stomach"], // 하제·완장제
  "239": ["stomach"], // 기타의 소화기관용약
  "141": ["allergy"], // 항히스타민제
  "264": ["skin", "antiinflam"], // 진통·진양·수렴·소염제 (바르는·붙이는 약)
  "261": ["skin"],
  "262": ["skin"],
  "263": ["skin"],
  "265": ["skin"],
  "266": ["skin"],
  "269": ["skin"],
  "214": ["bp"], // 혈압강하제
  "396": ["diabetes"], // 당뇨병용제
  "131": ["eye"], // 안과용제
};
const CLASS_PREFIX: [RegExp, string[]][] = [
  [/^6(1|2)\d$/, ["antibiotic"]], // 항생물질·화학요법제
  [/^3(1|2)\d$/, ["vitamin"]], // 비타민·자양강장
];

/** 공식 주성분 → 종류 (성분명이 식약처 제품 정보에 있을 때만 사용) */
const BY_INGREDIENT: [RegExp, string[]][] = [
  [/아세트아미노펜|acetaminophen|paracetamol/i, ["pain"]],
  [
    /(덱시)?이부프로펜|나프록센|록소프로펜|아세클로페낙|디클로페낙|셀레콕시브|멜록시캄|케토프로펜|피록시캄|아세틸살리실산|ibuprofen|naproxen|loxoprofen|aceclofenac|diclofenac|celecoxib|meloxicam/i,
    ["pain", "antiinflam"],
  ],
  [/세티리진|로라타딘|펙소페나딘|클로르페니라민|에바스틴|베포타스틴|에피나스틴|cetirizine|loratadine|fexofenadine|chlorpheniramine/i, ["allergy"]],
  [/덱스트로메토르판|암브록솔|아세틸시스테인|구아이페네신|브롬헥신|dextromethorphan|ambroxol|acetylcysteine/i, ["cold"]],
  [/판토프라졸|오메프라졸|라베프라졸|란소프라졸|파모티딘|레바미피드|알마게이트|수크랄페이트|pantoprazole|omeprazole|famotidine|rebamipide/i, ["stomach"]],
  [/판크레아틴|비오디아스타제|우르소데옥시콜산|pancreatin/i, ["digest"]],
  [/암로디핀|로사르탄|발사르탄|텔미사르탄|올메사르탄|칸데사르탄|amlodipine|losartan|valsartan|telmisartan/i, ["bp"]],
  [/메트포르민|글리메피리드|시타글립틴|다파글리플로진|엠파글리플로진|metformin|glimepiride|sitagliptin/i, ["diabetes"]],
  [/아목시실린|세파클러|클래리트로마이신|아지트로마이신|레보플록사신|amoxicillin|cefaclor|clarithromycin|azithromycin/i, ["antibiotic"]],
];

/** "[01140]해열.진통.소염제" · "01140" · "114" → "114" (형식이 다르면 null) */
export function classNumber(raw: string | undefined | null): string | null {
  const m = String(raw ?? "").match(/\[?\s*(\d{3,5})\s*\]?/);
  if (!m) return null;
  const d = m[1];
  if (d.length === 5) return d.startsWith("0") ? d.slice(1, 4) : d.slice(0, 3);
  if (d.length === 4) return d.startsWith("0") ? d.slice(1, 4) : d.slice(0, 3);
  return d;
}

/** 화면 표시용 약효 분류: "[01140]해열.진통.소염제" → "114 해열·진통·소염제" */
export function mfdsClassText(raw: string | undefined | null): string {
  const n = classNumber(raw);
  const name = String(raw ?? "")
    .replace(/^\s*\[[^\]]*\]\s*/, "")
    .replace(/\./g, "·")
    .trim();
  return [n, name].filter(Boolean).join(" ");
}

export interface Classification {
  categories: string[];
  source: CategorySource;
  /** 화면 설명: 어떤 근거로 분류했는지 */
  basis: string;
}

/**
 * @param productType 식약처 PRDUCT_TYPE (약효 분류, 코드 포함 원문)
 * @param ingredients 식약처 주성분 (정리된 문자열)
 */
export function classify(productType: string | undefined, ingredients: string | undefined): Classification {
  const out = new Set<string>();
  let source: CategorySource = "none";
  const n = classNumber(productType);
  if (n) {
    const byClass = BY_CLASS[n] ?? CLASS_PREFIX.find(([re]) => re.test(n))?.[1];
    if (byClass) {
      byClass.forEach((c) => out.add(c));
      source = "mfds";
    }
  }
  const ing = (ingredients ?? "").trim();
  if (ing) {
    const before = out.size;
    for (const [re, cats] of BY_INGREDIENT) if (re.test(ing)) cats.forEach((c) => out.add(c));
    if (out.size > before && source === "none") source = "ingredient";
  }
  if (out.size === 0) {
    // 분류 번호는 있으나 사용자용 종류에 대응이 없으면 '기타', 아무 근거도 없으면 '미분류'
    if (n) return { categories: ["other"], source: "mfds", basis: `식약처 약효 분류 ${mfdsClassText(productType)}` };
    return { categories: ["unclassified"], source: "none", basis: "공식 분류 정보를 찾지 못해 확인이 필요해요" };
  }
  const order = CATEGORY_IDS;
  return {
    categories: [...out].sort((a, b) => order.indexOf(a) - order.indexOf(b)),
    source,
    basis: source === "mfds" ? `식약처 약효 분류 ${mfdsClassText(productType)}${ing ? " · 주성분" : ""}` : "식약처 제품 정보의 주성분",
  };
}

export const CATEGORY_SOURCE_LABEL: Record<CategorySource, string> = {
  mfds: "식약처 약효 분류 기준",
  ingredient: "식약처 주성분 기준",
  user: "직접 고름",
  none: "미분류 · 확인 필요",
};
