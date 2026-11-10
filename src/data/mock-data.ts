/**
 * CareLog 데모(가상) 데이터
 *
 * ⚠️ 이 파일의 모든 인물·약품·기록은 개발 시연용 가상 데이터입니다.
 *    실제 환자정보, 실제 의약품 정보가 아니며 의료적 의미가 없습니다.
 *
 * 날짜는 "오늘" 기준 상대값으로 생성되므로 언제 접속해도 최근 데이터처럼 보입니다.
 * 난수는 시드 고정(mulberry32)이라 같은 날 생성하면 항상 같은 결과가 나옵니다.
 */
import { addDays, nowISO, seoulDateTimeToISO, todayISO } from "@/lib/date";
import { DATA_VERSION } from "@/lib/repository/migrate";
import type {
  Admission,
  CareLogData,
  CareMode,
  Digestion,
  HealthRecord,
  LifeRequest,
  MealIntake,
  MealLog,
  MealSlot,
  MealType,
  Medication,
  Patient,
  Scale5,
} from "@/types";

export { DATA_VERSION };

/** 시연 시 "로그인한" 것으로 간주하는 데모 계정 */
export const DEMO_PATIENT_ID = "P001";
export const DEMO_STAFF_ID = "U-STAFF-01";
/** 다른 병동 담당 의료진 — 담당 환자 필터 검증용 (역할 전환 메뉴에는 나오지 않음) */
export const DEMO_OTHER_STAFF_ID = "U-STAFF-02";
export const DEMO_GUARDIAN_ID = "U-GRD-01";

/** 자기기록 입원 시 배정하는 가상 병실 (재입원 시 직전 병실과 다른 곳을 고름) */
export const DEMO_WARD = "데모병동 7층";
export const DEMO_ROOMS = ["701호", "702호", "705호", "706호"];

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const toScale = (v: number) => clamp(Math.round(v), 1, 5) as Scale5;

interface RecordProfile {
  patientId: string;
  seed: number;
  /** 과거 며칠까지 생성할지 */
  days: number;
  /** 기록 확률 0~1 */
  coverage: number;
  /** daysAgo → 기본 컨디션(1~5) */
  baseCondition: (daysAgo: number) => number;
  /** daysAgo → 기록 당시 모드 */
  modeAt: (daysAgo: number) => CareMode;
  /** 오늘 기록 포함 여부 */
  includeToday?: boolean;
}

const MEMO_SAMPLES = [
  "",
  "",
  "(데모) 산책 20분 함",
  "(데모) 오후에 조금 피곤했음",
  "(데모) 밤에 두 번 깼음",
  "(데모) 식사 후 속이 편했음",
  "(데모) 약 복용 시간 지킴",
];

const DIGESTIONS: Digestion[] = ["good", "normal", "normal", "bloated", "heartburn", "nausea"];
const SYMPTOM_POOL = ["두통", "어지러움", "식욕 저하", "불면", "관절 통증", "변비", "기침"];

function generateRecords(p: RecordProfile, today: string, nowIso: string): HealthRecord[] {
  const rand = mulberry32(p.seed);
  const out: HealthRecord[] = [];
  for (let daysAgo = p.days; daysAgo >= 0; daysAgo--) {
    if (daysAgo === 0 && !p.includeToday) continue;
    if (daysAgo > 0 && rand() > p.coverage) continue;
    const date = addDays(today, -daysAgo);
    const base = p.baseCondition(daysAgo) + (rand() - 0.5) * 1.2;
    const condition = toScale(base);
    const pain = clamp(Math.round((5 - condition) * 1.8 + (rand() - 0.5) * 2), 0, 10);
    const fatigue = toScale(6 - base + (rand() - 0.5));
    const sleep = toScale(base + (rand() - 0.5) * 1.5);
    const intakeIdx = clamp(Math.round(condition - 1 + (rand() - 0.3)), 0, 4);
    const symptoms =
      condition <= 3
        ? SYMPTOM_POOL.filter(() => rand() < (condition <= 2 ? 0.35 : 0.15)).slice(0, 3)
        : [];
    // 기록 시각은 그날 저녁 — 단, 오늘 기록이 아직 오지 않은 시각(미래)이 되지 않도록 현재 시각으로 제한
    const evening = seoulDateTimeToISO(date, 20, Math.floor(rand() * 59));
    const ts = evening > nowIso ? nowIso : evening;
    out.push({
      id: `R-${p.patientId}-${date}`,
      patientId: p.patientId,
      date,
      condition,
      pain,
      fatigue,
      sleep,
      mealIntake: ([0, 25, 50, 75, 100] as MealIntake[])[intakeIdx],
      digestion: condition >= 4 ? "good" : DIGESTIONS[Math.floor(rand() * DIGESTIONS.length)],
      symptoms,
      memo: MEMO_SAMPLES[Math.floor(rand() * MEMO_SAMPLES.length)],
      recordedIn: p.modeAt(daysAgo),
      createdAt: ts,
      updatedAt: ts,
      isDemo: true,
    });
  }
  return out;
}

/** 날짜·끼니별 가상 병원식 메뉴 (형태에 따라 변형) */
const MENU_ROTATION: Record<MealSlot, string[][]> = {
  breakfast: [
    ["쌀밥", "미역국", "계란찜", "시금치나물", "배추김치"],
    ["쌀밥", "콩나물국", "두부조림", "애호박볶음", "깍두기"],
    ["쌀밥", "북엇국", "어묵볶음", "오이무침", "배추김치"],
  ],
  lunch: [
    ["잡곡밥", "된장국", "닭가슴살구이", "브로콜리무침", "배추김치"],
    ["잡곡밥", "소고기무국", "고등어구이", "숙주나물", "깍두기"],
    ["잡곡밥", "순두부국", "돼지고기장조림", "감자채볶음", "배추김치"],
  ],
  dinner: [
    ["쌀밥", "아욱국", "생선까스", "양배추샐러드", "깍두기"],
    ["쌀밥", "김칫국", "불고기", "도라지무침", "배추김치"],
    ["쌀밥", "감잣국", "동태전", "무생채", "배추김치"],
  ],
};

export function getMenu(date: string, slot: MealSlot, mealType: MealType): string[] {
  const dayNum = Number(date.replaceAll("-", ""));
  const base = MENU_ROTATION[slot][dayNum % 3];
  switch (mealType) {
    case "porridge":
      return ["흰죽", base[1].replace(/국$/, "국(맑게)"), "계란찜", "백김치", "간장"];
    case "soft":
      return ["진밥", base[1], "두부조림(부드럽게)", "애호박나물", "물김치"];
    case "liquid":
      return ["미음", "맑은 국물", "두유", "과일주스(희석)"];
    default:
      return base;
  }
}

export function createSeedData(today: string = todayISO()): CareLogData {
  const now = nowISO();

  const patients: Patient[] = [
    {
      id: "P001",
      name: "김하늘 (가상)",
      birthYear: 1958,
      gender: "F",
      department: "내과 (가상)",
      careMode: "outpatient",
      nextVisitDate: addDays(today, 5),
      assignedStaffIds: [DEMO_STAFF_ID],
      isDemo: true,
    },
    {
      id: "P002",
      name: "박데모 (가상)",
      birthYear: 1949,
      gender: "M",
      department: "내과 (가상)",
      careMode: "inpatient",
      nextVisitDate: addDays(today, 2),
      assignedStaffIds: [DEMO_STAFF_ID],
      isDemo: true,
    },
    {
      id: "P003",
      name: "이샘플 (가상)",
      birthYear: 1972,
      gender: "F",
      department: "정형외과 (가상)",
      careMode: "outpatient",
      nextVisitDate: addDays(today, 9),
      assignedStaffIds: [DEMO_STAFF_ID],
      isDemo: true,
    },
    {
      id: "P004",
      name: "최예시 (가상)",
      birthYear: 1965,
      gender: "M",
      department: "내과 (가상)",
      careMode: "inpatient",
      nextVisitDate: addDays(today, 1),
      assignedStaffIds: [DEMO_STAFF_ID],
      isDemo: true,
    },
    {
      id: "P005",
      name: "정테스트 (가상)",
      birthYear: 1980,
      gender: "F",
      department: "가정의학과 (가상)",
      careMode: "outpatient",
      nextVisitDate: addDays(today, 14),
      assignedStaffIds: [DEMO_STAFF_ID],
      isDemo: true,
    },
    // 다른 의료진(U-STAFF-02) 담당 — 이케어 간호사 화면에 보이면 안 되는 환자
    {
      id: "P006",
      name: "한다른 (가상)",
      birthYear: 1955,
      gender: "M",
      department: "외과 (가상)",
      careMode: "inpatient",
      nextVisitDate: addDays(today, 3),
      assignedStaffIds: [DEMO_OTHER_STAFF_ID],
      isDemo: true,
    },
  ];

  const ts = (daysAgo: number, hh: number) => seoulDateTimeToISO(addDays(today, -daysAgo), hh, 10);
  /**
   * 오늘 생긴 요청·식사 기록은 "지금으로부터 n분 전"으로 생성.
   * (고정 시각을 쓰면 새벽에 접속했을 때 미래 시각이 되어, 새로 만든 요청이 그 아래로 정렬되던 문제 방지)
   */
  const minutesAgo = (n: number) => new Date(Date.parse(now) - n * 60_000).toISOString();

  const admissions: Admission[] = [
    {
      id: "AD-P002-1",
      patientId: "P002",
      ward: DEMO_WARD,
      room: "703호",
      admittedOn: addDays(today, -12),
      source: "self_reported",
      createdAt: ts(12, 11),
      isDemo: true,
    },
    {
      id: "AD-P004-1",
      patientId: "P004",
      ward: DEMO_WARD,
      room: "708호",
      admittedOn: addDays(today, -5),
      source: "self_reported",
      createdAt: ts(5, 11),
      isDemo: true,
    },
    {
      id: "AD-P006-1",
      patientId: "P006",
      ward: "데모병동 9층",
      room: "902호",
      admittedOn: addDays(today, -8),
      source: "self_reported",
      createdAt: ts(8, 11),
      isDemo: true,
    },
  ];

  const records: HealthRecord[] = [
    // 주 데모 환자: 대체로 보통~좋음, 군데군데 미기록일
    ...generateRecords(
      {
        patientId: "P001",
        seed: 101,
        days: 45,
        coverage: 0.8,
        baseCondition: (d) => 3.4 + Math.sin(d / 5) * 0.6,
        modeAt: () => "outpatient",
      },
      today,
      now,
    ),
    // 검토 대상 예시: 평균 컨디션 낮고 기록 충분
    ...generateRecords(
      {
        patientId: "P002",
        seed: 202,
        days: 30,
        coverage: 0.75,
        baseCondition: () => 1.6,
        modeAt: (d) => (d <= 12 ? "inpatient" : "outpatient"),
        includeToday: true,
      },
      today,
      now,
    ),
    // 기록 부족 예시
    ...generateRecords(
      {
        patientId: "P003",
        seed: 303,
        days: 30,
        coverage: 0.12,
        baseCondition: () => 3.2,
        modeAt: () => "outpatient",
      },
      today,
      now,
    ),
    // 변화 확인 예시: 최근 1주 급격히 저하
    ...generateRecords(
      {
        patientId: "P004",
        seed: 404,
        days: 30,
        coverage: 0.85,
        baseCondition: (d) => (d <= 6 ? 1.8 : 4.2),
        modeAt: (d) => (d <= 5 ? "inpatient" : "outpatient"),
        includeToday: true,
      },
      today,
      now,
    ),
    // 안정 예시
    ...generateRecords(
      {
        patientId: "P005",
        seed: 505,
        days: 30,
        coverage: 0.9,
        baseCondition: () => 4.1,
        modeAt: () => "outpatient",
      },
      today,
      now,
    ),
    // 다른 의료진 담당 환자
    ...generateRecords(
      {
        patientId: "P006",
        seed: 606,
        days: 30,
        coverage: 0.7,
        baseCondition: () => 3,
        modeAt: (d) => (d <= 8 ? "inpatient" : "outpatient"),
      },
      today,
      now,
    ),
  ];

  const med = (
    m: Omit<Medication, "source" | "isDemo" | "visibleToGuardian"> & { visibleToGuardian?: boolean },
  ): Medication => ({ source: "mock", isDemo: true, visibleToGuardian: true, ...m });

  const medications: Medication[] = [
    med({
      id: "M-001",
      patientId: "P001",
      name: "예시 약품 A (가상)",
      purpose: "혈압 관리 목적의 예시 약품",
      dosage: "1정",
      schedule: "아침 식후",
      caution: "(예시 문구) 어지러움이 느껴지면 의료진과 상의하세요. 임의로 중단하지 마세요.",
      externalItemSeq: undefined,
    }),
    med({
      id: "M-002",
      patientId: "P001",
      name: "예시 약품 B (가상)",
      purpose: "위 점막 보호 목적의 예시 약품",
      dosage: "1포",
      schedule: "아침·저녁 식전",
      caution: "(예시 문구) 다른 약과 30분 이상 간격을 두는 예시 안내입니다.",
    }),
    med({
      id: "M-003",
      patientId: "P001",
      name: "예시 영양제 C (가상)",
      purpose: "영양 보충 목적의 예시 제품",
      dosage: "1캡슐",
      schedule: "점심 식후",
      caution: "(예시 문구) 복용 중 불편함이 있으면 기록해 주세요.",
      visibleToGuardian: false,
    }),
    med({
      id: "M-004",
      patientId: "P002",
      name: "예시 약품 D (가상)",
      purpose: "통증 완화 목적의 예시 약품",
      dosage: "1정",
      schedule: "하루 3회 식후",
      caution: "(예시 문구) 공복 복용을 피하는 예시 안내입니다.",
    }),
    med({
      id: "M-005",
      patientId: "P004",
      name: "예시 약품 E (가상)",
      purpose: "소화 기능 보조 목적의 예시 약품",
      dosage: "1정",
      schedule: "식후",
      caution: "(예시 문구) 졸음이 올 수 있다는 예시 안내입니다.",
    }),
  ];


  const requests: LifeRequest[] = [
    {
      id: "Q-001",
      patientId: "P002",
      category: "water",
      detail: "(데모) 따뜻한 물 한 병 부탁드립니다.",
      status: "received",
      createdAt: minutesAgo(75),
      updatedAt: minutesAgo(75),
      isDemo: true,
    },
    {
      id: "Q-002",
      patientId: "P002",
      category: "bedding",
      detail: "(데모) 이불 교체 요청",
      status: "acknowledged",
      createdAt: minutesAgo(135),
      updatedAt: minutesAgo(135),
      handledBy: DEMO_STAFF_ID,
      isDemo: true,
    },
    {
      id: "Q-003",
      patientId: "P004",
      category: "meal_change",
      detail: "(데모) 저녁을 죽으로 변경 희망",
      status: "received",
      mealChange: { date: today, slot: "dinner", toType: "porridge" },
      createdAt: minutesAgo(15),
      updatedAt: minutesAgo(15),
      isDemo: true,
    },
    {
      id: "Q-004",
      patientId: "P002",
      category: "other",
      detail: "(데모) 휠체어 대여 문의",
      status: "completed",
      createdAt: ts(1, 15),
      updatedAt: ts(1, 16),
      handledBy: DEMO_STAFF_ID,
      isDemo: true,
    },
    {
      id: "Q-005",
      patientId: "P006",
      category: "water",
      detail: "(데모) 다른 병동 환자의 물 요청 — 이케어 간호사 화면에는 보이지 않아야 함",
      status: "received",
      createdAt: minutesAgo(195),
      updatedAt: minutesAgo(195),
      isDemo: true,
    },
  ];

  const mealLogs: MealLog[] = [
    {
      id: `ML-P002-${today}-breakfast`,
      patientId: "P002",
      date: today,
      slot: "breakfast",
      mealType: "porridge",
      intake: 50,
      digestion: "bloated",
      updatedAt: minutesAgo(135),
    },
    {
      id: `ML-P004-${today}-breakfast`,
      patientId: "P004",
      date: today,
      slot: "breakfast",
      mealType: "regular",
      intake: 25,
      digestion: "nausea",
      updatedAt: minutesAgo(135),
    },
  ];

  return {
    version: DATA_VERSION,
    seededAt: now,
    users: [
      { id: "U-PAT-001", name: "김하늘 (가상)", role: "patient", isDemo: true },
      { id: DEMO_STAFF_ID, name: "이케어 간호사 (가상)", role: "staff", isDemo: true },
      { id: DEMO_OTHER_STAFF_ID, name: "박다른 간호사 (가상, 9층)", role: "staff", isDemo: true },
      { id: DEMO_GUARDIAN_ID, name: "김보호 (가상 보호자)", role: "guardian", relation: "자녀", isDemo: true },
    ],
    patients,
    admissions,
    records,
    medications,
    visitQuestions: [
      {
        id: "VQ-001",
        patientId: "P001",
        text: "(예시) 아침 약을 깜빡하면 언제 먹어야 하나요?",
        done: false,
        createdAt: ts(3, 21),
      },
      {
        id: "VQ-002",
        patientId: "P001",
        text: "(예시) 요즘 밤에 자주 깨는데 약과 관련이 있을까요?",
        done: false,
        createdAt: ts(1, 22),
      },
    ],
    mealLogs,
    requests,
    reviews: [],
    accessGrants: [
      {
        id: "AG-001",
        patientId: "P001",
        granteeUserId: DEMO_GUARDIAN_ID,
        role: "guardian",
        scopes: ["records", "medications", "meals", "requests"],
        approvedAt: ts(20, 10),
      },
    ],
  };
}
