/**
 * 약 기록 — 로그인 버전 저장소 (Supabase, 본인 세션 → RLS)
 * migration 10(처방 이력)·11(FeelPill 확장)이 적용되지 않은 DB에서는 available=false 로 알리고, 기존 기능은 그대로 둡니다.
 * 공유받은 사람은 기록 표를 직접 볼 수 없고 shared_records_for_me() 로 허용 항목만 받습니다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { CareLogError } from "@/lib/errors";
import { toCareLogError } from "@/lib/repository/supabase";
import {
  emptyRx,
  type NewPrescriptionInput,
  type Prescription,
  type Relation,
  type RxIntake,
  type RxItem,
  type RxNote,
  type RxShare,
  type RxSnapshot,
  type SharedRecord,
} from "./model";
import type { RxStore } from "./store";

export const RX_NOT_READY = "약 기록(처방·일반약·복용 경험)은 DB 업데이트 후 사용할 수 있어요. 처방전 약은 지금처럼 내 약 목록에 등록돼요.";

/* eslint-disable @typescript-eslint/no-explicit-any -- DB 행 매핑 */
const iso = (t: string) => new Date(t).toISOString();
const mapP = (p: any): Prescription => ({
  id: p.id,
  patientId: p.patient_id,
  kind: p.kind === "otc" ? "otc" : "prescription",
  source: p.source ?? "prescription",
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
  ingredients: i.ingredients ?? "",
  company: i.company ?? "",
  drugClass: i.drug_class ?? "",
  mfdsClass: i.mfds_class ?? "",
  categories: i.categories ?? ["unclassified"],
  categorySource: i.category_source ?? "none",
  dosage: i.dosage ?? "",
  frequency: i.frequency ?? "",
  timing: i.timing ?? "",
  duration: i.duration ?? "",
  cautionRx: i.caution_rx ?? "",
  cautionMfds: i.caution_mfds ?? "",
  externalItemSeq: i.external_item_seq ?? undefined,
  ediCode: i.edi_code ?? undefined,
  active: Boolean(i.active),
  starred: Boolean(i.starred),
  scheduleSlots: i.schedule_slots ?? [],
  sort: i.sort ?? 0,
});
const mapN = (n: any): RxNote => ({
  id: n.id,
  prescriptionId: n.prescription_id,
  patientId: n.patient_id,
  itemId: n.item_id ?? null,
  takenOn: n.taken_on ?? null,
  tags: n.tags ?? [],
  memo: n.memo ?? "",
  suggestedTags: n.suggested_tags ?? [],
  summary: n.summary ?? "",
  summarySource: n.summary_source ?? "",
  createdAt: iso(n.created_at),
  updatedAt: iso(n.updated_at),
});
const mapIntake = (x: any): RxIntake => ({
  id: x.id,
  patientId: x.patient_id,
  itemId: x.item_id,
  takenOn: x.taken_on,
  slot: x.slot,
  createdAt: iso(x.created_at),
});
const mapShare = (x: any): RxShare => ({
  id: x.id,
  patientId: x.patient_id,
  prescriptionId: x.prescription_id,
  granteeId: x.grantee_id,
  fields: x.fields ?? [],
  expiresAt: x.expires_at ? iso(x.expires_at) : null,
  revokedAt: x.revoked_at ? iso(x.revoked_at) : null,
  createdAt: iso(x.created_at),
});
export const mapShared = (r: any): SharedRecord => ({
  shareId: r.share_id,
  patientId: r.patient_id,
  kind: r.kind === "otc" ? "otc" : "prescription",
  date: r.date,
  fields: r.fields ?? [],
  expiresAt: r.expires_at ?? null,
  ...(r.department !== undefined && { department: r.department, clinic: r.clinic ?? "" }),
  items: (r.items ?? []).map((i: any) => ({
    name: i.name,
    categories: i.categories ?? [],
    ...(i.ingredients !== undefined && { ingredients: i.ingredients }),
    ...(i.strength !== undefined && { strength: i.strength }),
    ...(i.howto !== undefined && { howto: i.howto }),
  })),
  ...(r.notes !== undefined && {
    notes: (r.notes ?? []).map((n: any) => ({
      target: n.target,
      takenOn: n.taken_on ?? null,
      tags: n.tags ?? [],
      memo: n.memo ?? "",
      createdAt: n.created_at,
    })),
  }),
});
/* eslint-enable @typescript-eslint/no-explicit-any */

/** 테이블·컬럼·함수가 아직 없음 (PostgREST: PGRST205·PGRST202 / Postgres: 42P01·42703·42883) */
export const isMissingTable = (e: { code?: string } | null | undefined) =>
  ["PGRST205", "PGRST202", "PGRST204", "42P01", "42703", "42883"].includes(e?.code ?? "");

export function createSupabaseRxStore(client: SupabaseClient): RxStore {
  let snap: RxSnapshot | null = null;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());

  async function load() {
    const [p, i, n, k, s, g, sh] = await Promise.all([
      client.from("prescriptions").select("*").order("prescribed_on", { ascending: false }),
      client.from("prescription_items").select("*").order("sort", { ascending: true }),
      client.from("prescription_notes").select("*").order("created_at", { ascending: false }),
      client.from("intake_logs").select("*").order("taken_on", { ascending: false }).limit(1000),
      client.from("record_shares").select("*").order("created_at", { ascending: false }),
      client.from("access_grants").select("id, grantee_id, relation"),
      client.rpc("shared_records_for_me"),
    ]);
    const err = p.error ?? i.error ?? n.error ?? k.error ?? s.error ?? g.error ?? sh.error;
    if (err) {
      snap = emptyRx({
        available: false,
        message: isMissingTable(err) ? RX_NOT_READY : "약 기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
      });
    } else {
      const relations: Record<string, Relation> = {};
      for (const row of (g.data ?? []) as { grantee_id: string; relation: Relation | null }[]) if (row.relation) relations[row.grantee_id] = row.relation;
      snap = {
        prescriptions: (p.data ?? []).map(mapP),
        items: (i.data ?? []).map(mapI),
        notes: (n.data ?? []).map(mapN),
        intakes: (k.data ?? []).map(mapIntake),
        shares: (s.data ?? []).map(mapShare),
        relations,
        shared: Array.isArray(sh.data) ? sh.data.map(mapShared) : [],
        available: true,
      };
    }
    notify();
  }
  const ensure = () => {
    if (!snap?.available) throw new CareLogError("not_supported", snap?.message ?? RX_NOT_READY);
  };
  async function write(op: PromiseLike<{ error: { code?: string; message?: string } | null }>, ignore?: string) {
    ensure();
    const { error } = await op;
    if (error && error.code !== ignore) throw toCareLogError(error);
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
      const { data, error } = await client.rpc("create_med_record", {
        p_patient_id: input.patientId,
        p_request_id: input.requestId,
        p_kind: input.kind ?? "prescription",
        p_source: input.source ?? (input.kind === "otc" ? "search" : "prescription"),
        p_date: input.prescribedOn,
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
          edi_code: it.ediCode ?? "",
          active: it.active,
          ingredients: it.ingredients ?? "",
          company: it.company ?? "",
          drug_class: it.drugClass ?? "",
          mfds_class: it.mfdsClass ?? "",
          categories: it.categories?.length ? it.categories : ["unclassified"],
          category_source: it.categorySource ?? "none",
          schedule_slots: it.scheduleSlots ?? [],
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
            ...(patch.prescribedOn !== undefined && { prescribed_on: patch.prescribedOn }),
            ...(patch.department !== undefined && { department: patch.department }),
            ...(patch.clinic !== undefined && { clinic: patch.clinic }),
            ...(patch.guidance !== undefined && { guidance: patch.guidance }),
          })
          .eq("id", id),
      ),
    setStarred: (id, starred) => write(client.from("prescriptions").update({ starred }).eq("id", id)),
    setVisibleToGuardian: (id, v) => write(client.from("prescriptions").update({ visible_to_guardian: v }).eq("id", id)),
    setItemActive: (itemId, active) => write(client.from("prescription_items").update({ active }).eq("id", itemId)),
    updateItem: (itemId, p) =>
      write(
        client
          .from("prescription_items")
          .update({
            ...(p.categories !== undefined && { categories: p.categories }),
            ...(p.categorySource !== undefined && { category_source: p.categorySource }),
            ...(p.scheduleSlots !== undefined && { schedule_slots: p.scheduleSlots }),
            ...(p.starred !== undefined && { starred: p.starred }),
            ...(p.active !== undefined && { active: p.active }),
          })
          .eq("id", itemId),
      ),
    addNote: (n) =>
      write(
        client.from("prescription_notes").insert({
          prescription_id: n.prescriptionId,
          patient_id: n.patientId,
          item_id: n.itemId,
          taken_on: n.takenOn ?? null,
          tags: n.tags,
          memo: n.memo.trim(),
          suggested_tags: n.suggestedTags ?? [],
          summary: n.summary ?? "",
          summary_source: n.summarySource ?? "",
        }),
      ),
    updateNote: (id, p) =>
      write(
        client
          .from("prescription_notes")
          .update({
            item_id: p.itemId,
            tags: p.tags,
            memo: p.memo.trim(),
            ...(p.takenOn !== undefined && { taken_on: p.takenOn }),
            ...(p.summary !== undefined && { summary: p.summary }),
            ...(p.suggestedTags !== undefined && { suggested_tags: p.suggestedTags }),
            ...(p.summarySource !== undefined && { summary_source: p.summarySource }),
          })
          .eq("id", id),
      ),
    deleteNote: (id) => write(client.from("prescription_notes").delete().eq("id", id)),
    // 같은 시간대 중복 체크(23505)는 이미 기록된 것으로 봄
    logIntake: (x) => write(client.from("intake_logs").insert({ patient_id: x.patientId, item_id: x.itemId, taken_on: x.takenOn, slot: x.slot }), "23505"),
    removeIntake: (id) => write(client.from("intake_logs").delete().eq("id", id)),
    shareRecord: (x) =>
      write(client.rpc("share_record", { p_prescription_id: x.prescriptionId, p_grantee_id: x.granteeId, p_fields: x.fields, p_expires_at: x.expiresAt })),
    revokeShare: (id) => write(client.rpc("revoke_record_share", { p_share_id: id })),
    setRelation: (x) => write(client.rpc("set_grant_relation", { p_grant_id: x.grantId, p_relation: x.relation })),
  };
}
