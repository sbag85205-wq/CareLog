/**
 * 앱 전역에서 사용하는 저장소 인스턴스.
 * Supabase로 전환할 때는 이 파일에서 구현체만 바꾸면 됩니다.
 *
 *   import { createSupabaseRepository } from "./supabase";
 *   export const repository = createSupabaseRepository();
 */
import { createLocalStorageRepository } from "./local-storage";
import type { CareLogRepository } from "./types";

export const repository: CareLogRepository = createLocalStorageRepository();
export type * from "./types";
