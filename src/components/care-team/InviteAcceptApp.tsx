"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MemberLoginForm } from "@/components/care-team/MemberLoginForm";
import { Alert, Notice, PButton, PCard, Wordmark } from "@/components/patient-ui/kit";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { useDbApp } from "@/hooks/useDbApp";
import { ROLE_NAME } from "@/lib/roles";

/** 초대 토큰은 주소의 # 뒤에만 둠 → 서버 요청·로그에 남지 않음 */
function readToken(): string | null {
  const m = window.location.hash.match(/(?:^#|&)t=([0-9a-f]{64})\b/);
  return m ? m[1] : null;
}

/** /invite#t=… — 보호자가 자기 계정으로 초대를 수락 */
export function InviteAcceptApp() {
  const router = useRouter();
  const { repo, snapshot, loadState, logout, signedOut, restart } = useDbApp(null, { requireLogin: false });
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const action = useAsyncAction();
  const [done, setDone] = useState(false);

  useEffect(() => {
    const read = () => setToken(readToken());
    const id = window.setTimeout(read, 0);
    window.addEventListener("hashchange", read);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("hashchange", read);
    };
  }, []);

  const role = snapshot?.viewer.role;
  return (
    <div className="min-h-dvh bg-ivory text-ink">
      <main className="mx-auto w-full max-w-md px-5 pt-8 pb-10 lg:pt-16">
        <PCard className="!p-0 lg:!p-10 max-lg:!border-0 max-lg:!bg-transparent">
          <Wordmark sub="케어로그" />
          <h1 className="mt-8 text-[1.85rem] leading-snug font-extrabold tracking-tight text-ink">보호자 초대</h1>
          <p className="mt-3 text-ink-soft">환자가 공유한 항목을 읽기 전용으로 볼 수 있어요. 공유는 환자가 언제든 바꾸거나 멈출 수 있어요.</p>

          <div className="mt-8 space-y-5">
            {token === null && <Alert>초대 링크가 올바르지 않아요. 환자에게 받은 링크 전체를 다시 열어 주세요.</Alert>}
            {token && signedOut && (
              <>
                <Notice>초대받은 이메일의 보호자 계정으로 로그인해 주세요.</Notice>
                <MemberLoginForm onSuccess={() => restart()} />
              </>
            )}
            {token && !signedOut && loadState?.state === "error" && <Alert>{loadState.message}</Alert>}
            {token && !signedOut && (!snapshot || loadState?.state === "loading") && loadState?.state !== "error" && (
              <p className="text-ink-soft">계정을 확인하는 중…</p>
            )}
            {token && snapshot && role !== "guardian" && (
              <>
                <Alert>
                  지금은 {ROLE_NAME[role ?? "patient"]} 계정으로 로그인되어 있어요. 로그아웃한 뒤 초대받은 보호자 계정으로 로그인해 주세요.
                </Alert>
                <PButton variant="secondary" className="w-full" onClick={() => void logout()}>
                  로그아웃
                </PButton>
              </>
            )}
            {token && snapshot && role === "guardian" && repo && !done && (
              <>
                <Alert>{action.error}</Alert>
                <PButton
                  className="w-full"
                  disabled={action.pending}
                  onClick={async () => {
                    const r = await action.run(() => repo.acceptInvitation(token));
                    if (r.ok) {
                      setDone(true);
                      history.replaceState(null, "", "/invite"); // 토큰을 주소에서 지움
                      router.replace("/guardian");
                    }
                  }}
                >
                  {action.pending ? "수락하는 중…" : "초대 수락하기"}
                </PButton>
              </>
            )}
            {done && <Notice>초대를 수락했어요. 안부 화면으로 이동해요.</Notice>}
          </div>
          <p className="mt-8 text-center text-sm text-ink-soft">
            <Link href="/" className="font-semibold text-sage-700 underline underline-offset-4">
              처음 화면으로
            </Link>
          </p>
        </PCard>
      </main>
    </div>
  );
}
