"use client";

/**
 * 처방 이력 저장소 — 로그인 버전(Supabase)과 공개 데모(이 브라우저 localStorage)가 같은 인터페이스
 * 화면은 RxStoreProvider 로 주입받아 사용합니다.
 */
import { createContext, useContext, useSyncExternalStore } from "react";
import type { NewPrescriptionInput, RxNote, RxSnapshot } from "./model";

export interface RxStore {
  getSnapshot(): RxSnapshot | null;
  subscribe(listener: () => void): () => void;
  load(): Promise<void>;
  /** 한 건의 처방으로 묶어 저장 — 같은 requestId 로 다시 보내면 기존 처방 ID를 돌려줌 (중복 생성 없음) */
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
  addNote(note: Pick<RxNote, "prescriptionId" | "patientId" | "itemId" | "tags" | "memo">): Promise<void>;
  updateNote(id: string, patch: Pick<RxNote, "itemId" | "tags" | "memo">): Promise<void>;
  deleteNote(id: string): Promise<void>;
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
