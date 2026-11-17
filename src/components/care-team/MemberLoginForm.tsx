"use client";

import { useState } from "react";
import { Alert, PButton, TextField } from "@/components/patient-ui/kit";

/** 보호자·간호사/의료진 로그인 (이메일 + 비밀번호) — 계정은 관리자가 준비 */
export function MemberLoginForm({ onSuccess }: { onSuccess: (home: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-6"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        if (pending) return;
        setPending(true);
        setError(null);
        try {
          const res = await fetch("/api/member-auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
            credentials: "same-origin",
            cache: "no-store",
          });
          const r = (await res.json()) as { ok: boolean; message?: string; home?: string };
          if (!r.ok) return setError(r.message ?? "로그인하지 못했습니다.");
          setPassword("");
          onSuccess(r.home ?? "/");
        } catch {
          setError("서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        } finally {
          setPending(false);
        }
      }}
    >
      <TextField label="이메일" type="email" autoComplete="username" value={email} maxLength={254} onChange={(e) => setEmail(e.target.value)} required />
      <TextField label="비밀번호" type="password" autoComplete="current-password" value={password} maxLength={200} onChange={(e) => setPassword(e.target.value)} required />
      <Alert>{error}</Alert>
      <PButton type="submit" className="w-full" disabled={pending || !email || !password} arrow={!pending}>
        {pending ? "확인 중…" : "로그인"}
      </PButton>
    </form>
  );
}
