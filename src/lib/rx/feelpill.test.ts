/**
 * FeelPill 약 기록 — 분류·태그 제안·찾기·같은 제품 묶기·공유 항목 (가상 데이터)
 */
import { describe, expect, it } from "vitest";
import { classify, classNumber, mfdsClassText } from "./categories";
import { suggestTags, summarize } from "./experience-tagger";
import { createLocalRxStore, seedRx } from "./local-store";
import { buildSharedRecord, experienceSentence, filterItems, filterPrescriptions, productTimeline, sameProduct, type RxItem, type RxShare } from "./model";

describe("약 종류 자동 분류 (식약처 약효 분류 → 주성분 → 미분류)", () => {
  it("약효 분류 번호 형식", () => {
    expect(classNumber("[01140]해열.진통.소염제")).toBe("114");
    expect(classNumber("01140")).toBe("114");
    expect(classNumber("[02330]건위소화제")).toBe("233");
    expect(classNumber("114")).toBe("114");
    expect(classNumber("가상 분류")).toBeNull();
    expect(mfdsClassText("[01140]해열.진통.소염제")).toBe("114 해열·진통·소염제");
  });

  it("공식 분류·성분이 있으면 그대로, 소염진통 성분은 두 종류에 함께", () => {
    expect(classify("[01140]해열.진통.소염제", "아세트아미노펜")).toMatchObject({ categories: ["pain"], source: "mfds" });
    expect(classify("[01140]해열.진통.소염제", "이부프로펜")).toMatchObject({ categories: ["pain", "antiinflam"], source: "mfds" });
    expect(classify("[01180]종합감기제", "아세트아미노펜, 클로르페니라민말레산염")).toMatchObject({ categories: ["pain", "cold", "allergy"] });
    expect(classify(undefined, "세티리진염산염")).toMatchObject({ categories: ["allergy"], source: "ingredient" });
  });

  it("근거가 없으면 지어내지 않고 '미분류 · 확인 필요', 대응 없는 분류 번호는 '기타'", () => {
    expect(classify(undefined, undefined)).toMatchObject({ categories: ["unclassified"], source: "none" });
    expect(classify("가상 분류", "가상성분")).toMatchObject({ categories: ["unclassified"], source: "none" });
    expect(classify("[04210]항악성종양제", "")).toMatchObject({ categories: ["other"], source: "mfds" });
  });
});

describe("복용 경험 태그 제안 (규칙 기반 · 원인 단정 없음)", () => {
  it.each([
    ["이 약 먹었을 때 두통이 좀 나아졌어.", ["증상 완화를 느꼈어요"]],
    ["먹고 나서 너무 졸렸어.", ["졸림"]],
    ["알약이 너무 커서 삼키기 힘들었어.", ["알약이 너무 커요", "삼키기 어려워요"]],
    ["먹은 날 속이 쓰렸는데 약 때문인지는 모르겠어.", ["속쓰림", "원인 미확인"]],
    ["전에 먹었을 때는 괜찮았는데 이번에는 메스꺼웠어.", ["메스꺼움"]],
    ["감기약 먹고 하루 종일 너무 졸렸어. 근데 감기 때문인지 약 때문인지는 모르겠어.", ["졸림", "원인 미확인"]],
    ["지난번에 먹었을 때 속이 쓰렸어.", ["속쓰림"]],
    ["두통이 있을 때 먹었는데 이전보다 편했다고 느꼈어요.", []],
    ["콧물은 줄었는데 속이 쓰렸어요", ["증상 완화를 느꼈어요", "속쓰림"]],
  ])("%s", (memo, tags) => {
    expect(suggestTags(memo)).toEqual(tags);
  });

  it("정리 문장은 기록체, 불편 경험에는 관련성 미확인 문구", () => {
    expect(summarize(["졸림", "원인 미확인"], { itemName: "가상감기약" })).toBe("가상감기약 복용 후 졸림을 경험했다고 기록함. 약과의 관련성은 확인되지 않음.");
    expect(summarize(["속쓰림"], { wholeRecord: true })).toBe("함께 먹은 약 복용 후 속쓰림을 경험했다고 기록함. 원인 약물은 확인되지 않음.");
    expect(summarize(["복용하기 편했어요"])).toBe("복용 후 '복용하기 편했어요'라고 기록함.");
  });
});

const TODAY = "2026-11-23";
const seed = () => seedRx("P001", TODAY);

describe("찾기 — 날짜·진료과·약 종류·경험 태그·★·제품명을 함께", () => {
  it("약 종류 '진통·해열제' → 과거 일반약·처방 약 모두 (같은 제품 2회 등록 포함)", () => {
    const rows = filterItems(seed(), { category: "pain" });
    expect(rows.map((r) => r.item.name)).toEqual(["가상진통정500밀리그램", "가상소염진통정", "가상이부펜정200밀리그램", "가상진통정500밀리그램"]);
  });

  it("경험 '속쓰림' + 약 종류 '소염진통제' → 이부펜정만 (처방 전체 메모의 속쓰림은 그 처방의 약에도 연결)", () => {
    expect(filterItems(seed(), { tags: ["속쓰림"], category: "antiinflam" }).map((r) => r.item.name)).toEqual(["가상이부펜정200밀리그램"]);
    expect(filterItems(seed(), { tags: ["속쓰림"] }).map((r) => r.item.name)).toContain("가상알레르정10밀리그램");
  });

  it("진료과 '이비인후과' + ★ → 보관한 처방, 달·종류·현재 복용으로 좁히기", () => {
    const s = seed();
    expect(filterPrescriptions(s, { department: "이비인후과", starredOnly: true }).map((p) => p.id)).toEqual(["RX-DEMO-1"]);
    const month = s.prescriptions.find((p) => p.id === "OTC-DEMO-2")!.prescribedOn.slice(0, 7);
    expect(filterPrescriptions(s, { month }).map((p) => p.id)).toContain("OTC-DEMO-2");
    expect(filterPrescriptions(s, { kind: "otc" }).every((p) => p.kind === "otc")).toBe(true);
    expect(filterItems(s, { use: "current" }).map((r) => r.item.name)).toEqual(["가상소염진통정", "가상근이완정", "가상혈압정5밀리그램"]);
    expect(filterItems(s, { query: "아세트아미노" }).length).toBe(2);
    expect(filterItems(s, { query: "없는약" })).toEqual([]);
  });

  it("★는 약 단위로도: 약에 ★를 하면 그 약만, 원래 이력(묶음)도 그대로", () => {
    const s = seed();
    s.items = s.items.map((i) => (i.id === "OTCI-2" ? { ...i, starred: true } : i));
    expect(filterItems(s, { starredOnly: true }).map((r) => r.item.id)).toEqual(["OTCI-2", "RXI-1", "RXI-2", "RXI-3"]);
    expect(filterPrescriptions(s, {}).map((p) => p.id)).toContain("OTC-DEMO-2");
  });
});

describe("같은 제품 묶기 — 품목기준코드가 같을 때만", () => {
  it("같은 제품은 날짜별 경험이 누적되고, 이름이 같아도 코드가 없거나 다르면 합치지 않음", () => {
    const s = seed();
    const pain = s.items.find((i) => i.id === "OTCI-1")!;
    expect(sameProduct(s, pain).map((r) => r.item.id)).toEqual(["OTCI-3", "OTCI-1"]);
    expect(productTimeline(s, pain).map((t) => t.note.id)).toEqual(["OTCN-3", "OTCN-1"]);

    const twin: RxItem = { ...pain, id: "TWIN", externalItemSeq: "900000106", prescriptionId: "OTC-DEMO-3" };
    const noCode: RxItem = { ...pain, id: "NOCODE", externalItemSeq: undefined, prescriptionId: "OTC-DEMO-3" };
    const s2 = { ...s, items: [...s.items, twin, noCode] };
    expect(sameProduct(s2, pain).map((r) => r.item.id)).toEqual(["OTCI-3", "OTCI-1"]);
    expect(sameProduct(s2, noCode).map((r) => r.item.id)).toEqual(["NOCODE"]);
  });
});

describe("진료 때 보여줄 문장 — 사용자의 기록, 원인 단정 없음", () => {
  it("처방 전체 경험", () => {
    const s = seed();
    const p = { ...s.prescriptions.find((x) => x.id === "RX-DEMO-1")!, prescribedOn: "2026-09-01" };
    const n = { ...s.notes.find((x) => x.id === "RXN-1")!, takenOn: null, tags: ["속쓰림"] };
    expect(experienceSentence(p, n)).toBe("2026.09.01 처방받은 약들을 복용한 날 속쓰림을 경험했다고 기록함. 원인 약물은 확인되지 않음.");
  });
});

describe("선택 공유 — 허용한 항목만 담음", () => {
  it("경험만 공유하면 성분·함량·복용 방법·진료과는 결과에 없음", () => {
    const s = seed();
    const share: RxShare = {
      id: "S1",
      patientId: "P001",
      prescriptionId: "OTC-DEMO-2",
      granteeId: "G",
      fields: ["experience"],
      expiresAt: null,
      revokedAt: null,
      createdAt: TODAY,
    };
    const r = buildSharedRecord(s, share)!;
    expect(Object.keys(r.items[0]).sort()).toEqual(["categories", "name"]);
    expect(r.notes?.[0].tags).toEqual(["속쓰림", "원인 미확인"]);
    expect(r).not.toHaveProperty("department");
    const r2 = buildSharedRecord(s, { ...share, prescriptionId: "RX-DEMO-1", fields: ["ingredients", "department"] })!;
    expect(r2).toMatchObject({ department: "이비인후과" });
    expect(r2).not.toHaveProperty("notes");
    expect(buildSharedRecord(s, { ...share, patientId: "OTHER" })).toBeNull();
  });
});

describe("데모 저장소", () => {
  const mem = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    } as unknown as Storage;
  };

  it("일반약 등록은 '복용 중'·'복용 체크'로 처리하지 않음, 같은 요청은 한 건", async () => {
    const storage = mem();
    const st = createLocalRxStore({ storage: () => storage, patientId: "P001", today: () => TODAY });
    const before = st.getSnapshot()!;
    const input = {
      requestId: "r1",
      patientId: "P001",
      kind: "otc" as const,
      source: "otc_box" as const,
      prescribedOn: TODAY,
      department: "이비인후과",
      clinic: "",
      guidance: "",
      items: [{ name: "가상소화정", strength: "", dosage: "", frequency: "", timing: "", duration: "", cautionRx: "", cautionMfds: "", active: false }],
    };
    const id = await st.createPrescription(input);
    expect(await st.createPrescription(input)).toBe(id);
    const after = st.getSnapshot()!;
    expect(after.prescriptions.length).toBe(before.prescriptions.length + 1);
    const p = after.prescriptions.find((x) => x.id === id)!;
    expect(p).toMatchObject({ kind: "otc", department: "" });
    expect(after.items.find((i) => i.prescriptionId === id)).toMatchObject({ active: false, categories: ["unclassified"] });
    expect(after.intakes).toEqual([]);
    // 이전 기록은 그대로
    expect(before.prescriptions.every((x) => after.prescriptions.some((y) => y.id === x.id && y.updatedAt === x.updatedAt))).toBe(true);
  });

  it("공유받은 사람: 공유한 기록만, 철회·관계 철회 즉시 0건", async () => {
    const storage = mem();
    let viewer: { role: "patient" | "guardian"; userId?: string; grantActive?: boolean } = { role: "patient" };
    const st = createLocalRxStore({ storage: () => storage, patientId: "P001", today: () => TODAY, viewer: () => viewer, hasActiveGrant: () => true });
    await st.shareRecord({ patientId: "P001", prescriptionId: "OTC-DEMO-2", granteeId: "G", fields: ["experience"], expiresAt: null });
    viewer = { role: "guardian", userId: "G", grantActive: true };
    const g = st.getSnapshot()!;
    expect(g.prescriptions).toEqual([]);
    expect(g.shared.map((r) => r.items[0].name)).toEqual(["가상이부펜정200밀리그램"]);
    viewer = { role: "guardian", userId: "OTHER", grantActive: true };
    expect(st.getSnapshot()!.shared).toEqual([]);
    viewer = { role: "guardian", userId: "G", grantActive: false };
    expect(st.getSnapshot()!.shared).toEqual([]);
    viewer = { role: "patient" };
    const shareId = st.getSnapshot()!.shares[0].id;
    await st.revokeShare(shareId);
    viewer = { role: "guardian", userId: "G", grantActive: true };
    expect(st.getSnapshot()!.shared).toEqual([]);
  });

  it("복용 체크: 같은 시간대는 한 번, 필요할 때는 여러 번", async () => {
    const storage = mem();
    const st = createLocalRxStore({ storage: () => storage, patientId: "P001", today: () => TODAY });
    const x = { patientId: "P001", itemId: "RXI-4", takenOn: TODAY, slot: "morning" as const };
    await st.logIntake(x);
    await st.logIntake(x);
    await st.logIntake({ ...x, itemId: "OTCI-1", slot: "prn" });
    await st.logIntake({ ...x, itemId: "OTCI-1", slot: "prn" });
    expect(st.getSnapshot()!.intakes.map((i) => i.slot)).toEqual(["morning", "prn", "prn"]);
  });
});
