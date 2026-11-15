/**
 * 환자 코드 로그인 — 입력 규칙 (브라우저·서버 공용, 순수 함수)
 *
 * 환자 코드: 혼동 문자(0/O, 1/I/L)를 뺀 31종 문자 12자리, 표시는 XXXX-XXXX-XXXX (약 59비트 무작위)
 * 표시용 demo_code(P001 등)와는 별개이며, 추측하기 어려운 값만 로그인에 사용합니다.
 */

export const LOGIN_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const LOGIN_CODE_LENGTH = 12;

/** 공백·하이픈 제거 + 대문자 (DB의 private.normalize_login_code 와 동일 규칙) */
export function normalizeLoginCode(input: string): string {
  return input.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
}

export function isLoginCodeFormat(input: string): boolean {
  const code = normalizeLoginCode(input);
  return code.length === LOGIN_CODE_LENGTH && [...code].every((c) => LOGIN_CODE_ALPHABET.includes(c));
}

export function formatLoginCode(code: string): string {
  const n = normalizeLoginCode(code);
  return n.match(/.{1,4}/g)?.join("-") ?? n;
}

/** 서버 전용 발급용 — crypto.getRandomValues + 거부 샘플링으로 치우침 없는 무작위 코드 */
export function generateLoginCode(random: (buf: Uint8Array) => Uint8Array = (b) => crypto.getRandomValues(b)): string {
  const n = LOGIN_CODE_ALPHABET.length;
  const limit = 256 - (256 % n);
  let out = "";
  while (out.length < LOGIN_CODE_LENGTH) {
    for (const byte of random(new Uint8Array(32))) {
      if (byte < limit && out.length < LOGIN_CODE_LENGTH) out += LOGIN_CODE_ALPHABET[byte % n];
    }
  }
  return formatLoginCode(out);
}

/** 생년월일 8자리(YYYYMMDD) → YYYY-MM-DD. 실제로 존재하는 날짜이고 오늘 이전이어야 함 */
export function parseBirthDate8(input: string, today: string): string | null {
  if (!/^\d{8}$/.test(input)) return null;
  const y = Number(input.slice(0, 4));
  const m = Number(input.slice(4, 6));
  const d = Number(input.slice(6, 8));
  if (y < 1900) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  const iso = `${input.slice(0, 4)}-${input.slice(4, 6)}-${input.slice(6, 8)}`;
  return iso <= today ? iso : null;
}

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72; // Supabase Auth(bcrypt) 최대 길이

/** 비밀번호 규칙 — 문제가 없으면 null, 있으면 안내 문구 */
export function checkPasswordPolicy(password: string, confirm: string, loginCode?: string): string | null {
  if (password.length < PASSWORD_MIN) return `비밀번호는 ${PASSWORD_MIN}자 이상이어야 합니다.`;
  if (password.length > PASSWORD_MAX) return `비밀번호는 ${PASSWORD_MAX}자 이하로 입력해 주세요.`;
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return "비밀번호에 영문과 숫자를 모두 넣어 주세요.";
  if (/^(.)\1+$/.test(password)) return "같은 문자만 반복한 비밀번호는 사용할 수 없습니다.";
  if (loginCode && normalizeLoginCode(password).includes(normalizeLoginCode(loginCode))) {
    return "환자 코드를 비밀번호에 넣을 수 없습니다.";
  }
  if (password !== confirm) return "새 비밀번호와 비밀번호 확인이 다릅니다.";
  return null;
}

/**
 * 사용자 안내 문구 — 실패 원인(코드 없음·생년월일 불일치·이미 설정·잠금·요청 과다)을 구분하지 않음
 */
export const PATIENT_AUTH_MESSAGES = {
  verifyFailed:
    "입력하신 정보로 처음 이용하기를 진행할 수 없습니다. 환자 코드와 생년월일을 확인해 주세요. 이미 비밀번호를 설정하셨다면 로그인을 이용하시고, 계속 안 되면 잠시 후 다시 시도해 주세요.",
  setupExpired: "비밀번호 설정 시간이 지났거나 이미 처리되었습니다. 처음 이용하기를 다시 진행해 주세요.",
  setupSaveFailed: "비밀번호를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  loginFailed: "환자 코드 또는 비밀번호가 올바르지 않습니다. 계속 안 되면 잠시 후 다시 시도해 주세요.",
  badRequest: "입력 형식이 올바르지 않습니다.",
  notConfigured: "DB 연결 설정이 없어 환자 로그인을 사용할 수 없습니다. 관리자에게 문의해 주세요.",
} as const;
