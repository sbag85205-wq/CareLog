"use client";

/**
 * 로그인 없는 공개 체험 — 브라우저에서 Supabase 익명 세션(signInAnonymously)을 받고,
 * 본인 세션으로 start_trial() 을 불러 그 방문자 전용 환자·예시 기록을 만듦 (서버 키 사용 안 함, 기존 RLS 그대로)
 * 같은 브라우저로 다시 오면 같은 체험을 이어서 씀 (만료 전까지)
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type TrialStatus = { is_trial: boolean; expires_at?: string; expired?: boolean };
export type TrialResult = { ok: true; resumed: boolean; expiresAt: string } | { ok: false; message: string };

const MSG = {
  disabled: "체험 기능이 아직 켜지지 않았어요. 잠시 후 다시 시도해 주세요.",
  busy: "지금 체험을 시작하려는 분이 많아요. 잠시 후 다시 시도해 주세요.",
  member: "이미 로그인한 계정이 있어요. 로그아웃한 뒤 체험을 시작해 주세요.",
  failed: "체험을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.",
};

function authMessage(e: { code?: string; status?: number; message?: string } | null | undefined): string {
  const code = e?.code ?? "";
  if (code === "anonymous_provider_disabled" || /anonymous sign-?ins are disabled/i.test(e?.message ?? "")) return MSG.disabled;
  if (code === "over_request_rate_limit" || e?.status === 429) return MSG.busy;
  return MSG.failed;
}

async function anonymousSession(client: SupabaseClient): Promise<string | null> {
  const { data } = await client.auth.getSession();
  if (data.session) return null;
  const { error } = await client.auth.signInAnonymously();
  return error ? authMessage(error) : null;
}

/** 지금 브라우저의 세션이 익명 체험 세션인가 */
export async function currentTrial(client: SupabaseClient): Promise<{ anonymous: boolean; status: TrialStatus | null }> {
  const { data } = await client.auth.getSession();
  const anonymous = Boolean(data.session?.user?.is_anonymous);
  if (!data.session) return { anonymous: false, status: null };
  const r = await client.rpc("trial_status");
  return { anonymous, status: r.error ? null : (r.data as TrialStatus) };
}

/** 체험 시작 (또는 같은 체험 이어서) — 만료된 세션이면 새 익명 세션으로 다시 시작 */
export async function startTrial(client: SupabaseClient): Promise<TrialResult> {
  const { data } = await client.auth.getSession();
  if (data.session && !data.session.user.is_anonymous) return { ok: false, message: MSG.member };
  let err = await anonymousSession(client);
  if (err) return { ok: false, message: err };
  let r = await client.rpc("start_trial");
  if (r.error && /expired/.test(r.error.message ?? "")) {
    await client.auth.signOut();
    err = await anonymousSession(client);
    if (err) return { ok: false, message: err };
    r = await client.rpc("start_trial");
  }
  if (r.error) return { ok: false, message: /forbidden/.test(r.error.message ?? "") ? MSG.member : MSG.failed };
  const d = r.data as { expires_at: string; resumed: boolean };
  return { ok: true, resumed: d.resumed, expiresAt: d.expires_at };
}

/** 체험 끝내기 — 내 체험 기록을 바로 지우고 세션 종료 */
export async function endTrial(client: SupabaseClient): Promise<void> {
  const { data } = await client.auth.getSession();
  if (data.session?.user?.is_anonymous) await client.rpc("end_trial");
  await fetch("/api/patient-auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => undefined);
  await client.auth.signOut();
}
