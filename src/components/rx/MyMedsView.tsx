"use client";

import { ScrollText } from "lucide-react";
import { useState } from "react";
import { MedicationsView } from "@/components/patient-db/MedicationsView";
import { payloadToMedications, PrescriptionImport, type ImportPayload } from "@/components/patient-db/PrescriptionImport";
import { PageTitle } from "@/components/patient-ui/AppShell";
import { Alert, Notice, PButton, PCard, Segmented, SoftSheet } from "@/components/patient-ui/kit";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import type { DbSnapshot, SupabaseRepository } from "@/lib/repository/supabase";
import { activeItems, type RxSnapshot } from "@/lib/rx/model";
import type { RxStore } from "@/lib/rx/store";
import { medicationsOf } from "@/lib/selectors";
import type { Patient } from "@/types";
import { ActiveItemCard } from "./RxParts";
import { RxHistory } from "./RxHistory";

export type MedsView = "current" | "history";

/** 내 약 — 지금 복용 중 · 처방 이력 + 처방전 등록 */
export function MyMedsView({
  snapshot,
  rx,
  rxStore,
  patient,
  repo,
  today,
  demo,
  initialView = "current",
  initialSelected = null,
  startImport = false,
}: {
  snapshot: DbSnapshot;
  rx: RxSnapshot | null;
  rxStore: RxStore | null;
  patient: Patient;
  repo: SupabaseRepository;
  today: string;
  demo?: boolean;
  initialView?: MedsView;
  initialSelected?: string | null;
  startImport?: boolean;
}) {
  const [view, setView] = useState<MedsView>(initialView);
  const [selected, setSelected] = useState<string | null>(initialSelected);
  const [importing, setImporting] = useState(startImport);
  const [notice, setNotice] = useState<string | null>(null);
  const stop = useAsyncAction();
  const meds = medicationsOf(snapshot, patient.id);
  const rxReady = Boolean(rx?.available && rxStore);
  const active = rx?.available ? activeItems(rx) : [];

  const existing = [
    ...meds.map((m) => ({ name: m.name, externalItemSeq: m.externalItemSeq })),
    ...active.map(({ item }) => ({
      name: item.name,
      externalItemSeq: item.externalItemSeq,
    })),
  ];

  async function save(payload: ImportPayload) {
    if (rxReady && rxStore) {
      const id = await rxStore.createPrescription({
        requestId: payload.requestId,
        patientId: patient.id,
        ...payload.meta,
        items: payload.items,
      });
      setSelected(id);
    } else {
      await repo.addMedications(patient.id, payloadToMedications(payload)); // 처방 이력 구조가 없는 DB: 예전처럼 내 약 목록에
    }
  }

  return (
    <div className="space-y-5">
      <PageTitle
        title="내 약"
        sub="지금 먹는 약과 지난 처방을 날짜별로 봐요."
        action={
          <PButton
            size="md"
            icon={ScrollText}
            onClick={() => {
              setNotice(null);
              setImporting(true);
            }}
          >
            {demo ? "예제 처방전 불러오기" : "처방전 등록"}
          </PButton>
        }
      />
      {rx && !rx.available && <Notice>{rx.message}</Notice>}
      <Notice>{notice}</Notice>
      <div className="max-w-md">
        <Segmented
          ariaLabel="내 약 보기"
          items={[
            { value: "current" as MedsView, label: "지금 복용 중" },
            { value: "history" as MedsView, label: "처방 이력" },
          ]}
          value={view}
          onChange={(v) => {
            setView(v);
            setSelected(null);
          }}
        />
      </div>

      {view === "current" ? (
        <div className="space-y-6">
          <section aria-label="지금 복용 중" className="space-y-3">
            {rx?.available && active.length === 0 && (
              <PCard tone="ivory">
                <p className="text-ink-soft">처방에서 ‘지금 복용 중’으로 표시한 약이 없어요.</p>
              </PCard>
            )}
            <div className="grid gap-3 lg:grid-cols-2">
              {active.map(({ item, prescription }) => (
                <ActiveItemCard
                  key={item.id}
                  item={item}
                  prescription={prescription}
                  today={today}
                  pending={stop.pending}
                  onOpen={() => {
                    setSelected(prescription.id);
                    setView("history");
                    window.scrollTo({ top: 0 });
                  }}
                  onStop={rxStore ? () => void stop.run(() => rxStore.setItemActive(item.id, false)) : undefined}
                />
              ))}
            </div>
            <Alert>{stop.error}</Alert>
          </section>
          <MedicationsView
            medications={meds}
            patientId={patient.id}
            repo={repo}
            editable
            embedded
            title="직접 추가한 약"
            sub="처방전 없이 따로 적어 둔 약이에요."
          />
        </div>
      ) : rx?.available ? (
        <RxHistory key={selected ?? "none"} snapshot={rx} store={rxStore} repo={repo} questions={snapshot.visitQuestions} initialSelected={selected} />
      ) : (
        <PCard tone="ivory">
          <p className="text-ink-soft">{rx?.message ?? "처방 이력을 불러오는 중…"}</p>
        </PCard>
      )}

      <SoftSheet open={importing} title={demo ? "예제 처방전 불러오기" : "처방전 등록"} onClose={() => setImporting(false)}>
        {importing && (
          <PrescriptionImport
            existing={existing}
            demo={demo}
            requireDate={rxReady}
            save={save}
            onDone={(n) => {
              setNotice(
                rxReady ? `처방 1건 · 약 ${n}개를 등록했어요. 처방 이력에서 복용 경험을 남겨 보세요.` : `처방전에서 약 ${n}개를 내 약 목록에 등록했어요.`,
              );
              if (rxReady) setView("history");
            }}
          />
        )}
      </SoftSheet>
    </div>
  );
}
