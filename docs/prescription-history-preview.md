# 처방 이력 버전 — Preview 배포 기록과 되돌리기

새 방향: «지난 처방과 약을 먹고 느낀 점을 기록해, 다음 진료에서 바로 보여주는 앱»

## 시작 전 기준 (2026-11-23 KST)

| 항목 | 값 |
| --- | --- |
| 로컬·GitHub `main`·Production 커밋 | `adad0de` (feat: 처방전 촬영·PDF 인식과 약 일괄 등록, 공개 /demo를 현재 CareLog 디자인으로) |
| Production 배포 | Vercel `ax-2team/carelog` · 배포 ID `8xCLmqk9ZmVach9yFkDjhz9pTjkP` · 2026-11-23 03:49 KST · Ready |
| 공개 주소 | `https://carelog-zeta.vercel.app` — `/demo` 200, `/login` 200, `/` 307 → `/login` |
| DB (carelog-dev) | migration 1–9 적용, **10(처방 이력)은 미적용** — 새 표 없음(PGRST205) 확인 |
| 작업 브랜치 | `carelog-prescription-history` (`adad0de`에서 분기) — Preview만 배포, `main`·Production은 그대로 |

## 이 브랜치가 하지 않는 것

- `main` 병합·Production 배포 없음 (Vercel은 브랜치 push를 Preview로만 배포)
- 원격 DB에 migration 적용 없음 — 앱은 처방 이력 표가 없으면 안내 후 예전처럼 `medications`에 등록
- 병동 기능(통원·입원 전환, 병동·호실, 식사, 생활 요청, 의료진 생활 요청 메뉴) 코드·DB 기록 삭제 없음 — `FEATURES.WARD = false`로 화면에서만 숨김

## Production을 지금 상태로 되돌리거나 유지하는 법

- Preview만 쓰는 동안 Production은 `adad0de` 그대로입니다. 되돌릴 것이 없습니다.
- 나중에 이 브랜치를 Production에 올렸다가 되돌려야 하면:
  1. Vercel 대시보드 → carelog → Deployments → 배포 `8xCLmqk9ZmVach9yFkDjhz9pTjkP`(커밋 `adad0de`) → **Promote to Production** (또는 현재 Production에서 **Instant Rollback**)
  2. Git은 force push 없이: `git revert -m 1 <병합 커밋>` 후 push
  3. migration 10을 적용한 뒤라도 기존 표·데이터는 바뀌지 않으므로 이전 앱(`adad0de`)이 그대로 동작합니다 (새 표·`visit_questions.prescription_id`는 이전 앱이 읽지 않음).

## Production 반영에 필요한 DB 변경

`supabase/README.md`의 “6단계: 처방 이력 (migration 10)” 참고 — 토큰 갱신 → status → dry-run(파일 1개) → 적용 → verify-catalog(테이블 19 · 정책 43) → 원격 E2E.
