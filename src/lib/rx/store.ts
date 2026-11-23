"use client";

/**
 * 약 기록 저장소 — 로그인 버전(Supabase)과 공개 데모(이 브라우저 localStorage)가 같은 인터페이스
 * 화면은 RxStoreProvider 로 주입받아 사용합니다.
 */
import { createContext, useContext, useSyncExternalStore } from "react";
import type { IntakeSlot, NewPrescriptionInput, NoteInput, NotePatch, Relation, RxItem, RxSnapshot, ShareField } from "./model";

export type ItemPatch = Partial<Pick<RxItem, "categories" | "categorySource" | "scheduleSlots" | "starred" | "active">>;

export interface RxStore {
  getSnapshot(): RxSnapshot | null;
  subscribe(listener: () => void): () => void;
  load(): Promise<void>;
  /** 한 건으로 묶어 저장 — 같은 requestId 로 다시 보내면 기존 ID를 돌려줌 (중복 생성 없음) */
  createPrescription(input: NewPrescriptionInput): Promise<string>;
  updatePrescription(
    id: string,
    patch: {
      prescribedOn?: string;
      department?: string;
      clinic?: string;
      guidance?: string;
    },
  ): Promise<void>;
  setStarred(id: string, starred: boolean): Promise<void>;
  setVisibleToGuardian(id: string, visible: boolean): Promise<void>;
  setItemActive(itemId: string, active: boolean): Promise<void>;
  updateItem(itemId: string, patch: ItemPatch): Promise<void>;
  addNote(note: NoteInput): Promise<void>;
  updateNote(id: string, patch: NotePatch): Promise<void>;
  deleteNote(id: string): Promise<void>;
  /** 복용 체크 — 같은 약·날짜·시간대는 한 번만 (필요할 때 먹는 약은 여러 번) */
  logIntake(input: { patientId: string; itemId: string; takenOn: string; slot: IntakeSlot | "prn" }): Promise<void>;
  removeIntake(id: string): Promise<void>;
  /** 선택 공유 — 기록 1건을 승인된 공유 상대 1명에게, 고른 항목만 */
  shareRecord(input: { patientId: string; prescriptionId: string; granteeId: string; fields: ShareField[]; expiresAt: string | null }): Promise<void>;
  revokeShare(id: string): Promise<void>;
  setRelation(input: { patientId: string; grantId: string; granteeId: string; relation: Relation }): Promise<void>;
}

const RxStoreContext = createContext<RxStore | null>(null);
export const RxStoreProvider = RxStoreContext.Provider;

export function useRxStore(): RxStore | null {
  return useContext(RxStoreContext);
}

const noop = () => () => {};
export function useRxSnapshot(store: RxStore | null): RxSnapshot | null {
  return useSyncExternalStore(
    store?.subscribe ?? noop,
    () => store?.getSnapshot() ?? null,
    () => null,
  );
}
