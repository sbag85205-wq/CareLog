/**
 * 의약품 상세정보 제공자 인터페이스
 *
 * 현재는 가상(mock) 제공자만 사용합니다. 향후 식약처 공공데이터
 * "의약품개요정보(e약은요)" API(DrbEasyDrugInfoService)를 서버 측(Route Handler)에서 호출하는
 * 구현을 추가하고, Medication.externalItemSeq(품목기준코드)로 조회하면 됩니다.
 *
 * ⚠️ API 키는 서버 환경변수(MFDS_API_KEY)로만 사용하고 클라이언트에 노출하지 마세요.
 */
import type { Medication } from "@/types";

export interface MedicationInfo {
  efficacy: string;
  usage: string;
  warning: string;
  sourceLabel: string;
}

export interface MedicationInfoProvider {
  getInfo(med: Medication): Promise<MedicationInfo>;
}

export const mockMedicationInfoProvider: MedicationInfoProvider = {
  async getInfo(med) {
    return {
      efficacy: med.purpose,
      usage: `${med.dosage} · ${med.schedule}`,
      warning: med.caution,
      sourceLabel: "가상 데이터 (식약처 API 미연결)",
    };
  },
};

/*
 * 향후 구현 예시 (아직 호출하지 않음):
 *
 * export const mfdsMedicationInfoProvider: MedicationInfoProvider = {
 *   async getInfo(med) {
 *     const res = await fetch(`/api/medications/${med.externalItemSeq}`); // 서버 Route Handler 경유
 *     const json = await res.json();
 *     return { efficacy: json.efcyQesitm, usage: json.useMethodQesitm, warning: json.atpnQesitm, sourceLabel: "식약처 e약은요" };
 *   },
 * };
 */
