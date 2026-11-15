/**
 * 환자 코드 로그인 — 서버 로직 (DB·Auth 의존성을 주입받아 테스트 가능)
 *
 * ⚠️ 입력값(환자 코드·생년월일·비밀번호)은 절대 로그로 남기지 않습니다.
 */
import { checkPasswordPolicy, isLoginCodeFormat, PATIENT_AUTH_MESSAGES as M } from "@/lib/patient-auth/rules";

type Ok<T = object> = { ok: true } & T;
type Fail = { ok: false };

/** DB 쪽 (Supabase: service_role 전용 svc_* RPC) */
export interface PatientAuthDb {
  verifyFirstAccess(code: string, birthDate: string, ttlSeconds: number): Promise<Ok<{ token: string; expiresAt: string }> | Fail>;
  beginPasswordSetup(token: string): Promise<Ok<{ authUserId: string }> | Fail>;
  completePasswordSetup(token: string): Promise<Ok<{ email: string }> | Fail>;
  abortPasswordSetup(token: string): Promise<void>;
  loginLookup(code: string): Promise<Ok<{ email: string }> | Fail>;
  recordLoginResult(code: string, success: boolean): Promise<void>;
}

/** 인증 쪽 (Supabase Auth: 관리자 비밀번호 설정 + 비밀번호 로그인으로 세션 발급) */
export interface PatientAuthProvider {
  setPassword(authUserId: string, password: string): Promise<void>;
  /** 성공 시 세션을 만들고(실서비스: 쿠키) true */
  signIn(email: string, password: string): Promise<boolean>;
}

export interface PatientAuthDeps {
  db: PatientAuthDb;
  auth: PatientAuthProvider;
  /** 내부 오류 기록 — 입력값을 넘기지 말 것 */
  logError?: (where: string, err: unknown) => void;
}

export type ServiceResult<T = object> = ({ ok: true } & T) | { ok: false; status: number; message: string };

export const SETUP_TOKEN_TTL_SECONDS = 600;

const fail = (status: number, message: string): { ok: false; status: number; message: string } => ({ ok: false, status, message });

function safeLog(deps: PatientAuthDeps, where: string, err: unknown) {
  // 오류 객체의 메시지만 — 요청 입력값은 포함하지 않음
  deps.logError?.(where, err instanceof Error ? err.message : "unknown error");
}

/** 1. 최초 확인: 환자 코드 + 생년월일(YYYY-MM-DD) → 일회용 설정 권한 */
export async function verifyFirstAccess(
  deps: PatientAuthDeps,
  loginCode: string,
  birthDateIso: string,
): Promise<ServiceResult<{ token: string; expiresAt: string }>> {
  if (!isLoginCodeFormat(loginCode)) return fail(401, M.verifyFailed);
  try {
    const r = await deps.db.verifyFirstAccess(loginCode, birthDateIso, SETUP_TOKEN_TTL_SECONDS);
    if (!r.ok) return fail(401, M.verifyFailed);
    return { ok: true, token: r.token, expiresAt: r.expiresAt };
  } catch (e) {
    safeLog(deps, "verifyFirstAccess", e);
    return fail(503, M.verifyFailed);
  }
}

/** 2. 비밀번호 설정: 일회용 권한 → Auth 비밀번호 저장 → 설정 완료 → 로그인 세션 */
export async function setPasswordWithToken(
  deps: PatientAuthDeps,
  token: string | undefined,
  password: string,
  passwordConfirm: string,
): Promise<ServiceResult<{ signedIn: boolean; consumed: boolean }>> {
  const policy = checkPasswordPolicy(password, passwordConfirm);
  if (policy) return fail(400, policy);
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return fail(401, M.setupExpired);

  let begun: Awaited<ReturnType<PatientAuthDb["beginPasswordSetup"]>>;
  try {
    begun = await deps.db.beginPasswordSetup(token);
  } catch (e) {
    safeLog(deps, "beginPasswordSetup", e);
    return fail(503, M.setupSaveFailed);
  }
  if (!begun.ok) return fail(401, M.setupExpired); // 만료·이미 사용·동시 제출 중 나중 요청

  try {
    await deps.auth.setPassword(begun.authUserId, password);
  } catch (e) {
    safeLog(deps, "setPassword", e);
    await deps.db.abortPasswordSetup(token).catch((err) => safeLog(deps, "abortPasswordSetup", err));
    return fail(503, M.setupSaveFailed); // 유효기간 안에서 같은 권한으로 다시 시도 가능
  }

  let done: Awaited<ReturnType<PatientAuthDb["completePasswordSetup"]>>;
  try {
    done = await deps.db.completePasswordSetup(token);
  } catch (e) {
    safeLog(deps, "completePasswordSetup", e);
    await deps.db.abortPasswordSetup(token).catch((err) => safeLog(deps, "abortPasswordSetup", err));
    return fail(503, M.setupSaveFailed);
  }
  if (!done.ok) return fail(401, M.setupExpired);

  let signedIn = false;
  try {
    signedIn = await deps.auth.signIn(done.email, password);
  } catch (e) {
    safeLog(deps, "signIn after setup", e);
  }
  return { ok: true, signedIn, consumed: true };
}

/** 3. 일반 로그인: 환자 코드 + 비밀번호 (비밀번호 검증은 Supabase Auth) */
export async function loginWithCode(
  deps: PatientAuthDeps,
  loginCode: string,
  password: string,
): Promise<ServiceResult> {
  if (!isLoginCodeFormat(loginCode) || password.length === 0 || password.length > 200) return fail(401, M.loginFailed);
  try {
    const found = await deps.db.loginLookup(loginCode);
    if (!found.ok) return fail(401, M.loginFailed); // 코드 없음·미설정·잠금 구분 없음
    const ok = await deps.auth.signIn(found.email, password);
    await deps.db.recordLoginResult(loginCode, ok);
    return ok ? { ok: true } : fail(401, M.loginFailed);
  } catch (e) {
    safeLog(deps, "loginWithCode", e);
    return fail(503, M.loginFailed);
  }
}
