import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { emailToLoginId, isValidLoginId, LOGIN_ID_RULE, loginIdToEmail, normalizeLoginId } from "@/lib/patient-auth/login-id";
import { checkPasswordPolicy } from "@/lib/patient-auth/rules";

/**
 * 관리자 환자 계정 관리 (서버 키 사용 — requireAdmin 통과 후에만 호출)
 * - 비밀번호·서버 키는 반환·기록하지 않음. 오류 로그에는 단계와 오류 코드만
 */
export type Result<T = object> = ({ ok: true } & T) | { ok: false; status: number; message: string };
const fail = (status: number, message: string) => ({ ok: false as const, status, message });
const BAN = "876000h"; // 사실상 무기한 (복구 시 해제)

export interface AdminPatientRow {
  id: string;
  displayName: string;
  demoCode: string | null;
  careMode: string;
  createdAt: string;
  loginId: string | null;
  status: "active" | "disabled";
  isTest: boolean;
  lastSignInAt: string | null;
  records: number;
}

export interface DeletePreview {
  counts: Record<string, number>;
  total: number;
}

const log = (where: string, err: { code?: string; status?: number } | null) =>
  console.error(`[admin] ${where} 실패: ${err?.status ?? ""} ${err?.code ?? ""}`.trim());

async function allUsers(admin: SupabaseClient): Promise<Map<string, User>> {
  const map = new Map<string, User>();
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    for (const u of data.users) map.set(u.id, u);
    if (data.users.length < 200) break;
  }
  return map;
}

export async function listPatients(admin: SupabaseClient): Promise<Result<{ patients: AdminPatientRow[] }>> {
  const { data: patients, error } = await admin
    .from("patients")
    .select("id, profile_id, display_name, demo_code, care_mode, created_at")
    .order("created_at", { ascending: false });
  if (error) return (log("list", error), fail(500, "환자 목록을 불러오지 못했습니다."));
  const users = await allUsers(admin);
  const ids = (patients ?? []).map((p) => p.profile_id).filter(Boolean) as string[];
  const { data: profs } = ids.length ? await admin.from("profiles").select("id, disabled_at").in("id", ids) : { data: [] };
  const disabled = new Map((profs ?? []).map((p) => [p.id as string, Boolean(p.disabled_at)]));
  const rows: AdminPatientRow[] = [];
  for (const p of patients ?? []) {
    const u = p.profile_id ? users.get(p.profile_id) : undefined;
    const { count } = await admin.from("health_records").select("id", { count: "exact", head: true }).eq("patient_id", p.id);
    rows.push({
      id: p.id,
      displayName: p.display_name,
      demoCode: p.demo_code,
      careMode: p.care_mode,
      createdAt: p.created_at,
      loginId: emailToLoginId(u?.email),
      status: p.profile_id && disabled.get(p.profile_id) ? "disabled" : "active",
      isTest: u?.app_metadata?.carelog_test === true,
      lastSignInAt: u?.last_sign_in_at ?? null,
      records: count ?? 0,
    });
  }
  return { ok: true, patients: rows };
}

function checkLoginId(raw: unknown): Result<{ loginId: string }> {
  const loginId = normalizeLoginId(typeof raw === "string" ? raw : "");
  if (!isValidLoginId(loginId)) return fail(400, `아이디 형식: ${LOGIN_ID_RULE}`);
  return { ok: true, loginId };
}

function checkPassword(password: unknown, confirm: unknown): Result<{ password: string }> {
  if (typeof password !== "string" || typeof confirm !== "string") return fail(400, "비밀번호를 입력해 주세요.");
  const policy = checkPasswordPolicy(password, confirm);
  return policy ? fail(400, policy) : { ok: true, password };
}

const idTaken = (e: { code?: string; message?: string } | null) =>
  e?.code === "email_exists" || /already (been )?registered|already exists/i.test(e?.message ?? "");

/** 신규 환자 등록: Auth 계정(아이디·초기 비밀번호) + 환자 행 — 실패하면 만든 계정 정리 */
export async function registerPatient(
  admin: SupabaseClient,
  body: { displayName?: unknown; loginId?: unknown; password?: unknown; passwordConfirm?: unknown; isTest?: unknown },
): Promise<Result<{ patientId: string; loginId: string }>> {
  const name = typeof body.displayName === "string" ? body.displayName.trim() : "";
  if (name.length < 1 || name.length > 50) return fail(400, "표시 이름을 1~50자로 입력해 주세요.");
  const id = checkLoginId(body.loginId);
  if (!id.ok) return id;
  const pw = checkPassword(body.password, body.passwordConfirm);
  if (!pw.ok) return pw;

  const { data, error } = await admin.auth.admin.createUser({
    email: loginIdToEmail(id.loginId),
    password: pw.password,
    email_confirm: true, // .invalid 도메인 — 메일 발송 없음 (프로젝트 Confirm email 설정은 변경하지 않음)
    user_metadata: { display_name: name },
    app_metadata: { carelog_test: body.isTest === true },
  });
  if (error) {
    if (idTaken(error)) return fail(409, "이미 사용 중인 아이디예요.");
    return (log("register.createUser", error), fail(500, "계정을 만들지 못했습니다."));
  }
  const { data: p, error: pe } = await admin.from("patients").insert({ profile_id: data.user.id, display_name: name }).select("id").single();
  if (pe || !p) {
    log("register.patient", pe);
    await admin.auth.admin.deleteUser(data.user.id);
    return fail(500, "환자 정보를 만들지 못했습니다. 만들던 계정은 정리했습니다.");
  }
  return { ok: true, patientId: p.id, loginId: id.loginId };
}

async function patientUser(admin: SupabaseClient, patientId: unknown) {
  if (typeof patientId !== "string" || !/^[0-9a-f-]{36}$/.test(patientId)) return null;
  const { data: p } = await admin.from("patients").select("id, profile_id, display_name").eq("id", patientId).maybeSingle();
  if (!p?.profile_id) return null;
  const { data } = await admin.auth.admin.getUserById(p.profile_id);
  if (!data?.user) return null;
  return { patient: p as { id: string; profile_id: string; display_name: string }, user: data.user };
}

/** 기존 환자에게 아이디 지정·변경 — Auth 사용자 ID·환자 ID·비밀번호·기록은 그대로 */
export async function setLoginId(admin: SupabaseClient, body: { patientId?: unknown; loginId?: unknown }): Promise<Result<{ loginId: string }>> {
  const t = await patientUser(admin, body.patientId);
  if (!t) return fail(404, "환자를 찾을 수 없습니다.");
  const id = checkLoginId(body.loginId);
  if (!id.ok) return id;
  if (emailToLoginId(t.user.email) === id.loginId) return { ok: true, loginId: id.loginId };
  const { error } = await admin.auth.admin.updateUserById(t.user.id, { email: loginIdToEmail(id.loginId), email_confirm: true });
  if (error) {
    if (idTaken(error)) return fail(409, "이미 사용 중인 아이디예요.");
    return (log("setLoginId", error), fail(500, "아이디를 저장하지 못했습니다."));
  }
  return { ok: true, loginId: id.loginId };
}

/** 비밀번호 재설정 (이전 코드 방식 환자는 '설정 완료'로 표시해 바로 사용 가능) */
export async function resetPassword(
  admin: SupabaseClient,
  body: { patientId?: unknown; password?: unknown; passwordConfirm?: unknown },
): Promise<Result> {
  const t = await patientUser(admin, body.patientId);
  if (!t) return fail(404, "환자를 찾을 수 없습니다.");
  const pw = checkPassword(body.password, body.passwordConfirm);
  if (!pw.ok) return pw;
  const { error } = await admin.auth.admin.updateUserById(t.user.id, { password: pw.password });
  if (error) return (log("resetPassword", error), fail(500, "비밀번호를 바꾸지 못했습니다."));
  const { error: me } = await admin.rpc("svc_mark_password_set", { p_patient_id: t.patient.id });
  if (me) log("resetPassword.mark", me);
  return { ok: true };
}

/** 비활성화·복구: DB 표시(RLS 즉시 차단) + Auth 로그인 차단(새 로그인·토큰 갱신 차단) */
export async function setDisabled(admin: SupabaseClient, body: { patientId?: unknown }, disabled: boolean): Promise<Result> {
  const t = await patientUser(admin, body.patientId);
  if (!t) return fail(404, "환자를 찾을 수 없습니다.");
  const { error } = await admin.from("profiles").update({ disabled_at: disabled ? new Date().toISOString() : null }).eq("id", t.user.id);
  if (error) return (log("setDisabled.profile", error), fail(500, "상태를 바꾸지 못했습니다."));
  const { error: be } = await admin.auth.admin.updateUserById(t.user.id, { ban_duration: disabled ? BAN : "none" });
  if (be) {
    log("setDisabled.ban", be);
    return fail(500, "로그인 차단 설정에 실패했습니다. 다시 시도해 주세요.");
  }
  return { ok: true };
}

const LINKED: [string, string][] = [
  ["health_records", "컨디션 기록"],
  ["medications", "내 약"],
  ["visit_questions", "진료 질문"],
  ["meal_logs", "식사 기록"],
  ["life_requests", "생활 요청"],
  ["admissions", "입원 이력"],
  ["access_grants", "보호자 공유"],
  ["guardian_invitations", "보호자 초대"],
  ["staff_assignments", "간호사 배정"],
  ["staff_reviews", "의료진 검토"],
];

/** 영구 삭제 미리보기: 연결된 기록 수 (가상 테스트 계정만) */
export async function deletePreview(admin: SupabaseClient, body: { patientId?: unknown }): Promise<Result<DeletePreview & { displayName: string }>> {
  const t = await patientUser(admin, body.patientId);
  if (!t) return fail(404, "환자를 찾을 수 없습니다.");
  if (t.user.app_metadata?.carelog_test !== true) return fail(403, "가상 테스트 계정으로 등록한 환자만 영구 삭제할 수 있습니다.");
  const counts: Record<string, number> = {};
  for (const [table, label] of LINKED) {
    const { count } = await admin.from(table).select("*", { count: "exact", head: true }).eq("patient_id", t.patient.id);
    counts[label] = count ?? 0;
  }
  return { ok: true, counts, total: Object.values(counts).reduce((a, b) => a + b, 0), displayName: t.patient.display_name };
}

/** 영구 삭제: 표시 이름을 그대로 입력한 경우에만 (가상 테스트 계정만) — 환자 행(연결 기록 연쇄 삭제) → Auth 계정 */
export async function deletePatient(admin: SupabaseClient, body: { patientId?: unknown; confirm?: unknown }): Promise<Result> {
  const preview = await deletePreview(admin, body);
  if (!preview.ok) return preview;
  if (body.confirm !== preview.displayName) return fail(400, "확인을 위해 표시 이름을 정확히 입력해 주세요.");
  const t = (await patientUser(admin, body.patientId))!;
  const { error } = await admin.from("patients").delete().eq("id", t.patient.id);
  if (error) return (log("delete.patient", error), fail(500, "삭제하지 못했습니다."));
  const { error: ue } = await admin.auth.admin.deleteUser(t.user.id);
  if (ue) log("delete.user", ue);
  return { ok: true };
}
