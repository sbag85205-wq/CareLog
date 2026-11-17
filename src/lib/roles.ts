/** 로그인 버전의 역할별 첫 화면 (역할 값은 서버의 profiles.role — 화면에서 고를 수 없음) */
export type AppRole = "patient" | "staff" | "guardian";

export const ROLE_HOME: Record<AppRole, string> = {
  patient: "/my",
  staff: "/staff",
  guardian: "/guardian",
};

export const ROLE_NAME: Record<AppRole, string> = {
  patient: "환자",
  staff: "간호사·의료진",
  guardian: "보호자",
};

export function asAppRole(v: unknown): AppRole {
  return v === "staff" || v === "guardian" ? v : "patient";
}
