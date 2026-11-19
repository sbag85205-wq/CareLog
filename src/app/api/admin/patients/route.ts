import type { NextRequest } from "next/server";
import { requireAdmin } from "@/server/admin/guard";
import {
  deletePatient,
  deletePreview,
  listPatients,
  registerPatient,
  resetPassword,
  setDisabled,
  setLoginId,
  type Result,
} from "@/server/admin/patients";
import { json, readJson } from "@/server/patient-auth/http";

/** 관리자: 환자 계정 목록 */
export async function GET(req: NextRequest) {
  const gate = await requireAdmin(req);
  if ("error" in gate) return gate.error;
  return reply(await listPatients(gate.admin));
}

/** 관리자: 등록·아이디 지정·비밀번호 재설정·비활성화·복구·영구 삭제(가상 테스트 계정만) */
export async function POST(req: NextRequest) {
  const gate = await requireAdmin(req);
  if ("error" in gate) return gate.error;
  const body = (await readJson(req)) ?? {};
  const a = gate.admin;
  switch (body.action) {
    case "register":
      return reply(await registerPatient(a, body));
    case "set-login-id":
      return reply(await setLoginId(a, body));
    case "reset-password":
      return reply(await resetPassword(a, body));
    case "disable":
      return reply(await setDisabled(a, body, true));
    case "restore":
      return reply(await setDisabled(a, body, false));
    case "delete-preview":
      return reply(await deletePreview(a, body));
    case "delete":
      return reply(await deletePatient(a, body));
    default:
      return json({ ok: false, message: "알 수 없는 요청입니다." }, 400);
  }
}

function reply(r: Result) {
  if (!r.ok) return json({ ok: false, message: r.message }, r.status);
  return json(r);
}
