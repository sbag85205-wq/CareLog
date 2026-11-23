/**
 * localStorage 기반 프로토타입 저장소.
 *
 * ⚠️ 가상(데모) 데이터 전용입니다. 실제 환자정보·건강정보를 저장하는 용도로 사용하지 마세요.
 *    브라우저 localStorage는 암호화·접근제어가 없습니다.
 *
 * 구조 (DB 전환 대비):
 * - confirmed : "서버에 저장된" 것으로 간주하는 데이터 (localStorage에 저장)
 * - pending   : 응답을 기다리는 낙관적 변경 목록
 * - view      : confirmed + pending — 화면이 보는 데이터
 * 쓰기 흐름: ① 입력 검증 (실패 시 데이터 변경 없이 reject)
 *            ② (낙관적 쓰기라면) 화면에 먼저 반영
 *            ③ 가상 지연 → "서버" 재검증 후 확정 / 실패하면 화면 변경을 되돌리고 reject
 */
import { createSeedData, DEMO_ROOMS, DEMO_WARD } from "@/data/mock-data";
import { nowISO, todayISO } from "@/lib/date";
import { readDevFlags, type DevFlags } from "@/lib/dev-flags";
import { applyCareMode } from "@/lib/domain/admissions";
import { checkRequestTransition } from "@/lib/domain/request-status";
import { CareLogError } from "@/lib/errors";
import type { AccessScope, CareLogData, HealthRecord, LifeRequest, MealLog, Medication, StaffReview, VisitQuestion } from "@/types";
import type { MedicationInput } from "./supabase";
import { DATA_VERSION, migrateData } from "./migrate";
import type { CareLogRepository, HealthRecordInput } from "./types";

export const STORAGE_KEY = "carelog.demo-data.v1";

/** 로그인 버전 화면을 데모에서 그대로 쓰기 위한 추가 쓰기 (가상 데이터, 이 브라우저에만 저장) */
export interface LocalDemoWrites {
  setVisitQuestionShared(id: string, shared: boolean): Promise<void>;
  setNextVisitDate(patientId: string, date: string | null): Promise<void>;
  addMedications(patientId: string, inputs: MedicationInput[]): Promise<void>;
  updateMedication(id: string, input: MedicationInput): Promise<void>;
  deleteMedication(id: string): Promise<void>;
  setMedicationVisibility(id: string, visible: boolean): Promise<void>;
  updateGrantScopes(grantId: string, scopes: AccessScope[]): Promise<void>;
  revokeGrant(grantId: string): Promise<void>;
}

export type LocalRepository = CareLogRepository & LocalDemoWrites;

type Mutation = (d: CareLogData) => CareLogData;
type Prepared<T> = { noop: true; result: T } | { noop?: false; mutate: Mutation; result: T };

export interface LocalRepositoryOptions {
  storage?: () => Storage;
  devFlags?: () => DevFlags;
  /** 한국 날짜 */
  today?: () => string;
  seed?: (today: string) => CareLogData;
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function assignDemoRoom(previousRoom: string | undefined) {
  return { ward: DEMO_WARD, room: DEMO_ROOMS.find((r) => r !== previousRoom) ?? DEMO_ROOMS[0] };
}

function assertRecord(input: HealthRecordInput) {
  const inRange = (v: number, lo: number, hi: number) => Number.isInteger(v) && v >= lo && v <= hi;
  if (
    !inRange(input.condition, 1, 5) ||
    !inRange(input.pain, 0, 10) ||
    !inRange(input.fatigue, 1, 5) ||
    !inRange(input.sleep, 1, 5) ||
    ![0, 25, 50, 75, 100].includes(input.mealIntake) ||
    input.memo.length > 500
  ) {
    throw new CareLogError("invalid_input", "입력값이 올바르지 않습니다. 항목을 다시 확인해 주세요.");
  }
}

export function createLocalStorageRepository(options: LocalRepositoryOptions = {}): LocalRepository {
  const getStorage = options.storage ?? (() => window.localStorage);
  const getFlags = options.devFlags ?? readDevFlags;
  const today = options.today ?? (() => todayISO());
  const seed = options.seed ?? createSeedData;

  let confirmed: CareLogData | null = null;
  let pending: Mutation[] = [];
  let view: CareLogData | null = null;
  /** 데모 초기화 시 증가 — 진행 중이던 쓰기를 무효화 */
  let epoch = 0;
  const listeners = new Set<() => void>();

  function persist(next: CareLogData) {
    try {
      getStorage().setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // 사생활 보호 모드 등에서 저장 실패 → 메모리에서만 동작
    }
  }

  function load(): CareLogData {
    try {
      const raw = getStorage().getItem(STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        const migrated = migrateData(parsed, today());
        if (migrated) {
          if (migrated !== parsed) persist(migrated); // 이전 버전 → 현재 버전으로 저장
          return migrated;
        }
      }
    } catch {
      // 손상된 데이터 → 새 데모 데이터
    }
    const seeded = seed(today());
    persist(seeded);
    return seeded;
  }

  function getConfirmed(): CareLogData {
    if (!confirmed) confirmed = load();
    return confirmed;
  }

  function computeView(): CareLogData {
    // 낙관적 변경 중 지금 데이터와 충돌하는 것은 건너뜀 (확정 단계에서 실패 처리됨)
    return pending.reduce((acc, mutate) => {
      try {
        return mutate(acc);
      } catch {
        return acc;
      }
    }, getConfirmed());
  }

  function snapshot(): CareLogData {
    if (!view) view = computeView();
    return view;
  }

  function invalidate() {
    view = null;
    listeners.forEach((l) => l());
  }

  async function write<T>(prepare: (current: CareLogData) => Prepared<T>, optimistic: boolean): Promise<T> {
    const prepared = prepare(snapshot()); // 검증 실패 시 여기서 throw → 데이터 변경 없음
    if (prepared.noop) return prepared.result;
    const { mutate, result } = prepared;
    const startedEpoch = epoch;

    if (optimistic) {
      pending = [...pending, mutate];
      invalidate();
    }
    try {
      const flags = getFlags();
      if (flags.latencyMs > 0) await sleep(flags.latencyMs);
      if (startedEpoch !== epoch) {
        throw new CareLogError("cancelled", "데모 데이터가 초기화되어 저장이 취소되었습니다.");
      }
      if (flags.failWrites) {
        throw new CareLogError("write_failed", "저장하지 못했습니다 (가상 네트워크 오류). 다시 시도해 주세요.");
      }
      const next = mutate(getConfirmed()); // "서버" 재검증 — 충돌 시 throw
      confirmed = next;
      persist(next);
      return result;
    } finally {
      if (optimistic) pending = pending.filter((m) => m !== mutate);
      invalidate();
    }
  }

  return {
    getSnapshot() {
      if (typeof window === "undefined" && !options.storage) return null;
      return snapshot();
    },

    subscribe(listener) {
      listeners.add(listener);
      const onStorage = (e: StorageEvent) => {
        if (e.key === STORAGE_KEY) {
          confirmed = null; // 다른 탭에서 변경 → 다시 읽기
          invalidate();
        }
      };
      if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(listener);
        if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
      };
    },

    upsertHealthRecord(input) {
      // 폼 저장은 확정 후 반영 (실패 시 사용자가 입력한 폼 내용이 사라지지 않도록)
      return write<HealthRecord>((cur) => {
        assertRecord(input);
        const existing = cur.records.find((r) => r.patientId === input.patientId && r.date === input.date);
        const now = nowISO();
        const record: HealthRecord = existing
          ? { ...existing, ...input, updatedAt: now, isDemo: true }
          : { ...input, id: newId("R"), createdAt: now, updatedAt: now, isDemo: true };
        return {
          result: record,
          mutate: (d) => {
            const ex = d.records.find((r) => r.patientId === input.patientId && r.date === input.date);
            return {
              ...d,
              records: ex
                ? d.records.map((r) => (r.id === ex.id ? { ...record, id: ex.id, createdAt: ex.createdAt } : r))
                : [...d.records, record],
            };
          },
        };
      }, false);
    },

    setCareMode(patientId, mode) {
      return write<void>((cur) => {
        const patient = cur.patients.find((p) => p.id === patientId);
        if (!patient) throw new CareLogError("not_found", "환자 정보를 찾을 수 없습니다.");
        if (patient.careMode === mode) return { noop: true, result: undefined };
        const ctx = { today: today(), now: nowISO(), admissionId: newId("AD"), assignRoom: assignDemoRoom };
        return { result: undefined, mutate: (d) => applyCareMode(d, patientId, mode, ctx) };
      }, true);
    },

    addVisitQuestion(patientId, text, prescriptionId) {
      return write<VisitQuestion>(() => {
        const trimmed = text.trim();
        if (!trimmed || trimmed.length > 200) {
          throw new CareLogError("invalid_input", "질문은 1~200자로 입력해 주세요.");
        }
        const now = nowISO();
        const q: VisitQuestion = { id: newId("VQ"), patientId, text: trimmed, done: false, prescriptionId, createdAt: now, updatedAt: now };
        return { result: q, mutate: (d) => ({ ...d, visitQuestions: [...d.visitQuestions, q] }) };
      }, false);
    },

    updateVisitQuestion(id, text) {
      return write<void>(() => {
        const t = text.trim();
        if (!t || t.length > 200) throw new CareLogError("invalid_input", "질문은 1~200자로 입력해 주세요.");
        return {
          result: undefined,
          mutate: (d) => ({ ...d, visitQuestions: d.visitQuestions.map((q) => (q.id === id ? { ...q, text: t, updatedAt: nowISO() } : q)) }),
        };
      }, false);
    },

    toggleVisitQuestion(id) {
      return write<void>(() => ({
        result: undefined,
        mutate: (d) => {
          if (!d.visitQuestions.some((q) => q.id === id)) throw new CareLogError("not_found", "질문을 찾을 수 없습니다.");
          return { ...d, visitQuestions: d.visitQuestions.map((q) => (q.id === id ? { ...q, done: !q.done } : q)) };
        },
      }), true);
    },

    deleteVisitQuestion(id) {
      return write<void>(() => ({
        result: undefined,
        mutate: (d) => ({ ...d, visitQuestions: d.visitQuestions.filter((q) => q.id !== id) }),
      }), true);
    },

    upsertMealLog(patch) {
      // 선택 버튼 — 화면에 먼저 반영하고, 실패하면 되돌림
      return write<MealLog>((cur) => {
        const id = `ML-${patch.patientId}-${patch.date}-${patch.slot}`;
        const existing = cur.mealLogs.find((m) => m.id === id);
        const unchanged =
          existing &&
          (patch.intake === undefined || existing.intake === patch.intake) &&
          (patch.digestion === undefined || existing.digestion === patch.digestion);
        if (unchanged) return { noop: true, result: existing }; // 같은 값 중복 클릭
        const now = nowISO();
        const merge = (base: MealLog | undefined): MealLog => ({
          ...(base ?? { id, patientId: patch.patientId, date: patch.date, slot: patch.slot, mealType: "regular" }),
          ...(patch.intake !== undefined && { intake: patch.intake }),
          ...(patch.digestion !== undefined && { digestion: patch.digestion }),
          updatedAt: now,
        });
        return {
          result: merge(existing),
          mutate: (d) => {
            const ex = d.mealLogs.find((m) => m.id === id);
            return {
              ...d,
              mealLogs: ex ? d.mealLogs.map((m) => (m.id === id ? merge(ex) : m)) : [...d.mealLogs, merge(undefined)],
            };
          },
        };
      }, true);
    },

    createRequest(input) {
      return write<LifeRequest>(() => {
        const detail = input.detail.trim();
        if (!detail || detail.length > 300) throw new CareLogError("invalid_input", "요청 내용을 입력해 주세요.");
        if (!!input.mealChange !== (input.category === "meal_change")) {
          throw new CareLogError("invalid_input", "식사 변경 요청 정보가 올바르지 않습니다.");
        }
        const now = nowISO();
        const req: LifeRequest = {
          ...input,
          detail,
          id: newId("Q"),
          status: "received",
          createdAt: now,
          updatedAt: now,
          isDemo: true,
        };
        return { result: req, mutate: (d) => ({ ...d, requests: [...d.requests, req] }) };
      }, false);
    },

    updateRequestStatus(id, expected, to, staffId) {
      const check = (d: CareLogData) => {
        const req = d.requests.find((r) => r.id === id);
        if (!req) throw new CareLogError("not_found", "요청을 찾을 수 없습니다.");
        const result = checkRequestTransition(req.status, expected, to);
        if (!result.ok) throw new CareLogError(result.code, result.message);
        return req;
      };
      return write<void>((cur) => {
        check(cur); // 화면 기준 검증 — 실패하면 데이터 변경 없음
        const now = nowISO();
        return {
          result: undefined,
          mutate: (d) => {
            const req = check(d); // "서버" 기준 재검증
            let mealLogs = d.mealLogs;
            // 식사 변경 요청이 "처리 완료"되면 그때 실제 식사 형태에 반영 (즉시 확정 X)
            if (req.mealChange && to === "completed") {
              const { date, slot, toType } = req.mealChange;
              const mlId = `ML-${req.patientId}-${date}-${slot}`;
              mealLogs = mealLogs.some((m) => m.id === mlId)
                ? mealLogs.map((m) => (m.id === mlId ? { ...m, mealType: toType, updatedAt: now } : m))
                : [...mealLogs, { id: mlId, patientId: req.patientId, date, slot, mealType: toType, updatedAt: now }];
            }
            return {
              ...d,
              mealLogs,
              requests: d.requests.map((r) => (r.id === id ? { ...r, status: to, handledBy: staffId, updatedAt: now } : r)),
            };
          },
        };
      }, true);
    },

    addStaffReview(input) {
      return write<StaffReview>(() => {
        if (input.note.length > 300) throw new CareLogError("invalid_input", "메모는 300자 이내로 입력해 주세요.");
        const review: StaffReview = { ...input, id: newId("RV"), createdAt: nowISO() };
        return { result: review, mutate: (d) => ({ ...d, reviews: [...d.reviews, review] }) };
      }, false);
    },

    setVisitQuestionShared(id, shared) {
      return write<void>(() => ({
        result: undefined,
        mutate: (d) => {
          if (!d.visitQuestions.some((q) => q.id === id)) throw new CareLogError("not_found", "질문을 찾을 수 없습니다.");
          return { ...d, visitQuestions: d.visitQuestions.map((q) => (q.id === id ? { ...q, sharedWithStaff: shared } : q)) };
        },
      }), true);
    },

    setNextVisitDate(patientId, date) {
      return write<void>(() => ({
        result: undefined,
        mutate: (d) => ({ ...d, patients: d.patients.map((p) => (p.id === patientId ? { ...p, nextVisitDate: date ?? undefined } : p)) }),
      }), false);
    },

    addMedications(patientId, inputs) {
      // 여러 약을 한 번에 확정 (전부 저장되거나 전부 실패)
      return write<void>(() => {
        if (inputs.some((i) => !i.name.trim() || i.name.trim().length > 100)) {
          throw new CareLogError("invalid_input", "약 이름을 1~100자로 입력해 주세요.");
        }
        const now = nowISO();
        const meds: Medication[] = inputs.map((i) => ({
          id: newId("M"),
          patientId,
          name: i.name.trim(),
          purpose: "",
          dosage: i.dosage.trim(),
          schedule: i.schedule.trim(),
          caution: i.caution.trim(),
          source: i.externalItemSeq ? "mfds" : "manual",
          externalItemSeq: i.externalItemSeq ?? undefined,
          visibleToGuardian: Boolean(i.visibleToGuardian),
          updatedAt: now,
          isDemo: true,
        }));
        return { result: undefined, mutate: (d) => ({ ...d, medications: [...d.medications, ...meds] }) };
      }, false);
    },

    updateMedication(id, input) {
      return write<void>(() => ({
        result: undefined,
        mutate: (d) => {
          if (!d.medications.some((m) => m.id === id)) throw new CareLogError("not_found", "약을 찾을 수 없습니다.");
          return {
            ...d,
            medications: d.medications.map((m) =>
              m.id === id
                ? {
                    ...m,
                    name: input.name.trim(),
                    dosage: input.dosage.trim(),
                    schedule: input.schedule.trim(),
                    caution: input.caution.trim(),
                    ...(input.externalItemSeq !== undefined && {
                      externalItemSeq: input.externalItemSeq ?? undefined,
                      source: input.externalItemSeq ? ("mfds" as const) : ("manual" as const),
                    }),
                    updatedAt: nowISO(),
                  }
                : m,
            ),
          };
        },
      }), false);
    },

    deleteMedication(id) {
      return write<void>(() => ({
        result: undefined,
        mutate: (d) => ({ ...d, medications: d.medications.filter((m) => m.id !== id) }),
      }), true);
    },

    setMedicationVisibility(id, visible) {
      return write<void>(() => ({
        result: undefined,
        mutate: (d) => ({ ...d, medications: d.medications.map((m) => (m.id === id ? { ...m, visibleToGuardian: visible } : m)) }),
      }), true);
    },

    updateGrantScopes(grantId, scopes) {
      return write<void>(() => {
        if (scopes.length === 0) throw new CareLogError("invalid_input", "공유 범위를 하나 이상 선택하거나 공유를 철회해 주세요.");
        return { result: undefined, mutate: (d) => ({ ...d, accessGrants: d.accessGrants.map((g) => (g.id === grantId ? { ...g, scopes } : g)) }) };
      }, false);
    },

    revokeGrant(grantId) {
      return write<void>(() => ({
        result: undefined,
        mutate: (d) => ({ ...d, accessGrants: d.accessGrants.map((g) => (g.id === grantId ? { ...g, revokedAt: g.revokedAt ?? nowISO() } : g)) }),
      }), false);
    },

    async resetDemoData() {
      epoch += 1;
      pending = [];
      confirmed = seed(today());
      persist(confirmed);
      invalidate();
    },
  };
}

export { DATA_VERSION };
