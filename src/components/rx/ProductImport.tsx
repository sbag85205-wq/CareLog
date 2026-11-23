"use client";

import { Camera, CheckCircle2, FileUp, PencilLine, Receipt, Search } from "lucide-react";
import { useRef, useState } from "react";
import { Alert, cn, Notice, PButton, PCard, StatusPill } from "@/components/patient-ui/kit";
import { EXAMPLE_BOX, EXAMPLE_RECEIPT, exampleBoxText, exampleReceiptText } from "@/lib/demo/example-otc";
import { useDrugSearch, type DrugItem } from "@/lib/drug-search-client";
import { extractBoxNames, extractReceiptLines } from "@/lib/prescription/product-text";
import type { ReadProgress } from "@/lib/prescription/read-file";
import { classify, categoryLabel, CATEGORY_SOURCE_LABEL, mfdsClassText } from "@/lib/rx/categories";
import { manualToItem, productToItem } from "@/lib/rx/product";
import type { RecordSource, RxItemInput } from "@/lib/rx/model";

export type ProductMode = "box" | "receipt" | "search";

export interface ProductPayload {
  requestId: string;
  source: RecordSource;
  date: string;
  shop: string;
  items: RxItemInput[];
}

const newRequestId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (Number(c) ^ ((Math.random() * 16) >> (Number(c) / 4))).toString(16));

const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

interface Line {
  key: string;
  /** 사진에서 읽은 줄 또는 검색어 */
  raw: string;
  query: string;
  status: "searching" | "found" | "none" | "failed";
  candidates: DrugItem[];
  /** 고른 품목기준코드 · MANUAL = 이름만 직접 입력 · null = 이 줄은 등록 안 함 · undefined = 아직 안 고름 */
  pick: string | null | undefined;
  /** 직접 입력할 때 이름·함량 (식약처 확인 안 됨) */
  manualName: string;
  manualStrength: string;
  message?: string;
}

/** 식약처 후보 대신 사용자가 이름을 직접 적어 등록 */
const MANUAL = "__manual__";
type Chosen = { key: string; kind: "mfds"; d: DrugItem } | { key: string; kind: "manual"; name: string; strength: string };

const MODE_TITLE: Record<ProductMode, string> = { box: "일반약 상자", receipt: "약국 영수증", search: "약 이름 직접 검색" };

/**
 * 일반약 등록 — 상자 사진 · 약국 영수증 · 직접 검색
 * 사진은 이 기기 안에서만 읽고(서버 전송 없음), 식약처 검색에는 제품명 후보만 보냄.
 * 한 제품으로 확실하지 않으면 후보를 보여 주고 사용자가 고름. 등록했다고 '복용'으로 보지 않음.
 */
export function ProductImport({
  mode,
  demo,
  save,
  onDone,
  onSwitchToSearch,
  initialQuery = "",
}: {
  initialQuery?: string;
  mode: ProductMode;
  demo?: boolean;
  save: (p: ProductPayload) => Promise<void>;
  onDone: (n: number) => void;
  onSwitchToSearch?: (q: string) => void;
}) {
  const search = useDrugSearch();
  const [stage, setStage] = useState<"choose" | "reading" | "pick" | "saving" | "done">("choose");
  const [progress, setProgress] = useState<ReadProgress | null>(null);
  const [readText, setReadText] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [q, setQ] = useState(initialQuery);
  const [date, setDate] = useState(todayLocal);
  const [shop, setShop] = useState("");
  const [taking, setTaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoRead, setDemoRead] = useState(false);
  const requestIdRef = useRef<string | null>(null);
  const savingRef = useRef(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const update = (key: string, patch: Partial<Line>) => setLines((cur) => cur.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  async function lookup(key: string, names: string[]) {
    // 첫 이름부터 차례로 검색 — 결과가 나오면 멈춤 (외부로는 이름만)
    for (const name of names) {
      const r = await search({ q: name });
      if (!r.ok) return update(key, { status: "failed", candidates: [], pick: undefined, message: r.message });
      const items = r.items.filter((i) => i.itemSeq);
      if (items.length) {
        const active = items.filter((i) => !i.canceled);
        const list = (active.length ? active : items).slice(0, 8);
        return update(key, { status: "found", candidates: list, query: name, pick: undefined });
      }
    }
    update(key, { status: "none", candidates: [], pick: undefined });
  }

  async function startFromText(text: string, isDemo: boolean) {
    setReadText(text);
    setDemoRead(isDemo);
    requestIdRef.current = newRequestId();
    if (mode === "box") {
      const names = extractBoxNames(text);
      const line: Line = {
        key: "box",
        raw: names[0] ?? "",
        query: names[0] ?? "",
        status: names.length ? "searching" : "none",
        candidates: [],
        pick: undefined,
        manualName: names[0] ?? "",
        manualStrength: "",
      };
      setLines([line]);
      setStage("pick");
      if (names.length) await lookup("box", names);
    } else {
      const rl = extractReceiptLines(text);
      setLines(
        rl.map((l, i) => ({
          key: `r${i}`,
          raw: l.raw,
          query: l.name,
          status: "searching",
          candidates: [],
          pick: undefined,
          manualName: l.name,
          manualStrength: "",
        })),
      );
      if (isDemo) setShop(EXAMPLE_RECEIPT.shop);
      setStage("pick");
      for (const [i, l] of rl.entries()) await lookup(`r${i}`, [l.name]);
    }
  }

  async function runSearch(query: string) {
    const s = query.trim();
    if (s.length < 2) return setError("제품명을 2자 이상 입력해 주세요.");
    setError(null);
    setQ(s);
    requestIdRef.current ??= newRequestId();
    setLines([{ key: "search", raw: s, query: s, status: "searching", candidates: [], pick: undefined, manualName: s, manualStrength: "" }]);
    setStage("pick");
    await lookup("search", [s]);
  }

  async function readFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setStage("reading");
    setProgress({ stage: "ocr-load", ratio: 0 });
    try {
      const { readPrescriptionFile } = await import("@/lib/prescription/read-file");
      const r = await readPrescriptionFile(file, setProgress);
      await startFromText(r.text, false);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "사진을 읽지 못했어요.");
      setStage("choose");
    } finally {
      if (cameraRef.current) cameraRef.current.value = "";
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const chosen: Chosen[] = lines.flatMap((l): Chosen[] => {
    if (l.pick === MANUAL) return l.manualName.trim() ? [{ key: l.key, kind: "manual", name: l.manualName.trim(), strength: l.manualStrength.trim() }] : [];
    const d = l.pick ? l.candidates.find((c) => c.itemSeq === l.pick) : undefined;
    return d ? [{ key: l.key, kind: "mfds", d }] : [];
  });
  const undecided = lines.filter((l) => l.status === "found" && l.pick === undefined);
  const manualMissing = lines.filter((l) => l.pick === MANUAL && !l.manualName.trim());
  const searching = lines.some((l) => l.status === "searching");

  async function register() {
    if (savingRef.current || chosen.length === 0 || searching || manualMissing.length > 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    savingRef.current = true;
    setStage("saving");
    setError(null);
    try {
      await save({
        requestId: requestIdRef.current ?? (requestIdRef.current = newRequestId()),
        // 모두 직접 입력이면 '직접 입력', 하나라도 식약처 제품이면 원래 방법
        source: chosen.every((c) => c.kind === "manual") ? "manual" : mode === "box" ? "otc_box" : mode === "receipt" ? "receipt" : "search",
        date,
        shop: shop.trim().slice(0, 60),
        items: chosen.map((c) => ({ ...(c.kind === "mfds" ? productToItem(c.d) : manualToItem(c.name, c.strength)), active: taking })),
      });
      setStage("done");
      onDone(chosen.length);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "저장하지 못했어요. 다시 시도해 주세요.");
      setStage("pick");
    } finally {
      savingRef.current = false;
    }
  }

  /* ───────────── 화면 ───────────── */

  if (stage === "done") {
    return (
      <PCard tone="tint">
        <p className="flex items-center gap-2 text-lg font-bold text-brand-900">
          <CheckCircle2 className="h-6 w-6" aria-hidden /> 일반약 {chosen.length}개를 등록했어요
        </p>
        <p className="mt-1 text-sm text-brand-800">나의 약 기록에서 확인하고, 먹어 본 뒤 느낀 점을 남겨 보세요.</p>
      </PCard>
    );
  }

  if (stage === "choose" || stage === "reading") {
    return (
      <PCard className="space-y-4">
        {mode === "search" ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void runSearch(q);
            }}
          >
            <label className="block">
              <span className="mb-1 block text-sm font-bold text-ink">기억나는 제품명</span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                maxLength={40}
                placeholder={demo ? "예: 가상소화정" : "예: 제품명 일부"}
                aria-label="제품명 검색어"
                className="h-14 w-full rounded-2xl border border-line bg-white px-4 text-lg"
              />
            </label>
            <PButton type="submit" className="w-full" icon={Search}>
              식약처 제품 정보에서 찾기
            </PButton>
            <p className="text-xs text-ink-soft">
              {demo ? "데모는 가상 제품 목록에서 찾아요 (데모용 예시)." : "검색어(제품명)만 식약처 의약품 제품 허가정보 검색에 사용해요."}
            </p>
          </form>
        ) : demo ? (
          <>
            {mode === "box" ? <ExampleBox /> : <ExampleReceipt />}
            <PButton
              className="w-full"
              icon={mode === "box" ? Camera : Receipt}
              onClick={() => void startFromText(mode === "box" ? exampleBoxText() : exampleReceiptText(), true)}
            >
              {mode === "box" ? "예제 상자 사진 읽기" : "예제 영수증 읽기"}
            </PButton>
            <p className="text-xs text-ink-soft">데모용 예시: 실제 사진 인식 대신 예제 글자를 읽은 것으로 처리하고, 가상 제품 목록에서 찾아요.</p>
          </>
        ) : (
          <>
            <p className="text-ink">
              {mode === "box"
                ? "약 상자의 제품명이 잘 보이게 찍어 주세요. 알약 모양으로는 찾지 않아요."
                : "제품명이 적힌 약국 영수증을 찍어 주세요. 영수증이 있다고 복용한 것으로 보지 않아요."}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <PButton icon={Camera} disabled={stage === "reading"} onClick={() => cameraRef.current?.click()}>
                사진 찍기
              </PButton>
              <PButton variant="secondary" icon={FileUp} disabled={stage === "reading"} onClick={() => fileRef.current?.click()}>
                사진 파일 선택
              </PButton>
            </div>
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              aria-label={`${MODE_TITLE[mode]} 사진 찍기`}
              tabIndex={-1}
              onChange={(e) => void readFile(e.target.files?.[0])}
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="sr-only"
              aria-label={`${MODE_TITLE[mode]} 사진 파일 선택`}
              tabIndex={-1}
              onChange={(e) => void readFile(e.target.files?.[0])}
            />
            <p className="text-xs leading-relaxed text-ink-soft">
              사진은 이 기기 안에서만 읽어요 (서버로 보내지 않음). 제품 확인에는 읽어 낸 제품명만 식약처 검색에 사용해요.
            </p>
            {stage === "reading" && progress && <p className="text-sm font-semibold text-brand-800">글자 읽는 중… {Math.round(progress.ratio * 100)}%</p>}
          </>
        )}
        <Alert>{error}</Alert>
      </PCard>
    );
  }

  return (
    <div className="space-y-4">
      {mode === "search" && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void runSearch(q);
          }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            maxLength={40}
            aria-label="제품명 검색어"
            className="h-12 min-w-0 flex-1 rounded-2xl border border-line bg-white px-4"
          />
          <PButton type="submit" size="md" icon={Search}>
            다시 찾기
          </PButton>
        </form>
      )}
      {mode !== "search" && (
        <Notice>
          {demoRead ? "데모용 예시 · " : ""}
          {mode === "box" ? "상자에서 읽은 제품명으로 찾았어요" : `영수증에서 제품 줄 ${lines.length}개를 찾았어요`}
        </Notice>
      )}
      {lines.length === 0 && (
        <Alert>
          영수증에서 제품명을 찾지 못했어요. 확인이 필요해요 — 직접 검색으로 찾아 주세요.
          {onSwitchToSearch && (
            <PButton size="sm" variant="soft" className="mt-2" onClick={() => onSwitchToSearch("")}>
              직접 검색
            </PButton>
          )}
        </Alert>
      )}
      <ul className="space-y-3" aria-label="제품 후보">
        {lines.map((l) => (
          <li key={l.key}>
            <LineCard
              line={l}
              onPick={(pick) => update(l.key, { pick })}
              onManual={(patch) => update(l.key, patch)}
              multi={mode === "receipt"}
              onSwitchToSearch={onSwitchToSearch}
            />
          </li>
        ))}
      </ul>
      {readText && (
        <details className="rounded-2xl bg-ivory px-4 py-3 text-sm">
          <summary className="cursor-pointer font-semibold text-ink-soft">읽은 글자 보기 (이 기기에만 있어요)</summary>
          <pre className="mt-2 max-h-40 overflow-auto font-sans text-xs whitespace-pre-wrap text-ink">{readText}</pre>
        </details>
      )}

      {chosen.length > 0 && (
        <PCard className="space-y-3 !p-4" aria-label="등록 확인">
          <p className="font-bold text-ink">저장 전 확인</p>
          <ul className="space-y-2">
            {chosen.map((ch) => {
              if (ch.kind === "manual")
                return (
                  <li key={ch.key} className="rounded-2xl bg-ivory p-3 text-sm" aria-label={`등록할 제품: ${ch.name}`}>
                    <p className="font-bold text-ink">
                      {ch.name}
                      {ch.strength && ` ${ch.strength}`}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-1">
                      <StatusPill tone="dashed" className="!px-2.5 !py-0.5 !text-xs">
                        직접 입력 · 식약처 확인 안 됨
                      </StatusPill>
                      <StatusPill tone="warn" className="!px-2.5 !py-0.5 !text-xs">
                        미분류 · 확인 필요
                      </StatusPill>
                    </p>
                    <p className="mt-1 text-xs text-ink-soft">성분·약 종류는 비워 둬요. 저장 후 약 종류를 직접 고를 수 있어요.</p>
                  </li>
                );
              const d = ch.d;
              const it = productToItem(d);
              const c = classify(d.classRaw ?? d.productType, d.ingredient);
              return (
                <li key={ch.key} className="rounded-2xl bg-ivory p-3 text-sm" aria-label={`등록할 제품: ${d.name}`}>
                  <p className="font-bold text-ink">{d.name}</p>
                  <p className="text-ink-soft">
                    {[d.company, it.ingredients && `성분 ${it.ingredients}`, it.strength && `함량 ${it.strength}`, d.category].filter(Boolean).join(" · ")}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-1">
                    <span className="text-xs font-bold text-ink-soft">약 종류</span>
                    {c.categories.map((x) => (
                      <StatusPill key={x} tone={x === "unclassified" ? "warn" : "outline"} className="!px-2.5 !py-0.5 !text-xs">
                        {x === "unclassified" ? "미분류 · 확인 필요" : categoryLabel(x)}
                      </StatusPill>
                    ))}
                    <span className="text-xs text-ink-soft">({CATEGORY_SOURCE_LABEL[c.source]} · 저장 후 고칠 수 있어요)</span>
                  </p>
                </li>
              );
            })}
          </ul>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-ink-soft">구매·등록일</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-12 w-full rounded-xl border border-line bg-white px-3"
                aria-label="구매·등록일"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-ink-soft">약국 (선택)</span>
              <input
                value={shop}
                onChange={(e) => setShop(e.target.value)}
                maxLength={60}
                className="h-12 w-full rounded-xl border border-line bg-white px-3"
                placeholder="비워 둬도 돼요"
              />
            </label>
          </div>
          <label className="flex items-start gap-2 rounded-2xl border border-line bg-white p-3">
            <input type="checkbox" className="mt-1 h-5 w-5 accent-brand-700" checked={taking} onChange={(e) => setTaking(e.target.checked)} />
            <span className="text-sm">
              <span className="font-bold text-ink">지금 먹고 있어요</span>
              <span className="block text-ink-soft">등록(구매)만으로는 복용한 것으로 보지 않아요. 실제로 먹고 있을 때만 체크하세요.</span>
            </span>
          </label>
        </PCard>
      )}

      <div className="sticky bottom-0 -mx-4 space-y-2 border-t border-line bg-ivory px-4 pt-3 pb-1 sm:-mx-6 sm:px-6">
        {searching && <p className="text-sm text-ink-soft">식약처 제품 정보에서 찾는 중이에요…</p>}
        {undecided.length > 0 && (
          <p className="text-sm font-semibold text-blush-700">제품을 골라 주세요 ({undecided.length}곳). 확실하지 않으면 ‘등록 안 함’을 고르세요.</p>
        )}
        {manualMissing.length > 0 && <p className="text-sm font-semibold text-blush-700">직접 입력할 약 이름을 적어 주세요.</p>}
        <Alert>{error}</Alert>
        <PButton
          className="w-full"
          disabled={stage === "saving" || chosen.length === 0 || searching || undecided.length > 0 || manualMissing.length > 0}
          onClick={() => void register()}
        >
          {stage === "saving" ? "등록 중…" : chosen.length ? `확인한 제품 ${chosen.length}개 등록` : "제품을 골라 주세요"}
        </PButton>
      </div>
    </div>
  );
}

function LineCard({
  line: l,
  onPick,
  onManual,
  multi,
  onSwitchToSearch,
}: {
  line: Line;
  onPick: (p: string | null | undefined) => void;
  onManual: (patch: Partial<Pick<Line, "manualName" | "manualStrength">>) => void;
  multi: boolean;
  onSwitchToSearch?: (q: string) => void;
}) {
  const manualFields = l.pick === MANUAL && (
    <div
      className="mt-2 grid gap-2 rounded-2xl border border-dashed border-line bg-white p-3 sm:grid-cols-[1fr_9rem]"
      aria-label={`${l.raw || l.query} 직접 입력`}
    >
      <label className="block">
        <span className="mb-1 block text-xs font-bold text-ink-soft">약 이름 (직접 입력)</span>
        <input
          value={l.manualName}
          maxLength={100}
          onChange={(e) => onManual({ manualName: e.target.value })}
          aria-label="직접 입력할 약 이름"
          className="h-12 w-full rounded-xl border border-line bg-white px-3 text-base"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-bold text-ink-soft">함량 (선택)</span>
        <input
          value={l.manualStrength}
          maxLength={50}
          placeholder="예: 500mg"
          onChange={(e) => onManual({ manualStrength: e.target.value })}
          aria-label="직접 입력할 함량"
          className="h-12 w-full rounded-xl border border-line bg-white px-3 text-base"
        />
      </label>
      <p className="text-xs text-ink-soft sm:col-span-2">식약처에서 확인하지 않은 약으로 표시돼요. 성분·약 종류는 지어내지 않고 비워 둬요.</p>
    </div>
  );
  return (
    <PCard className="!p-4" aria-label={`읽은 줄: ${l.raw || l.query}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 font-bold break-words text-ink">{l.raw || "제품명을 읽지 못했어요"}</p>
        <StatusPill tone={l.status === "found" ? (l.candidates.length === 1 ? "sage" : "warn") : l.status === "searching" ? "ivory" : "warn"}>
          {l.status === "searching"
            ? "찾는 중"
            : l.status === "found"
              ? l.candidates.length === 1
                ? "후보 1개 · 확인 필요"
                : `후보 ${l.candidates.length}개 · 골라 주세요`
              : "확인 필요"}
        </StatusPill>
      </div>
      {(l.status === "none" || l.status === "failed") && (
        <div className="mt-2 space-y-2 text-sm">
          <p className="text-blush-700">{l.status === "failed" ? l.message : "식약처 제품 정보에서 이 이름을 찾지 못했어요. 제품을 추측하지 않아요."}</p>
          <div className="flex flex-wrap gap-2">
            {l.pick === MANUAL ? (
              <PButton size="sm" variant="ghost" onClick={() => onPick(undefined)}>
                직접 입력 취소
              </PButton>
            ) : (
              <PButton size="sm" variant="secondary" icon={PencilLine} onClick={() => onPick(MANUAL)}>
                이름만 직접 입력해 등록
              </PButton>
            )}
            {onSwitchToSearch && l.pick !== MANUAL && (
              <PButton size="sm" variant="soft" icon={Search} onClick={() => onSwitchToSearch(l.query)}>
                다른 이름으로 검색
              </PButton>
            )}
          </div>
          {manualFields}
        </div>
      )}
      {l.candidates.length > 0 && (
        <fieldset className="mt-3 space-y-1.5" aria-label={`${l.raw || l.query} 제품 후보`}>
          {l.candidates.map((c) => (
            <label
              key={c.itemSeq}
              className={cn(
                "flex cursor-pointer items-start gap-2 rounded-2xl border p-3",
                l.pick === c.itemSeq ? "border-brand-500 bg-brand-50" : "border-line bg-white",
              )}
            >
              <input
                type="radio"
                name={`pick-${l.key}`}
                className="mt-1 accent-brand-700"
                checked={l.pick === c.itemSeq}
                onChange={() => onPick(c.itemSeq)}
                aria-label={`${c.name} · ${c.company}`}
              />
              <span className="min-w-0 text-sm">
                <span className="block font-bold break-words text-ink">{c.name}</span>
                <span className="block text-ink-soft">
                  {[c.company, c.ingredient && `성분 ${c.ingredient}`, c.category, mfdsClassText(c.classRaw ?? c.productType)].filter(Boolean).join(" · ")}
                </span>
                <span className="text-xs text-ink-soft">품목기준코드 {c.itemSeq}</span>
                {c.canceled && (
                  <StatusPill tone="warn" className="ml-1 !text-xs">
                    허가 취하
                  </StatusPill>
                )}
              </span>
            </label>
          ))}
          <label
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-2xl border p-3 text-sm",
              l.pick === null ? "border-brand-500 bg-brand-50" : "border-line bg-white",
            )}
          >
            <input type="radio" name={`pick-${l.key}`} className="accent-brand-700" checked={l.pick === null} onChange={() => onPick(null)} />
            {multi ? "이 줄은 등록 안 함" : "여기에 없어요 · 등록 안 함"}
          </label>
          <label
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-2xl border p-3 text-sm",
              l.pick === MANUAL ? "border-brand-500 bg-brand-50" : "border-line bg-white",
            )}
          >
            <input type="radio" name={`pick-${l.key}`} className="accent-brand-700" checked={l.pick === MANUAL} onChange={() => onPick(MANUAL)} />
            목록에 없어요 · 이름만 직접 입력
          </label>
          {manualFields}
        </fieldset>
      )}
    </PCard>
  );
}

function ExampleBox() {
  const b = EXAMPLE_BOX;
  return (
    <figure
      className="mx-auto w-full max-w-sm overflow-hidden rounded-2xl border-2 border-brand-300 bg-gradient-to-br from-white to-brand-50 p-5 shadow-sm"
      aria-label="예제 일반약 상자 (가상)"
    >
      <span className="inline-block rounded-md bg-brand-700 px-2 py-0.5 text-xs font-bold text-white">{b.badge}</span>
      <p className="mt-3 text-2xl font-extrabold text-brand-900">{b.title}</p>
      <p className="text-sm font-semibold text-brand-800">{b.sub}</p>
      <p className="mt-6 text-right text-sm text-ink-soft">{b.count}</p>
      <figcaption className="mt-2 border-t border-brand-200 pt-2 text-center text-xs text-ink-soft">데모용 예시 · {b.note}</figcaption>
    </figure>
  );
}

function ExampleReceipt() {
  const r = EXAMPLE_RECEIPT;
  return (
    <figure
      className="mx-auto w-full max-w-xs rounded-xl border border-line bg-white p-4 font-mono text-xs text-ink shadow-sm"
      aria-label="예제 약국 영수증 (가상)"
    >
      <p className="text-center font-bold">{r.shop}</p>
      <p className="text-center text-ink-soft">{r.date}</p>
      <div className="my-2 border-t border-dashed border-line" />
      {r.lines.map((l) => (
        <p key={l.name} className="flex justify-between gap-2">
          <span>{l.name}</span>
          <span>
            {l.qty} {l.price}
          </span>
        </p>
      ))}
      <div className="my-2 border-t border-dashed border-line" />
      <p className="flex justify-between font-bold">
        <span>합계</span>
        <span>{r.total}</span>
      </p>
      <figcaption className="mt-2 text-center text-ink-soft">데모용 예시 영수증</figcaption>
    </figure>
  );
}
