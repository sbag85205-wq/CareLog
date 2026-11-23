/**
 * migration 11 — FeelPill 약 기록 확장 (PGlite, 가상 계정)
 * 일반약 등록 · 제품 정보/분류 컬럼 · 자동 정리 분리 저장 · 복용 체크 · 선택 공유(항목·기간·철회) · 환자 간 유출 없음
 * 환자 A·B, 공유 상대 F(A가 초대 수락), 공유 상대 F2(B가 초대 수락), 아무 관계 없는 사용자 X
 */
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, createTestDb, expectFail, signUp } from "./support/db";

type U = { id: string; email: string };
let db: PGlite;
let A: U, B: U, F: U, F2: U, X: U;
let pidA: string, pidB: string;
let grantF: string;

const count = async (actor: U, sql: string, params: unknown[] = []) =>
  (await as<{ n: number }>(db, actor, `select count(*)::int n from (${sql}) q`, params))[0].n;

const OTC = JSON.stringify([
  {
    name: "(가상) 진통정500밀리그램",
    strength: "500mg",
    ingredients: "아세트아미노펜",
    company: "(가상)제약",
    drug_class: "otc",
    mfds_class: "114 해열·진통·소염제",
    categories: ["pain"],
    category_source: "mfds",
    external_item_seq: "900000101",
    dosage: "1회 1정",
  },
]);
const createRecord = (actor: U, pid: string, kind: string, source: string, date: string, items: string, req: string | null = null) =>
  as<{ id: string }>(
    db,
    actor,
    "select public.create_med_record($1, coalesce($5::uuid, gen_random_uuid()), $2, $3, $4::date, '이비인후과', '(가상)약국', '', $6::jsonb) id",
    [pid, kind, source, date, req, items],
  );

beforeAll(async () => {
  db = await createTestDb();
  [A, B, F, F2, X] = await Promise.all(["fp-a", "fp-b", "fp-f", "fp-f2", "fp-x"].map((n) => signUp(db, `${n}@example.test`)));
  const issue = async (u: U) =>
    (await as<{ id: string }>(db, "service_role", "insert into public.patients (profile_id, display_name) values ($1, '(가상)') returning id", [u.id]))[0].id;
  pidA = await issue(A);
  pidB = await issue(B);
  for (const [owner, pid, g] of [
    [A, pidA, F],
    [B, pidB, F2],
  ] as const) {
    const inv = (await as<{ j: { token: string } }>(db, owner, "select public.invite_guardian($1, $2, '{records}') j", [pid, g.email]))[0].j;
    await as(db, g, "select public.accept_guardian_invitation($1)", [inv.token]);
  }
  grantF = (await as<{ id: string }>(db, A, "select id from public.access_grants where grantee_id = $1", [F.id]))[0].id;
});

describe("일반약 등록 (처방과 같은 표, kind 로 구분)", () => {
  it("일반약은 진료과를 비우고, 등록했다고 '복용 중'으로 만들지 않음 · 제품명·성분·함량·분류는 따로 저장", async () => {
    const [{ id }] = await createRecord(A, pidA, "otc", "otc_box", "2026-09-01", OTC);
    const [p] = await as<{ kind: string; source: string; department: string }>(
      db,
      A,
      "select kind, source, department from public.prescriptions where id = $1",
      [id],
    );
    expect(p).toEqual({ kind: "otc", source: "otc_box", department: "" });
    const [i] = await as(
      db,
      A,
      "select name, strength, ingredients, company, drug_class, mfds_class, categories, category_source, active from public.prescription_items where prescription_id = $1",
      [id],
    );
    expect(i).toEqual({
      name: "(가상) 진통정500밀리그램",
      strength: "500mg",
      ingredients: "아세트아미노펜",
      company: "(가상)제약",
      drug_class: "otc",
      mfds_class: "114 해열·진통·소염제",
      categories: ["pain"],
      category_source: "mfds",
      active: false,
    });
  });

  it("처방은 기본으로 복용 중, 분류가 없으면 '미분류'", async () => {
    const [{ id }] = await createRecord(A, pidA, "prescription", "prescription", "2026-09-02", JSON.stringify([{ name: "(가상) 코감기정" }]));
    const [i] = await as<{ active: boolean; categories: string[]; category_source: string }>(
      db,
      A,
      "select active, categories, category_source from public.prescription_items where prescription_id = $1",
      [id],
    );
    expect(i).toEqual({ active: true, categories: ["unclassified"], category_source: "none" });
  });

  it("같은 요청은 한 건, 허용되지 않은 분류·형식은 거부, 다른 환자 대신 등록 불가", async () => {
    const req = "77777777-7777-4777-8777-777777777777";
    const [{ id }] = await createRecord(A, pidA, "otc", "search", "2026-10-01", OTC, req);
    const [{ id: again }] = await createRecord(A, pidA, "otc", "search", "2026-10-01", OTC, req);
    expect(again).toBe(id);
    expect(await count(A, "select 1 from public.prescriptions where request_id = $1", [req])).toBe(1);
    const bad = JSON.stringify([{ name: "(가상) 약", categories: ["효능좋음"] }]);
    expect(await expectFail(createRecord(A, pidA, "otc", "search", "2026-10-02", bad))).toMatch(/check constraint|violates/);
    expect(await expectFail(createRecord(A, pidA, "vitamin", "search", "2026-10-02", OTC))).toMatch(/check constraint|violates/);
    expect(await expectFail(createRecord(A, pidB, "otc", "search", "2026-10-02", OTC))).toMatch(/row-level security/);
  });

  it("같은 품목기준코드는 날짜별로 따로 쌓이고, 이름이 같아도 코드가 다르면 다른 행", async () => {
    await createRecord(A, pidA, "otc", "receipt", "2026-11-15", OTC);
    const other = JSON.stringify([{ name: "(가상) 진통정500밀리그램", external_item_seq: "900000106" }]);
    await createRecord(A, pidA, "otc", "receipt", "2026-11-16", other);
    const rows = await as<{ seq: string; n: number }>(
      db,
      A,
      "select external_item_seq seq, count(*)::int n from public.prescription_items where patient_id = $1 and name = '(가상) 진통정500밀리그램' group by 1 order by 1",
      [pidA],
    );
    expect(rows).toEqual([
      { seq: "900000101", n: 3 },
      { seq: "900000106", n: 1 },
    ]);
  });

  it("분류 수정·★·반복 일정은 본인만, 허용 목록 밖 값은 거부", async () => {
    const item = (await as<{ id: string }>(db, A, "select id from public.prescription_items where patient_id = $1 limit 1", [pidA]))[0].id;
    await as(
      db,
      A,
      "update public.prescription_items set categories = '{pain,antiinflam}', category_source = 'user', starred = true, schedule_slots = '{morning,evening}' where id = $1",
      [item],
    );
    expect(await expectFail(as(db, A, "update public.prescription_items set schedule_slots = '{midnight}' where id = $1", [item]))).toMatch(
      /check constraint|violates/,
    );
    expect(await as(db, B, "update public.prescription_items set starred = false where id = $1 returning id", [item])).toEqual([]);
    expect(await expectFail(as(db, A, "update public.prescription_items set ingredients = '바꾼 성분' where id = $1", [item]))).toMatch(/permission denied/);
  });
});

describe("복용 경험: 원본 메모와 자동 정리 분리", () => {
  it("자동 정리(제안 태그·요약)를 고쳐도 원본 메모는 그대로", async () => {
    const rx = (
      await as<{ id: string }>(db, A, "select id from public.prescriptions where patient_id = $1 and kind = 'otc' order by prescribed_on limit 1", [pidA])
    )[0].id;
    const memo = "(가상) 감기약 먹고 너무 졸렸어. 근데 약 때문인지는 모르겠어.";
    const [{ id }] = await as<{ id: string }>(
      db,
      A,
      "insert into public.prescription_notes (prescription_id, patient_id, taken_on, tags, memo, suggested_tags, summary, summary_source) values ($1, $2, '2026-09-02', '{졸림,원인 미확인}', $3, '{졸림,원인 미확인}', '복용 후 졸림을 경험했다고 기록함. 약과의 관련성은 확인되지 않음.', 'rule') returning id",
      [rx, pidA, memo],
    );
    await as(db, A, "update public.prescription_notes set tags = '{졸림}', summary = '(사용자가 고친 요약)' where id = $1", [id]);
    const [n] = await as(db, A, "select memo, tags, suggested_tags, summary, summary_source, taken_on::text from public.prescription_notes where id = $1", [
      id,
    ]);
    expect(n).toEqual({
      memo,
      tags: ["졸림"],
      suggested_tags: ["졸림", "원인 미확인"],
      summary: "(사용자가 고친 요약)",
      summary_source: "rule",
      taken_on: "2026-09-02",
    });
    expect(await expectFail(as(db, A, "update public.prescription_notes set summary_source = 'gpt' where id = $1", [id]))).toMatch(/check constraint|violates/);
  });
});

describe("복용 체크", () => {
  let item: string, itemB: string;
  beforeAll(async () => {
    item = (await as<{ id: string }>(db, A, "select id from public.prescription_items where patient_id = $1 order by created_at limit 1", [pidA]))[0].id;
    const [{ id: rxB }] = await createRecord(B, pidB, "prescription", "prescription", "2026-11-01", JSON.stringify([{ name: "(가상) B약" }]));
    itemB = (await as<{ id: string }>(db, B, "select id from public.prescription_items where prescription_id = $1", [rxB]))[0].id;
  });

  it("같은 약·날·시간대는 한 번만, 필요할 때(prn)는 여러 번", async () => {
    const ins = (slot: string) =>
      as(db, A, "insert into public.intake_logs (patient_id, item_id, taken_on, slot) values ($1, $2, '2026-11-20', $3)", [pidA, item, slot]);
    await ins("morning");
    expect(await expectFail(ins("morning"))).toMatch(/duplicate key|unique/);
    await ins("prn");
    await ins("prn");
    expect(await count(A, "select 1 from public.intake_logs where item_id = $1", [item])).toBe(3);
  });

  it("다른 환자의 약에 체크 불가, 다른 사람의 체크는 안 보임, 공유 상대도 못 봄", async () => {
    expect(
      await expectFail(as(db, A, "insert into public.intake_logs (patient_id, item_id, taken_on, slot) values ($1, $2, '2026-11-20', 'noon')", [pidA, itemB])),
    ).toMatch(/invalid_input/);
    expect(
      await expectFail(as(db, B, "insert into public.intake_logs (patient_id, item_id, taken_on, slot) values ($1, $2, '2026-11-20', 'noon')", [pidA, item])),
    ).toMatch(/row-level security/);
    expect(await count(B, "select 1 from public.intake_logs")).toBe(0);
    expect(await count(F, "select 1 from public.intake_logs")).toBe(0);
    const del = await as(db, B, "delete from public.intake_logs where patient_id = $1 returning id", [pidA]);
    expect(del).toEqual([]);
  });
});

describe("선택 공유 (기록 1건 · 사람 1명 · 허용 항목 · 기간 · 철회)", () => {
  let otcRx: string, rxPrescription: string;
  const shared = async (u: U) => (await as<{ j: Record<string, unknown>[] }>(db, u, "select public.shared_records_for_me() j"))[0].j;

  beforeAll(async () => {
    otcRx = (
      await as<{ id: string }>(db, A, "select id from public.prescriptions where patient_id = $1 and kind = 'otc' order by prescribed_on limit 1", [pidA])
    )[0].id;
    rxPrescription = (await as<{ id: string }>(db, A, "select id from public.prescriptions where patient_id = $1 and kind = 'prescription' limit 1", [pidA]))[0]
      .id;
  });

  it("공유 전: 공유 상대도 기록 표·함수 모두 0건 (기본 비공개)", async () => {
    expect(await count(F, "select 1 from public.prescriptions")).toBe(0);
    expect(await count(F, "select 1 from public.prescription_items")).toBe(0);
    expect(await shared(F)).toEqual([]);
  });

  it("고른 기록 하나만, 허용한 항목만 보임 (성분·함량·진료과는 결과에 없음)", async () => {
    await as(db, A, "select public.share_record($1, $2, '{experience}', null)", [otcRx, F.id]);
    const list = await shared(F);
    expect(list).toHaveLength(1);
    const r = list[0] as { kind: string; items: Record<string, unknown>[]; notes: { memo: string }[]; department?: string };
    expect(r.kind).toBe("otc");
    expect(Object.keys(r.items[0]).sort()).toEqual(["categories", "name"]);
    expect(r.items[0].name).toBe("(가상) 진통정500밀리그램");
    expect(r.notes[0].memo).toContain("졸렸어");
    expect(r).not.toHaveProperty("department");
    // 기록 표는 여전히 직접 못 봄, 고치지도 못함
    expect(await count(F, "select 1 from public.prescriptions")).toBe(0);
    expect(await as(db, F, "update public.prescription_notes set memo = '바꿈' returning id")).toEqual([]);
    expect(await count(F, "select 1 from public.record_shares")).toBe(0);
  });

  it("항목을 바꿔 다시 공유하면 활성 공유는 하나 (성분·함량 추가, 경험 제외)", async () => {
    await as(db, A, "select public.share_record($1, $2, '{ingredients,strength}', null)", [otcRx, F.id]);
    expect(await count(A, "select 1 from public.record_shares where prescription_id = $1 and revoked_at is null", [otcRx])).toBe(1);
    const r = (await shared(F))[0] as { items: Record<string, unknown>[]; notes?: unknown };
    expect(r.items[0]).toMatchObject({ ingredients: "아세트아미노펜", strength: "500mg" });
    expect(r).not.toHaveProperty("notes");
  });

  it("처방은 '진료과·병원'을 켜야 진료과가 보임", async () => {
    await as(db, A, "select public.share_record($1, $2, '{howto}', null)", [rxPrescription, F.id]);
    let r = (await shared(F)).find((x) => x.kind === "prescription") as { department?: string; items: { howto?: string }[] };
    expect(r).not.toHaveProperty("department");
    await as(db, A, "select public.share_record($1, $2, '{howto,department}', null)", [rxPrescription, F.id]);
    r = (await shared(F)).find((x) => x.kind === "prescription") as { department?: string; items: { howto?: string }[] };
    expect(r.department).toBe("이비인후과");
  });

  it("다른 환자·관계 없는 사용자에게는 안 보이고, 남의 기록을 공유하거나 관계 없는 사람에게 공유 불가", async () => {
    expect(await shared(F2)).toEqual([]);
    expect(await shared(X)).toEqual([]);
    expect(await shared(B)).toEqual([]);
    expect(await expectFail(as(db, B, "select public.share_record($1, $2, '{experience}', null)", [otcRx, F2.id]))).toMatch(/not_found/);
    expect(await expectFail(as(db, A, "select public.share_record($1, $2, '{experience}', null)", [otcRx, X.id]))).toMatch(/forbidden/);
    expect(await expectFail(as(db, A, "select public.share_record($1, $2, '{diagnosis}', null)", [otcRx, F.id]))).toMatch(/check constraint|violates/);
    expect(
      await expectFail(as(db, A, "insert into public.record_shares (patient_id, prescription_id, grantee_id) values ($1, $2, $3)", [pidA, otcRx, X.id])),
    ).toMatch(/permission denied/);
  });

  it("기간이 지나면 안 보이고, 지난 날짜로는 공유할 수 없음", async () => {
    expect(await expectFail(as(db, A, "select public.share_record($1, $2, '{experience}', now() - interval '1 day')", [otcRx, F.id]))).toMatch(/invalid_input/);
    await as(db, A, "select public.share_record($1, $2, '{experience}', now() + interval '1 hour')", [otcRx, F.id]);
    expect((await shared(F)).some((x) => x.kind === "otc")).toBe(true);
    await as(db, "service_role", "update public.record_shares set expires_at = now() - interval '1 minute' where prescription_id = $1 and revoked_at is null", [
      otcRx,
    ]);
    expect((await shared(F)).some((x) => x.kind === "otc")).toBe(false);
  });

  it("공유 철회 → 즉시 안 보임, 남의 공유는 철회 불가", async () => {
    const id = (await as<{ id: string }>(db, A, "select public.share_record($1, $2, '{experience}', null) id", [otcRx, F.id]))[0].id;
    expect(await expectFail(as(db, B, "select public.revoke_record_share($1)", [id]))).toMatch(/not_found/);
    await as(db, A, "select public.revoke_record_share($1)", [id]);
    expect((await shared(F)).some((x) => x.kind === "otc")).toBe(false);
  });

  it("관계 이름은 본인만 정하고, 공유 관계 자체를 철회하면 모든 공유가 멈춤", async () => {
    await as(db, A, "select public.set_grant_relation($1, 'friend')", [grantF]);
    expect((await as<{ relation: string }>(db, A, "select relation from public.access_grants where id = $1", [grantF]))[0].relation).toBe("friend");
    expect(await expectFail(as(db, F, "select public.set_grant_relation($1, 'family')", [grantF]))).toMatch(/not_found/);
    expect(await expectFail(as(db, A, "select public.set_grant_relation($1, 'boss')", [grantF]))).toMatch(/invalid_input/);
    expect((await shared(F)).length).toBeGreaterThan(0); // 처방 공유가 아직 살아 있음
    await as(db, A, "select public.revoke_guardian_access($1)", [grantF]);
    expect(await shared(F)).toEqual([]);
    expect(await expectFail(as(db, A, "select public.share_record($1, $2, '{experience}', null)", [otcRx, F.id]))).toMatch(/forbidden/);
  });

  it("로그인 안 한 사용자는 등록·공유 조회 함수 실행 불가", async () => {
    expect(await expectFail(as(db, "anon", "select public.shared_records_for_me()"))).toMatch(/permission denied/);
    expect(await expectFail(as(db, "anon", "select public.create_med_record(null, null, null, null, null, null, null, null, null)"))).toMatch(
      /permission denied/,
    );
  });
});
