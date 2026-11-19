"use client";

import { IdCard, KeyRound, RotateCcw, ShieldOff, Trash2, UserPlus, UsersRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppShell, PageTitle, type ShellTab } from "@/components/patient-ui/AppShell";
import { Alert, Notice, PButton, PCard, SoftSheet, StatusPill, Switch, TextField } from "@/components/patient-ui/kit";
import { formatDateTime } from "@/lib/date";
import { MODE_LABEL } from "@/lib/labels";
import { LOGIN_ID_RULE } from "@/lib/patient-auth/login-id";
import type { LoadState } from "@/lib/repository/supabase";
import { getBrowserClient } from "@/lib/supabase/browser";
import type { CareMode } from "@/types";

interface Row {
  id: string;
  displayName: string;
  demoCode: string | null;
  careMode: CareMode;
  createdAt: string;
  loginId: string | null;
  status: "active" | "disabled";
  isTest: boolean;
  lastSignInAt: string | null;
  records: number;
}

type Api = { ok: boolean; message?: string; [k: string]: unknown };

async function api(method: "GET" | "POST", body?: Record<string, unknown>): Promise<{ status: number; data: Api }> {
  try {
    const res = await fetch("/api/admin/patients", {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
    });
    return { status: res.status, data: (await res.json()) as Api };
  } catch {
    return { status: 0, data: { ok: false, message: "서버에 연결하지 못했습니다." } };
  }
}

type Dialog =
  | { kind: "register" }
  | { kind: "login-id"; row: Row }
  | { kind: "password"; row: Row }
  | { kind: "disable"; row: Row }
  | { kind: "restore"; row: Row }
  | { kind: "delete"; row: Row };

const TABS: ShellTab<"patients">[] = [{ id: "patients", label: "환자 계정", icon: UsersRound }];

/**
 * /admin/patients — 관리자 환자 계정 관리
 * 관리자 여부·모든 변경은 서버(/api/admin/patients)가 확인하고 서버 키로 처리 (브라우저에는 서버 키 없음)
 */
export function AdminPatientsApp() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loadState, setLoadState] = useState<LoadState>({ state: "loading" });
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { status, data } = await api("GET");
    if (status === 401) return router.replace("/login/member");
    if (!data.ok) return setLoadState({ state: "error", message: data.message ?? "불러오지 못했습니다." });
    setRows(data.patients as Row[]);
    setLoadState({ state: "ready" });
  }, [router]);

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(id);
  }, [load]);

  async function logout() {
    await fetch("/api/patient-auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => undefined);
    await getBrowserClient()?.auth.signOut();
    router.replace("/login/member");
  }

  const done = (msg: string) => {
    setDialog(null);
    setNotice(msg);
    void load();
  };

  return (
    <AppShell
      tabs={TABS}
      active="patients"
      onTab={() => {}}
      roleLabel="관리자"
      onLogout={() => void logout()}
      loadState={loadState}
      onRetry={() => void load()}
      ready={loadState.state === "ready" && rows !== null}
    >
      <div className="space-y-5">
        <PageTitle
          title="환자 계정"
          sub="환자 등록 · 아이디 지정 · 비밀번호 재설정 · 비활성화"
          action={
            <PButton size="md" icon={UserPlus} onClick={() => setDialog({ kind: "register" })}>
              환자 등록
            </PButton>
          }
        />
        <Notice>{notice}</Notice>
        <PCard tone="ivory">
          <p className="text-xs leading-relaxed text-ink-soft">
            가상 계정만 등록하세요. 비밀번호는 저장하거나 화면에 다시 표시하지 않아요 — 등록·재설정한 비밀번호는 환자에게 직접 전달해 주세요. 비활성화하면 이미 로그인한
            기기에서도 바로 데이터에 접근할 수 없어요.
          </p>
        </PCard>
        {rows && rows.length === 0 && (
          <PCard>
            <p className="text-ink-soft">등록된 환자가 없어요.</p>
          </PCard>
        )}
        <ul className="grid gap-3 lg:grid-cols-2" aria-label="환자 계정 목록">
          {rows?.map((r) => (
            <li key={r.id}>
              <PatientCard row={r} onAction={setDialog} />
            </li>
          ))}
        </ul>
      </div>

      <SoftSheet open={dialog !== null} title={dialogTitle(dialog)} onClose={() => setDialog(null)}>
        {dialog?.kind === "register" && <RegisterForm onDone={done} />}
        {dialog?.kind === "login-id" && <LoginIdForm row={dialog.row} onDone={done} />}
        {dialog?.kind === "password" && <PasswordForm row={dialog.row} onDone={done} />}
        {(dialog?.kind === "disable" || dialog?.kind === "restore") && <StatusForm row={dialog.row} disable={dialog.kind === "disable"} onDone={done} />}
        {dialog?.kind === "delete" && <DeleteForm row={dialog.row} onDone={done} />}
      </SoftSheet>
    </AppShell>
  );
}

function dialogTitle(d: Dialog | null) {
  if (!d) return "";
  if (d.kind === "register") return "환자 등록";
  const name = d.row.displayName;
  return {
    "login-id": `${name} · 로그인 아이디`,
    password: `${name} · 비밀번호 재설정`,
    disable: `${name} · 비활성화`,
    restore: `${name} · 복구`,
    delete: `${name} · 영구 삭제`,
  }[d.kind];
}

function PatientCard({ row: r, onAction }: { row: Row; onAction: (d: Dialog) => void }) {
  return (
    <PCard aria-label={`${r.displayName} 계정`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-lg font-bold break-words text-ink">
            {r.displayName}
            {r.demoCode && <span className="ml-1 text-sm font-medium text-ink-soft">({r.demoCode})</span>}
          </p>
          <p className="mt-1 font-mono text-sm break-all text-ink">{r.loginId ?? <span className="font-sans text-blush-700">아이디 없음 · 이전 방식</span>}</p>
        </div>
        <span className="flex flex-wrap gap-1">
          {r.status === "active" ? <StatusPill check>활성</StatusPill> : <StatusPill tone="warn">비활성</StatusPill>}
          {r.isTest && <StatusPill tone="ivory">테스트</StatusPill>}
        </span>
      </div>
      <p className="mt-2 text-xs text-ink-soft">
        {MODE_LABEL[r.careMode]} · 기록 {r.records}건 · 등록 {formatDateTime(r.createdAt)} · 마지막 로그인 {r.lastSignInAt ? formatDateTime(r.lastSignInAt) : "없음"}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <PButton size="sm" variant="secondary" icon={IdCard} onClick={() => onAction({ kind: "login-id", row: r })}>
          {r.loginId ? "아이디 변경" : "아이디 지정"}
        </PButton>
        <PButton size="sm" variant="secondary" icon={KeyRound} onClick={() => onAction({ kind: "password", row: r })}>
          비밀번호 재설정
        </PButton>
        {r.status === "active" ? (
          <PButton size="sm" variant="ghost" icon={ShieldOff} onClick={() => onAction({ kind: "disable", row: r })}>
            비활성화
          </PButton>
        ) : (
          <PButton size="sm" variant="soft" icon={RotateCcw} onClick={() => onAction({ kind: "restore", row: r })}>
            복구
          </PButton>
        )}
        {r.isTest && (
          <PButton size="sm" variant="ghost" icon={Trash2} onClick={() => onAction({ kind: "delete", row: r })}>
            영구 삭제
          </PButton>
        )}
      </div>
    </PCard>
  );
}

/** 공통: 요청 보내고 결과 처리 (비밀번호 입력값은 성공·실패와 관계없이 화면 상태에서 지움) */
function useSubmit() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (body: Record<string, unknown>) => {
    if (pending) return null;
    setPending(true);
    setError(null);
    const { data } = await api("POST", body);
    setPending(false);
    if (!data.ok) setError(data.message ?? "처리하지 못했습니다.");
    return data.ok ? data : null;
  };
  return { pending, error, run };
}

function PasswordPair({ pw, setPw, confirm, setConfirm, label }: { pw: string; setPw: (v: string) => void; confirm: string; setConfirm: (v: string) => void; label: string }) {
  return (
    <>
      <TextField label={label} type="password" autoComplete="new-password" value={pw} maxLength={72} onChange={(e) => setPw(e.target.value)} helper="8자 이상, 영문과 숫자를 함께 사용" />
      <TextField label={`${label} 확인`} type="password" autoComplete="new-password" value={confirm} maxLength={72} onChange={(e) => setConfirm(e.target.value)} />
    </>
  );
}

function RegisterForm({ onDone }: { onDone: (msg: string) => void }) {
  const [name, setName] = useState("");
  const [loginId, setLoginId] = useState("");
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isTest, setIsTest] = useState(true);
  const s = useSubmit();
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await s.run({ action: "register", displayName: name, loginId, password: pw, passwordConfirm: confirm, isTest });
        setPw("");
        setConfirm("");
        if (r) onDone(`${name} 님을 등록했어요. 아이디 ${r.loginId as string} 와 초기 비밀번호를 환자에게 직접 전달해 주세요.`);
      }}
    >
      <PCard className="space-y-5">
        <TextField label="표시 이름" value={name} maxLength={50} onChange={(e) => setName(e.target.value)} placeholder="예: 가상 환자 하늘" />
        <TextField label="로그인 아이디" value={loginId} maxLength={20} autoCapitalize="none" spellCheck={false} onChange={(e) => setLoginId(e.target.value)} helper={LOGIN_ID_RULE} placeholder="예: haneul01" />
        <PasswordPair pw={pw} setPw={setPw} confirm={confirm} setConfirm={setConfirm} label="초기 비밀번호" />
        <Switch label="가상 테스트 계정" description="테스트 계정만 나중에 영구 삭제할 수 있어요" checked={isTest} onChange={setIsTest} />
      </PCard>
      <Alert>{s.error}</Alert>
      <PButton type="submit" className="w-full" disabled={s.pending || !name.trim() || !loginId || !pw || !confirm}>
        {s.pending ? "등록 중…" : "등록"}
      </PButton>
    </form>
  );
}

function LoginIdForm({ row, onDone }: { row: Row; onDone: (msg: string) => void }) {
  const [loginId, setLoginId] = useState(row.loginId ?? "");
  const s = useSubmit();
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await s.run({ action: "set-login-id", patientId: row.id, loginId });
        if (r) onDone(`${row.displayName} 님의 아이디를 ${r.loginId as string}(으)로 정했어요. 비밀번호는 그대로예요.`);
      }}
    >
      <PCard className="space-y-4">
        <p className="text-sm text-ink-soft">
          환자 ID·계정·비밀번호와 기록·약·진료 질문·보호자 공유·간호사 배정은 그대로 이어져요. 환자는 새 아이디와 <strong>기존 비밀번호</strong>로 로그인해요.
        </p>
        <TextField label="로그인 아이디" value={loginId} maxLength={20} autoCapitalize="none" spellCheck={false} onChange={(e) => setLoginId(e.target.value)} helper={LOGIN_ID_RULE} />
      </PCard>
      <Alert>{s.error}</Alert>
      <PButton type="submit" className="w-full" disabled={s.pending || !loginId}>
        {s.pending ? "저장 중…" : "아이디 저장"}
      </PButton>
    </form>
  );
}

function PasswordForm({ row, onDone }: { row: Row; onDone: (msg: string) => void }) {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const s = useSubmit();
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await s.run({ action: "reset-password", patientId: row.id, password: pw, passwordConfirm: confirm });
        setPw("");
        setConfirm("");
        if (r) onDone(`${row.displayName} 님의 비밀번호를 재설정했어요. 새 비밀번호를 환자에게 직접 전달해 주세요.`);
      }}
    >
      <PCard className="space-y-5">
        <p className="text-sm text-ink-soft">환자가 비밀번호를 잊은 경우에만 사용하세요. 기록과 계정은 그대로예요.</p>
        <PasswordPair pw={pw} setPw={setPw} confirm={confirm} setConfirm={setConfirm} label="새 비밀번호" />
      </PCard>
      <Alert>{s.error}</Alert>
      <PButton type="submit" className="w-full" disabled={s.pending || !pw || !confirm}>
        {s.pending ? "저장 중…" : "비밀번호 재설정"}
      </PButton>
    </form>
  );
}

function StatusForm({ row, disable, onDone }: { row: Row; disable: boolean; onDone: (msg: string) => void }) {
  const s = useSubmit();
  return (
    <PCard className="space-y-4">
      <p className="text-ink">
        {disable
          ? "비활성화하면 로그인할 수 없고, 이미 로그인한 기기에서도 바로 기록·약·요청에 접근할 수 없어요. 기록은 지워지지 않아요."
          : "복구하면 기존 아이디·비밀번호로 다시 로그인할 수 있고, 기록이 그대로 이어져요."}
      </p>
      <Alert>{s.error}</Alert>
      <PButton
        className={disable ? "w-full !bg-blush-700" : "w-full"}
        disabled={s.pending}
        onClick={async () => {
          const r = await s.run({ action: disable ? "disable" : "restore", patientId: row.id });
          if (r) onDone(`${row.displayName} 님 계정을 ${disable ? "비활성화" : "복구"}했어요.`);
        }}
      >
        {s.pending ? "처리 중…" : disable ? "비활성화" : "복구"}
      </PButton>
    </PCard>
  );
}

function DeleteForm({ row, onDone }: { row: Row; onDone: (msg: string) => void }) {
  const [preview, setPreview] = useState<{ counts: Record<string, number>; total: number } | null>(null);
  const [confirm, setConfirm] = useState("");
  const s = useSubmit();
  const pv = useSubmit();
  useEffect(() => {
    const id = window.setTimeout(async () => {
      const r = await pv.run({ action: "delete-preview", patientId: row.id });
      if (r) setPreview({ counts: r.counts as Record<string, number>, total: r.total as number });
    }, 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 열 때 1번만
  }, [row.id]);
  return (
    <PCard className="space-y-4">
      <Alert>{pv.error}</Alert>
      {preview && (
        <>
          <p className="font-bold text-blush-700">가상 테스트 계정과 연결된 데이터를 모두 영구 삭제해요. 되돌릴 수 없어요.</p>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm" aria-label="삭제될 연결 기록">
            {Object.entries(preview.counts).map(([k, v]) => (
              <li key={k} className="flex justify-between gap-2">
                <span className="text-ink-soft">{k}</span>
                <span className="font-bold text-ink">{v}건</span>
              </li>
            ))}
          </ul>
          <p className="text-sm text-ink-soft">
            삭제 범위: 환자 정보와 위 연결 기록 {preview.total}건, 로그인 계정. 보호자·간호사 계정 자체는 남아요.
          </p>
          <TextField label={`확인: 표시 이름 "${row.displayName}" 입력`} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          <Alert>{s.error}</Alert>
          <PButton
            className="w-full !bg-blush-700"
            disabled={s.pending || confirm !== row.displayName}
            onClick={async () => {
              const r = await s.run({ action: "delete", patientId: row.id, confirm });
              if (r) onDone(`${row.displayName} 테스트 계정을 영구 삭제했어요.`);
            }}
          >
            {s.pending ? "삭제 중…" : "영구 삭제"}
          </PButton>
        </>
      )}
      {!preview && !pv.error && <p className="text-ink-soft">연결된 기록을 확인하는 중…</p>}
    </PCard>
  );
}
