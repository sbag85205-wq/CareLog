import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { createSupabaseRxStore, RX_NOT_READY } from "./supabase-store";

function fake(opts: { missing?: boolean }) {
  const calls: { fn?: string; table?: string; args?: unknown }[] = [];
  const res = (data: unknown) => ({
    data,
    error: opts.missing ? { code: "PGRST205", message: "Could not find the table" } : null,
  });
  const builder = (table: string) => {
    const b: Record<string, unknown> = {
      select: () => b,
      order: () => b,
      eq: () => b,
      update: (args: unknown) => (calls.push({ table, args }), b),
      insert: (args: unknown) => (calls.push({ table, args }), b),
      then: (r: (v: unknown) => void) =>
        r(
          res(
            table === "prescriptions"
              ? [
                  {
                    id: "rx1",
                    patient_id: "p1",
                    prescribed_on: "2026-09-01",
                    department: "이비인후과",
                    clinic: "",
                    guidance: "",
                    starred: true,
                    visible_to_guardian: false,
                    created_at: "2026-09-01T10:00:00Z",
                    updated_at: "2026-09-01T10:00:00Z",
                  },
                ]
              : [],
          ),
        ),
    };
    return b;
  };
  const client = {
    from: builder,
    rpc: async (fn: string, args: unknown) => (calls.push({ fn, args }), { data: "rx-new", error: null }),
  } as unknown as SupabaseClient;
  return { client, calls };
}

describe("처방 이력 — 로그인 버전 저장소", () => {
  it("DB에 처방 이력 구조가 없으면 사용 불가로 알리고 쓰기는 거부 (기존 기능은 그대로)", async () => {
    const { client } = fake({ missing: true });
    const s = createSupabaseRxStore(client);
    await s.load();
    expect(s.getSnapshot()).toMatchObject({
      available: false,
      message: RX_NOT_READY,
      prescriptions: [],
    });
    await expect(s.setStarred("rx1", true)).rejects.toMatchObject({
      code: "not_supported",
    });
  });

  it("처방 한 건 등록은 RPC 한 번 (요청 ID 포함, 약 필드는 DB 이름으로)", async () => {
    const { client, calls } = fake({});
    const s = createSupabaseRxStore(client);
    await s.load();
    expect(s.getSnapshot()!.prescriptions[0]).toMatchObject({
      id: "rx1",
      starred: true,
      department: "이비인후과",
    });
    const id = await s.createPrescription({
      requestId: "11111111-1111-4111-8111-111111111111",
      patientId: "p1",
      prescribedOn: "2026-11-22",
      department: "내과",
      clinic: "",
      guidance: "",
      items: [
        {
          name: "가상정",
          strength: "5mg",
          dosage: "1회 1정",
          frequency: "하루 1회",
          timing: "아침",
          duration: "30일분",
          cautionRx: "",
          cautionMfds: "(가상)",
          externalItemSeq: "200000001",
          active: true,
        },
      ],
    });
    expect(id).toBe("rx-new");
    const rpc = calls.find((c) => c.fn === "create_prescription")!.args as Record<string, unknown>;
    expect(rpc).toMatchObject({
      p_patient_id: "p1",
      p_request_id: "11111111-1111-4111-8111-111111111111",
      p_department: "내과",
    });
    expect((rpc.p_items as Record<string, unknown>[])[0]).toMatchObject({
      caution_mfds: "(가상)",
      external_item_seq: "200000001",
      active: true,
    });
  });
});
