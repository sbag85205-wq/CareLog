/**
 * 데모용 가상 처방전 (실제 환자·의료기관·약품 아님)
 * 화면에는 표로 보여 주고, 인식 단계는 이 텍스트를 그대로 사용합니다 (파일·OCR 없이 체험).
 */
export const EXAMPLE_PRESCRIPTION = {
  clinic: "케어가상의원 (가상)",
  patient: "김하늘 (가상)",
  issuedOn: "2026-11-20",
  rows: [
    { edi: "600000011", name: "케어가상정500밀리그램(가상성분)", dose: "1", times: "3", days: "5", usage: "식후 30분" },
    { edi: "", name: "케어가상캡슐 10mg", dose: "1", times: "2", days: "7", usage: "아침 저녁 식후" },
    { edi: "600000033", name: "케어가상코프시럽", dose: "10", times: "3", days: "5", usage: "" },
    { edi: "", name: "케어가상서방정75밀리그램", dose: "1/2", times: "1", days: "30", usage: "취침 전" },
    { edi: "", name: "없는가상연고", dose: "1", times: "2", days: "7", usage: "" },
  ],
} as const;

export function examplePrescriptionText(): string {
  const p = EXAMPLE_PRESCRIPTION;
  return [
    "처 방 전",
    `의료기관 명칭 ${p.clinic}`,
    `환자 성명 ${p.patient}`,
    "처방 의약품의 명칭 1회 투약량 1일 투여횟수 총 투약일수 용법",
    ...p.rows.map((r) => [r.edi, r.name, r.dose, r.times, r.days, r.usage].filter(Boolean).join(" ")),
    `교부 연월일 ${p.issuedOn}`,
  ].join("\n");
}
