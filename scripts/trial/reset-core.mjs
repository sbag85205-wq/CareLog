// @ts-check
/**
 * 공개 체험 계정 기록 초기화 — 핵심 로직 (서버 키 클라이언트를 주입받음, 단위 테스트: src/lib/trial-reset.test.ts)
 *
 * 안전 장치 (하나라도 어긋나면 아무것도 지우지 않음)
 * 1. 대상은 설정값 CARELOG_TRIAL_ACCOUNTS 의 "환자ID:Auth사용자ID" 쌍만 (1~10개, 중복 금지)
 * 2. DB에서 환자 행의 profile_id 가 설정한 Auth 사용자 ID 와 정확히 같아야 함
 * 3. 환자 표시 이름에 "(체험)" 표시
 * 4. Auth 계정이 관리자 화면에서 '테스트 계정'으로 등록됨 (app_metadata.carelog_test === true)
 * 5. 역할이 환자이고 관리자 목록(admin_users)에 없음
 * 삭제는 항상 patient_id = 대상 환자 ID 조건으로만. 계정·환자 행·로그인 정보·공유 관계(access_grants)는 남김.
 */

export const TRIAL_MARK = "(체험)";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** 지우는 표 (자식 → 부모 순서). 모두 patient_id 열로 대상 환자만 */
export const RESET_TABLES = [
  "intake_logs",
  "record_shares",
  "prescription_notes",
  "prescription_items",
  "prescriptions",
  "visit_questions",
  "health_records",
  "medications",
  "meal_logs",
  "life_requests",
  "guardian_invitations",
];

/**
 * @typedef {{ patientId: string; authUserId: string }} Target
 * @typedef {{ patientId: string; authUserId: string; name: string }} VerifiedTarget
 */

/**
 * "pid:uid,pid:uid" → 대상 목록 (형식 오류면 throw)
 * @param {string | undefined} raw
 * @returns {Target[]}
 */
export function parseTargets(raw) {
  const parts = (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length < 1 || parts.length > 10) throw new Error("CARELOG_TRIAL_ACCOUNTS 에 체험 계정을 1~10개 넣어 주세요 (환자ID:Auth사용자ID).");
  const out = parts.map((p) => {
    const [patientId, authUserId, extra] = p.split(":").map((s) => s.trim().toLowerCase());
    if (extra !== undefined || !UUID.test(patientId ?? "") || !UUID.test(authUserId ?? "")) throw new Error(`형식이 잘못된 항목이 있어요: ${p.slice(0, 8)}…`);
    return { patientId, authUserId };
  });
  if (new Set(out.map((t) => t.patientId)).size !== out.length || new Set(out.map((t) => t.authUserId)).size !== out.length) {
    throw new Error("같은 계정이 두 번 들어 있어요.");
  }
  return out;
}

/** 표가 아직 없음 (migration 미적용) @param {{ code?: string } | null | undefined} e */
const missing = (e) => ["PGRST205", "42P01"].includes(e?.code ?? "");

/**
 * 모든 대상을 확인 — 하나라도 실패하면 ok=false (호출 쪽은 아무것도 지우지 않음)
 * @param {any} client 서버 키 Supabase 클라이언트
 * @param {Target[]} targets
 * @returns {Promise<{ ok: boolean; verified: VerifiedTarget[]; errors: string[] }>}
 */
export async function verifyTargets(client, targets) {
  /** @type {string[]} */
  const errors = [];
  /** @type {VerifiedTarget[]} */
  const verified = [];
  for (const t of targets) {
    const tag = `${t.patientId.slice(0, 8)}…`;
    const { data: p, error: pe } = await client.from("patients").select("id, profile_id, display_name").eq("id", t.patientId).maybeSingle();
    if (pe || !p) {
      errors.push(`${tag}: 환자를 찾지 못했어요.`);
      continue;
    }
    if (p.profile_id !== t.authUserId) {
      errors.push(`${tag}: 환자와 Auth 계정 ID가 설정과 달라요.`);
      continue;
    }
    if (typeof p.display_name !== "string" || !p.display_name.includes(TRIAL_MARK)) {
      errors.push(`${tag}: 표시 이름에 ${TRIAL_MARK} 표시가 없어요.`);
      continue;
    }
    const { data: prof } = await client.from("profiles").select("id, role").eq("id", t.authUserId).maybeSingle();
    if (!prof || prof.role !== "patient") {
      errors.push(`${tag}: 환자 역할 계정이 아니에요.`);
      continue;
    }
    const { data: adm } = await client.from("admin_users").select("user_id").eq("user_id", t.authUserId).maybeSingle();
    if (adm) {
      errors.push(`${tag}: 관리자 계정은 초기화할 수 없어요.`);
      continue;
    }
    const { data: u, error: ue } = await client.auth.admin.getUserById(t.authUserId);
    if (ue || !u?.user || u.user.id !== t.authUserId) {
      errors.push(`${tag}: Auth 계정을 찾지 못했어요.`);
      continue;
    }
    if (u.user.app_metadata?.carelog_test !== true) {
      errors.push(`${tag}: 관리자 화면에서 '테스트 계정'으로 등록한 계정이 아니에요.`);
      continue;
    }
    verified.push({ patientId: t.patientId, authUserId: t.authUserId, name: p.display_name });
  }
  return { ok: errors.length === 0 && verified.length === targets.length, verified, errors };
}

/**
 * 지울 건수 (대상 환자 × 표)
 * @param {any} client
 * @param {VerifiedTarget[]} verified
 * @returns {Promise<Record<string, Record<string, number | null>>>} null = 표 없음
 */
export async function countPlan(client, verified) {
  /** @type {Record<string, Record<string, number | null>>} */
  const plan = {};
  for (const v of verified) {
    plan[v.patientId] = {};
    for (const table of RESET_TABLES) {
      const { count, error } = await client.from(table).select("*", { count: "exact", head: true }).eq("patient_id", v.patientId);
      if (error && !missing(error)) throw new Error(`${table} 건수를 세지 못했어요: ${error.code ?? ""}`);
      plan[v.patientId][table] = error ? null : (count ?? 0);
    }
  }
  return plan;
}

/**
 * 삭제 — 확인을 통과한 대상만, patient_id 조건으로만. 끝난 뒤 다시 세어 0건인지 확인
 * @param {any} client
 * @param {VerifiedTarget[]} verified
 */
export async function applyReset(client, verified) {
  /** @type {Record<string, Record<string, number>>} */
  const deleted = {};
  for (const v of verified) {
    if (!UUID.test(v.patientId)) throw new Error("대상 ID 형식 오류");
    deleted[v.patientId] = {};
    for (const table of RESET_TABLES) {
      const { count, error } = await client.from(table).delete({ count: "exact" }).eq("patient_id", v.patientId);
      if (error && missing(error)) continue;
      if (error) throw new Error(`${table} 삭제 실패: ${error.code ?? ""} (이 표 앞까지만 지워짐)`);
      deleted[v.patientId][table] = count ?? 0;
    }
  }
  const after = await countPlan(client, verified);
  const left = Object.values(after).flatMap((t) => Object.values(t)).filter((n) => n !== null && n > 0).length;
  if (left > 0) throw new Error("초기화 뒤에도 남은 기록이 있어요. 다시 확인해 주세요.");
  return deleted;
}

/**
 * 체험용 가상 예시 기록 넣기 (일반약 1건 + 처방 1건 + 복용 경험) — 처방 이력 표가 있을 때만
 * @param {any} client
 * @param {VerifiedTarget} v
 * @param {string} today YYYY-MM-DD
 */
export async function seedSample(client, v, today) {
  /** @param {number} n */
  const day = (n) => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  };
  /** @param {Record<string, unknown>} row @returns {Promise<string>} */
  const rec = async (row) => {
    const { data, error } = await client
      .from("prescriptions")
      .insert({ patient_id: v.patientId, request_id: crypto.randomUUID(), ...row })
      .select("id")
      .single();
    if (error) throw new Error(`예시 기록을 넣지 못했어요: ${error.code ?? ""}`);
    return data.id;
  };
  /** @param {string} prescriptionId @param {number} sort @param {Record<string, unknown>} row @returns {Promise<string>} */
  const item = async (prescriptionId, sort, row) => {
    const { data, error } = await client
      .from("prescription_items")
      .insert({ prescription_id: prescriptionId, patient_id: v.patientId, sort, ...row })
      .select("id")
      .single();
    if (error) throw new Error(`예시 약을 넣지 못했어요: ${error.code ?? ""}`);
    return data.id;
  };
  /** @param {string} prescriptionId @param {string | null} itemId @param {Record<string, unknown>} row */
  const note = async (prescriptionId, itemId, row) => {
    const { error } = await client.from("prescription_notes").insert({ prescription_id: prescriptionId, patient_id: v.patientId, item_id: itemId, ...row });
    if (error) throw new Error(`예시 경험을 넣지 못했어요: ${error.code ?? ""}`);
  };

  const otc = await rec({ kind: "otc", source: "search", prescribed_on: day(40), clinic: "(체험) 가상약국" });
  const otcItem = await item(otc, 0, {
    name: "(체험) 가상진통정500밀리그램",
    strength: "500mg",
    ingredients: "아세트아미노펜",
    drug_class: "otc",
    mfds_class: "114 해열·진통·소염제",
    categories: ["pain"],
    category_source: "mfds",
    dosage: "1회 1정",
    frequency: "필요할 때",
    active: false,
  });
  await note(otc, otcItem, {
    taken_on: day(38),
    tags: ["증상 완화를 느꼈어요", "복용하기 편했어요"],
    memo: "(체험 예시) 두통이 있을 때 먹었는데 편했어요.",
  });

  const rx = await rec({ kind: "prescription", source: "prescription", prescribed_on: day(14), department: "이비인후과", clinic: "(체험) 가상이비인후과" });
  const a = await item(rx, 0, { name: "(체험) 가상코감기정", dosage: "1회 1정", frequency: "하루 3회", timing: "식후 30분", duration: "5일분", categories: ["cold"], category_source: "mfds", active: false });
  await item(rx, 1, { name: "(체험) 가상위보호정", dosage: "1회 1정", frequency: "하루 3회", timing: "식후 30분", duration: "5일분", categories: ["stomach"], category_source: "mfds", active: false });
  await note(rx, null, {
    taken_on: day(12),
    tags: ["증상 완화를 느꼈어요", "속쓰림", "원인 미확인"],
    memo: "(체험 예시) 콧물은 줄었는데 저녁에 속이 쓰렸어요. 어느 약 때문인지는 모르겠어요.",
  });
  await note(rx, a, { taken_on: day(13), tags: ["졸림"], memo: "(체험 예시) 낮에 졸렸어요." });
}
