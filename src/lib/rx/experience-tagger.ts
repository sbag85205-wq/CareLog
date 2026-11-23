/**
 * 복용 경험 메모 → 태그 제안·짧은 정리 (규칙 기반 · 이 기기 안에서만 · 외부 AI 사용 안 함)
 *
 * 원칙
 * - 제안일 뿐: 사용자가 확인·수정한 태그만 저장 (tags), 제안 원본은 suggestedTags 에 따로
 * - 원본 메모는 바꾸지 않음
 * - 원인·인과관계를 단정하지 않음 ("약과의 관련성은 확인되지 않음")
 * - 증상 때문에 약을 먹었다는 말(예: "두통이 있을 때 먹었는데")은 불편 경험으로 보지 않음
 *
 * 외부 AI로 바꾸려면 같은 형태(ExperienceTagger)의 서버 구현을 추가하고, 동의를 받은 경우에만
 * 메모 텍스트만 서버로 보내도록 합니다 (docs/feelpill-v2.md 'AI 연결' 참고).
 */
import { josa, tagLabel } from "./model";

export interface TagSuggestion {
  tags: string[];
  summary: string;
  source: "rule" | "ai";
  /** 아무 규칙에도 맞지 않음 → 사용자가 직접 고르도록 안내 */
  empty: boolean;
}

export interface ExperienceTagger {
  id: "rule" | "ai";
  suggest(memo: string, ctx?: { itemName?: string; wholeRecord?: boolean }): Promise<TagSuggestion>;
}

const IMPROVED = /(나아졌|나아짐|나아지|줄었|줄어들|좋아졌|덜했|덜해|가라앉|괜찮아졌|효과가 있|효과 있|도움이 됐|도움이 되|편해졌|멎었|멈췄)/;
/** 증상이 약을 먹은 이유인 말 */
const REASON = /(때|때문에|해서|라서|있어서|아파서)\s*(먹|복용|챙겨)/;
/** 예전 복용에 대한 말 */
const PAST_TIME = /(전에|지난번|예전|저번|처음)/;

const AFTER_RULES: [RegExp, string][] = [
  [/속(이|에서)?\s*(쓰리|쓰렸|쓰려|쓰림|따가)|속쓰림|위가\s*쓰/, "속쓰림"],
  [/졸리|졸렸|졸려|졸림|졸음|잠이\s*(쏟|와|왔|오)/, "졸림"],
  [/메스껍|메스꺼|울렁|구역|토할\s*것/, "메스꺼움"],
  [/어지럽|어지러|어질|핑\s*돌/, "어지러움"],
  [/두통|머리가\s*(아프|아팠|아파|지끈)|머리\s*아/, "두통"],
];
const PROCESS_RULES: [RegExp, string][] = [
  [/알약이?\s*(너무\s*)?(크|커서|컸|커요|큰)|약이\s*(너무\s*)?(크|커서|컸)/, "알약이 너무 커요"],
  [/삼키기\s*(힘들|어렵|어려|불편)|목에\s*걸/, "삼키기 어려워요"],
  [/맛이\s*(쓰|써|이상|불편|역|별로)|쓴\s*맛|쓴맛/, "맛이 불편해요"],
  [/(횟수|자주\s*먹|하루에?\s*(세|네|3|4)\s*번).*(번거|귀찮|힘들)|번거로/, "복용 횟수가 번거로워요"],
];
const GOOD_RULES: [RegExp, string][] = [
  [/먹기\s*(편|쉬)|복용하기\s*(편|쉬)|편하게\s*먹/, "복용하기 편했어요"],
  [/(별\s*(문제|이상)\s*없|불편(함|한\s*점)?\s*(이|은)?\s*없|아무렇지\s*않|괜찮았)/, "불편함이 없었어요"],
];
const UNCERTAIN = /(모르겠|인지는|인지\s*모|확실하지|확실치|때문인지|탓인지|애매)/;

/** 문장을 짧은 마디로 나눔 (그런데·는데·지만 앞뒤를 따로 봄) */
function clauses(memo: string): string[] {
  return memo
    .split(/[.!?\n]|(?:그런데|근데|하지만|지만|는데|은데|ㄴ데)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 메모 → 태그 제안 (순서: 도움 → 불편 → 복용 과정 → 원인 미확인) */
export function suggestTags(memo: string): string[] {
  const text = memo.trim();
  if (!text) return [];
  const out = new Set<string>();
  for (const c of clauses(text)) {
    const improved = IMPROVED.test(c);
    const reason = REASON.test(c);
    if (improved) out.add("증상 완화를 느꼈어요");
    for (const [re, tag] of PROCESS_RULES) if (re.test(c)) out.add(tag);
    for (const [re, tag] of GOOD_RULES) {
      // "전에 먹었을 때는 괜찮았는데" 처럼 예전 복용 이야기는 이번 경험으로 보지 않음
      if (tag === "불편함이 없었어요" && PAST_TIME.test(c)) continue;
      if (re.test(c)) out.add(tag);
    }
    // 증상이 나아졌다는 말·약을 먹은 이유는 불편 경험이 아님
    if (!improved && !reason) for (const [re, tag] of AFTER_RULES) if (re.test(c)) out.add(tag);
  }
  if (UNCERTAIN.test(text)) out.add("원인 미확인");
  // 불편 경험이 있으면 '불편함이 없었어요'는 빼기 (서로 모순)
  if ([...out].some((t) => AFTER_RULES.some(([, x]) => x === t))) out.delete("불편함이 없었어요");
  const order = [
    "증상 완화를 느꼈어요",
    "복용하기 편했어요",
    "불편함이 없었어요",
    ...AFTER_RULES.map(([, t]) => t),
    ...PROCESS_RULES.map(([, t]) => t),
    "원인 미확인",
  ];
  return [...out].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

/** 제안 태그 → 한두 문장 정리 (단정하지 않는 기록체) */
export function summarize(tags: string[], ctx: { itemName?: string; wholeRecord?: boolean } = {}): string {
  const after = tags.filter((t) => AFTER_RULES.some(([, x]) => x === t));
  const proc = tags.filter((t) => PROCESS_RULES.some(([, x]) => x === t));
  const good = tags.filter((t) => GOOD_RULES.some(([, x]) => x === t) || t === "증상 완화를 느꼈어요");
  const what = ctx.itemName ? `${ctx.itemName} 복용` : ctx.wholeRecord ? "함께 먹은 약 복용" : "복용";
  const parts: string[] = [];
  if (good.length) parts.push(`${what} 후 '${good.map(tagLabel).join("·")}'라고 기록함.`);
  if (after.length) {
    const w = after.join("·");
    parts.push(`${good.length ? "" : `${what} 후 `}${w}${josa(w, "을", "를")} 경험했다고 기록함.`);
  }
  if (proc.length) parts.push(`복용 과정의 불편: ${proc.map(tagLabel).join("·")}.`);
  if (after.length || tags.includes("원인 미확인")) parts.push(ctx.wholeRecord ? "원인 약물은 확인되지 않음." : "약과의 관련성은 확인되지 않음.");
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export const ruleTagger: ExperienceTagger = {
  id: "rule",
  async suggest(memo, ctx) {
    const tags = suggestTags(memo);
    return { tags, summary: tags.length ? summarize(tags, ctx) : "", source: "rule", empty: tags.length === 0 };
  },
};
