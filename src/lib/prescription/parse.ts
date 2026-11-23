/**
 * 처방전 인식 텍스트 → 약 목록 (브라우저에서만 실행 — 원문·전체 텍스트는 서버로 보내지 않음)
 *
 * 한국 처방전의 "처방 의약품의 명칭 · 1회 투약량 · 1일 투여횟수 · 총 투약일수 · 용법" 표를 한 줄씩 읽습니다.
 * OCR 결과는 줄이 섞이거나 글자가 틀릴 수 있어, 확실하지 않은 값은 비워 두고 사용자가 확인·수정합니다.
 */

import { DEPARTMENTS } from "@/lib/rx/model";

export interface ParsedDrug {
  /** 화면 구분용 */
  key: string;
  /** 인식한 원래 줄 */
  raw: string;
  /** 보험코드(9자리) — 명확히 읽힌 경우만 */
  ediCode?: string;
  /** 약 이름 (함량 포함 가능) */
  name: string;
  /** 함량 (예: 500mg) */
  strength?: string;
  /** 제형 (정·캡슐·시럽 등) */
  form?: string;
  /** 1회 투약량 숫자 (예: "1", "0.5") */
  dose?: string;
  /** 1일 투여횟수 */
  timesPerDay?: string;
  /** 총 투약일수 */
  days?: string;
  /** 용법 (예: 식후 30분) */
  usage?: string;
}

const FORMS: [RegExp, string][] = [
  [/서방정|정제|필름코팅정|츄어블정|구강붕해정|정(?=[\s\d(]|$)|tab(let)?s?\b/i, "정"],
  [/연질캡슐|캡슐|캅셀|캡술|캡숄|캠슐|캠숄|캡술|cap(sule)?s?\b/i, "캡슐"],
  [/시럽|현탁액|내용액|액(?=[\s\d(]|$)|syr(up)?\b/i, "시럽"],
  [/과립|산(?=[\s\d(]|$)|세립|분말/, "포"],
  [/점안액|점이액/, "점안액"],
  [/연고|크림|겔|로션/, "외용"],
  [/패취|패치/, "패치"],
  [/주사|주(?=[\s\d(]|$)|inj\b/i, "주사"],
];

const UNIT = /(\d+(?:[.,]\d+)?)\s*(밀리그램|밀리그람|mg|㎎|마이크로그램|mcg|㎍|μg|그램|g|밀리리터|ml|㎖|%|IU|단위)(?![a-z])/i;
const UNIT_NORMAL: Record<string, string> = {
  밀리그램: "mg", 밀리그람: "mg", mg: "mg", "㎎": "mg", 마이크로그램: "mcg", mcg: "mcg", "㎍": "mcg", "μg": "mcg",
  그램: "g", g: "g", 밀리리터: "mL", ml: "mL", "㎖": "mL", "%": "%", iu: "IU", 단위: "단위",
};

/** 표 머리글·환자·기관 정보 줄 (약이 아님) */
const SKIP = /처방\s*의약품|의약품의\s*명칭|명칭|투약량|투여\s*횟수|투약\s*일수|용법|환자|성명|주민|생년|의료기관|요양기관|교부|조제|약국|처방전|처방의|면허|전화|팩스|주소|사용기간|발행|질병분류|비고|본인부담|보험|건강보험|의료급여|산재|자동차|기타|서명|날인|발급|연월일|병원|의원/;

const USAGE = /(식[전후]\s*\d*\s*분?|식간|취침\s*전|자기\s*전|기상\s*(직)?후|공복|아침|점심|저녁|필요\s*시|통증\s*시|매\s*\d+\s*시간)/g;

export function normalizeStrength(s: string): string | undefined {
  const m = s.match(UNIT);
  if (!m) return undefined;
  const n = m[1].replace(",", ".");
  return `${n}${UNIT_NORMAL[m[2].toLowerCase()] ?? UNIT_NORMAL[m[2]] ?? m[2]}`;
}

export function detectForm(name: string): string | undefined {
  for (const [re, f] of FORMS) if (re.test(name)) return f;
  return undefined;
}

/** 검색용 이름: 괄호(성분) 앞까지, 공백 제거 */
export function searchName(name: string): string {
  return name.replace(/\(.*$/, "").replace(/\s+/g, "").trim();
}

/** 함량을 뺀 제품명 (예: 가상정500밀리그램 → 가상정) — 함량이 다른 제품까지 넓게 찾을 때 */
export function baseName(name: string): string {
  return searchName(name).replace(new RegExp(UNIT.source, "gi"), "").replace(/[\d.]+$/, "").trim();
}

function cleanLine(line: string): string {
  return line
    .replace(/[|｜¦]/g, " ")
    .replace(/[“”"'`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

let seq = 0;

export function parsePrescriptionText(text: string): ParsedDrug[] {
  const out: ParsedDrug[] = [];
  const seen = new Set<string>();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = cleanLine(rawLine);
    if (line.length < 3 || !/[가-힣A-Za-z]/.test(line)) continue;

    const edi = line.match(/(?:^|\s)(\d{9})(?=\s|$)/)?.[1];
    let rest = edi ? line.replace(edi, " ").trim() : line;

    // 토큰 단위: "500 mg"처럼 떨어진 함량은 붙이고, 약 이름 = 첫 단독 숫자 전까지, 그 뒤 연속 숫자 = 투약량·횟수·일수
    const tokens = rest.split(" ").reduce<string[]>((acc, t) => {
      if (acc.length && /^\d+(?:[.,]\d+)?$/.test(acc[acc.length - 1]) && /^(밀리그램|밀리그람|mg|㎎|mcg|㎍|그램|g|ml|mL|㎖|%)(?![A-Za-z])/i.test(t)) {
        acc[acc.length - 1] += t;
      } else acc.push(t);
      return acc;
    }, []);
    const isNum = (t: string) => /^\d+(?:\.\d+)?$|^1\/2$/.test(t);
    // 줄 앞의 번호·잘린 코드(예: "1.", "60000001")는 이름이 아님
    while (tokens.length && /^\d+[.)]?$/.test(tokens[0])) tokens.shift();
    const firstNum = tokens.findIndex(isNum);
    const nameTokens = firstNum === -1 ? tokens : tokens.slice(0, firstNum);
    let j = firstNum === -1 ? tokens.length : firstNum;
    const nums: string[] = [];
    while (j < tokens.length && isNum(tokens[j]) && nums.length < 5) nums.push(tokens[j++]);
    const tail = tokens.slice(j).join(" ");
    // 숫자 칸이 4개 이상이면 앞쪽은 이름에 붙은 함량을 잘못 읽은 것 → 이름으로, 마지막 3칸이 투약량·횟수·일수
    while (nums.length > 3) nameTokens.push(nums.shift()!);
    let name = nameTokens.join(" ").trim();
    if (!/[가-힣A-Za-z]/.test(name)) continue;

    if (SKIP.test(name) && !edi) continue;
    const form = detectForm(name);
    const strength = normalizeStrength(name);
    // 약으로 보기 어려운 줄 — 제형·함량·보험코드가 없고, 표의 숫자 칸(투약량·횟수·일수)도 없음
    // (OCR이 제형 글자를 틀리게 읽어도, 이름 뒤에 숫자 3칸이 있으면 처방 약 줄로 봄)
    if (!edi && !form && !strength && !(nums.length >= 3 && /[가-힣A-Za-z]{2,}/.test(name))) continue;
    name = name.replace(/\s+/g, " ");

    rest = tail;
    const usage = [...`${tail} ${rawLine}`.matchAll(USAGE)].map((u) => u[0].replace(/\s+/g, " ").replace(/(\d)\s+분/, "$1분").trim());
    const toNum = (s?: string) => (s && /^\d+(?:\.\d+)?$/.test(s) ? s : s && /^1\/2$/.test(s) ? "0.5" : undefined);

    const key = `${edi ?? ""}|${searchName(name)}`;
    if (seen.has(key)) continue; // 같은 약 줄이 OCR로 두 번 읽힌 경우
    seen.add(key);
    out.push({
      key: `rx-${++seq}`,
      raw: line,
      ediCode: edi,
      name,
      strength,
      form,
      dose: toNum(nums[0]),
      timesPerDay: toNum(nums[1]),
      days: toNum(nums[2]),
      usage: usage.length ? [...new Set(usage)].join(" ") : undefined,
    });
  }
  return out;
}

const DOSE_UNIT: Record<string, string> = { 정: "정", 캡슐: "캡슐", 시럽: "mL", 포: "포", 점안액: "방울", 패치: "매" };

/** 미리보기 칸에 채울 값 — 처방전에 없는 값은 빈칸 */
export function toFormFields(d: ParsedDrug) {
  const unit = (d.form && DOSE_UNIT[d.form]) ?? "";
  return {
    name: d.name,
    strength: d.strength ?? "",
    dosage: d.dose ? `1회 ${d.dose}${unit}` : "",
    schedule: [d.timesPerDay ? `하루 ${d.timesPerDay}회` : "", d.usage ?? ""].filter(Boolean).join(" · "),
    duration: d.days ? `${d.days}일분` : "",
  };
}

/* ───────────── 처방전 머리 정보: 처방일·진료과·의료기관·복약 안내 ───────────── */


export interface PrescriptionMeta {
  /** YYYY-MM-DD — 교부·처방·발행 날짜가 명확할 때만 */
  prescribedOn?: string;
  /** 진료과가 하나로 명확할 때만 (아니면 비워서 환자가 고름) */
  department?: string;
  clinic?: string;
  /** 처방전·복약 안내의 주의사항 줄 */
  guidance?: string;
}

const DATE = /(20\d{2}|19\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?/;

function toIsoDate(m: RegExpMatchArray): string | undefined {
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return undefined;
  return dt.toISOString().slice(0, 10);
}

export function parsePrescriptionMeta(text: string): PrescriptionMeta {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const meta: PrescriptionMeta = {};

  // 처방일: 교부·처방·발행 줄의 날짜 우선, 없으면 생년월일·주민번호가 아닌 첫 날짜
  const dated = lines.filter((l) => DATE.test(l) && !/생년|주민|출생/.test(l));
  const preferred = dated.find((l) => /교부|처방|발행/.test(l)) ?? dated.find((l) => !/조제/.test(l)) ?? dated[0];
  if (preferred) meta.prescribedOn = toIsoDate(preferred.match(DATE)!);

  // 진료과: '진료과' 표시 줄 → 전체에서 한 가지만 나올 때 (긴 이름 먼저: 정형외과 ⊃ 외과)
  const ordered = [...DEPARTMENTS].sort((a, b) => b.length - a.length);
  const findDepts = (s: string) => {
    let rest = s;
    const found = new Set<string>();
    for (const d of ordered) {
      if (rest.includes(d)) {
        found.add(d);
        rest = rest.split(d).join(" ");
      }
    }
    return [...found];
  };
  const labeled = lines.find((l) => /진료\s*과/.test(l));
  const fromLabel = labeled ? findDepts(labeled) : [];
  const all = findDepts(lines.join(" "));
  if (fromLabel.length === 1) meta.department = fromLabel[0];
  else if (all.length === 1) meta.department = all[0];

  const clinic = lines.map((l) => l.match(/(?:의료기관|요양기관)\s*(?:명칭|명|이름)?\s*[:：]?\s*(.+)$/)?.[1]).find(Boolean);
  if (clinic) meta.clinic = clinic.replace(/전화.*$/, "").trim().slice(0, 60);

  const guidance = lines.filter((l) => /주의|복약\s*안내|졸음|운전|음주|임부|수유/.test(l) && !/처방\s*의약품|명칭/.test(l)).slice(0, 4);
  if (guidance.length) meta.guidance = guidance.join("\n").slice(0, 1000);
  return meta;
}

/** 처방 이력 미리보기 칸 — 횟수와 시점을 나눠서 (처방전에 없는 값은 빈칸) */
export function toRxFields(d: ParsedDrug) {
  const f = toFormFields(d);
  return {
    name: f.name,
    strength: f.strength,
    dosage: f.dosage,
    frequency: d.timesPerDay ? `하루 ${d.timesPerDay}회` : "",
    timing: d.usage ?? "",
    duration: f.duration,
  };
}
