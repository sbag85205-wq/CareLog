/**
 * 공개 /demo 저장소 — 브라우저 localStorage의 가상 데이터를 로그인 버전 화면 형식(DbSnapshot)으로 제공
 *
 * 로그인 버전에서는 DB(RLS)가 역할별로 행을 걸러 주지만, 데모는 같은 규칙을 여기서 흉내 냅니다.
 * - 환자: 본인(P001) 데이터 / 의료진: 담당 환자, 공유한 진료 질문만, 내부 메모 포함
 * - 보호자: 공유받은 항목만, 약은 '보호자에게 공개'한 것만, 진료 질문·검토 정보 없음
 * 실제 서버·식약처 API에는 접속하지 않습니다 (보안 기능이 아닌 체험용 화면 필터).
 */
import { DEMO_GUARDIAN_ID, DEMO_PATIENT_ID, DEMO_STAFF_ID } from "@/data/mock-data";
import { CareLogError } from "@/lib/errors";
import type { CareLogData } from "@/types";
import type { LocalRepository } from "./local-storage";
import type { DbSnapshot, Grant, Invitation, LoadState, SupabaseRepository, ViewerRole } from "./supabase";

export type DemoRole = Exclude<ViewerRole, "admin">;

const VIEWER: Record<DemoRole, string> = { patient: "U-PAT-001", staff: DEMO_STAFF_ID, guardian: DEMO_GUARDIAN_ID };

export function toDemoSnapshot(d: CareLogData, role: DemoRole): DbSnapshot {
  const userId = VIEWER[role];
  const displayName = d.users.find((u) => u.id === userId)?.name ?? "";
  const grantsAll: Grant[] = d.accessGrants.map((g) => ({
    id: g.id,
    patientId: g.patientId,
    granteeId: g.granteeUserId,
    scopes: g.scopes,
    invitationId: `INV-${g.id}`,
    approvedAt: g.approvedAt,
    revokedAt: g.revokedAt,
  }));
  // 데모 보호자 이름을 '초대 이메일' 자리에 표시
  const invitationsAll: Invitation[] = d.accessGrants.map((g) => ({
    id: `INV-${g.id}`,
    patientId: g.patientId,
    email: d.users.find((u) => u.id === g.granteeUserId)?.name ?? "가상 보호자",
    scopes: g.scopes,
    status: "accepted",
    expiresAt: g.approvedAt,
    createdAt: g.approvedAt,
    respondedAt: g.approvedAt,
  }));

  let patientIds: string[];
  const scopeOf = new Map<string, Set<string>>();
  if (role === "patient") patientIds = [DEMO_PATIENT_ID];
  else if (role === "staff") patientIds = d.patients.filter((p) => p.assignedStaffIds.includes(userId)).map((p) => p.id);
  else {
    for (const g of d.accessGrants) if (g.granteeUserId === userId && !g.revokedAt) scopeOf.set(g.patientId, new Set(g.scopes));
    patientIds = [...scopeOf.keys()];
  }
  const ids = new Set(patientIds);
  const mine = <T extends { patientId: string }>(rows: T[], scope?: string) =>
    rows.filter((r) => ids.has(r.patientId) && (role !== "guardian" || !scope || scopeOf.get(r.patientId)?.has(scope)));

  return {
    ...d,
    patients: d.patients.filter((p) => ids.has(p.id)),
    admissions: mine(d.admissions),
    records: mine(d.records, "records"),
    medications: mine(d.medications, "medications").filter((m) => role !== "guardian" || m.visibleToGuardian),
    visitQuestions: role === "guardian" ? [] : mine(d.visitQuestions).filter((q) => role !== "staff" || q.sharedWithStaff),
    mealLogs: mine(d.mealLogs, "meals"),
    requests: mine(d.requests, "requests"),
    reviews: role === "guardian" ? [] : mine(d.reviews).map((r) => (role === "staff" ? r : { ...r, note: "" })),
    viewer: { userId, role, displayName },
    invitations: role === "patient" ? invitationsAll.filter((i) => ids.has(i.patientId)) : [],
    grants: role === "patient" ? grantsAll.filter((g) => ids.has(g.patientId)) : grantsAll.filter((g) => g.granteeId === userId),
    reviewNotes: role === "staff" ? Object.fromEntries(d.reviews.map((r) => [r.id, r.note])) : {},
    menus: [],
  };
}

/** 데모에서는 만들 수 없는 기능 (실제 계정·초대 링크) */
const notInDemo = (what: string) => async (): Promise<never> => {
  throw new CareLogError("not_supported", `${what}은(는) 가상 데이터 데모에서 사용할 수 없어요. 로그인 버전에서 이용해 주세요.`);
};

export function createDemoRepository(local: LocalRepository, role: DemoRole): SupabaseRepository {
  let lastBase: CareLogData | null = null;
  let last: DbSnapshot | null = null;
  const getSnapshot = () => {
    const base = local.getSnapshot();
    if (!base) return null;
    if (base !== lastBase) {
      lastBase = base;
      last = toDemoSnapshot(base, role);
    }
    return last;
  };
  const ready: LoadState = { state: "ready" };
  const loading: LoadState = { state: "loading" };

  return {
    getSnapshot,
    subscribe: local.subscribe,
    getLoadState: () => (local.getSnapshot() ? ready : loading),
    load: async () => {},

    upsertHealthRecord: (i) => local.upsertHealthRecord(i),
    setCareMode: (pid, mode) => local.setCareMode(pid, mode),
    addVisitQuestion: (pid, text) => local.addVisitQuestion(pid, text),
    toggleVisitQuestion: (id) => local.toggleVisitQuestion(id),
    deleteVisitQuestion: (id) => local.deleteVisitQuestion(id),
    setVisitQuestionShared: (id, shared) => local.setVisitQuestionShared(id, shared),
    setNextVisitDate: (pid, date) => local.setNextVisitDate(pid, date),
    upsertMealLog: (p) => local.upsertMealLog(p),
    createRequest: (i) => local.createRequest(i),
    updateRequestStatus: (id, expected, to) => local.updateRequestStatus(id, expected, to, DEMO_STAFF_ID),
    addStaffReview: (i) => local.addStaffReview({ ...i, staffId: DEMO_STAFF_ID }),

    addMedication: (pid, input) => local.addMedications(pid, [input]),
    addMedications: (pid, inputs) => local.addMedications(pid, inputs),
    updateMedication: (id, input) => local.updateMedication(id, input),
    deleteMedication: (id) => local.deleteMedication(id),
    setMedicationVisibility: (id, v) => local.setMedicationVisibility(id, v),

    updateGuardianScopes: (gid, scopes) => local.updateGrantScopes(gid, scopes),
    revokeGuardianAccess: (gid) => local.revokeGrant(gid),
    inviteGuardian: notInDemo("새 보호자 초대 링크"),
    revokeInvitation: async () => {},
    acceptInvitation: notInDemo("초대 수락"),

    resetDemoData: () => local.resetDemoData(),
  };
}
