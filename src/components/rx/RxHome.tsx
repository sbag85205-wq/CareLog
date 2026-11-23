"use client";

import { ArrowRight, CalendarCheck, ClipboardList, NotebookPen, Plus, Presentation, Search } from "lucide-react";
import { useState } from "react";
import { Notice, PButton, PCard, SoftSheet } from "@/components/patient-ui/kit";
import { CloudMascot, NotebookIcon } from "@/components/patient-ui/illustrations";
import type { DbSnapshot, SupabaseRepository } from "@/lib/repository/supabase";
import { BRAND } from "@/lib/brand";
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
 * CareLog 홈 — "그때 먹었던 약, 나한테 어땠더라?" (디자인 v2 · Soft Glass)
 * Hero(유리 + 기록 노트 3D + 몽글) → 지금 복용 중 · 최근 복용 경험 · 오늘 복용 체크(민트 강조) → 다음 진료 준비(라벤더)
 * 핵심 버튼 두 개(약 등록하기 · 내가 먹었던 약 찾기)를 크게, 나머지는 짧게.
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
  const currentCount = active.length + manual.length;
  const lastNote = ready ? [...rx!.notes].sort((a, b) => noteDate(b).localeCompare(noteDate(a)))[0] : undefined;

  return (
    <div className="space-y-6">
      {/* ───────── Hero (유리 효과·3D 소품은 여기에만) ───────── */}
      <section
        className="bg-hero relative overflow-hidden rounded-[1.75rem] border border-white/90 px-5 pt-6 pb-6 shadow-soft sm:px-10 sm:pt-10 sm:pb-9"
        aria-labelledby="home-title"
      >
        <div className="md:grid md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-6">
        <div className="min-w-0 max-w-xl">
          <p className="glass inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold text-brand-800">
            <NotebookPen className="h-4 w-4 shrink-0 text-sage" aria-hidden />
            {patient.name} 님의 복약 경험 기록장
          </p>
          <h1 id="home-title" className="mt-4 text-[1.75rem] leading-[1.22] font-extrabold tracking-tight break-keep text-ink sm:text-[2.6rem]">
            그때 먹었던 약,
            <br />
            <span className="text-brand-700">나한테 어땠더라?</span>
          </h1>
          {/* 모바일: 설명 옆에 기록 노트 + 몽글 (제목·버튼을 가리지 않음) */}
          <div className="mt-3 flex items-end justify-between gap-3">
            <p className="min-w-0 text-[1.05rem] break-keep text-ink-soft">{BRAND.sub}</p>
            <HeroArt compact className="md:hidden" />
          </div>
          <div className="mt-6 grid gap-2.5 sm:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <PButton icon={Plus} onClick={onRegister}>
              약 등록하기
            </PButton>
            <PButton variant="secondary" icon={Search} className="!border-white bg-white/80" onClick={() => onFind()}>
              내가 먹었던 약 찾기
            </PButton>
          </div>
          {ready && (
            <p className="glass mt-6 inline-flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[0.875rem] px-4 py-2.5 text-sm text-ink-soft">
              <span className="font-semibold text-ink">나의 기록장</span>
              <span className="text-base font-bold text-ink">
                약 {rx!.items.length}개 · 경험 {rx!.notes.length}건
              </span>
              {lastNote && <span>마지막 기록 {dotDate(noteDate(lastNote))}</span>}
            </p>
          )}
        </div>
        {/* PC·태블릿: 오른쪽 칸 (본문과 겹치지 않게 그리드로 배치) */}
        <HeroArt className="hidden md:flex md:pr-2 lg:pr-8" />
        </div>
      </section>

      {rx && !rx.available && <Notice>{rx.message}</Notice>}

      {(usedCats.length > 0 || expTags.length > 0) && (
        <PCard aria-label="빠르게 다시 찾기" className="flex flex-col gap-4 !p-4 sm:!p-5 lg:flex-row lg:gap-8">
          {usedCats.length > 0 && (
            <div className="min-w-0">
              <p className="mb-2 text-sm font-bold text-ink">약 종류로 찾기</p>
              <div className="flex flex-wrap gap-2">
                {usedCats.map((c) => (
                  <PButton key={c.id} size="sm" variant="soft" className="!rounded-full" onClick={() => onFind({ category: c.id })}>
                    {c.label}
                  </PButton>
                ))}
              </div>
            </div>
          )}
          {expTags.length > 0 && (
            <div className="min-w-0">
              <p className="mb-2 text-sm font-bold text-ink">경험으로 찾기</p>
              <div className="flex flex-wrap gap-2">
                {expTags.map((t) => (
                  <PButton key={t} size="sm" variant="secondary" className="!rounded-full" onClick={() => onBody([t])}>
                    {t}
                  </PButton>
                ))}
              </div>
            </div>
          )}
        </PCard>
      )}

      {/* ───────── 3열 카드 (PC) / 1열 (모바일) ───────── */}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3 xl:items-start">
        <PCard aria-label="지금 복용 중">
          <SectionHead
            title={
              <>
                지금 복용 중인 약 {currentCount > 0 && <span className="text-brand-700">{currentCount}</span>}
              </>
            }
            action={active.length > 0 ? { label: "전체 보기", onClick: () => onFind({ use: "current" }) } : undefined}
          />
          {active.length === 0 && manual.length === 0 ? (
            <p className="rounded-[0.875rem] bg-ivory p-4 text-sm text-ink-soft">
              지금 먹는 약이 없어도 괜찮아요. 예전에 먹었던 약을 등록하고 그때 느낀 점을 남겨 두면, 다음에 다시 찾을 수 있어요.
            </p>
          ) : (
            <ul className="divide-y divide-line/80">
              {active.slice(0, 4).map(({ item, prescription }) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onOpenItem(item.id)}
                    className="flex w-full items-start justify-between gap-3 rounded-xl py-3 text-left transition hover:bg-ivory/80"
                    aria-label={`복용 중: ${item.name}`}
                  >
                    <span className="min-w-0">
                      <span className="block font-bold break-words text-ink">{item.name}</span>
                      <span className="block text-sm text-ink-soft">{howToTake(item)}</span>
                      <span className="block text-xs text-ink-soft/80">
                        {dotDate(prescription.prescribedOn)} {prescription.kind === "otc" ? "일반약" : `${prescription.department || ""} 처방`}
                      </span>
                    </span>
                    <KindPill p={prescription} />
                  </button>
                </li>
              ))}
              {manual.slice(0, Math.max(0, 4 - active.length)).map((m) => (
                <li key={m.id} className="py-3" aria-label={`복용 중: ${m.name}`}>
                  <p className="font-bold break-words text-ink">{m.name}</p>
                  <p className="text-sm text-ink-soft">{[m.dosage, m.schedule].filter(Boolean).join(" · ") || "복용 방법 미입력"}</p>
                  <p className="text-xs text-ink-soft/80">직접 추가한 약</p>
                </li>
              ))}
            </ul>
          )}
          {active.length + manual.length > 4 && <p className="mt-2 text-sm text-ink-soft">외 {active.length + manual.length - 4}개</p>}
        </PCard>

        <PCard aria-label="최근 기록한 경험">
          <SectionHead title="최근 복용 경험" action={{ label: "모두 보기", onClick: () => onBody() }} />
          {recentNotes.length === 0 ? (
            <p className="rounded-[0.875rem] bg-ivory p-4 text-sm text-ink-soft">먹어 본 약의 느낌을 남기면 여기에 보여요.</p>
          ) : (
            <ul className="divide-y divide-line/80">
              {recentNotes.map((n) => {
                const p = rx!.prescriptions.find((x) => x.id === n.prescriptionId);
                const name = rx!.items.find((i) => i.id === n.itemId)?.name ?? (p?.kind === "otc" ? "일반약 등록 전체" : "처방 전체");
                return (
                  <li key={n.id}>
                    <button type="button" onClick={() => p && onOpenRecord(p.id)} className="w-full rounded-xl py-3 text-left transition hover:bg-ivory/80">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="min-w-0 font-bold break-words text-ink">{name}</span>
                        <span className="shrink-0 text-xs text-ink-soft">{dotDate(noteDate(n))}</span>
                      </span>
                      <span className="mt-1.5 block">
                        <TagPills tags={n.tags} small />
                      </span>
                      {n.memo && (
                        <span className="mt-2 line-clamp-2 block rounded-[0.75rem] border border-line/70 bg-paper px-3 py-2 text-sm text-ink">{n.memo}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </PCard>

        <div className="space-y-5 md:col-span-2 xl:col-span-1">
          {ready && <IntakeCheck rx={rx!} store={rxStore} patientId={patient.id} today={today} />}
        </div>
      </div>

      {recentItems.length > 0 && (
        <PCard aria-label="최근 등록한 약">
          <SectionHead title="최근 등록한 약" />
          <ul className="grid gap-2 md:grid-cols-3">
            {recentItems.map(({ item, prescription }) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onOpenItem(item.id)}
                  className="h-full w-full rounded-[0.875rem] border border-line/80 bg-ivory/60 p-3.5 text-left transition hover:border-brand-200 hover:bg-white"
                  aria-label={`최근 등록: ${item.name}`}
                >
                  <span className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
                    <KindPill p={prescription} /> {dotDate(prescription.prescribedOn)}
                  </span>
                  <span className="mt-1.5 block font-bold text-ink">{item.name}</span>
                  <span className="mt-1.5 block">
                    <CategoryPills item={item} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </PCard>
      )}

      {/* ───────── 다음 진료 준비 (라벤더) ───────── */}
      <PCard tone="lavender" aria-label="다음 진료 준비" className="!p-4 sm:!p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[0.875rem] bg-white text-lavender-700 shadow-soft" aria-hidden>
            <ClipboardList className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-ink">다음 진료 준비</h2>
            <p className="text-sm text-ink-soft">
              복용약 · 불편 경험 · 물어볼 질문 {openQuestions}개를 한 곳에서 정리해요
              {latestRx && <span className="block sm:inline"> · 최근 처방 {prescriptionLabel(latestRx, itemsOf(rx!, latestRx.id).length)}</span>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {latestRx && (
              <PButton size="md" variant="secondary" icon={Presentation} className="!border-white" onClick={() => setShowId(latestRx.id)}>
                진료 때 보여주기
              </PButton>
            )}
            <PButton size="md" icon={CalendarCheck} arrow onClick={onVisit}>
              진료 준비 열기
            </PButton>
          </div>
        </div>
      </PCard>

      <p className="px-1 text-xs text-ink-soft">{BRAND.name}은 약을 추천하거나 효과·부작용을 판정하지 않아요. 내가 남긴 경험을 보관하고 다시 찾게 도와줘요.</p>

      <SoftSheet open={Boolean(shown)} title="진료 때 보여주기" onClose={() => setShowId(null)}>
        {shown && rx && <VisitShow p={shown} snapshot={rx} questions={questions} repo={repo} />}
      </SoftSheet>
    </div>
  );
}

/**
 * 홈 Hero 소품: 기록 노트 3D + 기본 몽글 (몽글이 노트 앞, 왼쪽 아래)
 * 몽글 크기 — 모바일 50~62px (320 / 375 / 430), PC 76~88px
 */
function HeroArt({ compact, className }: { compact?: boolean; className?: string }) {
  return (
    <div className={`pointer-events-none flex shrink-0 items-end ${className ?? ""}`} aria-hidden>
      <CloudMascot
        className={
          compact
            ? "relative z-10 -mr-3 mb-0.5 w-[50px] min-[375px]:w-[56px] min-[430px]:w-[62px]"
            : "relative z-10 -mr-10 mb-2 w-[76px] lg:-mr-14 lg:w-[88px]"
        }
      />
      <NotebookIcon className={compact ? "w-[58px] min-[375px]:w-[66px] min-[430px]:w-[74px]" : "w-40 lg:w-52"} />
    </div>
  );
}

/** 카드 제목 + 오른쪽 링크 (전체 보기 · 모두 보기) */
function SectionHead({ title, action }: { title: React.ReactNode; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h2 className="text-lg font-bold text-ink sm:text-xl">{title}</h2>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-lg px-1 text-sm font-semibold text-brand-700 hover:text-brand-800"
        >
          {action.label}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
}
