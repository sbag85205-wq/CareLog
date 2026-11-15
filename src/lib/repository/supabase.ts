/**
 * Supabase(DB 모드) 환자 저장소 — 3단계: 로그인한 환자 본인의 컨디션 기록 조회·저장
 *
 * - 조회·저장은 로그인 세션으로 실행 → RLS(is_patient_self)가 본인 기록만 허용
 * - 같은 한국 날짜 재저장은 upsert_health_record RPC가 기존 1건을 수정 (unique(patient_id, record_date))
 * - 건강기록은 메모리에만 보관하고 localStorage에 저장하지 않음
 * - 아직 연결하지 않은 기능(식사·요청·약 등)은 not_supported 오류
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, todayISO } from "@/lib/date";
import { CareLogError, type CareLogErrorCode } from "@/lib/errors";
import type { Admission, CareLogData, CareMode, Digestion, HealthRecord, MealIntake, Patient, Scale5 } from "@/types";
import { DATA_VERSION } from "./migrate";
import type { CareLogRepository } from "./types";

export type LoadState = { state: "idle" | "loading" | "ready" | "error"; message?: string };

export interface SupabasePatientRepository extends CareLogRepository {
  load(): Promise<void>;
  getLoadState(): LoadState;
}

const RECORD_COLUMNS =
  "id, patient_id, record_date, condition, pain, fatigue, sleep, meal_intake, digestion, symptoms, memo, recorded_in, created_at, updated_at";
const HISTORY_DAYS = 90;

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
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
    isDemo: false,
  };
}

/** DB 오류 → 사용자 안내 오류 (메시지 규칙 '<코드>: <안내>') */
export function toCareLogError(err: { code?: string; message?: string } | null): CareLogError {
  const msg = err?.message ?? "";
  const m = msg.match(/^(invalid_input|forbidden|not_found|invalid_transition|stale_state):\s*(.+)$/);
  if (m) return new CareLogError(m[1] as CareLogErrorCode, m[2]);
  if (err?.code === "42501" || /row-level security|permission denied/i.test(msg)) {
    return new CareLogError("forbidden", "본인 기록만 저장할 수 있습니다. 다시 로그인해 주세요.");
  }
  return new CareLogError("write_failed", "저장하지 못했습니다. 네트워크를 확인하고 다시 시도해 주세요.");
}

const notSupported = async (): Promise<never> => {
  throw new CareLogError("not_supported", "이 기능은 아직 DB 모드에서 지원하지 않습니다.");
};

export function createSupabasePatientRepository(
  client: SupabaseClient,
  userId: string,
  opts: { today?: () => string } = {},
): SupabasePatientRepository {
  const today = opts.today ?? (() => todayISO());
  let data: CareLogData | null = null;
  let loadState: LoadState = { state: "idle" };
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());

  function setRecords(records: HealthRecord[]) {
    if (!data) return;
    data = { ...data, records: [...records].sort((a, b) => a.date.localeCompare(b.date)) };
    notify();
  }

  return {
    getSnapshot: () => data,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getLoadState: () => loadState,

    async load() {
      loadState = { state: "loading" };
      notify();
      try {
        const { data: p, error: pe } = await client
          .from("patients")
          .select("id, display_name, birth_year, sex, department, care_mode, next_visit_date")
          .eq("profile_id", userId)
          .maybeSingle();
        if (pe) throw pe;
        if (!p) throw new CareLogError("not_found", "이 계정에 연결된 환자 정보가 없습니다. 관리자에게 문의해 주세요.");

        const [{ data: adm, error: ae }, { data: recs, error: re }] = await Promise.all([
          client
            .from("admissions")
            .select("id, patient_id, ward, room, admitted_on, discharged_on, source, created_at")
            .eq("patient_id", p.id)
            .is("discharged_on", null),
          client
            .from("health_records")
            .select(RECORD_COLUMNS)
            .eq("patient_id", p.id)
            .gte("record_date", addDays(today(), -(HISTORY_DAYS - 1)))
            .order("record_date", { ascending: true }),
        ]);
        if (ae) throw ae;
        if (re) throw re;

        const patient: Patient = {
          id: p.id,
          name: p.display_name,
          birthYear: p.birth_year ?? 0,
          gender: p.sex === "M" ? "M" : "F",
          department: p.department ?? "",
          careMode: p.care_mode,
          nextVisitDate: p.next_visit_date ?? undefined,
          assignedStaffIds: [],
          isDemo: false,
        };
        const admissions: Admission[] = (adm ?? []).map((a) => ({
          id: a.id,
          patientId: a.patient_id,
          ward: a.ward,
          room: a.room,
          admittedOn: a.admitted_on,
          dischargedOn: a.discharged_on ?? undefined,
          source: a.source,
          createdAt: new Date(a.created_at).toISOString(),
          isDemo: false,
        }));
        data = {
          version: DATA_VERSION,
          seededAt: new Date().toISOString(),
          users: [],
          patients: [patient],
          admissions,
          records: ((recs ?? []) as RecordRow[]).map(toHealthRecord),
          medications: [],
          visitQuestions: [],
          mealLogs: [],
          requests: [],
          reviews: [],
          accessGrants: [],
        };
        loadState = { state: "ready" };
      } catch (e) {
        loadState = {
          state: "error",
          message: e instanceof CareLogError ? e.message : "기록을 불러오지 못했습니다. 다시 로그인하거나 잠시 후 시도해 주세요.",
        };
      }
      notify();
    },

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
      const others = (data?.records ?? []).filter((r) => r.date !== saved.date);
      setRecords([...others, saved]);
      return saved;
    },

    setCareMode: notSupported,
    addVisitQuestion: notSupported,
    toggleVisitQuestion: notSupported,
    deleteVisitQuestion: notSupported,
    upsertMealLog: notSupported,
    createRequest: notSupported,
    updateRequestStatus: notSupported,
    addStaffReview: notSupported,
    resetDemoData: notSupported,
  };
}
