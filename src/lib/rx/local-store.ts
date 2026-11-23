/**
 * 공개 데모용 약 기록 저장소 — 가상 데이터, 이 브라우저 localStorage에만 저장 (서버 전송 없음)
 * 공유받은 사람(데모 '함께 보는 사람')은 기록 표를 직접 볼 수 없고, 고른 기록·고른 항목만 받음 (DB 함수와 같은 규칙)
 */
import { CareLogError } from "@/lib/errors";
import { classify, mfdsClassText } from "./categories";
import {
  buildSharedRecord,
  shareActive,
  type NewPrescriptionInput,
  type Prescription,
  type Relation,
  type RxIntake,
  type RxItem,
  type RxNote,
  type RxShare,
  type RxSnapshot,
} from "./model";
import type { RxStore } from "./store";

export const RX_STORAGE_KEY = "carelog.demo-rx.v2";

interface Stored {
  version: 2;
  prescriptions: Prescription[];
  items: RxItem[];
  notes: RxNote[];
  intakes: RxIntake[];
  shares: RxShare[];
  relations: Record<string, Relation>;
  /** 처리한 등록 요청 → ID (같은 등록을 다시 눌러도 한 건) */
  requests: Record<string, string>;
}

let counter = 0;
const newId = (p: string) => `${p}-${Date.now().toString(36)}-${(counter++).toString(36)}`;
const nowISO = () => new Date().toISOString();

/** 데모 가상 제품의 식약처 형식 정보 (drug-catalog.ts 와 같은 값) */
const PRODUCT = {
  pain: {
    seq: "900000101",
    name: "가상진통정500밀리그램",
    ingredients: "아세트아미노펜",
    strength: "500mg",
    company: "가상제약(주)",
    type: "[01140]해열.진통.소염제",
  },
  ibu: {
    seq: "900000102",
    name: "가상이부펜정200밀리그램",
    ingredients: "이부프로펜",
    strength: "200mg",
    company: "가상헬스",
    type: "[01140]해열.진통.소염제",
  },
} as const;

/**
 * 데모 처음 상태 (모두 가상)
 * - 일반약: 가상진통정(두 번 등록 — 같은 제품의 날짜별 경험), 가상이부펜정(속쓰림, 원인 미확인)
 * - 처방: 이비인후과(★, 처방 전체에 속쓰림), 내과(혈압약 정기 복용), 정형외과(복용 중)
 */
export function seedRx(patientId: string, today: string): Stored {
  const day = (offset: number) => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - offset);
    return d.toISOString().slice(0, 10);
  };
  const at = (date: string, h: number) => `${date}T${String(h - 9).padStart(2, "0")}:10:00.000Z`;
  const rec = (id: string, date: string, o: Partial<Prescription> & Pick<Prescription, "kind" | "source">): Prescription => ({
    id,
    patientId,
    prescribedOn: date,
    department: "",
    clinic: "",
    guidance: "",
    starred: false,
    visibleToGuardian: false,
    createdAt: at(date, 19),
    updatedAt: at(date, 19),
    ...o,
  });
  const it = (id: string, prescriptionId: string, sort: number, o: Partial<RxItem> & Pick<RxItem, "name">, type?: string): RxItem => {
    const c = classify(type, o.ingredients);
    return {
      id,
      prescriptionId,
      patientId,
      sort,
      strength: "",
      ingredients: "",
      company: "",
      drugClass: "",
      mfdsClass: type ? mfdsClassText(type) : "",
      categories: c.categories,
      categorySource: c.source,
      dosage: "",
      frequency: "",
      timing: "",
      duration: "",
      cautionRx: "",
      cautionMfds: "",
      active: false,
      starred: false,
      scheduleSlots: [],
      ...o,
    };
  };
  const note = (id: string, prescriptionId: string, itemId: string | null, takenOn: string | null, tags: string[], memo: string, summary = ""): RxNote => ({
    id,
    prescriptionId,
    patientId,
    itemId,
    takenOn,
    tags,
    memo,
    suggestedTags: summary ? tags : [],
    summary,
    summarySource: summary ? "rule" : "",
    createdAt: at(takenOn ?? today, 21),
    updatedAt: at(takenOn ?? today, 21),
  });
  const otc = (p: (typeof PRODUCT)[keyof typeof PRODUCT]) => ({
    name: p.name,
    ingredients: p.ingredients,
    strength: p.strength,
    company: p.company,
    drugClass: "otc" as const,
    externalItemSeq: p.seq,
    dosage: "1회 1정",
    frequency: "필요할 때",
  });
  const ent = day(83);
  const otc1 = day(82);
  const otc2 = day(52);
  const im = day(39);
  const os = day(21);
  const otc3 = day(9);
  return {
    version: 2,
    prescriptions: [
      rec("RX-DEMO-1", ent, {
        kind: "prescription",
        source: "prescription",
        department: "이비인후과",
        clinic: "가상이비인후과의원",
        starred: true,
        guidance: "(가상) 졸릴 수 있으니 운전·기계 조작에 주의하세요.",
      }),
      rec("OTC-DEMO-1", otc1, { kind: "otc", source: "otc_box", clinic: "가상약국" }),
      rec("OTC-DEMO-2", otc2, { kind: "otc", source: "receipt", clinic: "가상온누리약국" }),
      rec("RX-DEMO-2", im, { kind: "prescription", source: "prescription", department: "내과", clinic: "케어가상의원" }),
      rec("RX-DEMO-3", os, {
        kind: "prescription",
        source: "prescription",
        department: "정형외과",
        clinic: "가상정형외과",
        guidance: "(가상) 위장 장애가 있으면 식후에 드세요.",
      }),
      rec("OTC-DEMO-3", otc3, { kind: "otc", source: "search", clinic: "" }),
    ],
    items: [
      it(
        "RXI-1",
        "RX-DEMO-1",
        0,
        { name: "가상코감기정", ingredients: "", dosage: "1회 1정", frequency: "하루 3회", timing: "식후 30분", duration: "5일분", drugClass: "rx" },
        "[01180]종합감기제",
      ),
      it(
        "RXI-2",
        "RX-DEMO-1",
        1,
        {
          name: "가상알레르정10밀리그램",
          strength: "10mg",
          ingredients: "세티리진염산염",
          dosage: "1회 1정",
          frequency: "하루 1회",
          timing: "취침 전",
          duration: "5일분",
          cautionMfds: "(가상 요약) 졸음이 올 수 있음",
          drugClass: "rx",
        },
        "[01410]항히스타민제",
      ),
      it("RXI-3", "RX-DEMO-1", 2, { name: "가상위보호정", dosage: "1회 1정", frequency: "하루 3회", timing: "식후 30분", duration: "5일분" }),
      it("OTCI-1", "OTC-DEMO-1", 0, otc(PRODUCT.pain), PRODUCT.pain.type),
      it("OTCI-2", "OTC-DEMO-2", 0, otc(PRODUCT.ibu), PRODUCT.ibu.type),
      it(
        "RXI-4",
        "RX-DEMO-2",
        0,
        {
          name: "가상혈압정5밀리그램",
          strength: "5mg",
          ingredients: "암로디핀베실산염",
          dosage: "1회 1정",
          frequency: "하루 1회",
          timing: "아침 식후",
          duration: "60일분",
          active: true,
          drugClass: "rx",
          scheduleSlots: ["morning"],
        },
        "[02140]혈압강하제",
      ),
      it(
        "RXI-5",
        "RX-DEMO-3",
        0,
        {
          name: "가상소염진통정",
          ingredients: "아세클로페낙",
          dosage: "1회 1정",
          frequency: "하루 2회",
          timing: "아침 저녁 식후",
          duration: "14일분",
          active: true,
          cautionRx: "(가상) 속이 쓰리면 우유와 함께",
          drugClass: "rx",
          scheduleSlots: ["morning", "evening"],
        },
        "[01140]해열.진통.소염제",
      ),
      it("RXI-6", "RX-DEMO-3", 1, {
        name: "가상근이완정",
        dosage: "1회 1정",
        frequency: "하루 2회",
        timing: "아침 저녁 식후",
        duration: "14일분",
        active: true,
        scheduleSlots: ["morning", "evening"],
      }),
      it("OTCI-3", "OTC-DEMO-3", 0, otc(PRODUCT.pain), PRODUCT.pain.type),
    ],
    notes: [
      note(
        "RXN-1",
        "RX-DEMO-1",
        null,
        day(80),
        ["증상 완화를 느꼈어요", "속쓰림", "원인 미확인"],
        "(가상) 콧물은 사흘 만에 줄었는데 저녁 약 먹고 속이 쓰렸어요. 어느 약 때문인지는 모르겠어요.",
        "함께 먹은 약 복용 후 '증상 완화를 느꼈어요'라고 기록함. 속쓰림을 경험했다고 기록함. 원인 약물은 확인되지 않음.",
      ),
      note("RXN-2", "RX-DEMO-1", "RXI-2", day(79), ["졸림"], "(가상) 아침까지 졸렸어요."),
      note(
        "OTCN-1",
        "OTC-DEMO-1",
        "OTCI-1",
        day(81),
        ["증상 완화를 느꼈어요", "복용하기 편했어요"],
        "(가상) 두통이 있을 때 먹었는데 이전보다 편했다고 느꼈어요.",
      ),
      note(
        "OTCN-2",
        "OTC-DEMO-2",
        "OTCI-2",
        day(50),
        ["속쓰림", "원인 미확인"],
        "(가상) 복용한 날 저녁에 속이 쓰렸어요. 약 때문인지는 모르겠어요.",
        "가상이부펜정200밀리그램 복용 후 속쓰림을 경험했다고 기록함. 약과의 관련성은 확인되지 않음.",
      ),
      note("RXN-3", "RX-DEMO-3", null, day(18), ["복용하기 편했어요"], ""),
      note("OTCN-3", "OTC-DEMO-3", "OTCI-3", day(8), ["불편함이 없었어요"], "(가상) 이번에도 특별히 불편한 점은 없었어요."),
    ],
    intakes: [],
    shares: [],
    relations: {},
    requests: {},
  };
}

export interface LocalRxOptions {
  storage?: () => Storage;
  patientId: string;
  today: () => string;
  /** 공유받은 사람으로 볼 때: 그 사람에게 공유된 기록·허용 항목만 */
  viewer?: () => { role: "patient" | "guardian"; userId?: string; grantActive?: boolean };
  /** 공유 상대가 지금 승인된 공유 관계인지 (철회된 관계에는 새로 공유할 수 없음) */
  hasActiveGrant?: (granteeId: string) => boolean;
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
      cache = parsed && parsed.version === 2 ? parsed : seedRx(o.patientId, o.today());
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
  const touch = <T extends { updatedAt: string }>(x: T): T => ({ ...x, updatedAt: nowISO() });
  const mine = (patientId: string) => {
    if (patientId !== o.patientId) throw new CareLogError("forbidden", "본인 기록만 바꿀 수 있어요.");
  };
  const ownItem = (d: Stored, itemId: string) => {
    const i = d.items.find((x) => x.id === itemId);
    if (!i) throw new CareLogError("not_found", "약을 찾을 수 없어요.");
    return i;
  };

  return {
    getSnapshot() {
      if (typeof window === "undefined" && !o.storage) return null;
      const d = read();
      const v = o.viewer?.() ?? { role: "patient" as const };
      const now = nowISO().slice(0, 13); // 시간 단위로만 다시 계산 (매 렌더링마다 새 객체 금지)
      const key = `${v.role}:${v.userId ?? ""}:${v.grantActive ?? ""}:${now}`;
      if (view && viewKey === key) return view;
      viewKey = key;
      if (v.role === "guardian") {
        // 기록 표는 볼 수 없음 — 나에게 공유된 기록, 허용한 항목만
        const nowIso = nowISO();
        const shared = v.grantActive
          ? d.shares
              .filter((s) => s.granteeId === v.userId && shareActive(s, nowIso))
              .map((s) => buildSharedRecord(d, s))
              .filter((x): x is NonNullable<typeof x> => x !== null)
          : [];
        view = { prescriptions: [], items: [], notes: [], intakes: [], shares: [], relations: {}, shared, available: true };
      } else {
        view = {
          prescriptions: d.prescriptions,
          items: d.items,
          notes: d.notes,
          intakes: d.intakes,
          shares: d.shares,
          relations: d.relations,
          shared: [],
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
      if (done) return done; // 다시 눌러도 같은 기록
      mine(input.patientId);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.prescribedOn)) throw new CareLogError("invalid_input", "날짜를 확인해 주세요.");
      if (input.items.length === 0 || input.items.some((i) => !i.name.trim())) throw new CareLogError("invalid_input", "약 이름을 확인해 주세요.");
      const now = nowISO();
      const kind = input.kind ?? "prescription";
      const id = newId(kind === "otc" ? "OTC" : "RX");
      const p: Prescription = {
        id,
        patientId: input.patientId,
        kind,
        source: input.source ?? (kind === "otc" ? "search" : "prescription"),
        prescribedOn: input.prescribedOn,
        department: kind === "otc" ? "" : input.department.trim(),
        clinic: input.clinic.trim(),
        guidance: input.guidance.trim(),
        starred: false,
        visibleToGuardian: false,
        createdAt: now,
        updatedAt: now,
      };
      const items: RxItem[] = input.items.map((i, sort) => ({
        ingredients: "",
        company: "",
        drugClass: "",
        mfdsClass: "",
        categories: ["unclassified"],
        categorySource: "none",
        scheduleSlots: [],
        ...i,
        name: i.name.trim(),
        id: newId("RXI"),
        prescriptionId: id,
        patientId: input.patientId,
        starred: false,
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
      write({ ...d, prescriptions: d.prescriptions.map((p) => (p.id === id ? touch({ ...p, ...patch }) : p)) });
    },
    async setStarred(id, starred) {
      const d = read();
      write({ ...d, prescriptions: d.prescriptions.map((p) => (p.id === id ? touch({ ...p, starred }) : p)) });
    },
    async setVisibleToGuardian(id, visibleToGuardian) {
      const d = read();
      write({ ...d, prescriptions: d.prescriptions.map((p) => (p.id === id ? touch({ ...p, visibleToGuardian }) : p)) });
    },
    async setItemActive(itemId, active) {
      const d = read();
      write({ ...d, items: d.items.map((i) => (i.id === itemId ? { ...i, active } : i)) });
    },
    async updateItem(itemId, patch) {
      const d = read();
      ownItem(d, itemId);
      if (patch.categories && patch.categories.length === 0) throw new CareLogError("invalid_input", "약 종류를 하나 이상 골라 주세요.");
      write({ ...d, items: d.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) });
    },
    async addNote(n) {
      if (n.tags.length === 0 && !n.memo.trim()) throw new CareLogError("invalid_input", "태그를 고르거나 메모를 적어 주세요.");
      const d = read();
      mine(n.patientId);
      const now = nowISO();
      write({
        ...d,
        notes: [
          ...d.notes,
          {
            takenOn: null,
            suggestedTags: [],
            summary: "",
            summarySource: "",
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
      write({ ...d, notes: d.notes.map((x) => (x.id === id ? touch({ ...x, ...patch, memo: patch.memo.trim() }) : x)) });
    },
    async deleteNote(id) {
      const d = read();
      write({ ...d, notes: d.notes.filter((x) => x.id !== id) });
    },
    async logIntake(input) {
      const d = read();
      mine(input.patientId);
      ownItem(d, input.itemId);
      // 정해진 시간대는 하루 한 번 (다시 눌러도 한 건), 필요할 때 먹는 약은 먹을 때마다
      if (input.slot !== "prn" && d.intakes.some((x) => x.itemId === input.itemId && x.takenOn === input.takenOn && x.slot === input.slot)) return;
      write({ ...d, intakes: [...d.intakes, { ...input, id: newId("INT"), createdAt: nowISO() }] });
    },
    async removeIntake(id) {
      const d = read();
      write({ ...d, intakes: d.intakes.filter((x) => x.id !== id) });
    },
    async shareRecord(input) {
      const d = read();
      mine(input.patientId);
      if (!d.prescriptions.some((p) => p.id === input.prescriptionId && p.patientId === input.patientId))
        throw new CareLogError("not_found", "기록을 찾을 수 없어요.");
      if (o.hasActiveGrant && !o.hasActiveGrant(input.granteeId))
        throw new CareLogError("forbidden", "공유가 철회된 사람에게는 공유할 수 없어요. 다시 초대해 주세요.");
      const now = nowISO();
      // 같은 기록·같은 사람의 활성 공유는 하나 — 새 설정으로 바꿈
      const shares = d.shares.map((s) =>
        s.prescriptionId === input.prescriptionId && s.granteeId === input.granteeId && !s.revokedAt ? { ...s, revokedAt: now } : s,
      );
      write({ ...d, shares: [...shares, { ...input, id: newId("SHR"), revokedAt: null, createdAt: now }] });
    },
    async revokeShare(id) {
      const d = read();
      const now = nowISO();
      write({ ...d, shares: d.shares.map((s) => (s.id === id && !s.revokedAt ? { ...s, revokedAt: now } : s)) });
    },
    async setRelation({ patientId, granteeId, relation }) {
      mine(patientId);
      const d = read();
      write({ ...d, relations: { ...d.relations, [granteeId]: relation } });
    },
    reset() {
      write(seedRx(o.patientId, o.today()));
    },
  };
}
