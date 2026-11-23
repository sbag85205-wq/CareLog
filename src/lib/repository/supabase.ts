/**
 * Supabase(DB 모드) 저장소 — 로그인한 사용자(환자·의료진·보호자) 공용
 *
 * - 모든 조회·저장은 로그인 세션으로 실행 → 보이는 행은 RLS가 역할별로 결정
 *   (환자: 본인 / 의료진: 담당 환자 / 보호자: 승인된 범위). 화면의 역할 선택으로 권한이 생기지 않음
 * - 역할(role)은 profiles(본인 행)에서 읽음 — 관리자만 바꿀 수 있는 값
 * - 상태 변경이 필요한 쓰기는 검증된 RPC 사용 (모드 전환·요청 상태·검토·보호자 공유)
 * - 데이터는 메모리에만 보관 (localStorage에 저장하지 않음)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, todayISO } from "@/lib/date";
import { CareLogError, type CareLogErrorCode } from "@/lib/errors";
import type {
  AccessScope,
  Admission,
  CareLogData,
  CareMode,
  Digestion,
  HealthRecord,
  LifeRequest,
  MealIntake,
  MealLog,
  MealSlot,
  MealType,
  Medication,
  Patient,
  RequestCategory,
  RequestStatus,
  ReviewAction,
  Scale5,
  StaffReview,
  VisitQuestion,
} from "@/types";
import { DATA_VERSION } from "./migrate";
import type { CareLogRepository } from "./types";

export type LoadState = { state: "idle" | "loading" | "ready" | "error"; message?: string };
export type ViewerRole = "patient" | "staff" | "guardian" | "admin";

export interface Invitation {
  id: string;
  patientId: string;
  email: string;
  scopes: AccessScope[];
  status: "pending" | "accepted" | "revoked" | "expired";
  expiresAt: string;
  createdAt: string;
  respondedAt?: string;
}

export interface Grant {
  id: string;
  patientId: string;
  granteeId: string;
  scopes: AccessScope[];
  invitationId?: string;
  approvedAt: string;
  revokedAt?: string;
}

export interface MenuRow {
  date: string;
  slot: MealSlot;
  mealType: MealType;
  items: string[];
}

/** 화면이 쓰는 스냅샷: 기존 앱 형식(CareLogData) + 로그인 사용자 정보·공유 정보 */
export interface DbSnapshot extends CareLogData {
  viewer: { userId: string; role: ViewerRole; displayName: string };
  invitations: Invitation[];
  grants: Grant[];
  /** 내부 검토 메모 (담당 의료진에게만 RLS가 행을 돌려줌) */
  reviewNotes: Record<string, string>;
  menus: MenuRow[];
}

export interface MedicationInput {
  name: string;
  dosage: string;
  schedule: string;
  caution: string;
  visibleToGuardian?: boolean;
  /**
   * 식약처 허가정보 검색에서 고른 제품의 품목기준코드(ITEM_SEQ).
   * 문자열: 검색으로 고른 약 / null: 직접 입력(코드 지움) / 생략: 바꾸지 않음(수정 시)
   */
  externalItemSeq?: string | null;
}

export interface SupabaseRepository extends CareLogRepository {
  getSnapshot(): DbSnapshot | null;
  load(opts?: { silent?: boolean }): Promise<void>;
  getLoadState(): LoadState;

  setCareMode(patientId: string, mode: CareMode, place?: { ward?: string; room?: string }): Promise<void>;
  setVisitQuestionShared(id: string, shared: boolean): Promise<void>;
  setNextVisitDate(patientId: string, date: string | null): Promise<void>;

  addMedication(patientId: string, input: MedicationInput): Promise<void>;
  /** 여러 약을 한 번의 요청으로 저장 (전부 저장되거나 전부 실패 — 재시도해도 일부만 중복되지 않음) */
  addMedications(patientId: string, inputs: MedicationInput[]): Promise<void>;
  updateMedication(id: string, input: MedicationInput): Promise<void>;
  deleteMedication(id: string): Promise<void>;
  setMedicationVisibility(id: string, visible: boolean): Promise<void>;

  inviteGuardian(patientId: string, email: string, scopes: AccessScope[]): Promise<{ token: string; expiresAt: string }>;
  revokeInvitation(id: string): Promise<void>;
  updateGuardianScopes(grantId: string, scopes: AccessScope[]): Promise<void>;
  revokeGuardianAccess(grantId: string): Promise<void>;
  acceptInvitation(token: string): Promise<void>;
}

/** @deprecated 이름 호환 (3단계) */
export type SupabasePatientRepository = SupabaseRepository;

const HISTORY_DAYS = 90;
const MEAL_DAYS = 14;

const RECORD_COLUMNS =
  "id, patient_id, record_date, condition, pain, fatigue, sleep, meal_intake, digestion, symptoms, memo, recorded_in, created_at, updated_at";
const PATIENT_COLUMNS = "id, display_name, birth_year, sex, department, care_mode, next_visit_date";
const MED_COLUMNS = "id, patient_id, name, purpose, dosage, schedule, caution, source, external_item_seq, visible_to_guardian, is_active, updated_at";
const REQUEST_COLUMNS =
  "id, patient_id, category, detail, status, meal_change_date, meal_change_slot, meal_change_to_type, handled_by, created_at, updated_at";

type RecordRow = {
  id: string;
  patient_id: string;
  record_date: string;
  condition: number;
  pain: number;
  fatigue: number;
  sleep: number;
  meal_intake: number;
  digestion: Digestion;
  symptoms: string[] | null;
  memo: string | null;
  recorded_in: CareMode;
  created_at: string;
  updated_at: string;
};

const iso = (t: string) => new Date(t).toISOString();

export function toHealthRecord(r: RecordRow): HealthRecord {
  return {
    id: r.id,
    patientId: r.patient_id,
    date: r.record_date,
    condition: r.condition as Scale5,
    pain: r.pain,
    fatigue: r.fatigue as Scale5,
    sleep: r.sleep as Scale5,
    mealIntake: r.meal_intake as MealIntake,
    digestion: r.digestion,
    symptoms: r.symptoms ?? [],
    memo: r.memo ?? "",
    recordedIn: r.recorded_in,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
    isDemo: false,
  };
}

/** DB 오류 → 사용자 안내 오류 (메시지 규칙 '<코드>: <안내>') */
export function toCareLogError(err: { code?: string; message?: string } | null): CareLogError {
  const msg = err?.message ?? "";
  const m = msg.match(/^(invalid_input|forbidden|not_found|invalid_transition|stale_state):\s*(.+)$/);
  if (m) return new CareLogError(m[1] as CareLogErrorCode, m[2]);
  if (err?.code === "42501" || /row-level security|permission denied/i.test(msg)) {
    return new CareLogError("forbidden", "이 작업을 할 권한이 없습니다. 다시 로그인해 주세요.");
  }
  return new CareLogError("write_failed", "저장하지 못했습니다. 네트워크를 확인하고 다시 시도해 주세요.");
}

const notSupported = async (): Promise<never> => {
  throw new CareLogError("not_supported", "이 기능은 DB 모드에서 제공하지 않습니다.");
};

/** 행을 하나도 바꾸지 못한 쓰기(RLS로 0행) → 권한 없음 */
function ensureChanged(rows: unknown[] | null, what: string) {
  if (!rows || rows.length === 0) throw new CareLogError("not_found", `${what}을(를) 찾을 수 없거나 권한이 없습니다.`);
}

/* eslint-disable @typescript-eslint/no-explicit-any -- DB 행 매핑 */
const mapPatient = (p: any, assigned: string[]): Patient => ({
  id: p.id,
  name: p.display_name,
  birthYear: p.birth_year ?? 0,
  gender: p.sex === "M" ? "M" : "F",
  department: p.department ?? "",
  careMode: p.care_mode,
  nextVisitDate: p.next_visit_date ?? undefined,
  assignedStaffIds: assigned,
  isDemo: false,
});
const mapAdmission = (a: any): Admission => ({
  id: a.id,
  patientId: a.patient_id,
  ward: a.ward,
  room: a.room,
  admittedOn: a.admitted_on,
  dischargedOn: a.discharged_on ?? undefined,
  source: a.source,
  createdAt: iso(a.created_at),
  isDemo: false,
});
const mapMedication = (m: any): Medication => ({
  id: m.id,
  patientId: m.patient_id,
  name: m.name,
  purpose: m.purpose ?? "",
  dosage: m.dosage ?? "",
  schedule: m.schedule ?? "",
  caution: m.caution ?? "",
  source: m.source === "manual" ? "manual" : "mfds",
  externalItemSeq: m.external_item_seq ?? undefined,
  visibleToGuardian: Boolean(m.visible_to_guardian),
  updatedAt: m.updated_at ? iso(m.updated_at) : undefined,
  isDemo: false,
});
const mapQuestion = (q: any): VisitQuestion => ({
  id: q.id,
  patientId: q.patient_id,
  text: q.text,
  done: Boolean(q.done),
  sharedWithStaff: Boolean(q.shared_with_staff),
  prescriptionId: q.prescription_id ?? undefined,
  createdAt: iso(q.created_at),
  updatedAt: q.updated_at ? iso(q.updated_at) : undefined,
});
const mapMeal = (m: any): MealLog => ({
  id: m.id,
  patientId: m.patient_id,
  date: m.meal_date,
  slot: m.slot,
  mealType: m.meal_type,
  intake: m.intake ?? undefined,
  digestion: m.digestion ?? undefined,
  updatedAt: iso(m.updated_at),
});
const mapRequest = (r: any): LifeRequest => ({
  id: r.id,
  patientId: r.patient_id,
  category: r.category as RequestCategory,
  detail: r.detail,
  status: r.status as RequestStatus,
  mealChange: r.meal_change_date ? { date: r.meal_change_date, slot: r.meal_change_slot, toType: r.meal_change_to_type } : undefined,
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
  handledBy: r.handled_by ?? undefined,
  isDemo: false,
});
const mapReview = (r: any): StaffReview => ({
  id: r.id,
  patientId: r.patient_id,
  staffId: r.staff_id,
  action: r.action as ReviewAction,
  note: "",
  createdAt: iso(r.created_at),
});
const mapGrant = (g: any): Grant => ({
  id: g.id,
  patientId: g.patient_id,
  granteeId: g.grantee_id,
  scopes: g.scopes ?? [],
  invitationId: g.invitation_id ?? undefined,
  approvedAt: iso(g.approved_at),
  revokedAt: g.revoked_at ? iso(g.revoked_at) : undefined,
});
const mapInvitation = (i: any): Invitation => ({
  id: i.id,
  patientId: i.patient_id,
  email: i.invitee_email,
  scopes: i.scopes ?? [],
  status: i.status,
  expiresAt: iso(i.expires_at),
  createdAt: iso(i.created_at),
  respondedAt: i.responded_at ? iso(i.responded_at) : undefined,
});
/* eslint-enable @typescript-eslint/no-explicit-any */

/** 관리자: 환자 데이터는 RLS로 읽지 않음 (계정 관리는 서버 API) */
function emptySnapshot(userId: string, displayName: string): DbSnapshot {
  return {
    version: DATA_VERSION,
    seededAt: new Date().toISOString(),
    users: [],
    patients: [],
    admissions: [],
    records: [],
    medications: [],
    visitQuestions: [],
    mealLogs: [],
    requests: [],
    reviews: [],
    accessGrants: [],
    viewer: { userId, role: "admin", displayName },
    invitations: [],
    grants: [],
    reviewNotes: {},
    menus: [],
  };
}

export function createSupabaseRepository(
  client: SupabaseClient,
  userId: string,
  opts: { today?: () => string } = {},
): SupabaseRepository {
  const today = opts.today ?? (() => todayISO());
  let data: DbSnapshot | null = null;
  let loadState: LoadState = { state: "idle" };
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());
  const set = (next: DbSnapshot) => {
    data = next;
    notify();
  };

  async function fetchAll(): Promise<DbSnapshot> {
    const [{ data: prof, error: pre }, { data: adminRow }] = await Promise.all([
      client.from("profiles").select("id, role, display_name, disabled_at").eq("id", userId).maybeSingle(),
      client.from("admin_users").select("user_id").eq("user_id", userId).maybeSingle(),
    ]);
    if (pre) throw pre;
    if (prof?.disabled_at) {
      // 서버(RLS)도 이미 모든 조회를 막고 있음 — 화면에는 이유를 안내
      throw new CareLogError("forbidden", "비활성화된 계정입니다. 병원(관리자)에 문의해 주세요.");
    }
    const role: ViewerRole = adminRow ? "admin" : prof?.role === "staff" || prof?.role === "guardian" ? prof.role : "patient";
    if (role === "admin") return emptySnapshot(userId, prof?.display_name ?? "");

    let pq = client.from("patients").select(PATIENT_COLUMNS);
    if (role === "patient") pq = pq.eq("profile_id", userId);
    const { data: prows, error: pe } = await pq;
    if (pe) throw pe;
    const patientRows = Array.isArray(prows) ? prows : prows ? [prows] : [];
    if (role === "patient" && patientRows.length === 0) {
      throw new CareLogError("not_found", "이 계정에 연결된 환자 정보가 없습니다. 관리자에게 문의해 주세요.");
    }
    const ids = patientRows.map((p) => p.id as string);
    const t = today();

    const none = Promise.resolve({ data: [] as unknown[], error: null });
    const byPatients = <T,>(q: () => T) => (ids.length ? q() : (none as unknown as T));
    const [adm, recs, meds, qs, meals, reqs, revs, notes, grants, invs, assigns, menus] = await Promise.all([
      byPatients(() => client.from("admissions").select("id, patient_id, ward, room, admitted_on, discharged_on, source, created_at").in("patient_id", ids)),
      byPatients(() =>
        client
          .from("health_records")
          .select(RECORD_COLUMNS)
          .in("patient_id", ids)
          .gte("record_date", addDays(t, -(HISTORY_DAYS - 1)))
          .order("record_date", { ascending: true }),
      ),
      byPatients(() => client.from("medications").select(MED_COLUMNS).in("patient_id", ids).eq("is_active", true).order("created_at", { ascending: true })),
      // "*": 처방 연결 컬럼(migration 10)이 없는 DB에서도 그대로 동작
      byPatients(() => client.from("visit_questions").select("*").in("patient_id", ids).order("created_at", { ascending: true })),
      byPatients(() => client.from("meal_logs").select("id, patient_id, meal_date, slot, meal_type, intake, digestion, updated_at").in("patient_id", ids).gte("meal_date", addDays(t, -(MEAL_DAYS - 1)))),
      byPatients(() => client.from("life_requests").select(REQUEST_COLUMNS).in("patient_id", ids).order("created_at", { ascending: false }).limit(300)),
      byPatients(() => client.from("staff_reviews").select("id, patient_id, staff_id, action, created_at").in("patient_id", ids).order("created_at", { ascending: false }).limit(300)),
      role === "staff" ? client.from("staff_review_notes").select("review_id, note") : none,
      client.from("access_grants").select("id, patient_id, grantee_id, scopes, invitation_id, approved_at, revoked_at"),
      role === "patient"
        ? client.from("guardian_invitations").select("id, patient_id, invitee_email, scopes, status, expires_at, created_at, responded_at").order("created_at", { ascending: false })
        : none,
      client.from("staff_assignments").select("patient_id, staff_id"),
      client.from("meal_menus").select("menu_date, slot, meal_type, items").eq("menu_date", t),
    ]);
    for (const r of [adm, recs, meds, qs, meals, reqs, revs, notes, grants, invs, assigns, menus]) if (r.error) throw r.error;
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const rows = (r: { data: unknown }) => (r.data ?? []) as any[];
    const assignedBy = new Map<string, string[]>();
    for (const a of rows(assigns)) assignedBy.set(a.patient_id, [...(assignedBy.get(a.patient_id) ?? []), a.staff_id]);
    const noteMap: Record<string, string> = {};
    for (const n of rows(notes)) noteMap[n.review_id] = n.note;

    return {
      version: DATA_VERSION,
      seededAt: new Date().toISOString(),
      users: [],
      patients: patientRows.map((p) => mapPatient(p, assignedBy.get(p.id as string) ?? [])),
      admissions: rows(adm).map(mapAdmission),
      records: (rows(recs) as RecordRow[]).map(toHealthRecord),
      medications: rows(meds).map(mapMedication),
      visitQuestions: rows(qs).map(mapQuestion),
      mealLogs: rows(meals).map(mapMeal),
      requests: rows(reqs).map(mapRequest),
      reviews: rows(revs).map((r) => ({ ...mapReview(r), note: noteMap[r.id] ?? "" })),
      accessGrants: [],
      viewer: { userId, role, displayName: prof?.display_name ?? "" },
      invitations: rows(invs).map(mapInvitation),
      grants: rows(grants).map(mapGrant),
      reviewNotes: noteMap,
      menus: rows(menus).map((m) => ({ date: m.menu_date, slot: m.slot, mealType: m.meal_type, items: m.items ?? [] })),
    };
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }

  async function load(o: { silent?: boolean } = {}) {
    if (!o.silent || !data) {
      loadState = { state: "loading" };
      notify();
    }
    try {
      data = await fetchAll();
      loadState = { state: "ready" };
    } catch (e) {
      if (!o.silent || !data) {
        loadState = {
          state: "error",
          message: e instanceof CareLogError ? e.message : "기록을 불러오지 못했습니다. 다시 로그인하거나 잠시 후 시도해 주세요.",
        };
      }
    }
    notify();
  }

  /** 쓰기 후 화면 갱신 (불러오는 중 표시 없이) */
  const refresh = () => load({ silent: true });

  async function rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data: out, error } = await client.rpc(fn, args);
    if (error) throw toCareLogError(error);
    return out as T;
  }

  const medRow = (i: MedicationInput) => {
    const row: Record<string, unknown> = {
      name: i.name.trim(),
      dosage: i.dosage.trim(),
      schedule: i.schedule.trim(),
      caution: i.caution.trim(),
    };
    if (i.externalItemSeq !== undefined) {
      const seq = i.externalItemSeq && /^[0-9]{6,12}$/.test(i.externalItemSeq) ? i.externalItemSeq : null;
      row.source = seq ? "mfds_permit" : "manual"; // DB 제약: manual 이 아니면 품목기준코드 필수
      row.external_item_seq = seq;
    }
    return row;
  };

  return {
    getSnapshot: () => data,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getLoadState: () => loadState,
    load,

    async upsertHealthRecord(input) {
      const { data: row, error } = await client.rpc("upsert_health_record", {
        p_patient_id: input.patientId,
        p_record_date: input.date,
        p_condition: input.condition,
        p_pain: input.pain,
        p_fatigue: input.fatigue,
        p_sleep: input.sleep,
        p_meal_intake: input.mealIntake,
        p_digestion: input.digestion,
        p_symptoms: input.symptoms,
        p_memo: input.memo,
      });
      if (error || !row) throw toCareLogError(error);
      const saved = toHealthRecord(row as RecordRow);
      if (data) {
        const others = data.records.filter((r) => !(r.patientId === saved.patientId && r.date === saved.date));
        set({ ...data, records: [...others, saved].sort((a, b) => a.date.localeCompare(b.date)) });
      }
      return saved;
    },

    async setCareMode(patientId, mode, place = {}) {
      await rpc("set_care_mode", { p_patient_id: patientId, p_mode: mode, p_ward: place.ward ?? null, p_room: place.room ?? null });
      await refresh();
    },

    async addVisitQuestion(patientId, text, prescriptionId) {
      const { data: row, error } = await client
        .from("visit_questions")
        .insert({ patient_id: patientId, text: text.trim(), ...(prescriptionId && { prescription_id: prescriptionId }) })
        .select("*")
        .single();
      if (error || !row) throw toCareLogError(error);
      await refresh();
      return mapQuestion(row);
    },
    async updateVisitQuestion(id, text) {
      const t = text.trim();
      if (!t || t.length > 200) throw new CareLogError("invalid_input", "질문은 1~200자로 입력해 주세요.");
      const { data: rows, error } = await client.from("visit_questions").update({ text: t }).eq("id", id).select("id");
      if (error) throw toCareLogError(error);
      ensureChanged(rows, "질문");
      await refresh();
    },
    async toggleVisitQuestion(id) {
      const q = data?.visitQuestions.find((x) => x.id === id);
      if (!q) throw new CareLogError("not_found", "질문을 찾을 수 없습니다.");
      const { data: rows, error } = await client.from("visit_questions").update({ done: !q.done }).eq("id", id).select("id");
      if (error) throw toCareLogError(error);
      ensureChanged(rows, "질문");
      await refresh();
    },
    async deleteVisitQuestion(id) {
      const { data: rows, error } = await client.from("visit_questions").delete().eq("id", id).select("id");
      if (error) throw toCareLogError(error);
      ensureChanged(rows, "질문");
      await refresh();
    },
    async setVisitQuestionShared(id, shared) {
      const { data: rows, error } = await client.from("visit_questions").update({ shared_with_staff: shared }).eq("id", id).select("id");
      if (error) throw toCareLogError(error);
      ensureChanged(rows, "질문");
      await refresh();
    },
    async setNextVisitDate(patientId, date) {
      const { data: rows, error } = await client.from("patients").update({ next_visit_date: date }).eq("id", patientId).select("id");
      if (error) throw toCareLogError(error);
      ensureChanged(rows, "환자 정보");
      await refresh();
    },

    async upsertMealLog(patch) {
      const row = await rpc("upsert_meal_intake", {
        p_patient_id: patch.patientId,
        p_meal_date: patch.date,
        p_slot: patch.slot,
        p_intake: patch.intake ?? null,
        p_digestion: patch.digestion ?? null,
      });
      await refresh();
      return mapMeal(row);
    },

    async createRequest(input) {
      const { data: row, error } = await client
        .from("life_requests")
        .insert({
          patient_id: input.patientId,
          category: input.category,
          detail: input.detail.trim(),
          meal_change_date: input.mealChange?.date ?? null,
          meal_change_slot: input.mealChange?.slot ?? null,
          meal_change_to_type: input.mealChange?.toType ?? null,
        })
        .select(REQUEST_COLUMNS)
        .single();
      if (error || !row) throw toCareLogError(error);
      await refresh();
      return mapRequest(row);
    },
    async updateRequestStatus(id, expected, to) {
      await rpc("advance_request_status", { p_request_id: id, p_expected: expected, p_to: to });
      await refresh();
    },

    async addStaffReview(input) {
      const id = await rpc<string>("add_staff_review", { p_patient_id: input.patientId, p_action: input.action, p_note: input.note ?? "" });
      await refresh();
      return { ...input, id, createdAt: new Date().toISOString() };
    },

    async addMedication(patientId, input) {
      const { error } = await client
        .from("medications")
        .insert({ patient_id: patientId, ...medRow(input), visible_to_guardian: Boolean(input.visibleToGuardian) });
      if (error) throw toCareLogError(error);
      await refresh();
    },
    async addMedications(patientId, inputs) {
      if (inputs.length === 0) return;
      const { error } = await client
        .from("medications")
        .insert(inputs.map((input) => ({ patient_id: patientId, ...medRow(input), visible_to_guardian: Boolean(input.visibleToGuardian) })));
      if (error) throw toCareLogError(error);
      await refresh();
    },
    async updateMedication(id, input) {
      const patch: Record<string, unknown> = medRow(input);
      if (input.visibleToGuardian !== undefined) patch.visible_to_guardian = input.visibleToGuardian;
      const { data: rows, error } = await client.from("medications").update(patch).eq("id", id).select("id");
      if (error) throw toCareLogError(error);
      ensureChanged(rows, "약");
      await refresh();
    },
    async deleteMedication(id) {
      const { data: rows, error } = await client.from("medications").delete().eq("id", id).select("id");
      if (error) throw toCareLogError(error);
      ensureChanged(rows, "약");
      await refresh();
    },
    async setMedicationVisibility(id, visible) {
      await rpc("set_medication_guardian_visibility", { p_medication_id: id, p_visible: visible });
      await refresh();
    },

    async inviteGuardian(patientId, email, scopes) {
      const out = await rpc<{ token: string; expires_at: string }>("invite_guardian", {
        p_patient_id: patientId,
        p_email: email,
        p_scopes: scopes,
        p_valid_days: 7,
      });
      await refresh();
      return { token: out.token, expiresAt: out.expires_at };
    },
    async revokeInvitation(id) {
      await rpc("revoke_guardian_invitation", { p_invitation_id: id });
      await refresh();
    },
    async updateGuardianScopes(grantId, scopes) {
      await rpc("update_guardian_scopes", { p_grant_id: grantId, p_scopes: scopes });
      await refresh();
    },
    async revokeGuardianAccess(grantId) {
      await rpc("revoke_guardian_access", { p_grant_id: grantId });
      await refresh();
    },
    async acceptInvitation(token) {
      await rpc("accept_guardian_invitation", { p_token: token });
      await refresh();
    },

    resetDemoData: notSupported,
  };
}

/** @deprecated 이름 호환 (3단계) */
export const createSupabasePatientRepository = createSupabaseRepository;
