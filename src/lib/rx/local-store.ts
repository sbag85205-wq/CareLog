/**
 * 공개 데모용 처방 이력 저장소 — 가상 데이터, 이 브라우저 localStorage에만 저장 (서버 전송 없음)
 * 보호자 역할로 볼 때는 '보호자 공유'를 켠 처방만, 그리고 보호자의 '약 정보' 공유 범위가 있을 때만 보여 줍니다.
 */
import { CareLogError } from "@/lib/errors";
import type { NewPrescriptionInput, Prescription, RxItem, RxNote, RxSnapshot } from "./model";
import type { RxStore } from "./store";

export const RX_STORAGE_KEY = "carelog.demo-rx.v1";

interface Stored {
  version: 1;
  prescriptions: Prescription[];
  items: RxItem[];
  notes: RxNote[];
  /** 처리한 등록 요청 → 처방 ID (같은 등록을 다시 눌러도 한 건) */
  requests: Record<string, string>;
}

let counter = 0;
const newId = (p: string) => `${p}-${Date.now().toString(36)}-${(counter++).toString(36)}`;
const nowISO = () => new Date().toISOString();

/** 데모 처음 상태: 이전 처방 3건 (가상) — 이비인후과 처방에는 속쓰림 경험이 있고 보관됨 */
export function seedRx(patientId: string, today: string): Stored {
  const day = (offset: number) => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - offset);
    return d.toISOString().slice(0, 10);
  };
  const at = (date: string, h: number) => `${date}T${String(h - 9).padStart(2, "0")}:10:00.000Z`;
  const pr = (id: string, date: string, department: string, clinic: string, starred: boolean, guidance: string): Prescription => ({
    id,
    patientId,
    prescribedOn: date,
    department,
    clinic,
    guidance,
    starred,
    visibleToGuardian: false,
    createdAt: at(date, 19),
    updatedAt: at(date, 19),
  });
  const it = (id: string, prescriptionId: string, sort: number, o: Partial<RxItem> & Pick<RxItem, "name">): RxItem => ({
    id,
    prescriptionId,
    patientId,
    sort,
    strength: "",
    dosage: "",
    frequency: "",
    timing: "",
    duration: "",
    cautionRx: "",
    cautionMfds: "",
    active: false,
    ...o,
  });
  const ent = day(83);
  const im = day(39);
  const os = day(21);
  return {
    version: 1,
    prescriptions: [
      pr("RX-DEMO-1", ent, "이비인후과", "가상이비인후과의원", true, "(가상) 졸릴 수 있으니 운전·기계 조작에 주의하세요."),
      pr("RX-DEMO-2", im, "내과", "케어가상의원", false, ""),
      pr("RX-DEMO-3", os, "정형외과", "가상정형외과", false, "(가상) 위장 장애가 있으면 식후에 드세요."),
    ],
    items: [
      it("RXI-1", "RX-DEMO-1", 0, {
        name: "가상코감기정",
        strength: "",
        dosage: "1회 1정",
        frequency: "하루 3회",
        timing: "식후 30분",
        duration: "5일분",
      }),
      it("RXI-2", "RX-DEMO-1", 1, {
        name: "가상알레르정10밀리그램",
        strength: "10mg",
        dosage: "1회 1정",
        frequency: "하루 1회",
        timing: "취침 전",
        duration: "5일분",
        cautionMfds: "(가상 요약) 졸음이 올 수 있음",
      }),
      it("RXI-3", "RX-DEMO-1", 2, {
        name: "가상위보호정",
        dosage: "1회 1정",
        frequency: "하루 3회",
        timing: "식후 30분",
        duration: "5일분",
      }),
      it("RXI-4", "RX-DEMO-2", 0, {
        name: "가상혈압정5밀리그램",
        strength: "5mg",
        dosage: "1회 1정",
        frequency: "하루 1회",
        timing: "아침 식후",
        duration: "60일분",
        active: true,
      }),
      it("RXI-5", "RX-DEMO-3", 0, {
        name: "가상소염진통정",
        dosage: "1회 1정",
        frequency: "하루 2회",
        timing: "아침 저녁 식후",
        duration: "14일분",
        active: true,
        cautionRx: "(가상) 속이 쓰리면 우유와 함께",
      }),
      it("RXI-6", "RX-DEMO-3", 1, {
        name: "가상근이완정",
        dosage: "1회 1정",
        frequency: "하루 2회",
        timing: "아침 저녁 식후",
        duration: "14일분",
        active: true,
      }),
    ],
    notes: [
      {
        id: "RXN-1",
        prescriptionId: "RX-DEMO-1",
        patientId,
        itemId: null,
        tags: ["증상이 줄었어요", "속쓰림"],
        memo: "(가상) 콧물은 사흘 만에 줄었는데 저녁 약 먹고 속이 쓰렸어요.",
        createdAt: at(day(80), 21),
        updatedAt: at(day(80), 21),
      },
      {
        id: "RXN-2",
        prescriptionId: "RX-DEMO-1",
        patientId,
        itemId: "RXI-2",
        tags: ["졸림"],
        memo: "(가상) 아침까지 졸렸어요.",
        createdAt: at(day(79), 9),
        updatedAt: at(day(79), 9),
      },
      {
        id: "RXN-3",
        prescriptionId: "RX-DEMO-3",
        patientId,
        itemId: null,
        tags: ["복용하기 편했어요"],
        memo: "",
        createdAt: at(day(18), 20),
        updatedAt: at(day(18), 20),
      },
    ],
    requests: {},
  };
}

export interface LocalRxOptions {
  storage?: () => Storage;
  patientId: string;
  today: () => string;
  /** 보호자로 볼 때: 공유된 처방만 (보호자의 '약 정보' 공유 범위가 있어야 함) */
  viewer?: () => {
    role: "patient" | "guardian";
    guardianHasMedicationScope: boolean;
  };
}

export function createLocalRxStore(o: LocalRxOptions): RxStore & { reset(): void } {
  const storage = () => (o.storage ? o.storage() : window.localStorage);
  const listeners = new Set<() => void>();
  let cache: Stored | null = null;
  let view: RxSnapshot | null = null;
  let viewKey = "";

  function read(): Stored {
    if (cache) return cache;
    try {
      const raw = storage().getItem(RX_STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as Stored) : null;
      cache = parsed && parsed.version === 1 ? parsed : seedRx(o.patientId, o.today());
    } catch {
      cache = seedRx(o.patientId, o.today());
    }
    return cache;
  }
  function write(next: Stored) {
    cache = next;
    view = null;
    try {
      storage().setItem(RX_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* 저장 공간이 없어도 화면에서는 계속 사용 */
    }
    listeners.forEach((l) => l());
  }
  const touch = <T extends { updatedAt: string }>(x: T): T => ({
    ...x,
    updatedAt: nowISO(),
  });

  return {
    getSnapshot() {
      if (typeof window === "undefined" && !o.storage) return null;
      const d = read();
      const v = o.viewer?.() ?? {
        role: "patient" as const,
        guardianHasMedicationScope: false,
      };
      const key = `${v.role}:${v.guardianHasMedicationScope}`;
      if (view && viewKey === key) return view;
      viewKey = key;
      if (v.role === "guardian") {
        const shared = v.guardianHasMedicationScope ? d.prescriptions.filter((p) => p.visibleToGuardian) : [];
        const ids = new Set(shared.map((p) => p.id));
        view = {
          prescriptions: shared,
          items: d.items.filter((i) => ids.has(i.prescriptionId)),
          notes: d.notes.filter((n) => ids.has(n.prescriptionId)),
          available: true,
        };
      } else {
        view = {
          prescriptions: d.prescriptions,
          items: d.items,
          notes: d.notes,
          available: true,
        };
      }
      return view;
    },
    subscribe(l) {
      listeners.add(l);
      const onStorage = (e: StorageEvent) => {
        if (e.key === RX_STORAGE_KEY) {
          cache = null;
          view = null;
          listeners.forEach((x) => x());
        }
      };
      if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(l);
        if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
      };
    },
    async load() {},

    async createPrescription(input: NewPrescriptionInput) {
      const d = read();
      const done = d.requests[input.requestId];
      if (done) return done; // 다시 눌러도 같은 처방
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.prescribedOn)) throw new CareLogError("invalid_input", "처방일을 확인해 주세요.");
      if (input.items.length === 0 || input.items.some((i) => !i.name.trim())) throw new CareLogError("invalid_input", "약 이름을 확인해 주세요.");
      const now = nowISO();
      const id = newId("RX");
      const p: Prescription = {
        id,
        patientId: input.patientId,
        prescribedOn: input.prescribedOn,
        department: input.department.trim(),
        clinic: input.clinic.trim(),
        guidance: input.guidance.trim(),
        starred: false,
        visibleToGuardian: false,
        createdAt: now,
        updatedAt: now,
      };
      const items: RxItem[] = input.items.map((i, sort) => ({
        ...i,
        name: i.name.trim(),
        id: newId("RXI"),
        prescriptionId: id,
        patientId: input.patientId,
        sort,
      }));
      write({
        ...d,
        prescriptions: [...d.prescriptions, p],
        items: [...d.items, ...items],
        requests: { ...d.requests, [input.requestId]: id },
      });
      return id;
    },
    async updatePrescription(id, patch) {
      const d = read();
      write({
        ...d,
        prescriptions: d.prescriptions.map((p) => (p.id === id ? touch({ ...p, ...patch }) : p)),
      });
    },
    async setStarred(id, starred) {
      const d = read();
      write({
        ...d,
        prescriptions: d.prescriptions.map((p) => (p.id === id ? touch({ ...p, starred }) : p)),
      });
    },
    async setVisibleToGuardian(id, visibleToGuardian) {
      const d = read();
      write({
        ...d,
        prescriptions: d.prescriptions.map((p) => (p.id === id ? touch({ ...p, visibleToGuardian }) : p)),
      });
    },
    async setItemActive(itemId, active) {
      const d = read();
      write({
        ...d,
        items: d.items.map((i) => (i.id === itemId ? { ...i, active } : i)),
      });
    },
    async addNote(n) {
      if (n.tags.length === 0 && !n.memo.trim()) throw new CareLogError("invalid_input", "태그를 고르거나 메모를 적어 주세요.");
      const d = read();
      const now = nowISO();
      write({
        ...d,
        notes: [
          ...d.notes,
          {
            ...n,
            memo: n.memo.trim(),
            id: newId("RXN"),
            createdAt: now,
            updatedAt: now,
          },
        ],
      });
    },
    async updateNote(id, patch) {
      const d = read();
      write({
        ...d,
        notes: d.notes.map((x) => (x.id === id ? touch({ ...x, ...patch, memo: patch.memo.trim() }) : x)),
      });
    },
    async deleteNote(id) {
      const d = read();
      write({ ...d, notes: d.notes.filter((x) => x.id !== id) });
    },
    reset() {
      write(seedRx(o.patientId, o.today()));
    },
  };
}
