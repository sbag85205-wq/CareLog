"use client";

import { Copy, Send, UserMinus } from "lucide-react";
import { useState } from "react";
import { PageTitle } from "@/components/patient-ui/AppShell";
import { Alert, CardHeading, ChipGroup, Notice, PButton, PCard, StatusPill, TextField } from "@/components/patient-ui/kit";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { formatDateTime } from "@/lib/date";
import { FEATURES } from "@/lib/features";
import { SCOPE_LABEL } from "@/lib/labels";
import type { DbSnapshot, Grant, SupabaseRepository } from "@/lib/repository/supabase";
import type { AccessScope } from "@/types";

// 새 버전: 병동 흐름(식사·생활 요청) 공유 범위는 숨김 — 이미 받은 공유 범위는 그대로 표시
const SCOPES: AccessScope[] = FEATURES.WARD ? ["records", "medications", "meals", "requests"] : ["records", "medications"];
const SCOPE_HINT: Record<AccessScope, string> = {
  records: "컨디션·메모 기록",
  medications: "'보호자와 공유'를 켠 처방·복용 경험과 '보호자에게 공개'를 켠 약만",
  meals: "입원 중 식사 기록",
  requests: "생활 요청과 처리 상태",
};
const scopeOptions = SCOPES.map((s) => ({ value: s, label: SCOPE_LABEL[s] }));
const toggle = (list: AccessScope[], s: AccessScope) => (list.includes(s) ? list.filter((x) => x !== s) : [...list, s]);

/**
 * 보호자 공유 — 환자가 초대하고 공유 항목을 선택·변경·철회
 * 실제 차단은 DB(RLS)가 담당: 철회·범위 축소 즉시 보호자 조회 결과에서 빠짐
 */
export function ShareView({ snapshot, patientId, repo, embedded }: { snapshot: DbSnapshot; patientId: string; repo: SupabaseRepository; embedded?: boolean }) {
  const [email, setEmail] = useState("");
  const [scopes, setScopes] = useState<AccessScope[]>(["records"]);
  const [link, setLink] = useState<{
    url: string;
    email: string;
    expiresAt: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const invite = useAsyncAction();
  const list = useAsyncAction();

  const invitations = snapshot.invitations.filter((i) => i.patientId === patientId);
  const emailOf = (g: Grant) => invitations.find((i) => i.id === g.invitationId)?.email ?? "보호자";
  const grants = snapshot.grants.filter((g) => g.patientId === patientId);
  const active = grants.filter((g) => !g.revokedAt);
  const revoked = grants.filter((g) => g.revokedAt);
  const now = Date.parse(snapshot.seededAt); // 불러온 시각 기준 (렌더링 중 현재 시각 호출 금지)
  const pending = invitations.filter((i) => i.status === "pending" && Date.parse(i.expiresAt) > now);

  return (
    <div className="space-y-5">
      {!embedded && <PageTitle title="보호자 공유" sub="공유할 항목을 고르고 언제든 바꾸거나 멈출 수 있어요." />}
      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <PCard aria-labelledby="invite-title">
          <CardHeading
            id="invite-title"
            title={embedded ? "함께 볼 사람 초대" : "보호자 초대"}
            sub={
              embedded
                ? "가족·연인·친구·보호자의 계정 이메일로 초대 링크를 만들어요. 링크는 직접 전해 주세요."
                : "보호자 계정의 이메일로 초대 링크를 만들어요. 링크는 보호자에게 직접 전해 주세요."
            }
          />
          <form
            className="space-y-5"
            onSubmit={async (e) => {
              e.preventDefault();
              setLink(null);
              setCopied(false);
              const r = await invite.run(() => repo.inviteGuardian(patientId, email, scopes));
              if (r.ok) {
                setLink({
                  url: `${window.location.origin}/invite#t=${r.value.token}`,
                  email: email.trim().toLowerCase(),
                  expiresAt: r.value.expiresAt,
                });
                setEmail("");
              }
            }}
          >
            <TextField
              label="보호자 이메일"
              type="email"
              autoComplete="off"
              value={email}
              maxLength={254}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="예: guardian@example.test"
              helper="보호자가 로그인할 때 쓰는 이메일과 같아야 해요."
            />
            <div>
              <p className="mb-2 text-base font-bold text-ink">공유할 항목</p>
              <ChipGroup ariaLabel="공유할 항목" value={scopes} onChange={(s) => setScopes((c) => toggle(c, s))} options={scopeOptions} />
              <ul className="mt-2 space-y-0.5 text-xs text-ink-soft">
                {scopes.map((s) => (
                  <li key={s}>
                    · {SCOPE_LABEL[s]}: {SCOPE_HINT[s]}
                  </li>
                ))}
              </ul>
            </div>
            <Alert>{invite.error}</Alert>
            <PButton type="submit" className="w-full" icon={Send} disabled={!email.trim() || scopes.length === 0 || invite.pending}>
              {invite.pending ? "만드는 중…" : "초대 링크 만들기"}
            </PButton>
          </form>
          {link && (
            <div className="mt-5 rounded-[1.25rem] bg-brand-100 p-4" aria-live="polite">
              <p className="text-sm font-bold text-brand-900">{link.email} 님에게 보낼 초대 링크</p>
              <p className="mt-2 rounded-xl bg-white px-3 py-2 font-mono text-xs break-all text-ink" data-testid="invite-link">
                {link.url}
              </p>
              <p className="mt-2 text-xs text-brand-800">
                이 링크는 지금만 보여요 · {formatDateTime(link.expiresAt)}까지 유효 · 초대받은 이메일 계정으로만 수락할 수 있어요.
              </p>
              <PButton
                variant="secondary"
                size="sm"
                icon={Copy}
                className="mt-3"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(link.url);
                    setCopied(true);
                  } catch {
                    setCopied(false);
                  }
                }}
              >
                {copied ? "복사했어요" : "링크 복사"}
              </PButton>
            </div>
          )}
        </PCard>

        <div className="space-y-5">
          <PCard aria-labelledby="grant-title">
            <CardHeading id="grant-title" title={embedded ? "연결된 사람 · 기본 공유 범위" : "공유 중인 보호자"} />
            <Alert>{list.error}</Alert>
            {active.length === 0 ? (
              <p className="text-sm text-ink-soft">아직 공유 중인 보호자가 없어요.</p>
            ) : (
              <ul className="space-y-4">
                {active.map((g) => (
                  <li key={g.id}>
                    <GrantEditor grant={g} email={emailOf(g)} repo={repo} />
                  </li>
                ))}
              </ul>
            )}
          </PCard>

          {pending.length > 0 && (
            <PCard aria-labelledby="pending-title">
              <CardHeading id="pending-title" title="수락 대기 중인 초대" />
              <ul className="space-y-3">
                {pending.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-ivory p-4">
                    <div className="min-w-0">
                      <p className="font-bold break-all text-ink">{i.email}</p>
                      <p className="text-xs text-ink-soft">
                        {i.scopes.map((s) => SCOPE_LABEL[s]).join(" · ")} · {formatDateTime(i.expiresAt)}까지
                      </p>
                    </div>
                    <PButton variant="secondary" size="sm" disabled={list.pending} onClick={() => void list.run(() => repo.revokeInvitation(i.id))}>
                      초대 취소
                    </PButton>
                  </li>
                ))}
              </ul>
            </PCard>
          )}

          {revoked.length > 0 && (
            <PCard tone="ivory">
              <p className="text-sm font-bold text-ink-soft">공유를 멈춘 보호자</p>
              <ul className="mt-2 space-y-1 text-sm text-ink-soft">
                {revoked.map((g) => (
                  <li key={g.id}>
                    {emailOf(g)} · {formatDateTime(g.revokedAt!)} 철회 · 다시 공유하려면 새로 초대해 주세요
                  </li>
                ))}
              </ul>
            </PCard>
          )}
        </div>
      </div>
    </div>
  );
}

function GrantEditor({ grant, email, repo }: { grant: Grant; email: string; repo: SupabaseRepository }) {
  const [scopes, setScopes] = useState<AccessScope[]>(grant.scopes);
  const [confirm, setConfirm] = useState(false);
  const [saved, setSaved] = useState(false);
  const action = useAsyncAction();
  const changed = scopes.length !== grant.scopes.length || scopes.some((s) => !grant.scopes.includes(s));
  return (
    <section className="rounded-[1.25rem] border border-line p-4" aria-label={`${email} 공유 설정`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-bold break-all text-ink">{email}</p>
        <StatusPill check>공유 중</StatusPill>
      </div>
      <p className="mt-1 text-xs text-ink-soft">{formatDateTime(grant.approvedAt)} 수락</p>
      <div className="mt-3">
        <ChipGroup
          ariaLabel={`${email} 공유 항목`}
          value={scopes}
          onChange={(s) => {
            setSaved(false);
            setScopes((c) => toggle(c, s));
          }}
          options={scopeOptions}
        />
      </div>
      <Alert className="mt-3">{action.error}</Alert>
      {saved && !changed && <Notice className="mt-3">공유 항목을 바꿨어요. 보호자 화면에 바로 반영돼요.</Notice>}
      {confirm ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl bg-blush-50 p-3">
          <span className="flex-1 text-sm font-semibold text-blush-700">공유를 멈추면 이 보호자는 더 이상 아무 정보도 볼 수 없어요.</span>
          <PButton size="sm" variant="secondary" onClick={() => setConfirm(false)}>
            취소
          </PButton>
          <PButton size="sm" className="!bg-blush-700" disabled={action.pending} onClick={() => void action.run(() => repo.revokeGuardianAccess(grant.id))}>
            공유 멈추기
          </PButton>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <PButton
            size="sm"
            disabled={!changed || scopes.length === 0 || action.pending}
            onClick={async () => {
              const r = await action.run(() => repo.updateGuardianScopes(grant.id, scopes));
              if (r.ok) setSaved(true);
            }}
          >
            공유 항목 저장
          </PButton>
          <PButton size="sm" variant="ghost" icon={UserMinus} onClick={() => setConfirm(true)}>
            공유 철회
          </PButton>
        </div>
      )}
      {scopes.length === 0 && <p className="mt-2 text-xs text-blush-700">하나 이상 고르거나 공유 철회를 눌러 주세요.</p>}
    </section>
  );
}
