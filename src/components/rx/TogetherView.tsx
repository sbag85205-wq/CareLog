"use client";

import { ChevronLeft, ChevronRight, Eye, Share2, UserMinus } from "lucide-react";
import { useState } from "react";
import { ShareView } from "@/components/patient-db/ShareView";
import { PageTitle } from "@/components/patient-ui/AppShell";
import { Alert, CardHeading, ChipGroup, cn, Notice, PButton, PCard, StatusPill, StatusSteps } from "@/components/patient-ui/kit";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { formatDateTime } from "@/lib/date";
import type { DbSnapshot, Grant, SupabaseRepository } from "@/lib/repository/supabase";
import {
  buildSharedRecord,
  DEFAULT_SHARE_FIELDS,
  itemsOf,
  prescriptionLabel,
  RELATION_LABEL,
  SHARE_FIELD_LABEL,
  shareActive,
  sortPrescriptions,
  type Relation,
  type RxSnapshot,
  type ShareField,
} from "@/lib/rx/model";
import type { RxStore } from "@/lib/rx/store";
import { SharedRecordCard } from "./SharedRecords";

const PERIODS: { value: string; label: string; days: number | null }[] = [
  { value: "7", label: "7일", days: 7 },
  { value: "30", label: "30일", days: 30 },
  { value: "90", label: "90일", days: 90 },
  { value: "none", label: "멈출 때까지", days: null },
];
const toggle = <T,>(list: T[], t: T) => (list.includes(t) ? list.filter((x) => x !== t) : [...list, t]);
const STEPS = [
  { key: "1", label: "① 기록" },
  { key: "2", label: "② 사람" },
  { key: "3", label: "③ 항목·기간" },
  { key: "4", label: "④ 확인·공유" },
];

/** 공유 상대 이름: 데모 사용자 이름 → 초대 이메일 → '공유 상대' */
export function personName(snapshot: DbSnapshot, g: Grant): string {
  return snapshot.users.find((u) => u.id === g.granteeId)?.name ?? snapshot.invitations.find((i) => i.id === g.invitationId)?.email ?? "공유 상대";
}

/**
 * 함께 보기 — 고른 기록 1건을, 고른 사람에게, 고른 항목만, 정한 기간 동안
 * 기록은 기본 비공개(처방약·진료 정보 포함). 공유받은 사람은 읽기만 가능. 언제든 멈춤.
 */
export function TogetherView({
  snapshot,
  rx,
  rxStore,
  patientId,
  repo,
  presetRecord,
}: {
  snapshot: DbSnapshot;
  rx: RxSnapshot | null;
  rxStore: RxStore | null;
  patientId: string;
  repo: SupabaseRepository;
  presetRecord?: string | null;
}) {
  const grants = snapshot.grants.filter((g) => g.patientId === patientId && !g.revokedAt);
  const records = rx?.available ? sortPrescriptions(rx.prescriptions) : [];
  const [recordId, setRecordId] = useState(presetRecord ?? "");
  const [grantee, setGrantee] = useState(grants[0]?.granteeId ?? "");
  const [fields, setFields] = useState<ShareField[]>(DEFAULT_SHARE_FIELDS);
  const [period, setPeriod] = useState("30");
  // 단계별 공유: 상세에서 '이 기록 공유하기'로 들어오면 ② 사람 고르기부터
  const [step, setStep] = useState(presetRecord ? 2 : 1);
  const [notice, setNotice] = useState<string | null>(null);
  const action = useAsyncAction();
  const record = records.find((p) => p.id === recordId);
  const nowIso = snapshot.seededAt; // 렌더링 중 현재 시각 호출 금지 — 불러온 시각 기준
  const shares = rx?.available ? rx.shares.filter((s) => s.patientId === patientId) : [];
  const activeShares = shares.filter((s) => !s.revokedAt);
  const preview =
    rx?.available && record && grantee
      ? buildSharedRecord(rx, {
          id: "preview",
          patientId,
          prescriptionId: record.id,
          granteeId: grantee,
          fields,
          expiresAt: null,
          revokedAt: null,
          createdAt: nowIso,
        })
      : null;
  const fieldOptions = (Object.keys(SHARE_FIELD_LABEL) as ShareField[]).filter((f) => f !== "department" || record?.kind === "prescription");

  return (
    <div className="space-y-5">
      <PageTitle title="함께 보기" sub="가족·연인·친구에게 내가 고른 약 기록만, 고른 항목만 보여 줘요." />
      <p className="rounded-2xl bg-ivory-deep px-4 py-3 text-sm text-ink-soft">
        모든 기록은 기본 비공개예요. 처방약·진료과 정보도 직접 켜야만 보여요. 공유받은 사람은 읽기만 할 수 있고, 다른 사람에게 약을 권하거나 복용을 지시하는
        기능은 없어요.
      </p>
      {rx && !rx.available && <Notice>{rx.message}</Notice>}

      {rx?.available && rxStore && (
        <PCard aria-labelledby="share-new">
          <CardHeading id="share-new" title="기록 하나 공유하기" sub="한 단계씩 고르고, 마지막에 상대에게 보이는 모습을 확인한 뒤 공유해요." />
          {grants.length === 0 ? (
            <p className="text-sm text-ink-soft">아직 연결된 사람이 없어요. 아래 ‘사람 초대 · 연결 관리’에서 먼저 초대해 주세요.</p>
          ) : (
            <div className="space-y-4">
              <StatusSteps steps={STEPS} current={String(step)} />
              <Notice>{notice}</Notice>

              {step === 1 && (
                <fieldset className="space-y-2">
                  <legend className="mb-1 text-sm font-bold text-ink">① 공유할 기록을 하나 골라 주세요</legend>
                  <div role="radiogroup" aria-label="공유할 기록" className="max-h-[22rem] space-y-2 overflow-y-auto pr-1">
                    {records.map((p) => {
                      const label = prescriptionLabel(p, itemsOf(rx, p.id).length);
                      const names = itemsOf(rx, p.id)
                        .map((i) => i.name)
                        .join(", ");
                      return (
                        <label
                          key={p.id}
                          className={cn(
                            "flex cursor-pointer items-start gap-3 rounded-[0.875rem] border p-3 transition",
                            recordId === p.id ? "border-brand-300 bg-brand-50" : "border-line bg-white hover:border-brand-200",
                          )}
                        >
                          <input
                            type="radio"
                            name="share-record"
                            className="mt-1 h-5 w-5 shrink-0 accent-brand-700"
                            checked={recordId === p.id}
                            onChange={() => setRecordId(p.id)}
                            aria-label={`${label} — ${names}`}
                          />
                          <span className="min-w-0">
                            <span className="block font-bold text-ink">{label}</span>
                            <span className="block truncate text-sm text-ink-soft">{names}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              )}

              {step === 2 && (
                <div>
                  <p className="mb-1 text-sm font-bold text-ink">② 함께 볼 사람</p>
                  {record && <p className="mb-2 text-sm text-ink-soft">기록: {prescriptionLabel(record, itemsOf(rx, record.id).length)}</p>}
                  <ChipGroup
                    ariaLabel="함께 볼 사람"
                    value={grantee}
                    onChange={setGrantee}
                    options={grants.map((g) => ({
                      value: g.granteeId,
                      label: `${personName(snapshot, g)}${rx.relations[g.granteeId] ? ` (${RELATION_LABEL[rx.relations[g.granteeId]]})` : ""}`,
                    }))}
                  />
                </div>
              )}

              {step === 3 && (
                <div className="space-y-4">
                  <div>
                    <p className="mb-1 text-sm font-bold text-ink">③ 보여 줄 항목</p>
                    <p className="mb-1.5 text-xs text-ink-soft">제품명과 등록일은 항상 보여요. 나머지는 켠 것만 보여요.</p>
                    <ChipGroup
                      ariaLabel="보여 줄 항목"
                      value={fields}
                      onChange={(f) => setFields((c) => toggle(c, f))}
                      options={fieldOptions.map((f) => ({ value: f, label: SHARE_FIELD_LABEL[f] }))}
                    />
                  </div>
                  <div>
                    <p className="mb-1 text-sm font-bold text-ink">공유 기간</p>
                    <ChipGroup ariaLabel="공유 기간" value={period} onChange={setPeriod} options={PERIODS.map((p) => ({ value: p.value, label: p.label }))} />
                  </div>
                </div>
              )}

              {step === 4 && preview && (
                <div className="space-y-3">
                  <dl className="grid gap-x-3 gap-y-1 rounded-[0.875rem] bg-ivory p-3 text-sm sm:grid-cols-[6rem_1fr]" aria-label="공유 내용 확인">
                    <dt className="font-bold text-ink-soft">기록</dt>
                    <dd className="text-ink">{record && prescriptionLabel(record, itemsOf(rx, record.id).length)}</dd>
                    <dt className="font-bold text-ink-soft">사람</dt>
                    <dd className="text-ink">
                      {grants.find((g) => g.granteeId === grantee)
                        ? personName(
                            snapshot,
                            grants.find((g) => g.granteeId === grantee)!,
                          )
                        : ""}
                    </dd>
                    <dt className="font-bold text-ink-soft">보이는 항목</dt>
                    <dd className="text-ink">제품명·날짜{fields.length ? `, ${fields.map((f) => SHARE_FIELD_LABEL[f]).join(", ")}` : ""}</dd>
                    <dt className="font-bold text-ink-soft">기간</dt>
                    <dd className="text-ink">{PERIODS.find((p) => p.value === period)?.label}</dd>
                  </dl>
                  <div className="rounded-2xl border border-dashed border-brand-300 p-3" aria-label="상대에게 보이는 내용 미리 보기">
                    <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-brand-800">
                      <Eye className="h-4 w-4" aria-hidden /> 상대에게 이렇게 보여요
                    </p>
                    <SharedRecordCard r={preview} />
                  </div>
                </div>
              )}

              <Alert>{action.error}</Alert>
              <div className="flex flex-wrap gap-2">
                {step > 1 && (
                  <PButton variant="secondary" size="md" icon={ChevronLeft} onClick={() => setStep((x) => x - 1)}>
                    이전
                  </PButton>
                )}
                {step < 4 ? (
                  <PButton
                    size="md"
                    className="flex-1"
                    disabled={(step === 1 && !record) || (step === 2 && !grantee)}
                    onClick={() => {
                      setNotice(null);
                      setStep((x) => x + 1);
                    }}
                  >
                    다음 <ChevronRight className="h-5 w-5" aria-hidden />
                  </PButton>
                ) : (
                  <PButton
                    size="md"
                    className="flex-1"
                    icon={Share2}
                    disabled={!record || !grantee || action.pending}
                    onClick={async () => {
                      const days = PERIODS.find((p) => p.value === period)?.days ?? null;
                      const expiresAt = days ? new Date(Date.now() + days * 86_400_000).toISOString() : null;
                      const r = await action.run(() => rxStore.shareRecord({ patientId, prescriptionId: recordId, granteeId: grantee, fields, expiresAt }));
                      if (r.ok) {
                        setNotice("공유했어요. 아래 ‘공유 중인 기록’에서 언제든 멈출 수 있어요.");
                        setStep(1);
                        setRecordId("");
                      }
                    }}
                  >
                    이 기록 공유하기
                  </PButton>
                )}
              </div>
            </div>
          )}
        </PCard>
      )}

      {rx?.available && (
        <PCard aria-labelledby="share-active">
          <CardHeading id="share-active" title={`공유 중인 기록 · ${activeShares.length}건`} />
          {activeShares.length === 0 ? (
            <p className="text-sm text-ink-soft">공유 중인 기록이 없어요.</p>
          ) : (
            <ul className="space-y-2">
              {activeShares.map((s) => {
                const p = rx.prescriptions.find((x) => x.id === s.prescriptionId);
                const g = snapshot.grants.find((x) => x.granteeId === s.granteeId && x.patientId === patientId);
                const live = shareActive(s, nowIso) && Boolean(g && !g.revokedAt);
                return (
                  <li key={s.id} className="rounded-2xl bg-ivory p-3" aria-label={`공유 중: ${p ? prescriptionLabel(p, itemsOf(rx, p.id).length) : "기록"}`}>
                    <p className="font-bold text-ink">{p ? prescriptionLabel(p, itemsOf(rx, p.id).length) : "지운 기록"}</p>
                    <p className="text-sm text-ink-soft">
                      {g ? personName(snapshot, g) : "공유 상대"} · {s.fields.length ? s.fields.map((f) => SHARE_FIELD_LABEL[f]).join(", ") : "제품명만"}
                    </p>
                    <p className="text-xs text-ink-soft">
                      {s.expiresAt ? `${formatDateTime(s.expiresAt)}까지` : "멈출 때까지"} · 시작 {formatDateTime(s.createdAt)}
                      {!live && " · 지금은 보이지 않음 (기간 끝남 또는 연결 해제)"}
                    </p>
                    <PButton
                      size="sm"
                      variant="ghost"
                      icon={UserMinus}
                      className="mt-1"
                      onClick={() => void action.run(() => rxStore!.revokeShare(s.id))}
                      aria-label="이 공유 멈추기"
                    >
                      공유 멈추기
                    </PButton>
                  </li>
                );
              })}
            </ul>
          )}
        </PCard>
      )}

      {rx?.available && rxStore && grants.length > 0 && (
        <PCard aria-labelledby="relations">
          <CardHeading id="relations" title="연결된 사람과의 관계" sub="관계 이름은 나만 보는 표시예요." />
          <ul className="space-y-3">
            {grants.map((g) => (
              <li key={g.id}>
                <p className="mb-1 font-semibold text-ink">{personName(snapshot, g)}</p>
                <ChipGroup<Relation>
                  ariaLabel={`${personName(snapshot, g)} 관계`}
                  value={rx.relations[g.granteeId]}
                  onChange={(relation) => void action.run(() => rxStore.setRelation({ patientId, grantId: g.id, granteeId: g.granteeId, relation }))}
                  options={(Object.keys(RELATION_LABEL) as Relation[]).map((r) => ({ value: r, label: RELATION_LABEL[r] }))}
                />
              </li>
            ))}
          </ul>
        </PCard>
      )}

      <details className={cn("rounded-[1.5rem] bg-ivory-deep px-4 py-3")} open={grants.length === 0}>
        <summary className="cursor-pointer font-semibold text-ink">사람 초대 · 연결 관리 (연결을 끊으면 모든 공유가 멈춰요)</summary>
        <div className="mt-3">
          <ShareView snapshot={snapshot} patientId={patientId} repo={repo} embedded />
        </div>
      </details>
      {shares.some((s) => s.revokedAt) && (
        <p className="px-1 text-xs text-ink-soft">
          <StatusPill tone="ivory" className="!text-xs">
            기록
          </StatusPill>{" "}
          멈춘 공유 {shares.filter((s) => s.revokedAt).length}건은 상대에게 보이지 않아요.
        </p>
      )}
    </div>
  );
}
