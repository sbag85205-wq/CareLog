import "server-only";
import { getAdminClient } from "@/server/supabase/admin";
import { createSessionClient } from "@/server/supabase/session";
import type { PatientAuthDb, PatientAuthDeps, PatientAuthProvider } from "./service";

type Json = { ok?: boolean; token?: string; expires_at?: string; auth_user_id?: string; email?: string };

async function rpc(fn: string, args: Record<string, unknown>): Promise<Json> {
  const { data, error } = await getAdminClient().rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.code ?? ""} ${error.message}`); // 입력값은 메시지에 포함되지 않음
  return (data ?? {}) as Json;
}

const db: PatientAuthDb = {
  async verifyFirstAccess(code, birthDate, ttlSeconds) {
    const r = await rpc("svc_verify_first_access", { p_login_code: code, p_birth_date: birthDate, p_ttl_seconds: ttlSeconds });
    return r.ok && r.token && r.expires_at ? { ok: true, token: r.token, expiresAt: r.expires_at } : { ok: false };
  },
  async beginPasswordSetup(token) {
    const r = await rpc("svc_begin_password_setup", { p_token: token });
    return r.ok && r.auth_user_id ? { ok: true, authUserId: r.auth_user_id } : { ok: false };
  },
  async completePasswordSetup(token) {
    const r = await rpc("svc_complete_password_setup", { p_token: token });
    return r.ok && r.email ? { ok: true, email: r.email } : { ok: false };
  },
  async abortPasswordSetup(token) {
    await rpc("svc_abort_password_setup", { p_token: token });
  },
  async loginLookup(code) {
    const r = await rpc("svc_login_lookup", { p_login_code: code });
    return r.ok && r.email ? { ok: true, email: r.email } : { ok: false };
  },
  async recordLoginResult(code, success) {
    await rpc("svc_record_login_result", { p_login_code: code, p_success: success });
  },
};

const auth: PatientAuthProvider = {
  async setPassword(authUserId, password) {
    const { error } = await getAdminClient().auth.admin.updateUserById(authUserId, { password });
    if (error) throw new Error(`updateUserById: ${error.status ?? ""} ${error.code ?? ""}`);
  },
  async signIn(email, password) {
    const client = await createSessionClient();
    const { error } = await client.auth.signInWithPassword({ email, password });
    return !error;
  },
};

export function supabasePatientAuthDeps(): PatientAuthDeps {
  return {
    db,
    auth,
    logError: (where, message) => console.error(`[patient-auth] ${where} 실패: ${String(message)}`),
  };
}
