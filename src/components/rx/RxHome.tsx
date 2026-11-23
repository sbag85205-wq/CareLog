"use client";

import { ClipboardPen, Presentation, ScrollText } from "lucide-react";
import { useState } from "react";
import { PatientConditionForm } from "@/components/patient-db/PatientConditionForm";
import { CardHeading, Notice, PButton, PCard, SoftSheet } from "@/components/patient-ui/kit";
import { formatLongKoreanDate } from "@/lib/date";
import type { DbSnapshot, SupabaseRepository } from "@/lib/repository/supabase";
import { activeItems, itemsOf, prescriptionLabel, sortPrescriptions, type RxSnapshot } from "@/lib/rx/model";
import { medicationsOf, questionsOf, recordsOf } from "@/lib/selectors";
import type { Patient } from "@/types";
import { VisitShow } from "./RxDetail";
import { ActiveItemCard } from "./RxParts";

/**
 * 새 환자 홈 — "지금 복용 중" 중심
 * (통원·입원 전환·식사·생활 요청은 이번 버전 홈에서 제외 — 코드와 기록은 보존)
 */
export function RxHome({
  snapshot,
  rx,
  patient,
  repo,
  today,
  demo,
  goMeds,
  goImport,
  goRecords,
}: {
  snapshot: DbSnapshot;
  rx: RxSnapshot | null;
  patient: Patient;
  repo: SupabaseRepository;
  today: string;
  demo?: boolean;
  goMeds: (prescriptionId?: string) => void;
  goImport: () => void;
  goRecords: () => void;
}) {
  const [conditionOpen, setConditionOpen] = useState(false);
  const [showId, setShowId] = useState<string | null>(null);
  const active = rx?.available ? activeItems(rx) : [];
  const manual = medicationsOf(snapshot, patient.id);
  const latest = rx?.available ? sortPrescriptions(rx.prescriptions)[0] : undefined;
  const questions = questionsOf(snapshot, patient.id);
  const openQuestions = questions.filter((q) => !q.done).length;
  const todayRecord = recordsOf(snapshot, patient.id).find((r) => r.date === today);
  const shown = rx?.prescriptions.find((p) => p.id === showId);

  return (
    <div className="space-y-6">
      <section>
        <p className="text-ink-soft">{formatLongKoreanDate(today)}</p>
        <h1 className="mt-2 text-[1.75rem] leading-tight font-extrabold tracking-tight break-keep text-ink sm:text-3xl">{patient.name} 님, 안녕하세요.</h1>
        <p className="mt-1.5 text-ink-soft">지난 처방과 약을 먹고 느낀 점을 남겨, 다음 진료에서 바로 보여 주세요.</p>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <section aria-label="지금 복용 중" className="space-y-3">
          <div className="flex items-end justify-between gap-2 px-1">
            <h2 className="text-xl font-bold text-ink">지금 복용 중</h2>
            <button type="button" onClick={() => goMeds()} className="text-sm font-semibold text-sage-700 underline-offset-4 hover:underline">
              내 약 전체 →
            </button>
          </div>
          {rx && !rx.available && <Notice>{rx.message}</Notice>}
          {active.length === 0 && manual.length === 0 ? (
            <PCard tone="ivory">
              <p className="text-ink-soft">지금 복용 중인 약이 없어요. 처방전을 등록하면 여기에 모아 보여 드려요.</p>
            </PCard>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {active.map(({ item, prescription }) => (
                <ActiveItemCard key={item.id} item={item} prescription={prescription} today={today} onOpen={() => goMeds(prescription.id)} />
              ))}
              {manual.slice(0, 4).map((m) => (
                <article key={m.id} className="rounded-[1.5rem] border border-line bg-white p-4 sm:p-5" aria-label={`복용 중: ${m.name}`}>
                  <p className="text-lg font-bold break-words text-ink">{m.name}</p>
                  <p className="mt-1 font-semibold text-sage-800">{[m.dosage, m.schedule].filter(Boolean).join(" · ") || "복용 방법 미입력"}</p>
                  <p className="mt-0.5 text-xs text-ink-soft">직접 추가한 약</p>
                </article>
              ))}
            </div>
          )}
          <PButton className="w-full sm:w-auto" icon={ScrollText} onClick={goImport}>
            {demo ? "예제 처방전 불러오기" : "처방전 등록"}
          </PButton>
        </section>

        <aside className="space-y-4" aria-label="다음 진료·건강 기록">
          <PCard tone="tint">
            <CardHeading title="다음 진료" sub={`물어볼 질문 ${openQuestions}개`} />
            {latest ? (
              <>
                <p className="text-sm text-sage-900">최근 처방: {prescriptionLabel(latest, itemsOf(rx!, latest.id).length)}</p>
                <PButton size="md" className="mt-3 w-full" icon={Presentation} onClick={() => setShowId(latest.id)}>
                  진료 때 보여주기
                </PButton>
              </>
            ) : (
              <p className="text-sm text-sage-900">처방을 등록하면 진료 때 한 화면으로 보여 줄 수 있어요.</p>
            )}
          </PCard>
          <PCard>
            <CardHeading title="건강 기록" sub={todayRecord ? "오늘 컨디션을 기록했어요." : "필요할 때 컨디션을 기록해요."} />
            <div className="grid gap-2">
              <PButton size="md" variant="secondary" icon={ClipboardPen} onClick={() => setConditionOpen(true)}>
                {todayRecord ? "오늘 기록 수정" : "오늘 컨디션 기록"}
              </PButton>
              <PButton size="md" variant="ghost" onClick={goRecords}>
                기록 보기
              </PButton>
            </div>
          </PCard>
        </aside>
      </div>

      <SoftSheet open={conditionOpen} title="오늘 컨디션 기록" onClose={() => setConditionOpen(false)}>
        {conditionOpen && (
          <PatientConditionForm
            key={todayRecord?.updatedAt ?? "new"}
            patientId={patient.id}
            date={today}
            mode={patient.careMode}
            existing={todayRecord}
            onSaved={() => setConditionOpen(false)}
          />
        )}
      </SoftSheet>
      <SoftSheet open={Boolean(shown)} title="진료 때 보여주기" onClose={() => setShowId(null)}>
        {shown && rx && <VisitShow p={shown} snapshot={rx} questions={questions} repo={repo} />}
      </SoftSheet>
    </div>
  );
}
