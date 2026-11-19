/**
 * 환자 로그인 아이디 (관리자가 발급)
 *
 * - 아이디는 Supabase Auth 계정의 이메일 `아이디@id.carelog.invalid` 로 저장합니다 (별도 테이블 없음).
 *   → 기존 환자에게 아이디를 붙이거나 바꿔도 Auth 사용자 ID·환자 ID·비밀번호·기록이 그대로 이어집니다.
 * - `.invalid` 도메인은 메일이 발송되지 않는 예약 도메인입니다.
 * - 규칙: 영문 소문자로 시작, 영문 소문자·숫자·. _ - 4~20자 (대소문자 구분 없음)
 */
export const PATIENT_LOGIN_DOMAIN = "id.carelog.invalid";

export const LOGIN_ID_RULE = "영문 소문자로 시작하는 4~20자 (영문 소문자·숫자·. _ - 사용 가능)";

export function normalizeLoginId(input: string): string {
  return input.trim().toLowerCase();
}

export function isValidLoginId(id: string): boolean {
  return /^[a-z][a-z0-9._-]{3,19}$/.test(id) && !/[._-]{2}/.test(id) && !/[._-]$/.test(id);
}

export function loginIdToEmail(id: string): string {
  return `${normalizeLoginId(id)}@${PATIENT_LOGIN_DOMAIN}`;
}

/** Auth 이메일 → 로그인 아이디 (아이디가 없는 이전 방식 계정이면 null) */
export function emailToLoginId(email: string | null | undefined): string | null {
  const e = (email ?? "").toLowerCase();
  const suffix = `@${PATIENT_LOGIN_DOMAIN}`;
  return e.endsWith(suffix) ? e.slice(0, -suffix.length) : null;
}

export const LOGIN_MESSAGES = {
  loginFailed: "아이디 또는 비밀번호가 올바르지 않습니다. 계속 안 되면 병원(관리자)에 문의해 주세요.",
} as const;
