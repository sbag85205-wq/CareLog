/**
 * localStorage 기반 프로토타입 저장소.
 *
 * ⚠️ 가상(데모) 데이터 전용입니다. 실제 환자정보·건강정보를 저장하는 용도로 사용하지 마세요.
 *    브라우저 localStorage는 암호화·접근제어가 없습니다.
 */
import { createSeedData, DATA_VERSION } from "@/data/mock-data";
import { todayISO } from "@/lib/date";
import type { CareLogData } from "@/types";
import type { CareLogRepository } from "./types";

const STORAGE_KEY = "carelog.demo-data.v1";

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createLocalStorageRepository(): CareLogRepository {
  let data: CareLogData | null = null;
  const listeners = new Set<() => void>();

  const isBrowser = () => typeof window !== "undefined";

  function load(): CareLogData {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CareLogData;
        if (parsed.version === DATA_VERSION) return parsed;
      }
    } catch {
      // 손상되었거나 접근 불가 → 새 데모 데이터로 시작
    }
    const seeded = createSeedData();
    persist(seeded);
    return seeded;
  }

  function persist(next: CareLogData) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // 사생활 보호 모드 등에서 저장 실패 → 메모리에서만 동작
    }
  }

  /** 불변 업데이트 후 구독자에게 알림 */
  function commit(mutator: (draft: CareLogData) => CareLogData) {
    const current = data ?? load();
    data = mutator(current);
    persist(data);
    listeners.forEach((l) => l());
  }

  const nowIso = () => new Date().toISOString();

  return {
    getSnapshot() {
      if (!isBrowser()) return null;
      if (!data) data = load();
      return data;
    },

    subscribe(listener) {
      listeners.add(listener);
      const onStorage = (e: StorageEvent) => {
        if (e.key === STORAGE_KEY) {
          data = null;
          listener();
        }
      };
      window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(listener);
        window.removeEventListener("storage", onStorage);
      };
    },

    async upsertHealthRecord(input) {
      const existing = (data ?? load()).records.find(
        (r) => r.patientId === input.patientId && r.date === input.date,
      );
      const now = nowIso();
      const record = existing
        ? { ...existing, ...input, updatedAt: now, isDemo: true }
        : { ...input, id: newId("R"), createdAt: now, updatedAt: now, isDemo: true };
      commit((d) => ({
        ...d,
        records: existing
          ? d.records.map((r) => (r.id === existing.id ? record : r))
          : [...d.records, record],
      }));
      return record;
    },

    async setCareMode(patientId, mode) {
      commit((d) => ({
        ...d,
        patients: d.patients.map((p) => {
          if (p.id !== patientId) return p;
          if (mode === "inpatient") {
            return {
              ...p,
              careMode: mode,
              ward: p.ward ?? "데모병동 7층",
              room: p.room ?? "701호",
              admissionDate: p.admissionDate ?? todayISO(),
            };
          }
          return { ...p, careMode: mode };
        }),
      }));
    },

    async addVisitQuestion(patientId, text) {
      const q = { id: newId("VQ"), patientId, text, done: false, createdAt: nowIso() };
      commit((d) => ({ ...d, visitQuestions: [...d.visitQuestions, q] }));
      return q;
    },

    async toggleVisitQuestion(id) {
      commit((d) => ({
        ...d,
        visitQuestions: d.visitQuestions.map((q) => (q.id === id ? { ...q, done: !q.done } : q)),
      }));
    },

    async deleteVisitQuestion(id) {
      commit((d) => ({ ...d, visitQuestions: d.visitQuestions.filter((q) => q.id !== id) }));
    },

    async upsertMealLog(input) {
      const id = `ML-${input.patientId}-${input.date}-${input.slot}`;
      const log = { ...input, id, updatedAt: nowIso() };
      commit((d) => ({
        ...d,
        mealLogs: d.mealLogs.some((m) => m.id === id)
          ? d.mealLogs.map((m) => (m.id === id ? { ...m, ...log } : m))
          : [...d.mealLogs, log],
      }));
      return log;
    },

    async createRequest(input) {
      const now = nowIso();
      const req = { ...input, id: newId("Q"), status: "received" as const, createdAt: now, updatedAt: now, isDemo: true };
      commit((d) => ({ ...d, requests: [...d.requests, req] }));
      return req;
    },

    async updateRequestStatus(id, status, staffId) {
      commit((d) => {
        const req = d.requests.find((r) => r.id === id);
        let mealLogs = d.mealLogs;
        // 식사 변경 요청이 "처리 완료"되면 그때 실제 식사 형태에 반영 (즉시 확정 X)
        if (req?.mealChange && status === "completed") {
          const { date, slot, toType } = req.mealChange;
          const mlId = `ML-${req.patientId}-${date}-${slot}`;
          mealLogs = mealLogs.some((m) => m.id === mlId)
            ? mealLogs.map((m) => (m.id === mlId ? { ...m, mealType: toType, updatedAt: nowIso() } : m))
            : [...mealLogs, { id: mlId, patientId: req.patientId, date, slot, mealType: toType, updatedAt: nowIso() }];
        }
        return {
          ...d,
          mealLogs,
          requests: d.requests.map((r) =>
            r.id === id ? { ...r, status, handledBy: staffId, updatedAt: nowIso() } : r,
          ),
        };
      });
    },

    async addStaffReview(input) {
      const review = { ...input, id: newId("RV"), createdAt: nowIso() };
      commit((d) => ({ ...d, reviews: [...d.reviews, review] }));
      return review;
    },

    async resetDemoData() {
      commit(() => createSeedData());
    },
  };
}
