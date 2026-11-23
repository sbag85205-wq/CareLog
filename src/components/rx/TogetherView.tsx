"use client";

import { Eye, Share2, UserMinus } from "lucide-react";
import { useState } from "react";
import { ShareView } from "@/components/patient-db/ShareView";
import { PageTitle } from "@/components/patient-ui/AppShell";
import { Alert, CardHeading, ChipGroup, cn, Notice, PButton, PCard, StatusPill } from "@/components/patient-ui/kit";
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
          <CardHeading id="share-new" title="기록 하나 공유하기" sub="① 기록 고르기 → ② 사람 고르기 → ③ 보여 줄 항목·기간 확인" />
          {grants.length === 0 ? (
            <p className="text-sm text-ink-soft">아직 연결된 사람이 없어요. 아래에서 먼저 초대해 주세요.</p>
          ) : (
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1 block text-sm font-bold text-ink">① 공유할 기록</span>
                <select
                  value={recordId}
                  onChange={(e) => setRecordId(e.target.value)}
                  aria-label="공유할 기록"
                  className="h-12 w-full rounded-xl border border-line bg-white px-3 text-base"
                >
                  <option value="">기록을 골라 주세요</option>
                  {records.map((p) => (
                    <option key={p.id} value={p.id}>
                      {prescriptionLabel(p, itemsOf(rx, p.id).length)} —{" "}
                      {itemsOf(rx, p.id)
                        .map((i) => i.name)
                        .join(", ")
                        .slice(0, 40)}
                    </option>
                  ))}
                </select>
              </label>
              <div>
                <p className="mb-1 text-sm font-bold text-ink">② 함께 볼 사람</p>
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
              {preview && (
                <div className="rounded-2xl border border-dashed border-brand-300 p-3" aria-label="상대에게 보이는 내용 미리 보기">
                  <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-brand-800">
                    <Eye className="h-4 w-4" aria-hidden /> 상대에게 이렇게 보여요
                  </p>
                  <SharedRecordCard r={preview} />
                </div>
              )}
              <Alert>{action.error}</Alert>
              <Notice>{notice}</Notice>
              <PButton
                className="w-full"
                icon={Share2}
                disabled={!record || !grantee || action.pending}
                onClick={async () => {
                  const days = PERIODS.find((p) => p.value === period)?.days ?? null;
                  const expiresAt = days ? new Date(Date.now() + days * 86_400_000).toISOString() : null;
                  const r = await action.run(() => rxStore.shareRecord({ patientId, prescriptionId: recordId, granteeId: grantee, fields, expiresAt }));
                  if (r.ok) setNotice("공유했어요. 아래 ‘공유 중인 기록’에서 언제든 멈출 수 있어요.");
                }}
              >
                이 기록 공유하기
              </PButton>
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
