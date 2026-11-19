import { json } from "@/server/patient-auth/http";

/**
 * 이전 방식(환자 코드 + 생년월일 → 비밀번호 설정)은 사용하지 않습니다.
 * 환자 계정은 관리자 화면(/admin/patients)에서 아이디·초기 비밀번호로 발급합니다.
 */
export async function POST() {
  return json({ ok: false, message: "환자 코드 방식은 더 이상 사용하지 않습니다. 병원(관리자)에서 받은 아이디로 로그인해 주세요." }, 410);
}
