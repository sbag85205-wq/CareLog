"use client";

import { CalendarCheck, PackagePlus, Presentation, Search } from "lucide-react";
import { useState } from "react";
import { CardHeading, Notice, PButton, PCard, SoftSheet } from "@/components/patient-ui/kit";
import type { DbSnapshot, SupabaseRepository } from "@/lib/repository/supabase";
import { CATEGORIES } from "@/lib/rx/categories";
import {
  activeItems,
  dotDate,
  filterItems,
  isDiscomfortTag,
  itemsOf,
  noteDate,
  prescriptionLabel,
  sortPrescriptions,
  tagGroup,
  usedTags,
  type RxFilter,
  type RxSnapshot,
} from "@/lib/rx/model";
import type { RxStore } from "@/lib/rx/store";
import { medicationsOf, questionsOf } from "@/lib/selectors";
import type { Patient } from "@/types";
import { IntakeCheck } from "./IntakeCheck";
import { VisitShow } from "./RxDetail";
import { CategoryPills, howToTake, KindPill, TagPills } from "./RxParts";

/**
 * FeelPill 홈 — "그때 먹었던 약, 나한테 어땠더라?"
 * 핵심 버튼 두 개(약 등록하기 · 내가 먹었던 약 찾기)를 크게, 나머지는 짧게.
 * 지금 먹는 약이 없어도 쓸모 있게: 예전 약 찾기·경험 기록이 중심.
 */
export function RxHome({
  snapshot,
  rx,
  rxStore,
  patient,
  repo,
  today,
  onRegister,
  onFind,
  onOpenRecord,
  onOpenItem,
  onBody,
  onVisit,
}: {
  snapshot: DbSnapshot;
  rx: RxSnapshot | null;
  rxStore: RxStore | null;
  patient: Patient;
  repo: SupabaseRepository;
  today: string;
  onRegister: () => void;
  onFind: (filter?: RxFilter) => void;
  onOpenRecord: (id: string) => void;
  onOpenItem: (id: string) => void;
  onBody: (tags?: string[]) => void;
  onVisit: () => void;
}) {
  const [showId, setShowId] = useState<string | null>(null);
  const ready = Boolean(rx?.available);
  const active = ready ? activeItems(rx!) : [];
  const manual = medicationsOf(snapshot, patient.id);
  const records = ready ? sortPrescriptions(rx!.prescriptions) : [];
  const recentItems = ready ? filterItems(rx!, {}).slice(0, 3) : [];
  const recentNotes = ready ? [...rx!.notes].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 2) : [];
  const latestRx = records.find((p) => p.kind === "prescription");
  const questions = questionsOf(snapshot, patient.id);
  const openQuestions = questions.filter((q) => !q.done).length;
  const shown = rx?.prescriptions.find((p) => p.id === showId);
  const usedCats = ready ? CATEGORIES.filter((c) => c.id !== "unclassified" && rx!.items.some((i) => i.categories.includes(c.id))).slice(0, 5) : [];
  const expTags = ready
    ? usedTags(rx!)
        .filter((t) => tagGroup(t) !== "note")
        .sort((a, b) => Number(isDiscomfortTag(b)) - Number(isDiscomfortTag(a)))
        .slice(0, 5)
    : [];

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] bg-sage-100 px-5 py-6 sm:px-8 sm:py-8" aria-labelledby="home-title">
        <p className="text-sm font-semibold text-sage-800">{patient.name} 님의 약 기록</p>
        <h1 id="home-title" className="mt-2 text-[1.85rem] leading-tight font-extrabold tracking-tight break-keep text-sage-900 sm:text-4xl">
          그때 먹었던 약,
          <br />
          나한테 어땠더라?
        </h1>
        <p className="mt-2 text-[1.05rem] break-keep text-sage-900">약 이름은 잊어도, 내 몸의 경험은 잊지 않도록.</p>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <PButton icon={PackagePlus} onClick={onRegister}>
            약 등록하기
          </PButton>
          <PButton variant="secondary" icon={Search} onClick={() => onFind()}>
            내가 먹었던 약 찾기
          </PButton>
        </div>
      </section>

      {rx && !rx.available && <Notice>{rx.message}</Notice>}

      {(usedCats.length > 0 || expTags.length > 0) && (
        <PCard aria-label="빠르게 다시 찾기" className="space-y-3 !p-4 sm:!p-5">
          {usedCats.length > 0 && (
            <div>
              <p className="mb-1.5 text-sm font-bold text-ink">약 종류로 찾기</p>
              <div className="flex flex-wrap gap-2">
                {usedCats.map((c) => (
                  <PButton key={c.id} size="sm" variant="soft" onClick={() => onFind({ category: c.id })}>
                    {c.label}
                  </PButton>
                ))}
              </div>
            </div>
          )}
          {expTags.length > 0 && (
            <div>
              <p className="mb-1.5 text-sm font-bold text-ink">경험으로 찾기</p>
              <div className="flex flex-wrap gap-2">
                {expTags.map((t) => (
                  <PButton key={t} size="sm" variant="secondary" onClick={() => onBody([t])}>
                    {t}
                  </PButton>
                ))}
              </div>
            </div>
          )}
        </PCard>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
        <div className="space-y-6">
          <section aria-label="지금 복용 중" className="space-y-3">
            <div className="flex items-end justify-between gap-2 px-1">
              <h2 className="text-xl font-bold text-ink">지금 복용 중</h2>
              {active.length > 0 && (
                <button
                  type="button"
                  onClick={() => onFind({ use: "current" })}
                  className="min-h-10 text-sm font-semibold text-sage-700 underline-offset-4 hover:underline"
                >
                  모두 보기 →
                </button>
              )}
            </div>
            {active.length === 0 && manual.length === 0 ? (
              <PCard tone="ivory">
                <p className="text-ink-soft">
                  지금 먹는 약이 없어도 괜찮아요. 예전에 먹었던 약을 등록하고 그때 느낀 점을 남겨 두면, 다음에 다시 찾을 수 있어요.
                </p>
              </PCard>
            ) : (
              <ul className="grid gap-2 md:grid-cols-2">
                {active.slice(0, 4).map(({ item, prescription }) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onOpenItem(item.id)}
                      className="w-full rounded-[1.25rem] border border-line bg-white p-4 text-left hover:border-sage-300"
                      aria-label={`복용 중: ${item.name}`}
                    >
                      <span className="block text-lg font-bold break-words text-ink">{item.name}</span>
                      <span className="block text-sm font-semibold text-sage-800">{howToTake(item)}</span>
                      <span className="block text-xs text-ink-soft">
                        {dotDate(prescription.prescribedOn)} {prescription.kind === "otc" ? "일반약" : `${prescription.department || ""} 처방`}
                      </span>
                    </button>
                  </li>
                ))}
                {manual.slice(0, Math.max(0, 4 - active.length)).map((m) => (
                  <li key={m.id} className="rounded-[1.25rem] border border-line bg-white p-4" aria-label={`복용 중: ${m.name}`}>
                    <p className="text-lg font-bold break-words text-ink">{m.name}</p>
                    <p className="text-sm font-semibold text-sage-800">{[m.dosage, m.schedule].filter(Boolean).join(" · ") || "복용 방법 미입력"}</p>
                    <p className="text-xs text-ink-soft">직접 추가한 약</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {ready && <IntakeCheck rx={rx!} store={rxStore} patientId={patient.id} today={today} />}

          {recentItems.length > 0 && (
            <section aria-label="최근 등록한 약" className="space-y-2">
              <h2 className="px-1 text-xl font-bold text-ink">최근 등록한 약</h2>
              <ul className="space-y-2">
                {recentItems.map(({ item, prescription }) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onOpenItem(item.id)}
                      className="w-full rounded-[1.25rem] border border-line bg-white p-4 text-left hover:border-sage-300"
                      aria-label={`최근 등록: ${item.name}`}
                    >
                      <span className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
                        <KindPill p={prescription} /> {dotDate(prescription.prescribedOn)}
                      </span>
                      <span className="mt-1 block font-bold text-ink">{item.name}</span>
                      <span className="mt-1 block">
                        <CategoryPills item={item} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="space-y-4" aria-label="최근 경험·다음 진료">
          <PCard>
            <CardHeading title="최근 기록한 경험" />
            {recentNotes.length === 0 ? (
              <p className="text-sm text-ink-soft">먹어 본 약의 느낌을 남기면 여기에 보여요.</p>
            ) : (
              <ul className="space-y-2">
                {recentNotes.map((n) => {
                  const p = rx!.prescriptions.find((x) => x.id === n.prescriptionId);
                  const name = rx!.items.find((i) => i.id === n.itemId)?.name ?? (p?.kind === "otc" ? "일반약 등록 전체" : "처방 전체");
                  return (
                    <li key={n.id}>
                      <button type="button" onClick={() => p && onOpenRecord(p.id)} className="w-full rounded-2xl bg-ivory p-3 text-left">
                        <span className="block text-xs text-ink-soft">
                          {dotDate(noteDate(n))} · {name}
                        </span>
                        <TagPills tags={n.tags} small />
                        {n.memo && <span className="mt-1 line-clamp-2 block text-sm text-ink">{n.memo}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <PButton size="sm" variant="ghost" className="mt-2" onClick={() => onBody()}>
              내 몸의 반응 모두 보기
            </PButton>
          </PCard>
          <PCard tone="tint">
            <CardHeading title="다음 진료 준비" sub={`물어볼 질문 ${openQuestions}개`} />
            {latestRx && <p className="mb-2 text-sm text-sage-900">최근 처방: {prescriptionLabel(latestRx, itemsOf(rx!, latestRx.id).length)}</p>}
            <div className="grid gap-2">
              {latestRx && (
                <PButton size="md" icon={Presentation} onClick={() => setShowId(latestRx.id)}>
                  진료 때 보여주기
                </PButton>
              )}
              <PButton size="md" variant="secondary" icon={CalendarCheck} onClick={onVisit}>
                진료 준비 열기
              </PButton>
            </div>
          </PCard>
        </aside>
      </div>

      <p className="px-1 text-xs text-ink-soft">FeelPill은 약을 추천하거나 효과·부작용을 판정하지 않아요. 내가 남긴 경험을 보관하고 다시 찾게 도와줘요.</p>

      <SoftSheet open={Boolean(shown)} title="진료 때 보여주기" onClose={() => setShowId(null)}>
        {shown && rx && <VisitShow p={shown} snapshot={rx} questions={questions} repo={repo} />}
      </SoftSheet>
    </div>
  );
}
