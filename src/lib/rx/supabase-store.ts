/**
 * 처방 이력 — 로그인 버전 저장소 (Supabase, 환자 본인 세션 → RLS)
 * migration 10(처방 이력)이 적용되지 않은 DB에서는 available=false 로 알리고, 기존 기능은 그대로 둡니다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { CareLogError } from "@/lib/errors";
import { toCareLogError } from "@/lib/repository/supabase";
import type { NewPrescriptionInput, Prescription, RxItem, RxNote, RxSnapshot } from "./model";
import type { RxStore } from "./store";

export const RX_NOT_READY = "처방 이력은 DB 업데이트 후 사용할 수 있어요. 처방전 약은 지금처럼 내 약 목록에 등록돼요.";

/* eslint-disable @typescript-eslint/no-explicit-any -- DB 행 매핑 */
const iso = (t: string) => new Date(t).toISOString();
const mapP = (p: any): Prescription => ({
  id: p.id,
  patientId: p.patient_id,
  prescribedOn: p.prescribed_on,
  department: p.department ?? "",
  clinic: p.clinic ?? "",
  guidance: p.guidance ?? "",
  starred: Boolean(p.starred),
  visibleToGuardian: Boolean(p.visible_to_guardian),
  createdAt: iso(p.created_at),
  updatedAt: iso(p.updated_at),
});
const mapI = (i: any): RxItem => ({
  id: i.id,
  prescriptionId: i.prescription_id,
  patientId: i.patient_id,
  name: i.name,
  strength: i.strength ?? "",
  dosage: i.dosage ?? "",
  frequency: i.frequency ?? "",
  timing: i.timing ?? "",
  duration: i.duration ?? "",
  cautionRx: i.caution_rx ?? "",
  cautionMfds: i.caution_mfds ?? "",
  externalItemSeq: i.external_item_seq ?? undefined,
  active: Boolean(i.active),
  sort: i.sort ?? 0,
});
const mapN = (n: any): RxNote => ({
  id: n.id,
  prescriptionId: n.prescription_id,
  patientId: n.patient_id,
  itemId: n.item_id ?? null,
  tags: n.tags ?? [],
  memo: n.memo ?? "",
  createdAt: iso(n.created_at),
  updatedAt: iso(n.updated_at),
});
/* eslint-enable @typescript-eslint/no-explicit-any */

/** 테이블이 아직 없음 (PostgREST: PGRST205 / Postgres: 42P01) */
export const isMissingTable = (e: { code?: string } | null | undefined) => e?.code === "PGRST205" || e?.code === "42P01";

export function createSupabaseRxStore(client: SupabaseClient): RxStore {
  let snap: RxSnapshot | null = null;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());

  async function load() {
    const [p, i, n] = await Promise.all([
      client.from("prescriptions").select("*").order("prescribed_on", { ascending: false }),
      client.from("prescription_items").select("*").order("sort", { ascending: true }),
      client.from("prescription_notes").select("*").order("created_at", { ascending: false }),
    ]);
    const err = p.error ?? i.error ?? n.error;
    if (err) {
      snap = {
        prescriptions: [],
        items: [],
        notes: [],
        available: false,
        message: isMissingTable(err) ? RX_NOT_READY : "처방 이력을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
      };
    } else {
      snap = {
        prescriptions: (p.data ?? []).map(mapP),
        items: (i.data ?? []).map(mapI),
        notes: (n.data ?? []).map(mapN),
        available: true,
      };
    }
    notify();
  }
  const ensure = () => {
    if (!snap?.available) throw new CareLogError("not_supported", snap?.message ?? RX_NOT_READY);
  };
  async function write(op: PromiseLike<{ error: { code?: string; message?: string } | null }>) {
    ensure();
    const { error } = await op;
    if (error) throw toCareLogError(error);
    await load();
  }

  return {
    getSnapshot: () => snap,
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    load,
    async createPrescription(input: NewPrescriptionInput) {
      ensure();
      const { data, error } = await client.rpc("create_prescription", {
        p_patient_id: input.patientId,
        p_request_id: input.requestId,
        p_prescribed_on: input.prescribedOn,
        p_department: input.department,
        p_clinic: input.clinic,
        p_guidance: input.guidance,
        p_items: input.items.map((it) => ({
          name: it.name,
          strength: it.strength,
          dosage: it.dosage,
          frequency: it.frequency,
          timing: it.timing,
          duration: it.duration,
          caution_rx: it.cautionRx,
          caution_mfds: it.cautionMfds,
          external_item_seq: it.externalItemSeq ?? "",
          active: it.active,
        })),
      });
      if (error || !data) throw toCareLogError(error);
      await load();
      return data as string;
    },
    updatePrescription: (id, patch) =>
      write(
        client
          .from("prescriptions")
          .update({
            ...(patch.prescribedOn !== undefined && {
              prescribed_on: patch.prescribedOn,
            }),
            ...(patch.department !== undefined && {
              department: patch.department,
            }),
            ...(patch.clinic !== undefined && { clinic: patch.clinic }),
            ...(patch.guidance !== undefined && { guidance: patch.guidance }),
          })
          .eq("id", id),
      ),
    setStarred: (id, starred) => write(client.from("prescriptions").update({ starred }).eq("id", id)),
    setVisibleToGuardian: (id, v) => write(client.from("prescriptions").update({ visible_to_guardian: v }).eq("id", id)),
    setItemActive: (itemId, active) => write(client.from("prescription_items").update({ active }).eq("id", itemId)),
    addNote: (n) =>
      write(
        client.from("prescription_notes").insert({
          prescription_id: n.prescriptionId,
          patient_id: n.patientId,
          item_id: n.itemId,
          tags: n.tags,
          memo: n.memo.trim(),
        }),
      ),
    updateNote: (id, p) => write(client.from("prescription_notes").update({ item_id: p.itemId, tags: p.tags, memo: p.memo.trim() }).eq("id", id)),
    deleteNote: (id) => write(client.from("prescription_notes").delete().eq("id", id)),
  };
}
