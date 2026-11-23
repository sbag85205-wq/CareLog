"use client";

import { Camera, CheckCircle2, FileUp, Plus, ScrollText } from "lucide-react";
import { useRef, useState } from "react";
import { Alert, cn, Notice, PButton, PCard, StatusPill } from "@/components/patient-ui/kit";
import { EXAMPLE_PRESCRIPTION, examplePrescriptionText } from "@/lib/demo/example-prescription";
import { useDrugCaution, useDrugSearch } from "@/lib/drug-search-client";
import { lookupDrug } from "@/lib/prescription/lookup";
import type { Candidate, MatchStatus } from "@/lib/prescription/match";
import { normalizeStrength, parsePrescriptionMeta, parsePrescriptionText, searchName, toRxFields } from "@/lib/prescription/parse";
import type { ReadMethod, ReadProgress } from "@/lib/prescription/read-file";
import type { MedicationInput } from "@/lib/repository/supabase";
import { DEPARTMENTS, type RxItemInput } from "@/lib/rx/model";

type RowStatus = MatchStatus | "searching" | "manual";

interface Fields {
  name: string;
  strength: string;
  dosage: string;
  frequency: string;
  timing: string;
  duration: string;
  /** 처방전·복약 안내에서 가져온 주의사항 (수정 가능) */
  cautionRx: string;
}

export interface ImportMeta {
  prescribedOn: string;
  department: string;
  clinic: string;
  guidance: string;
}

/** 확인한 처방 한 건 — requestId 는 화면에서 한 번 만들어 재시도에도 같은 값을 씀 (중복 등록 방지) */
export interface ImportPayload {
  requestId: string;
  meta: ImportMeta;
  items: RxItemInput[];
}

/** 처방 이력 구조가 없는 DB에서는 예전처럼 내 약 목록에 등록 (기존 동작 유지) */
export function payloadToMedications(p: ImportPayload): MedicationInput[] {
  return p.items.map((i) => ({
    name: i.name,
    dosage: i.dosage,
    schedule: [i.frequency, i.timing, i.duration].filter(Boolean).join(" · ").slice(0, 100),
    caution: [i.cautionRx, "처방전에서 불러옴"].filter(Boolean).join(" · ").slice(0, 500),
    externalItemSeq: i.externalItemSeq ?? null,
    visibleToGuardian: false,
  }));
}

const newRequestId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (Number(c) ^ ((Math.random() * 16) >> (Number(c) / 4))).toString(16));

interface Row {
  key: string;
  raw: string;
  status: RowStatus;
  candidates: Candidate[];
  /** 선택한 제품 품목기준코드 / null: 후보 쓰지 않고 직접 입력 / undefined: 아직 고르지 않음 */
  pick: string | null | undefined;
  fields: Fields;
  /** 식약처 제품 정보의 주의사항 (고른 제품 기준, 요약) */
  cautionMfds: string;
  cautionState?: "loading" | "failed";
  include: boolean;
  duplicate: boolean;
  message?: string;
}

const STATUS_PILL: Record<RowStatus, { label: string; tone: "sage" | "outline" | "warn" | "ivory" }> = {
  searching: { label: "제품 찾는 중", tone: "ivory" },
  confirmed: { label: "확인됨", tone: "sage" },
  review: { label: "확인 필요", tone: "warn" },
  not_found: { label: "검색 결과 없음 · 직접 입력", tone: "ivory" },
  search_failed: { label: "검색 실패 · 직접 입력", tone: "ivory" },
  manual: { label: "직접 입력", tone: "ivory" },
};

const METHOD_LABEL: Record<ReadMethod | "example", string> = {
  "pdf-text": "PDF 글자를 읽었어요",
  "pdf-ocr": "스캔 PDF를 이미지로 읽었어요",
  "image-ocr": "사진에서 글자를 읽었어요",
  example: "예제 처방전(가상)을 읽었어요",
};

/** 같은 약 비교용 이름: 괄호·공백 제거, 함량 표기 통일 (10밀리그램 = 10mg) */
const norm = (s: string) => {
  const n = searchName(s).toLowerCase();
  const st = normalizeStrength(n);
  return st ? n.replace(/(\d+(?:[.,]\d+)?)\s*(밀리그램|밀리그람|mg|㎎|마이크로그램|mcg|㎍|μg|그램|g|밀리리터|ml|㎖|%)/i, st.toLowerCase()) : n;
};

/**
 * 처방전 불러오기 → 저장 전 미리보기 → 선택한 약 한 번에 등록
 * - 처방전 원본·전체 인식 텍스트는 이 브라우저 안에서만 사용 (검색에는 약 이름·보험코드만)
 * - 처방전에 없거나 읽기 어려운 값은 빈칸, 모든 칸은 저장 전에 고칠 수 있음
 */
export function PrescriptionImport({
  existing,
  save,
  demo,
  onDone,
  requireDate = true,
}: {
  /** 이미 등록한 약 (지금 복용 중·내 약) — 같은 약은 기본으로 빼 둠 */
  existing: { name: string; externalItemSeq?: string }[];
  save: (payload: ImportPayload) => Promise<void>;
  /** 공개 데모: 예제 처방전만 (실제 파일 인식·식약처 API는 로그인 버전) */
  demo?: boolean;
  onDone: (count: number) => void;
  /** 처방 이력으로 저장할 때만 처방일 필수 (처방 이력 구조가 없는 DB에서는 약만 등록) */
  requireDate?: boolean;
}) {
  const search = useDrugSearch();
  const fetchCaution = useDrugCaution();
  const [meta, setMeta] = useState<ImportMeta>({
    prescribedOn: "",
    department: "",
    clinic: "",
    guidance: "",
  });
  const [metaRead, setMetaRead] = useState<{
    date: boolean;
    department: boolean;
  }>({ date: false, department: false });
  const requestIdRef = useRef<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<"choose" | "reading" | "review" | "saving" | "done">("choose");
  const [progress, setProgress] = useState<ReadProgress | null>(null);
  const [method, setMethod] = useState<ReadMethod | "example" | null>(null);
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const savingRef = useRef(false);

  /** 이미 등록한 약: 같은 품목기준코드(고른 제품 또는 후보 중 하나) 또는 같은 이름 */
  const existingMatch = (name: string, seqs: string[]) =>
    existing.find((m) => (m.externalItemSeq && seqs.includes(m.externalItemSeq)) || norm(m.name) === norm(name));
  const isDuplicate = (name: string, seq?: string | null) => Boolean(existingMatch(name, seq ? [seq] : []));

  const update = (key: string, patch: Partial<Row> | ((r: Row) => Partial<Row>)) =>
    setRows((cur) => cur.map((r) => (r.key === key ? { ...r, ...(typeof patch === "function" ? patch(r) : patch) } : r)));

  /** 고른 제품의 식약처 주의사항 가져오기 (품목기준코드만 전송) */
  async function loadCaution(key: string, seq: string | null | undefined) {
    if (!seq) {
      update(key, { cautionMfds: "", cautionState: undefined });
      return;
    }
    update(key, { cautionState: "loading" });
    const r = await fetchCaution(seq);
    update(key, (row) =>
      row.pick === seq
        ? {
            cautionMfds: r.ok ? r.caution : "",
            cautionState: r.ok ? undefined : "failed",
          }
        : {},
    );
  }

  async function startFromText(t: string, how: ReadMethod | "example") {
    setText(t);
    setMethod(how);
    requestIdRef.current = newRequestId(); // 이번 처방 등록 한 건의 ID
    const m = parsePrescriptionMeta(t);
    setMeta({
      prescribedOn: m.prescribedOn ?? "",
      department: m.department ?? "",
      clinic: m.clinic ?? "",
      guidance: m.guidance ?? "",
    });
    setMetaRead({
      date: Boolean(m.prescribedOn),
      department: Boolean(m.department),
    });
    const parsed = parsePrescriptionText(t);
    const initial: Row[] = parsed.map((p) => {
      const fields = { ...toRxFields(p), cautionRx: "" };
      const duplicate = isDuplicate(fields.name);
      return {
        key: p.key,
        raw: p.raw,
        status: "searching",
        candidates: [],
        pick: undefined,
        fields,
        cautionMfds: "",
        include: !duplicate,
        duplicate,
      };
    });
    setRows(initial);
    setStage("review");
    // 제품 후보는 한 줄씩 차례로 (외부로는 보험코드 또는 약 이름만)
    for (const p of parsed) {
      const m = await lookupDrug(p, search);
      update(p.key, (r) => {
        const dup = existingMatch(
          r.fields.name,
          m.candidates.map((c) => c.item.itemSeq),
        );
        // 이미 등록한 제품이 후보에 있으면 그 제품으로 맞춰 둠 (기본으로 등록하지 않음)
        const already = dup?.externalItemSeq ? m.candidates.find((c) => c.item.itemSeq === dup.externalItemSeq) : undefined;
        const chosen = already ?? (m.status === "confirmed" ? m.candidates.find((c) => c.item.itemSeq === m.selected) : undefined);
        const fields = chosen ? { ...r.fields, name: chosen.item.name } : r.fields;
        const duplicate = Boolean(dup) || isDuplicate(fields.name, chosen?.item.itemSeq);
        return {
          status: m.status,
          candidates: m.candidates,
          pick: chosen ? chosen.item.itemSeq : m.status === "not_found" || m.status === "search_failed" || duplicate ? null : undefined,
          fields,
          duplicate,
          include: r.include && !duplicate,
          message: m.message,
        };
      });
      const chosenSeq = m.status === "confirmed" ? m.selected : undefined;
      if (chosenSeq) void loadCaution(p.key, chosenSeq);
    }
  }

  async function readFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setStage("reading");
    setProgress({ stage: "pdf", ratio: 0 });
    try {
      const { readPrescriptionFile } = await import("@/lib/prescription/read-file");
      const r = await readPrescriptionFile(file, setProgress);
      if (parsePrescriptionText(r.text).length === 0) {
        setText(r.text);
        setMethod(r.method);
        setRows([]);
        setStage("review");
        return;
      }
      await startFromText(r.text, r.method);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "처방전을 읽지 못했어요.");
      setStage("choose");
    } finally {
      if (cameraRef.current) cameraRef.current.value = "";
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const selected = rows.filter((r) => r.include);
  const unresolved = selected.filter((r) => r.status === "review" && r.pick === undefined);
  const searching = rows.some((r) => r.status === "searching");
  const missingName = selected.filter((r) => !r.fields.name.trim());
  const missingDate = requireDate && !/^\d{4}-\d{2}-\d{2}$/.test(meta.prescribedOn);

  async function register() {
    if (savingRef.current || selected.length === 0 || unresolved.length || missingName.length || searching || missingDate) return;
    savingRef.current = true; // 연타·재시도 중복 방지 (한 번의 요청으로 전부 저장되거나 전부 실패)
    setStage("saving");
    setSaveError(null);
    try {
      await save({
        requestId: requestIdRef.current ?? (requestIdRef.current = newRequestId()),
        meta: {
          ...meta,
          department: meta.department.trim(),
          clinic: meta.clinic.trim(),
          guidance: meta.guidance.trim(),
        },
        items: selected.map((r) => {
          const f = r.fields;
          const strength = f.strength.trim();
          const hasStrength = !strength || normalizeStrength(f.name) === normalizeStrength(strength) || f.name.includes(strength);
          return {
            name: (hasStrength ? f.name : `${f.name} ${strength}`).trim().slice(0, 100),
            strength: strength.slice(0, 50),
            dosage: f.dosage.trim().slice(0, 50),
            frequency: f.frequency.trim().slice(0, 50),
            timing: f.timing.trim().slice(0, 100),
            duration: f.duration.trim().slice(0, 50),
            cautionRx: f.cautionRx.trim().slice(0, 1000),
            cautionMfds: r.pick ? r.cautionMfds.slice(0, 1000) : "",
            externalItemSeq: r.pick ?? undefined,
            active: true,
          };
        }),
      });
      setStage("done");
      onDone(selected.length);
    } catch (e) {
      setSaveError(e instanceof Error && e.message ? e.message : "저장하지 못했어요. 다시 시도해 주세요.");
      setStage("review");
    } finally {
      savingRef.current = false;
    }
  }

  /* ───────────── 화면 ───────────── */

  if (stage === "choose" || stage === "reading") {
    return (
      <div className="space-y-4">
        <PCard className="space-y-4">
          <p className="text-ink">처방전의 약 목록을 읽어 한 번에 등록해요. 저장하기 전에 모든 내용을 확인하고 고칠 수 있어요.</p>
          {demo ? (
            <>
              <ExamplePrescription />
              <PButton
                className="w-full"
                icon={ScrollText}
                disabled={stage === "reading"}
                onClick={() => void startFromText(examplePrescriptionText(), "example")}
              >
                예제 처방전 읽기
              </PButton>
              <p className="text-xs text-ink-soft">
                데모는 가상 처방전과 가상 검색 결과를 사용해요. 실제 사진·PDF 인식과 식약처 검색은 로그인한 환자 화면에서 사용할 수 있어요.
              </p>
            </>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                <PButton icon={Camera} disabled={stage === "reading"} onClick={() => cameraRef.current?.click()}>
                  사진 찍기
                </PButton>
                <PButton variant="secondary" icon={FileUp} disabled={stage === "reading"} onClick={() => fileRef.current?.click()}>
                  사진·PDF 파일 선택
                </PButton>
              </div>
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                aria-label="처방전 사진 찍기"
                tabIndex={-1}
                onChange={(e) => void readFile(e.target.files?.[0])}
              />
              <input
                ref={fileRef}
                type="file"
                accept="image/*,application/pdf,.pdf"
                className="sr-only"
                aria-label="처방전 사진·PDF 파일 선택"
                tabIndex={-1}
                onChange={(e) => void readFile(e.target.files?.[0])}
              />
              <p className="text-xs leading-relaxed text-ink-soft">
                처방전 사진·PDF는 이 기기 안에서만 읽어요 (서버로 보내지 않음). 제품 확인을 위해 약 이름이나 보험코드만 식약처 검색에 사용해요. 처음 사진을 읽을
                때 글자 인식 도구를 내려받느라 조금 걸릴 수 있어요.
              </p>
            </>
          )}
          <Alert>{error}</Alert>
          {stage === "reading" && progress && <ProgressBar p={progress} />}
        </PCard>
      </div>
    );
  }

  if (stage === "done") {
    return (
      <PCard tone="tint">
        <p className="flex items-center gap-2 text-lg font-bold text-sage-900">
          <CheckCircle2 className="h-6 w-6" aria-hidden /> 처방 1건 · 약 {selected.length}개를 등록했어요
        </p>
        <p className="mt-1 text-sm text-sage-800">지금 복용 중과 처방 이력에서 확인할 수 있어요.</p>
      </PCard>
    );
  }

  return (
    <div className="space-y-4">
      <Notice>
        {method ? METHOD_LABEL[method] : ""} · 약 {rows.length}개
        {rows.some((r) => r.status === "review") && ` · 확인 필요 ${rows.filter((r) => r.status === "review").length}개`}
      </Notice>
      <PCard className="!p-4 sm:!p-5" aria-label="처방 정보">
        <p className="font-bold text-ink">처방 정보</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-ink-soft">처방일</span>
            <input
              type="date"
              value={meta.prescribedOn}
              onChange={(e) => setMeta({ ...meta, prescribedOn: e.target.value })}
              className="h-11 w-full rounded-xl border border-line bg-white px-3 text-[0.95rem] text-ink outline-none focus:border-sage-500 focus:ring-4 focus:ring-sage-100"
            />
            {!metaRead.date && <span className="mt-1 block text-xs text-blush-700">처방전에서 날짜를 읽지 못했어요. 확인해서 입력해 주세요.</span>}
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-ink-soft">진료과</span>
            <select
              value={meta.department}
              onChange={(e) => setMeta({ ...meta, department: e.target.value })}
              className="h-11 w-full rounded-xl border border-line bg-white px-3 text-[0.95rem] text-ink outline-none focus:border-sage-500 focus:ring-4 focus:ring-sage-100"
            >
              <option value="">선택 안 함</option>
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            {!metaRead.department && <span className="mt-1 block text-xs text-ink-soft">진료과가 분명하지 않으면 고르거나 비워 두세요.</span>}
          </label>
          <MiniField
            label="의료기관 (선택)"
            value={meta.clinic}
            onChange={(e) => setMeta({ ...meta, clinic: e.target.value })}
            placeholder="예: 가상이비인후과의원"
            wide
          />
          <label className="block sm:col-span-2">
            <span className="mb-1 flex items-center gap-2 text-xs font-bold text-ink-soft">
              주의사항 · 복약 안내{" "}
              <StatusPill tone="ivory" className="!px-2 !py-0 !text-[0.7rem]">
                출처: 처방전·복약 안내
              </StatusPill>
            </span>
            <textarea
              value={meta.guidance}
              onChange={(e) => setMeta({ ...meta, guidance: e.target.value })}
              rows={2}
              maxLength={1000}
              placeholder="처방전·복약 안내에 적힌 주의사항 (없으면 비워 두세요)"
              className="w-full rounded-xl border border-line bg-white px-3 py-2 text-[0.95rem] text-ink outline-none focus:border-sage-500 focus:ring-4 focus:ring-sage-100"
            />
          </label>
        </div>
      </PCard>
      {rows.length === 0 && <Alert>약 목록을 찾지 못했어요. 더 밝은 곳에서 처방전 전체가 보이게 다시 찍거나, 아래에서 직접 추가해 주세요.</Alert>}
      <ul className="space-y-3" aria-label="처방전에서 읽은 약">
        {rows.map((r, i) => (
          <li key={r.key}>
            <RowCard row={r} index={i} onChange={(patch) => update(r.key, patch)} onPick={(seq) => void loadCaution(r.key, seq)} />
          </li>
        ))}
      </ul>
      <PButton
        variant="ghost"
        size="sm"
        icon={Plus}
        onClick={() =>
          setRows((cur) => [
            ...cur,
            {
              key: `manual-${Date.now()}`,
              raw: "",
              status: "manual",
              candidates: [],
              pick: null,
              include: true,
              duplicate: false,
              cautionMfds: "",
              fields: {
                name: "",
                strength: "",
                dosage: "",
                frequency: "",
                timing: "",
                duration: "",
                cautionRx: "",
              },
            },
          ])
        }
      >
        약 직접 추가
      </PButton>
      {text && (
        <details className="rounded-2xl bg-ivory px-4 py-3 text-sm">
          <summary className="cursor-pointer font-semibold text-ink-soft">인식한 전체 글자 보기 (이 기기에만 있어요)</summary>
          <pre className="mt-2 max-h-48 overflow-auto font-sans text-xs whitespace-pre-wrap text-ink">{text}</pre>
        </details>
      )}

      <div className="sticky bottom-0 -mx-4 space-y-2 border-t border-line bg-ivory px-4 pt-3 pb-1 sm:-mx-6 sm:px-6">
        {searching && <p className="text-sm text-ink-soft">제품 후보를 찾는 중이에요…</p>}
        {unresolved.length > 0 && (
          <p className="text-sm font-semibold text-blush-700">
            확인 필요 {unresolved.length}개 — 제품 후보를 고르거나 ‘후보 사용 안 함 · 직접 입력’을 선택해 주세요.
          </p>
        )}
        {missingName.length > 0 && <p className="text-sm font-semibold text-blush-700">약 이름이 빈 줄이 있어요.</p>}
        {missingDate && <p className="text-sm font-semibold text-blush-700">처방일을 입력해 주세요.</p>}
        <Alert>{saveError}</Alert>
        <PButton
          className="w-full"
          disabled={stage === "saving" || selected.length === 0 || unresolved.length > 0 || missingName.length > 0 || searching || missingDate}
          onClick={() => void register()}
        >
          {stage === "saving" ? "등록 중…" : `선택한 약 ${selected.length}개 한 번에 등록`}
        </PButton>
      </div>
    </div>
  );
}

function RowCard({
  row: r,
  index,
  onChange,
  onPick,
}: {
  row: Row;
  index: number;
  onChange: (p: Partial<Row> | ((r: Row) => Partial<Row>)) => void;
  onPick: (seq: string | null) => void;
}) {
  const pill = r.duplicate ? { label: "이미 등록된 약", tone: "ivory" as const } : STATUS_PILL[r.status];
  const setField = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    onChange((cur) => ({ fields: { ...cur.fields, [k]: v } }));
  };
  const title = r.fields.name || `약 ${index + 1}`;
  return (
    <PCard className={cn("!p-4 sm:!p-5", !r.include && "opacity-70")} aria-label={`처방 약 ${index + 1}: ${title}`}>
      <div className="flex items-start justify-between gap-3">
        <label className="flex min-w-0 items-start gap-2">
          <input
            type="checkbox"
            className="mt-1 h-5 w-5 shrink-0 accent-sage-700"
            checked={r.include}
            onChange={(e) => onChange({ include: e.target.checked })}
            aria-label={`${title} 등록`}
          />
          <span className="min-w-0 font-bold break-words text-ink">{title}</span>
        </label>
        <StatusPill tone={pill.tone}>{pill.label}</StatusPill>
      </div>
      {r.raw && <p className="mt-1 ml-7 text-xs break-words text-ink-soft">처방전: {r.raw}</p>}
      {r.message && <p className="mt-1 ml-7 text-xs text-blush-700">{r.message}</p>}

      {r.candidates.length > 0 && (
        <fieldset className="mt-3 space-y-1.5" aria-label={`${title} 제품 후보`}>
          <legend className="mb-1 text-sm font-bold text-ink">
            제품 후보 {r.status === "review" && <span className="font-medium text-blush-700">— 하나를 골라 주세요</span>}
          </legend>
          {r.candidates.slice(0, 6).map((c) => (
            <label
              key={`${c.item.itemSeq}-${c.item.company}`}
              className={cn(
                "flex cursor-pointer items-start gap-2 rounded-2xl border p-3",
                r.pick === c.item.itemSeq ? "border-sage-500 bg-sage-50" : "border-line bg-white",
              )}
            >
              <input
                type="radio"
                name={`pick-${r.key}`}
                className="mt-1 accent-sage-700"
                checked={r.pick === c.item.itemSeq}
                onChange={() => {
                  onChange((cur) => ({
                    pick: c.item.itemSeq,
                    fields: { ...cur.fields, name: c.item.name },
                  }));
                  onPick(c.item.itemSeq);
                }}
                aria-label={`${c.item.name} · ${c.item.company}`}
              />
              <span className="min-w-0 text-sm">
                <span className="block font-bold break-words text-ink">{c.item.name}</span>
                <span className="text-ink-soft">
                  {c.item.company}
                  {c.item.category && ` · ${c.item.category}`}
                  {c.item.itemSeq && ` · 품목기준코드 ${c.item.itemSeq}`}
                </span>
                <span className="mt-1 flex flex-wrap gap-1">
                  {c.strengthMatch === true && <StatusPill tone="sage">함량 일치</StatusPill>}
                  {c.strengthMatch === false && <StatusPill tone="warn">함량 다름</StatusPill>}
                  {c.formMatch === false && <StatusPill tone="warn">제형 다름</StatusPill>}
                  {c.item.canceled && <StatusPill tone="warn">허가 취하</StatusPill>}
                </span>
              </span>
            </label>
          ))}
          <label
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-2xl border p-3 text-sm",
              r.pick === null ? "border-sage-500 bg-sage-50" : "border-line bg-white",
            )}
          >
            <input
              type="radio"
              name={`pick-${r.key}`}
              className="accent-sage-700"
              checked={r.pick === null}
              onChange={() => {
                onChange({ pick: null });
                onPick(null);
              }}
            />
            후보 사용 안 함 · 직접 입력
          </label>
        </fieldset>
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <MiniField label="약 이름" value={r.fields.name} onChange={setField("name")} wide />
        <MiniField label="함량" value={r.fields.strength} onChange={setField("strength")} placeholder="예: 500mg" />
        <MiniField label="1회 복용량" value={r.fields.dosage} onChange={setField("dosage")} placeholder="예: 1회 1정" />
        <MiniField label="횟수" value={r.fields.frequency} onChange={setField("frequency")} placeholder="예: 하루 3회" />
        <MiniField label="시점" value={r.fields.timing} onChange={setField("timing")} placeholder="예: 식후 30분" />
        <MiniField label="기간" value={r.fields.duration} onChange={setField("duration")} placeholder="예: 5일분" />
        <MiniField
          label="주의사항 (처방전·복약 안내)"
          value={r.fields.cautionRx}
          onChange={setField("cautionRx")}
          placeholder="안내받은 주의사항 (없으면 비워 두세요)"
          wide
        />
      </div>
      {r.pick && (r.cautionMfds || r.cautionState) && (
        <div className="mt-2 rounded-xl bg-ivory px-3 py-2 text-xs text-ink" aria-label={`${title} 식약처 주의사항`}>
          <StatusPill tone="outline" className="!px-2 !py-0 !text-[0.7rem]">
            출처: 식약처 제품 정보
          </StatusPill>
          <p className="mt-1">
            {r.cautionState === "loading"
              ? "식약처 주의사항을 가져오는 중…"
              : r.cautionState === "failed"
                ? "식약처 주의사항을 가져오지 못했어요."
                : r.cautionMfds}
          </p>
        </div>
      )}
    </PCard>
  );
}

function MiniField({
  label,
  value,
  onChange,
  placeholder,
  wide,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  wide?: boolean;
}) {
  return (
    <label className={cn("block", wide && "sm:col-span-2")}>
      <span className="mb-1 block text-xs font-bold text-ink-soft">{label}</span>
      <input
        value={value}
        onChange={onChange}
        maxLength={100}
        placeholder={placeholder ?? "처방전에 없으면 비워 두세요"}
        className="h-11 w-full rounded-xl border border-line bg-white px-3 text-[0.95rem] text-ink outline-none placeholder:text-ink-soft/50 focus:border-sage-500 focus:ring-4 focus:ring-sage-100"
      />
    </label>
  );
}

function ProgressBar({ p }: { p: ReadProgress }) {
  const label = p.stage === "pdf" ? "PDF 읽는 중" : p.stage === "ocr-load" ? "글자 인식 도구 준비 중" : "글자 읽는 중";
  const pct = Math.round(Math.max(0, Math.min(1, p.ratio)) * 100);
  return (
    <div aria-live="polite">
      <p className="text-sm font-semibold text-sage-800">
        {label}… {pct}%
      </p>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-ivory-deep"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className="h-full rounded-full bg-sage-700 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** 데모용 가상 처방전 미리보기 (표) */
function ExamplePrescription() {
  const p = EXAMPLE_PRESCRIPTION;
  return (
    <figure className="overflow-hidden rounded-2xl border border-line bg-white" aria-label="예제 처방전 (가상)">
      <figcaption className="flex flex-wrap justify-between gap-2 bg-ivory-deep px-4 py-2 text-xs text-ink-soft">
        <span className="font-bold text-ink">처방전 · 가상 예제</span>
        <span>
          {p.clinic} · {p.patient} · {p.issuedOn}
        </span>
      </figcaption>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[30rem] text-left text-xs">
          <thead className="text-ink-soft">
            <tr>
              <th className="px-3 py-2 font-semibold">보험코드</th>
              <th className="px-3 py-2 font-semibold">처방 의약품의 명칭</th>
              <th className="px-2 py-2 font-semibold">1회</th>
              <th className="px-2 py-2 font-semibold">1일</th>
              <th className="px-2 py-2 font-semibold">일수</th>
              <th className="px-3 py-2 font-semibold">용법</th>
            </tr>
          </thead>
          <tbody>
            {p.rows.map((r) => (
              <tr key={r.name} className="border-t border-line text-ink">
                <td className="px-3 py-2 font-mono">{r.edi || "—"}</td>
                <td className="px-3 py-2">{r.name}</td>
                <td className="px-2 py-2">{r.dose}</td>
                <td className="px-2 py-2">{r.times}</td>
                <td className="px-2 py-2">{r.days}</td>
                <td className="px-3 py-2">{r.usage}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
