"use client";

import { Printer } from "lucide-react";
import { PButton } from "@/components/patient-ui/kit";
import {
  activeItems,
  dotDate,
  experienceSentence,
  howToTake,
  isDiscomfortTag,
  itemsOf,
  noteDate,
  prescriptionLabel,
  sortPrescriptions,
  type RxSnapshot,
} from "@/lib/rx/model";
import type { Patient, VisitQuestion } from "@/types";
import { SOURCE_TEXT } from "./RxParts";

/**
 * 진료용 요약 — 휴대폰 화면으로 보여 주거나 인쇄·PDF로 저장 (브라우저 인쇄 기능)
 * 사용자가 직접 보여 주는 자료이며 병원 시스템으로 전송하지 않음.
 */
export function VisitSummary({ rx, patient, questions, today }: { rx: RxSnapshot; patient: Patient; questions: VisitQuestion[]; today: string }) {
  const active = activeItems(rx);
  const history = sortPrescriptions(rx.prescriptions)
    .filter((p) => p.kind === "prescription")
    .slice(0, 6);
  const discomfort = [...rx.notes]
    .filter((n) => n.tags.some(isDiscomfortTag))
    .sort((a, b) => noteDate(b).localeCompare(noteDate(a)))
    .slice(0, 8);
  const open = questions.filter((q) => !q.done);
  return (
    <div className="space-y-4">
      <div className="print-area space-y-5 rounded-2xl bg-white p-5 text-[0.95rem] text-ink" aria-label="진료용 요약">
        <header className="border-b border-line pb-3">
          <p className="text-xs text-ink-soft">FeelPill(가칭) 진료용 요약 · {dotDate(today)} 작성 · 사용자가 직접 남긴 기록</p>
          <h3 className="text-xl font-extrabold">{patient.name}의 약 복용 기록</h3>
        </header>

        <section>
          <h4 className="mb-1 font-bold">현재 복용 중이라고 기록한 약 ({active.length})</h4>
          {active.length === 0 ? (
            <p className="text-ink-soft">없음</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-ink-soft">
                <tr>
                  <th className="py-1 pr-2 font-semibold">제품명 · 함량</th>
                  <th className="py-1 pr-2 font-semibold">성분</th>
                  <th className="py-1 font-semibold">복용 방법 · 기간 (사용자 기록)</th>
                </tr>
              </thead>
              <tbody>
                {active.map(({ item: i, prescription: p }) => (
                  <tr key={i.id} className="border-t border-line align-top">
                    <td className="py-1.5 pr-2 font-semibold">
                      {i.name}
                      {i.strength && !i.name.includes(i.strength) && ` ${i.strength}`}
                      <span className="block text-xs font-normal text-ink-soft">
                        {dotDate(p.prescribedOn)} {p.kind === "otc" ? "일반약" : p.department || "처방"}
                      </span>
                    </td>
                    <td className="py-1.5 pr-2">{i.ingredients || "—"}</td>
                    <td className="py-1.5">
                      {howToTake(i)}
                      {i.duration && ` · ${i.duration}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section>
          <h4 className="mb-1 font-bold">이전 처방 이력</h4>
          {history.length === 0 ? (
            <p className="text-ink-soft">없음</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {history.map((p) => (
                <li key={p.id}>
                  <span className="font-semibold">{prescriptionLabel(p, itemsOf(rx, p.id).length)}</span>
                  {p.clinic && ` · ${p.clinic}`} —{" "}
                  {itemsOf(rx, p.id)
                    .map((i) => i.name)
                    .join(", ")}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h4 className="mb-1 font-bold">기억해 둔 불편 경험</h4>
          <p className="mb-1 text-xs text-ink-soft">출처: {SOURCE_TEXT.user} — 원인을 판정한 것이 아니에요.</p>
          {discomfort.length === 0 ? (
            <p className="text-ink-soft">없음</p>
          ) : (
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {discomfort.map((n) => {
                const p = rx.prescriptions.find((x) => x.id === n.prescriptionId);
                if (!p) return null;
                return <li key={n.id}>{experienceSentence(p, n, rx.items.find((i) => i.id === n.itemId)?.name)}</li>;
              })}
            </ul>
          )}
        </section>

        <section>
          <h4 className="mb-1 font-bold">다음 진료 때 물어볼 질문</h4>
          {open.length === 0 ? (
            <p className="text-ink-soft">없음</p>
          ) : (
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              {open.map((q) => (
                <li key={q.id}>{q.text}</li>
              ))}
            </ol>
          )}
        </section>
        <p className="border-t border-line pt-2 text-xs text-ink-soft">
          이 문서는 사용자가 직접 보여 주는 기록이며 병원 시스템으로 전송되지 않았어요. 의학적 판단은 의료진과 상의하세요.
        </p>
      </div>
      <PButton className="w-full" icon={Printer} onClick={() => window.print()}>
        인쇄 또는 PDF로 저장
      </PButton>
      <p className="px-1 text-xs text-ink-soft">인쇄 창에서 ‘PDF로 저장’을 고르면 파일로 남길 수 있어요.</p>
    </div>
  );
}
