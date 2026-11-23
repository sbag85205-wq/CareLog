"use client";

import { Barcode, Box, ChevronLeft, Receipt, ScrollText, Search } from "lucide-react";
import { useRef, useState } from "react";
import { payloadToMedications, PrescriptionImport, type ImportPayload } from "@/components/patient-db/PrescriptionImport";
import { cn, PButton, PCard, SoftSheet } from "@/components/patient-ui/kit";
import type { DbSnapshot, SupabaseRepository } from "@/lib/repository/supabase";
import { activeItems, type RxSnapshot } from "@/lib/rx/model";
import type { RxStore } from "@/lib/rx/store";
import { medicationsOf } from "@/lib/selectors";
import type { Patient } from "@/types";
import { ProductImport, type ProductMode, type ProductPayload } from "./ProductImport";

export type RegisterMode = "choose" | "prescription" | ProductMode | "barcode";

const OPTIONS: { mode: RegisterMode; title: string; sub: string; icon: typeof Box }[] = [
  { mode: "prescription", title: "처방전 촬영·업로드", sub: "사진·PDF에서 처방일·진료과·약을 읽어 한 번에", icon: ScrollText },
  { mode: "box", title: "일반약 상자 촬영·업로드", sub: "상자의 제품명으로 식약처 제품 정보와 대조", icon: Box },
  { mode: "receipt", title: "약국 영수증 촬영·업로드", sub: "영수증에 적힌 제품명으로 후보 제안", icon: Receipt },
  { mode: "barcode", title: "바코드 스캔", sub: "준비 중 — 직접 검색으로 연결돼요", icon: Barcode },
  { mode: "search", title: "약 이름 직접 검색", sub: "기억나는 제품명 일부로 찾기", icon: Search },
];

const TITLE: Record<RegisterMode, string> = {
  choose: "약 등록하기",
  prescription: "처방전 등록",
  box: "일반약 상자로 등록",
  receipt: "약국 영수증으로 등록",
  search: "약 이름으로 찾기",
  barcode: "바코드 스캔",
};

/**
 * 약 등록하기 — 처방전 · 일반약 상자 · 약국 영수증 · 바코드(준비 중) · 직접 검색
 * 약 기록 구조가 없는 DB(로그인 버전, migration 미적용)에서는 예전처럼 내 약 목록에 등록
 */
export function RegisterSheet({
  open,
  initialMode = "choose",
  onClose,
  snapshot,
  rx,
  rxStore,
  repo,
  patient,
  demo,
  onSaved,
}: {
  open: boolean;
  initialMode?: RegisterMode;
  onClose: () => void;
  snapshot: DbSnapshot;
  rx: RxSnapshot | null;
  rxStore: RxStore | null;
  repo: SupabaseRepository;
  patient: Patient;
  demo?: boolean;
  /** 저장 후 (기록 ID — 예전 방식으로 저장했으면 null) */
  onSaved: (recordId: string | null, message: string) => void;
}) {
  const [mode, setMode] = useState<RegisterMode>(initialMode);
  const [query, setQuery] = useState("");
  const [n, setN] = useState(0);
  const rxReady = Boolean(rx?.available && rxStore);
  const meds = medicationsOf(snapshot, patient.id);
  const existing = [
    ...meds.map((m) => ({ name: m.name, externalItemSeq: m.externalItemSeq })),
    ...(rx?.available ? activeItems(rx).map(({ item }) => ({ name: item.name, externalItemSeq: item.externalItemSeq })) : []),
  ];
  const savedId = useRef<string | null>(null);

  async function savePrescription(payload: ImportPayload) {
    if (rxReady && rxStore) {
      savedId.current = await rxStore.createPrescription({
        requestId: payload.requestId,
        patientId: patient.id,
        kind: "prescription",
        source: "prescription",
        ...payload.meta,
        items: payload.items,
      });
    } else {
      await repo.addMedications(patient.id, payloadToMedications(payload));
    }
  }
  async function saveProduct(p: ProductPayload) {
    if (rxReady && rxStore) {
      savedId.current = await rxStore.createPrescription({
        requestId: p.requestId,
        patientId: patient.id,
        kind: "otc",
        source: p.source,
        prescribedOn: p.date,
        department: "",
        clinic: p.shop,
        guidance: "",
        items: p.items,
      });
    } else {
      await repo.addMedications(
        patient.id,
        p.items.map((i) => ({
          name: i.name,
          dosage: i.strength,
          schedule: "",
          caution: [i.ingredients && `성분 ${i.ingredients}`, "일반약 등록"].filter(Boolean).join(" · ").slice(0, 500),
          externalItemSeq: i.externalItemSeq ?? null,
          visibleToGuardian: false,
        })),
      );
    }
  }

  const go = (m: RegisterMode, q = "") => {
    setQuery(q);
    setMode(m);
    setN((x) => x + 1);
  };

  return (
    <SoftSheet open={open} title={TITLE[mode]} onClose={onClose}>
      {mode !== "choose" && initialMode === "choose" && (
        <button
          type="button"
          onClick={() => go("choose")}
          className="-mt-2 mb-2 inline-flex min-h-11 items-center gap-0.5 rounded-xl px-1 text-ink-soft hover:text-ink"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden /> 등록 방법 다시 고르기
        </button>
      )}
      {rx && !rx.available && mode !== "choose" && <p className="mb-3 rounded-2xl bg-ivory-deep px-4 py-3 text-sm text-ink-soft">{rx.message}</p>}
      {mode === "choose" && (
        <div className="space-y-3">
          <p className="px-1 text-ink-soft">어떤 것으로 등록할까요? 어려운 약 이름을 직접 입력하지 않아도 돼요. 저장하기 전에 모두 확인할 수 있어요.</p>
          <ul className="grid gap-2" aria-label="등록 방법">
            {OPTIONS.map(({ mode: m, title, sub, icon: Icon }) => (
              <li key={m}>
                <button
                  type="button"
                  onClick={() => go(m)}
                  className={cn(
                    "flex min-h-16 w-full items-center gap-3 rounded-[1.25rem] border bg-white px-4 py-3 text-left transition hover:border-brand-300",
                    m === "barcode" ? "border-dashed border-line opacity-80" : "border-line",
                  )}
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-100 text-brand-800">
                    <Icon className="h-6 w-6" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[1.05rem] font-bold text-ink">{title}</span>
                    <span className="block text-sm text-ink-soft">{sub}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="px-1 text-xs text-ink-soft">
            처방·구매·실제 복용은 따로 기록돼요. 등록했다고 먹은 것으로 처리하지 않아요. 알약 모양만 찍어서 찾는 기능은 없어요.
          </p>
        </div>
      )}
      {mode === "prescription" && (
        <PrescriptionImport
          key={n}
          existing={existing}
          demo={demo}
          requireDate={rxReady}
          save={savePrescription}
          onDone={(count) =>
            onSaved(
              savedId.current,
              rxReady ? `처방 1건 · 약 ${count}개를 등록했어요. 먹어 본 뒤 느낀 점을 남겨 보세요.` : `처방전에서 약 ${count}개를 내 약 목록에 등록했어요.`,
            )
          }
        />
      )}
      {(mode === "box" || mode === "receipt" || mode === "search") && (
        <ProductImport
          key={`${mode}-${n}`}
          mode={mode}
          demo={demo}
          initialQuery={query}
          save={saveProduct}
          onSwitchToSearch={(q) => go("search", q)}
          onDone={(count) =>
            onSaved(savedId.current, rxReady ? `일반약 ${count}개를 등록했어요. 복용으로 처리하지 않았어요.` : `일반약 ${count}개를 내 약 목록에 등록했어요.`)
          }
        />
      )}
      {mode === "barcode" && (
        <PCard className="space-y-3">
          <p className="font-bold text-ink">바코드 스캔은 아직 준비 중이에요</p>
          <p className="text-sm text-ink-soft">
            지금 연결된 식약처 공개 정보로는 상자 바코드를 제품 하나에 확실히 연결하는 방법을 검증하지 못했어요. 제품을 추측해서 등록하지 않도록, 제품명으로
            직접 찾아 주세요.
          </p>
          <PButton className="w-full" icon={Search} onClick={() => go("search")}>
            약 이름으로 찾기
          </PButton>
        </PCard>
      )}
    </SoftSheet>
  );
}
