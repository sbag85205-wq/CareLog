import { describe, expect, it } from "vitest";
import { MemoryStorage } from "@/test-utils/memory-storage";
import { createLocalRxStore, seedRx } from "./local-store";
import { activeItems, endDate, filterPrescriptions, itemsOf, prescriptionLabel, sortPrescriptions, usedDepartments, usedTags } from "./model";

const TODAY = "2026-11-23";
const seed = seedRx("P001", TODAY);

describe("기록 이력 화면 규칙", () => {
  it("제목: '2026/9/1 처방 · 이비인후과 · 약 3개' / 일반약 '… 일반약 · 약국 · 제품 1개', 등록일 최신순", () => {
    const sorted = sortPrescriptions(seed.prescriptions);
    expect(sorted.map((p) => p.id)).toEqual(["OTC-DEMO-3", "RX-DEMO-3", "RX-DEMO-2", "OTC-DEMO-2", "OTC-DEMO-1", "RX-DEMO-1"]);
    const ent = { ...seed.prescriptions.find((p) => p.id === "RX-DEMO-1")!, prescribedOn: "2026-09-01" };
    expect(prescriptionLabel(ent, itemsOf(seed, ent.id).length)).toBe("2026/9/1 처방 · 이비인후과 · 약 3개");
    const otc = { ...seed.prescriptions.find((p) => p.id === "OTC-DEMO-1")!, prescribedOn: "2026-09-01" };
    expect(prescriptionLabel(otc, 1)).toBe("2026/9/1 일반약 · 가상약국 · 제품 1개");
  });

  it("진료과 → ★ 보관한 처방 → 태그로 좁히기 (예: 이비인후과 → 보관 → 속쓰림)", () => {
    expect(filterPrescriptions(seed, { department: "이비인후과" })).toHaveLength(1);
    expect(filterPrescriptions(seed, { department: "이비인후과", starredOnly: true, tags: ["속쓰림"] }).map((p) => p.id)).toEqual(["RX-DEMO-1"]);
    expect(filterPrescriptions(seed, { department: "이비인후과", tags: ["메스꺼움"] })).toEqual([]);
    expect(filterPrescriptions(seed, { starredOnly: true }).map((p) => p.id)).toEqual(["RX-DEMO-1"]);
    expect(filterPrescriptions(seed, { tags: ["증상 완화를 느꼈어요", "속쓰림"] }).map((p) => p.id)).toEqual(["RX-DEMO-1"]); // 여러 태그는 모두 포함
    expect(usedDepartments(seed)).toEqual(["내과", "이비인후과", "정형외과"]);
    expect(usedTags(seed)).toEqual(["증상 완화를 느꼈어요", "복용하기 편했어요", "불편함이 없었어요", "속쓰림", "졸림", "원인 미확인"]);
  });

  it("지금 복용 중: 최신 처방 먼저 (일반약 등록은 포함 안 됨), 복용 기간 끝나는 날", () => {
    expect(activeItems(seed).map((x) => x.item.name)).toEqual(["가상소염진통정", "가상근이완정", "가상혈압정5밀리그램"]);
    expect(endDate("2026-11-20", "5일분")).toBe("2026-11-24");
    expect(endDate("2026-11-20", "")).toBeNull();
  });
});

describe("데모 처방 저장소 (이 브라우저에만)", () => {
  const make = () => {
    const storage = new MemoryStorage();
    return {
      storage,
      store: createLocalRxStore({
        storage: () => storage,
        patientId: "P001",
        today: () => TODAY,
      }),
    };
  };
  const input = (requestId: string) => ({
    requestId,
    patientId: "P001",
    prescribedOn: "2026-11-22",
    department: "이비인후과",
    clinic: "",
    guidance: "",
    items: [
      {
        name: "가상정",
        strength: "",
        dosage: "1회 1정",
        frequency: "하루 3회",
        timing: "식후",
        duration: "3일분",
        cautionRx: "",
        cautionMfds: "",
        active: true,
      },
    ],
  });

  it("같은 등록을 다시 보내도 처방·약은 한 건", async () => {
    const { store } = make();
    const a = await store.createPrescription(input("req-1"));
    const b = await store.createPrescription(input("req-1"));
    expect(a).toBe(b);
    const s = store.getSnapshot()!;
    expect(s.prescriptions).toHaveLength(7);
    expect(s.items.filter((i) => i.prescriptionId === a)).toHaveLength(1);
  });

  it("새 처방을 등록해도 이전 처방·약·메모는 그대로, 별표·메모는 다시 열어도 유지", async () => {
    const { store, storage } = make();
    await store.createPrescription(input("req-2"));
    await store.setStarred("RX-DEMO-3", true);
    await store.addNote({
      prescriptionId: "RX-DEMO-3",
      patientId: "P001",
      itemId: null,
      tags: ["졸림"],
      memo: "(가상) 메모",
    });
    const reopened = createLocalRxStore({
      storage: () => storage,
      patientId: "P001",
      today: () => TODAY,
    }).getSnapshot()!;
    expect(reopened.prescriptions.find((p) => p.id === "RX-DEMO-3")!.starred).toBe(true);
    expect(reopened.notes.filter((n) => n.prescriptionId === "RX-DEMO-3").map((n) => n.tags)).toContainEqual(["졸림"]);
    expect(itemsOf(reopened, "RX-DEMO-1")).toHaveLength(3);
  });
});
