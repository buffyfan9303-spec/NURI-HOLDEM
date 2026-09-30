# 누리홀덤 인수인계서 — 2026-09-30 ~ 10-01 세션 (상세 초안)

> 작성: 인수인계 초안 담당 에이전트(`claude-opus-5-5`, 읽기 전용 — 제품 코드·DB 수정 0). 작성 시각 2026-10-01 새벽(KST).
> 세션: `a1e61c23-3c36-41fc-b3c2-2b4c31dcd167`. 앞 세션 `0a8674b5-…` 은 2026-09-30 06:31 KST 에 꺼졌다(팀원 6갈래 동시 중단).
> **시각은 모두 KST.** PR 병합 시각은 `gh pr list` 의 `mergedAt`(UTC)에 9시간을 더했다. 러닝 로그의 "08:1x" 같은 시각은 대략값이다.
> 정본 위치: 이 초안은 `docs/HANDOFF.md`(git, 상태 정본)로 옮겨 커밋해야 계정·컴퓨터를 넘어간다. 에이전트 기억(`.claude/agent-memory-local/**`)은 git 에 없다.

## 원천 (이 문서가 읽은 것)

| 원천 | 경로 | 비고 |
|---|---|---|
| 러닝 로그(가장 중요) | `.claude/handoff/NURI-SESSION-2026-09-30-RUNLOG.md` | 210줄, 10-01 00:5x 까지 |
| 리드 기억 | `.claude/agent-memory-local/nuri-lead/MEMORY.md` + 09-30 파일 10개 | `project_owner_decisions_0929/0930.md` 등 |
| 역할 기억(09-30) | store-team 9 · home-team 9 · gto-team 4 · critical-reviewer 12 · design-reviewer 5 · verifier 3 · community-team 1 · root-cause-debugger 1 | 파일 목록은 §6 끝 |
| PR 목록 | `gh pr list -R buffyfan9303-spec/NURI-HOLDEM --state all --limit 45` | #51~#74 |
| CI 실행 | `gh run list --branch main` | 09-30 06시 이후 |
| 마이그레이션 머리 | `git show origin/main:supabase/migrations/20260930{a..i}_*.sql` | origin/main = `faac0e6f` |
| 명세 | `.claude/handoff/specs-0930/W-defects.md` · `PLAN-AB-exec.md` | W단계 결함표·K단계 계획 |
| 영상 분석 | scratchpad `uxui/` (CARD_SPEC·RULE_SPEC·guideline·tailwind4·channels·progress·rules/stat.json) | 규칙집은 아직 만드는 중 |
| 서브에이전트 실행 기록 | `~/.claude/projects/C--Users-buffy-OneDrive-----------/a1e61c23-…/subagents/*.jsonl` 75개 | 모델은 로그의 `message.model` 필드로 **관찰**한 값 |

---

## 0. 한눈에

### 0-1. 오늘 운영에 나간 것 (main → CI 통과 → Vercel Production)

| 묶음 | PR | 무엇 | main 병합 커밋(KST) |
|---|---|---|---|
| 모션 | #51 | 공용 Fold 로 열림·닫힘 44곳 부드럽게 · 누른 버튼 제자리 · 검색 칩 가로 펼침(D1·D2·keepMounted·N1 수정 포함) | dbe49790 (08:13) |
| 메일 | #52 | 메일 디자인 1벌 + 인증 템플릿 5종 + 1:1 문의 답변 메일(support-reply-email) | 73785bf8 (08:06) |
| 딜러 | #53 | 딜러 탭 ICM 계산기를 찹(딜) 분배 하나로 | 2a53aed4 (08:47) |
| 테스트 | #54 | UI-06 짧은 섹션 e2e — D8 첫 방문 정렬 계약 반영 | c394ab34 (07:23) |
| 매장 | #55 | 직원 화면 맨 위 출근·퇴근 버튼(00:00~01:59 는 어제 근무로) | a8623564 (07:50) |
| 순위 | #56 | 실명 공개를 본인이 고르면 모든 순위에 반영, 비동의 옛 기록은 '참가자' | 566238b8 (09:04) |
| 권한 | #57 | 승인 철회·승인 전 업주/공동 운영자의 매장 권한 차단(판정 정본 한 곳) | 42b80f3e (09:15) |
| 클락 | #58 | 모션 테마 v3 15종(벚꽃 3·계절 3·날씨 5+폭우 유리창·자연 3) 실제 클락에 연결 | c512b9c2 (09:57) |
| 일정 표시 | #59 | KW-3 상세·카드 표시(W-15·17·21·22·23·24) | a4a834de (10:37) |
| 계산 | #60 | KW-1a 포스터→장부→클락 계산 12건 | 14922e61 (10:52) |
| 이미지 | #61 | 썸네일 기본 resize=contain(포스터가 가운데 13~21%만 보이던 것) | 4c4d7db2 (12:22) |
| 일정 표시 | #62 | 리엔트리 계단 스택 표시(320 넘침 수정 포함) | d617cdd8 (12:50) |
| 보안 | #63 | CSP Report-Only 정비 · verify-identity 진단값 제거·일일 상한 | b458d1fa (12:22) |
| 보안 | #64 | 서버 가드 20260930f 적용 표기 + rankverify total_won 제거 | fe24da85 (12:22) |
| GTO | #65 | 정확도 감사 5건(드로잉 데드·푸시폴드 라벨·3벳 잔여 채점·ICM 자리수·SPOT BB앤티 유효 스택) | d10d69ce (12:22) |
| 포스터 폼 | #66 | KW-2 포스터 폼만으로 일정 입력(W-02·16·18·이용권 N장 칸·이미지 업로드 보증) | 3b54a4e7 (13:16) |
| SPOT | #67 | 두 사람 스택 따로 입력 · GTO 후속 3건 | 9fcbe0f0 (12:51) |
| 어문 | #68 | 어문 감사 510건 — 합니다체·법무 정리(위치정보관리책임자 김윤혜 등) | c0057d4b (13:50) |
| 이용권 | #69 | KW-1b 이용권 N장 = 바인 1회 · 첫 리바인 할인(firstRebuy) | 6b62d70e (13:50) |
| 클락 | #70 | K단계 — TV 슬라이드(시상·추가 페이지·광고)·시상 문구/메모·팀 점수·관리자 광고 관리 | a45e27a7 (14:12) |
| 설정 | #71 | 번들 JS 합계 예산 1014→1080 · CLAUDE.md Tailwind v4 표기 | 489191e8 (16:53) |
| 어문 | #72 | 국민체육진흥법 문장 복원 · 개정 이력 사실대로 · 리바이→리바인 | 729baf86 (16:56) |
| 포스터 | #73 | 포스터 webp 업로드 목표 500KB→250KB | 33e2a5b4 (16:59) |
| 이용권 | #74 | 할인 바인은 이용권 덜 받기 · 애드온 금액÷1만 장 · 모자라면 분납 | faac0e6f (18:30) |

- **최종 운영 main = `faac0e6f`**(CI success · CodeQL success · Vercel Production success — 러닝 로그 206줄). `git ls-remote` 로 원격 main 이 같은 해시임을 확인했다(작성 시점).
- 엣지 함수 배포(CLI): **notify-sanction v16**(새 로고) · **verify-identity**(logic.ts 포함) · **tda-assist**(rules.json '리바인'). 셋 다 비로그인 POST 401 확인.
- 운영 설정: **Supabase 인증 메일 템플릿 5종 교체**(Management API PATCH 200, 재조회 10/10 일치).

### 0-2. 운영 DB 에 적용한 것 (전부 리드가, 라이브 롤백 리허설 → 적용)

| 파일 | 한 줄 요약 | 적용 방법 |
|---|---|---|
| 20260930a | 1:1 문의 답변 메일 중복 발송 방지 표식 + 접수 WITH CHECK 강화 | 앞 세션에서 적용(파일 머리 ✅) |
| 20260930b | 직원 출근·퇴근 RPC(punch_my_shift·my_punch_state) | MCP execute_sql |
| 20260930c | 순위 실명 옵트인 판정 정본 + profiles.joined_at 보호 | MCP execute_sql(begin…commit) |
| 20260930d | 공동 운영자·업주 승인 요구(_venue_coowner_ok, 13개 함수+정책) | MCP execute_sql |
| 20260930e | 얼리 단계·레지 경계·계단 스택·애드온 엔트리·할인 조건 | MCP execute_sql(md5 게이트) |
| 20260930f | 서버 보안 가드(제재 계정 쓰기 차단·공개 반환 축소·무정책 GRANT 회수) | MCP execute_sql 1회 |
| 20260930g | 이용권 N장 = 바인 1회 · firstRebuy | MCP execute_sql 1회 |
| 20260930h | 클락 광고 테이블·버킷·config 상한·금칙어 트리거 | MCP execute_sql 1회 |
| 20260930i | 할인 바인 덜 받기·애드온 금액÷1만·모자라면 분납 | **Management API** database/query (⚠ 1차 cp949 깨짐 → 2분 뒤 재적용) |

상세 md5·사후 확인은 §3. 그 밖의 운영 데이터 쓰기: 시드 포스터 5장 posters 버킷 업로드 + schedules 12건 poster_url 연결 → 나중에 webp 재압축본으로 교체(옛 파일 참조 0, **삭제 보류**).

### 0-3. 아직 안 한 것 (요약 — 전체는 §7)

- **가이드·소개·PDF**(NURI/guide-redesign-0930, 1b885517+f6619ce5 push, PR 없음) — 오너 지시로 **모든 작업 끝난 뒤 마지막**에 사진 재촬영 → 병합 → owner.pdf 재생성.
- **디자인 개선안 E·F 단계**(앱 점검·전후 이미지 개선안 문서) — 이번 세션 범위 밖(오너 10-01). 규칙집 D 는 진행 중.
- B2 디자인 구현(GTO·내 매장) — **중단, 작업트리에 미커밋 변경 보존**(b2-gto-0930 15파일 · b2-store-0930 10파일+새 3파일). 오너가 번호로 고르면 재사용.
- 파일 머리 "✅ 적용 완료" 표기: **20260930b·c·d·e 는 origin/main 에서 아직 '⏳ 미적용'** 으로 적혀 있다(실제로는 적용됨). 최종 인수인계 PR 에서 고친다.
- Sentry DSN(CSP report-uri) · 광고 실제 업로드 시험 · 어문 보류분(store 파일 248건·서버 문구 112건) · used_for 잔존 · W-11 순위표 팀 합산 · TV 날짜/제목/진행시간/고급 테마 · 매장 바인왕 공개 보드 재설계 · AGENTS.md v3.4 표기 등.

### 0-4. 오너 결정 대기

| # | 질문 | 배경 |
|---|---|---|
| Q1 | 시드 포스터 **원본 파일 삭제** 여부 | webp 재압축본으로 교체 완료, 옛 파일 참조 0 |
| Q2 | SPOT 앤티 — 앞자리(히어로·상대 외) 짧은 스택 경고를 넣을지 | 두 스택 입력 후에도 k≥2 표는 전원 대칭 S 가정 |
| Q3 | 매장 바인왕/출석왕 공개 보드(venue_player_counts) 실명 원칙 설계 | 가입 회원은 닉네임, 미가입 장부 이름은 비공개 — 현재 영향 0매장 |
| Q4 | 이용권 비밀번호 감액 RPC(update_ledger_buyin_reduce)가 §E 잠금을 우회 | 업주 권한 범위 안의 틈 — 막을지 |
| Q5 | 12만·N=10 같은 'N×1만 < 참가비' 게임의 N장 약속 vs 금액 기준 | 리드 결정: min(N, floor(금액/1만)) — 포스터 약속 우선. 오너 확인 권장 |
| Q6 | 클락 '/' 구분자 대비 4.5:1 로 올리는 보드 스타일 변경 | 리드 결정 완료(올린다), 구현은 F 점검 목록 |
| Q7 | 디자인 개선안 — 오너가 **Docs 제목·번호로 고를 항목** | 승인 절차는 §2-13 |

---

## 1. 오너 지시·결정 전체 (시간순)

### 1-0. 앞 세션까지의 결정 중 이번 작업의 기준이 된 것 (09-29)

원문: `.claude/agent-memory-local/nuri-lead/project_owner_decisions_0929.md`, 결과 문서 `docs/HANDOFF-2026-09-29-results.md` §4.

| 번호 | 결정 |
|---|---|
| #3 | 장부 애드온 → 클락·TV 애드온 수·총칩 자동 증가 |
| #18 | 관전 클락: TV 전체화면이 아닐 때만 법적 고지 한 줄 |
| #15 | 차단은 서버에서도(글·댓글 조회) |
| #4·#5·#7 | 되돌리기='전송 취소', 발급류 전부 '전송', '발급 매장'→'보낸 매장', 서버 알림 문구도 |
| #6 | 대시보드 = 실제 전송 수 |
| #8·#9 | 애드온 5T 용도는 접수대 승인 때 선택 · 정산 '매장이용권' 타일에 애드온 포함 |
| 클락 #1·#2 | 얼리 기준 = 포스터/장부 등록 시점 · 서버 트리거 |
| #11 | 좋아요 빠른 두 번 = 취소 |
| #14 | 대한민국은 대부분 BB 앤티(1BB) — M존 기본 BB 앤티 |
| #16 | 완납 애드온 삭제 시 매출 감소는 정상 |
| 밤 추가 | "부스터 게임은 실제로는 애드온 게임" · W단계 실연은 로티아레나 오염 금지(더미 매장 + 롤백 리허설) |
| **W 결정(09-30 새벽)** | W-01 게임마다 'N장 = 참가 1회'(1장=1T=1만원 환산 유지) · W-03 '레지마감 N LV' = N레벨 끝 + 뒤 브레이크까지 · W-06 애드온 엔트리 게임별(기본 0) · W-07 레지마감 뒤 애드온·바인 허용 · W-04/05 얼리칩 단계 입력(최대 4단), 'N레벨 시작 전'은 앞 브레이크 포함 · W-11 팀 점수 = 클락 추가 페이지 + 순위표 팀 합산 둘 다 · W-25 T·GP·포인트 시상은 입력 단위 그대로(원화 병기 안 함, §28) · 일정 검색 칩은 가로로 펼침 |
| 09-29 | 대회 **예약은 로그인만**(본인인증 아님 — 20260929a, 화면 ed09bbf8) — 이번 D-2 초안이 이를 뒤집었다가 삭제됨(§2-1) |

### 1-1. 09-30 결정·지시 (시간순, 원문 요지)

| 대략 시각 | 지시·결정 | 처리 |
|---|---|---|
| 06:4x | (세션 복구) 끊긴 6갈래 이어서 | §2 각 트랙 |
| ~07:1x | 출근: **00:00~01:59 는 '어제 근무로 출근'** | 8b4cc8e6, 20260930b |
| ~07:1x | 순위: **이름 숨기기 옵션 없음. 실명 공개는 본인 선택만.** 기존 가입자는 기본 비공개 | PR #56 |
| ~07:1x | **병합 권한 부여** → `.claude/settings.local.json` 에 `gh pr merge`·`update-branch` 규칙 2줄 | 이후 리드가 CI 초록이면 병합 |
| ~07:3x | ① 업주 화면 실명 → **리드 결정**: 원문 있으면 원문, 없으면 켠 사람의 인증 실명 ② 지난 대회 위젯: 켠 사람 실명·나머지 닉네임 | a5ebd2e8 |
| ~07:5x | Supabase GitHub 연동 — 오너가 **자동 브랜치·운영 자동배포 둘 다 끔**(유료 빈 브랜치 2개 삭제) | 기억 `project_supabase_github_integration_off.md` |
| ~08:0x | "**승인 전인 업주 계정도 통과 — 이건 안 되게**" | 20260930d, PR #57 |
| ~08:0x | Supabase **관리 토큰(전 권한, 90일 ~12-29)** 제공 "보관해서 할 수 있는 것 진행" | `~/.config/nuri/supabase_access_token`(ACL 본인만, 값 출력 금지) |
| ~08:3x | 인증 메일 템플릿 PATCH 허용 규칙 문구 전송 → settings.local.json 37개 | 템플릿 5종 교체 |
| ~08:5x | 권한 규칙 추가 → 42개(Supabase execute_sql·apply_migration·deploy_edge_function, Vercel 전체, functions deploy CLI) | notify-sanction v16 배포 |
| ~09:0x | "**무료라도 상업적 무료 아니면 쓰지 마**" | Mixkit rain-window = Mixkit Stock Video Free License(상업 가능·출처 표기 불필요) → 유지. Restricted License 클립은 금지 |
| ~09:0x | 블라인드 '/' 구분자 대비 2.1~2.7 → **리드 위임** → 리드: TV 는 멀리서 보니 4.5:1 이상. 기존 보드 스타일이라 F 점검 목록 | 미구현 |
| ~09:3x | 시드 일정에 **포스터 이미지 누락** 지적 "포스터를 줬으니 같이 등록해야지, 확실하게 해" | 5장 업로드·12건 연결 |
| ~09:4x | 사용량 밸런스(주간 전체 63%·Fable 42%, 목 19:00 리셋) → 정형 구현 Sonnet, 동시 2명 | 곧 취소 |
| ~09:5x | "**아끼지 마, Fable 사용량이 오히려 적다**" → 절약 취소 | 정본 §3 에 추가 |
| ~10:0x | "**필요한 곳에 필요한 모델, 리드 판단.** 굳이 필요 없는 데까지 쓰라는 게 아니다" | Fable = 금액·엔트리 교차 판정·판정 충돌·원인 불명. 정본 §3 문구 갱신 |
| ~10:1x | 요금제 UX 영상 분석 학습 → 앱 감사(before/after 이미지·회귀 위험) | design-reviewer 감사 |
| ~10:2x | @UXUIDesign 채널 **전체** 분석 → 이어서 **레퍼런스 10개 채널 + 지침(Tailwind 토큰·NNgroup)** 전량 학습 | §8 |
| ~10:4x | 보안 자료(AI 생성 코드 취약점) **검증·적용 + 전체 계획** | D-1·D-2, Google Docs 계획서 |
| ~10:5x | 디자인 결과는 .md 대신 **Google Docs(이미지 포함)** → Google Drive 커넥터 이 프로젝트에서 다시 켬 | |
| ~11:0x | 정정: Docs 는 **UX 채널 분석 완료 후 '바꾸기 전/후 이미지가 든 개선 제안서'** 를 원한 것. 결정 ① 썸네일 기본 contain ② 로티 레지마감 값 조정 불필요(포스터에 있고 장부 시작 때 클락으로 감, W-14) ③ 디자인은 리드·감사자 실측 판단으로 권장 항목 바로 구현 | ③은 곧 뒤집힘 |
| ~11:0x | **판정 폭**: 내 매장 = PC(1440·1280·1920), 일반 유저 탭 = 모바일(390·360·320) | 모든 감사·구현·재실연 |
| ~11:1x | 서비스 소개·업주 가이드 **간단·한눈에 + 실제 앱 캡처 + 폰트 수정** | guide-0930 |
| ~11:1x | 앱 전체 **어문·어법·깨진 글자·번역투** 조사+수정 | 감사 965건 → PR #68 |
| ~11:2x | **GTO 계산 정확도** 점검 | gto-team 감사 |
| ~11:2x | 영상 학습 결과 + 누리홀덤 전체 결함·오류·오너 교정·보안을 **다른 프로젝트 재사용용 Google Docs** 로 아주 상세히 | K1 학습지식서 |
| ~11:3x | 전체 계획·모델 보여 달라 | 계획 v2 Google Docs |
| ~11:4x | 오너 결정 F3: **정지 계정도 기존 이용권 사용 허용** | 20260930f 에 양성 대조 |
| ~11:5x | "**디자인은 오너가 바꾸라는 항목만 구현**" (③ 뒤집음) | B2 에이전트 중단·작업트리 보존 |
| ~11:5x | 승인 절차: Docs 제목/번호 지정 → **After 이미지 그대로 구현(픽셀 대조)** → 모션 일관성·버튼·연결 전수 점검, 오류 0 까지 | 기억 `feedback_design_owner_picks.md` |
| ~12:0x | 손님용 소개·업주 가이드·PDF 는 **맡긴 모든 작업 + 디자인 승인분 구현이 끝난 뒤 마지막** | guide 병합 보류 |
| ~12:0x | "**spotEvaluate.ts 수정 허가**" + "**20bb 표를 정확하게**" | f6d9598e |
| ~12:1x | **오후 결정 6건**: ① 앱 말투 합니다체 ② §28 '순손익' 그대로, 금액은 '100만' 형식(병기 금지) ③ 위치정보관리책임자 = 김윤혜 ④ 법무 문서 모순 = 국가 발행 표준 문서 우선 ⑤ SPOT 두 사람 스택 따로 입력 ⑥ Sentry DSN 찾아서 CSP report-uri 진행 | 어문·SPOT·CSP |
| ~12:3x | 디자인 학습과 무관한 것은 병렬 OK | KW-1b·KW-4·SPOT·법무 병렬 착수 |
| ~13:2x | 세로 TV 에서 시상·추가 페이지·광고 **미표시 유지**(기존 설계) | KW-4 |
| ~15:xx | **오후 결정 8건**: ① 참가비≠N×1만 → 경고만(저장 허용) ② N 미설정 게임 → 1장=참가 1회 유지 ③ 할인 붙은 바인을 이용권으로 → 할인만큼 덜 받음 ④ 애드온을 이용권으로 → 애드온 금액÷1만 장 ⑤ Rebuy 표기 = **리바인** ⑥ 세로 TV 유지 ⑦ 불법 사행성 고지의 '국민체육진흥법…마인드 스포츠' 문장 **다시 넣기**(리드가 뺐던 것 되돌림) ⑧ 번들 totalJsGzipKb 1014→**1080** | 0930i·#71·#72 |
| ~16:0x | 디자인 수정안은 **Tailwind v4** 로(저장소 tailwindcss ^4.3.3) | tailwind4.md, #71 |
| ~16:3x | "**포스터는 webp 로 압축해서 하자, 원본 말고 너무 용량이 커**" | 시드 재압축·PR #73 |
| ~16:5x | 이용권 모자라면 **거절 대신 분납**(이용권 k장 + 나머지 현금/카드/계좌/미수), 바인·애드온 모두 | 0930i 재설계 |
| 10-01 00:30 | 영상 **수집 여기까지** → 워커 종료(4,816/5,741) | §8 |
| 10-01 00:3x | 미수집 925편 목록은 문서에 안 적어도 됨. **수집한 4,816편만 제대로 분석해서 제안** | |
| 10-01 00:4x | **규칙집(D)까지 만들고 인수인계 준비(규칙집 아주 상세히). E·F(앱 점검·개선안 문서)는 이번 세션 범위 밖** | 이 문서 |
| (상시) | 배포까지 끝나면 **작업 전 내역·오류·에이전트(모델 실측 포함)를 아주 상세하게** 인수인계서에 | 기억 `feedback_detailed_handoff_after_deploy.md` |

리드 자체 판단(오너 위임 범위): 드릴 3벳 모드 잔여 빈도는 채점하지 않음 · SPOT 앤티 1bb 허용 유지 + 라벨에 '앤티 뺀 스택' 명시 · §28 TV 사진의 PRIZE POOL/순위 배분은 가격 정보라 허용 · 이용권 ④는 N 설정 게임만 · N=1 명시도 미설정 취급 · 할인 후 만원 미만 나머지는 분납 경로 · N7 = min(N, floor(금액/1만)) · 이용약관 정정은 판 번호 유지하고 개정 이력 날짜 항목 추가.

---

## 2. 작업 트랙별 상세

표기: **요청 모델**은 위임 프롬프트에 적은 값, **관찰 모델**은 서브에이전트 로그 `message.model` 필드. 둘이 다르면 표시했다(이번 세션은 전부 일치).

### 2-1. 보안 D-1(감사) · D-2(서버 가드·CSP·verify-identity)

**왜**: 오너가 "AI 생성 웹앱 보안 결함 자료"(OWASP·NIST SSDF·논문) 검증·적용 + 전체 계획을 요청.
- 계획서(Google Docs): https://docs.google.com/document/d/1AQmmEmGRSFjswoaIXuSQOsBGsWUnogUYDRbu9KnxaJs
- 출처 교정(리드): 스탠퍼드 논문 저자는 Perry et al.(Sandoval 은 다른 논문, 반대 결론), OWASP LLM 번호는 2023판.

**D-1 감사** — critical-reviewer(Opus 5.5/high, 읽기 전용, 07:38~) + 화면-유일-가드 감사 포크(Opus). 보고 원문 scratchpad `security-d1/report.md`.
| 구분 | 결과 |
|---|---|
| P0 | 0 |
| P1-F1 | (오판) 예약 본인인증이 화면에만 있다 → **틀림**: 09-29 오너 결정으로 예약은 로그인만. critical 의 낡은 기억이 원인(정정 기록됨) |
| P1-F2 | `require_active_author` 트리거의 `current_user in ('authenticated','anon')` 조건이 **SECURITY DEFINER 안에서 꺼져** 정지 유저가 `share_spot_post` 로 글 작성(롤백 리허설 1행) |
| P1-F3 | CSP 를 강제로 바꾸면 PortOne 본인인증이 깨질 위험(`*.iamport.co`·`service.iamport.kr` 목록에 없음) |
| P2 | `get_domestic_rankings.total_won`(화면 미표시·§28) · `venue_player_counts`(rankMetrics 켜면 장부 player_name 원문, 현재 0매장) · `poll_results`(게시글 RLS 무시, 현재 투표 0) 등 |
| 문제없음 | 번들 비밀 0(청크 124) · 패키지 48 실재 · `npm audit --omit=dev` 0 · 엣지 11개 전부 anon 401/410 · RLS 119/119 켜짐 · 무정책 16 테이블 클라이언트 접근 0 · 방문 화면 CSP 위반 0 · unsafe-eval 실사용 0 · anon 실행 DEFINER 50개(변이는 조회수 2개뿐) |

**D-2 서버(20260930f)** — store-team(Opus/high, 리드 지정 단독 편집) 브랜치 `NURI/sec-d2-0930`.
- d2465127 초안 → critical(Opus) 재검토 **F1 FAIL**(예약 본인인증 분기가 09-29 오너 결정 뒤집음) + P2-2(공개 바인왕 보드에서 비회원 이름 제외)는 **기능 축소**라 분리 → dcbea41b 2차(파일 LF md5 `b62c6cb6…`, 45,572B).
- 2차 재리허설: 전사 md5 일치 · 미인증 예약 성공(행 1) · 정지 예약 거절 · 직접 INSERT 42501 · venue_player_counts md5/ACL 불변 · **정지 계정 QR 이용권 사용 성공(오너 F3 양성 대조)**.
- 내용: F2 트리거 조건 `or auth.uid() is not null`(정의자 함수 안에서도 정지 계정 차단) · `get_domestic_rankings` DROP 후 total_won 없는 반환형으로 재생성 · `_poll_visible` 로 poll_results 가림(posts_select 정책 복제 — §0-b 가 정책 md5 고정) · 무정책 GRANT 회수 · anon 의 schedule_reservations SELECT 회수(화면 영향 0).
- ✅ **라이브 적용**(리드, execute_sql 1회, ~11:4x): §0·§0-b 게이트·§14 자가검사 통과, `reserve_schedule` md5 `a4a8e96c…`, 어드바이저 보안 ERROR 0(WARN 3 기존).
- PR #64(6e3b7602 적용 표기 + rankverify total_won 제거) → 12:22 병합.
- 경미 관찰: `is_account_active` 는 정지 만료 뒤에도 cron_unsuspend_expired(15분) 전까지 false → 새 가드가 최대 15분 fail-closed.

**D-2 CSP·verify-identity** — home-team(Opus/high) 브랜치 `NURI/sec-csp-0930` d7154368 → PR #63.
- CSP **Report-Only 1단계**: unsafe-eval 제거 · 인라인 스크립트 해시 + 계약 테스트(LF 정규화 — 로컬 dist 는 CRLF) · PortOne 출처 추가(구 정책 prepare connect-src 위반 2건 → 새 정책 0).
- 검증 하네스: 운영 nuriholdem.com 에 route 로 헤더를 바꿔 끼워 구/새 비교. `serviceWorkers:'block'` 필수(안 막으면 SW 가 앱 셸을 내줘 거짓 실패). 가짜 channelKey 라 prepare 뒤(iframe·다날 form)는 **NOT_RUN**.
- verify-identity: 판정부를 `logic.ts`(deps 주입)로 분리 + `src/api/*.test.ts` · 응답에서 code/probe/secretOk/detail 제거 · `consume_ai_quota(uid,'identity',10)` 일일 상한(롤백 리허설 10회 ok·11회째 false).
- critical(Opus) PR #63 **5/5 PASS**. CodeQL `js/bad-tag-filter`(테스트 정규식) 두 번 → e3af103a · 3c8ae16b.
- 12:22 병합 → **verify-identity CLI 배포(logic.ts 포함) → 비로그인 POST 401**.
- **Sentry report-uri = BLOCKED**: 운영 Vercel env 에 `VITE_SENTRY_DSN` 없음(이름 목록 확인), 이 세션에 Sentry MCP 도구가 로드되지 않음(재시작 필요). 오너 결정 ⑥으로 진행 예정 → §7.

### 2-2. 직원 출근·퇴근 (00:00~01:59 어제 근무)

| 단계 | 담당·모델 | 결과 |
|---|---|---|
| 구현 | store-team Opus 5.5/high (06:46~07:10, 앞 세션 이어받음) | 4286d2f6, PR #55. StaffPunchBar 직원 화면 맨 위, 확인 단계·연타 잠금·되돌리기. 서버 `punch_my_shift` = 서버 시각(KST)·**빈 칸일 때만** 기록(`where check_in is null`) |
| 독립 검증 | verifier Sonnet 5.5/high | PASS — 삭제 줄 무손실, vitest 364파일/4005, tsc 0, 음성 대조 3변조 전부 빨강. NOT_RUN: e2e·번들 수치·실 DB |
| 보완 | store-team **Sonnet 5.5**/high (오너 규칙 확정 범위) | 8b4cc8e6 — KST<02:00 이면 어제 빈 행 우선, 어제 열린 행이면 applied=false(재탭이 오늘 행 안 찍게). punchView 5번째 인자 kstMin. 음성 대조 2건 |
| 리드 리허설 2 | 리드 | 01:30 어제행 t → 재탭 f(오늘행 0) · 어제 끝남→오늘행 · 02:00→오늘행 · now 재탭 f · null/anon 42501 · 시각 고정 사본 2개 · 롤백 후 흔적 0 |
| DB | 리드 | 20260930b(이름: 20260930a 가 이메일 작업 이름이라 b 로 변경) · 자가검사 통과 · DEFINER·anon f·auth t · src md5 `354189f7…`/`e4258817…` · 보안 어드바이저 ERROR 0 |
| 병합·배포 | 리드 | a8623564(07:50) → Vercel `dpl_HM1mgpph` READY, nuriholdem.com 엔트리 `CkbAnak0→JU9IbGDI` |

- 번들: StaffPayroll·StaffSchedule 을 지연 청크로 분리 → VenueManageTab 113.7/119KB gz(이 여유로 #52 가 통과).
- ⚠ 러닝 로그는 적용·병합을 "08:1x" 로 적었지만 gh mergedAt 은 07:50 이다. 적용이 병합 직전이었음은 두 기록 모두 같다.
- 알려진 경계(verifier 관찰, 저위험): 야간 자정 뒤 늦은 출근(어제 행 check_in 없음)은 버튼 불가 · 클라이언트는 기기 KST 로 판정 · 어제 행 미퇴근이 남을 수 있음.
- 확인 필요: 20260930b 파일 머리가 origin/main 에서 여전히 "⏳ 미적용"(§7). `e2e/_fixtures.ts` READ_ONLY_RPCS 에 `my_punch_state` 는 **있음**(41행 확인).

### 2-3. 순위 실명 옵트인 (20260930c · PR #56)

**왜**: 오너 "기존 가입자는 기본 실명 비공개. 실명 공개를 본인이 선택하게 — 그 선택만 제대로 할 수 있게". 실측 결함: 공개 RPC 5개가 옵트인한 사람에게 `venue_rankings.real_name`(업주 입력 칸)을 풀어 줬는데 **라이브 8행 전부 NULL → 켜도 0곳에 표시**. 전국 랭킹은 실명 자리가 없음. 미인증도 선택 가능.

| 차수 | 커밋 | 검토(critical, Opus 5.5/high — Fable 금지 쟁점) | 판정 |
|---|---|---|---|
| 1 | 38707ed0 | 비동의 실명 누출 0(공개 RPC 6 × 호출자 9종) · **결함**: 닉네임 재사용 시 B 가 A 의 옛 닉을 가져가 옵트인하면 A 의 입상에 B 실명(라이브 노출 0) · 경미: 미인증 pref 서버 미차단·식 인덱스 없음·다른 기기 끄기 전파 늦음 | 조건부 |
| 2 | a5ebd2e8 | 업주 화면(원문 우선, 없으면 켠 사람 인증 실명)·지난 대회 위젯 추가, nickname_owner_at(created_at 기준) → **FAIL**: save_venue_rankings 가 delete+insert 라 재저장 때 created_at=now() → 누출 재발(0→1 재현) | FAIL |
| 3 | 5a5b544e | 판정 날짜 = ranking_date(KST), 당일 변경 NULL, 본인 이력으로 그날 닉 확인 → R1·R2 PASS, **F1 FAIL**: `profiles.joined_at` 을 본인이 RLS 로 바꿀 수 있어 가입 전 기록에 실명 | FAIL |
| 4 | 75be5a46 | 가입 시각 = `auth.users.created_at` + `guard_profile_privileged_cols` 에 joined_at 보호(md5 게이트 `c7e07691…`) | **PASS**(가드 양성 6/6) |

- ✅ **라이브 적용**(리드, execute_sql begin…commit, ~09:0x): 새 함수 2 · 반환형 real_name/optin_real_name · anon 내부 f · 가드 joined_at · 인덱스 1 · 현재 옵트인 표시 0행. 적용 SQL 사본: 바탕화면 `누리홀덤_운영DB_적용SQL\1_20260930c_순위실명.sql`.
- 병합 566238b8(09:04).
- 남는 한계: 가입 뒤 같은 이름 **워크인** 행(행에 user_id 가 없어 못 막음) · 아무도 안 가졌던 틈 행은 현재 주인에게 떨어짐(옵트인 본인 이름만).
- 범위 밖 발견 → §2-4 로 이어짐: `can_manage_pos` 의 venue_owners 분기가 profiles.approved 를 안 봄.

### 2-4. 공동 운영자·업주 승인 게이트 (20260930d · PR #57)

**왜**: 오너 "승인 전인 업주 계정도 통과 — 이건 안 되게". 라이브 SELECT: venue_owner 2명 모두 approved=true → **현재 노출 0**. 구멍: 승인 철회(approveOwner(id,false) · 가입 거절 뒤 제재 해제)는 profiles.approved 만 바꾸고 venue_owners 'approved' 행은 남김 → 전권 유지(재현).

| 차수 | 커밋 | 내용 / 검토 |
|---|---|---|
| 1 | 47456691 | `_venue_coowner_ok(venue,user)` 로 9개 함수 통일 + transfer_venue_primary 재승인 우회 차단. 리허설 음성 3·양성 5, 권한 잃는 라이브 행 0 |
| 2 | 65c8b094 | 리드 결정: kill_venue 승인 가드 · 알림 수신자(`_venue_notify_recipients`)·바인 알림 정본화 · `_venue_owner_ok(uuid,uuid)` 오버로드. PR #57 생성 |
| 검토 | critical(Opus, 새 인스턴스) | 조건부 — 554칸 전수 대조(정상 운영자 차이 0, 관리자 소유 그룹 수신자 2칸만). **누락 N1** respond_staff_invite 부여 절(철회 업주의 옛 초대로 권한 부여 재현) · **N2** 주간 매출 리포트 수신 · **N3** is_verified_owner·venue_notices·posters_upload·comments_delete. 퇴사 직원 바인 알림은 건수만(손님 이름 아님 — 구현자 보고 정정) |
| 3 | bb657d02 | N1·N2·N3 반영, 공개 래퍼 `is_venue_or_group_owner`(정책은 호출자 권한이라 `_` 내부 함수를 못 부름). venue_notices·comments 는 그룹 개설자 분기 유지 |
| 재검증 | critical | **FAIL 1** — posters_upload 를 좁혀 **매장이 아직 없는 업주의 첫 매장 생성 업로드가 42501**(VenueManageTab 이 createMyVenue 전에 uploadPoster) |
| 4 | 014ca98b | posters_upload 변경 제외 → 업로드 표 원복 → **PASS** |

- ✅ **라이브 적용**(리드, ~09:1x): 자가검사 SC 전부 통과 · 6개 매장 업주 `_venue_owner_ok` 전부 true · 잃는 매장 0·공동운영자 0 · 로티 업주 JWT 양성(pos·ledger true, 남의 매장 false, 전환기 1).
- 병합 42b80f3e(09:15).
- 남긴 잔여(정책, owner_id 직접 비교): venues_update 등 — 의도적으로 이번 범위 밖(리드).

### 2-5. KW 단계 (포스터→장부→클락 실연 결함 수정)

원천 결함표: `.claude/handoff/specs-0930/W-defects.md`(24건: P0 2 · P1 11 · P2 13, store-team 09-29 밤). 오너 결정은 §1-0 W 결정.

#### KW-1a 계산·데이터 (PR #60 · 20260930e)
- store-team Opus 5.5/high(09:44~10:29) 830e0351: W-03 레지마감 뜻(N레벨 끝+뒤 브레이크) · W-04/05 얼리 단계(최대 4단, 앞 브레이크 포함) · W-27 반열림 경계 · W-06 애드온 엔트리 · W-10 계단 리엔트리 스택(rebuyStacks) · W-12 범위 시상 · W-13 비화폐 시상 · W-25 단위 · W-19 기준 엔트리 · W-28 할인 적용 조건 · W-14 남은 클락.
- 증거: 12건 전 FAIL→후 PASS · vitest 4107 · 음성 대조 9 · e2e 110 · **PGlite(실제 PG 18.3 WASM)로 SQL 식 동치 15/15**(Supabase MCP 가 작업 중 끊겨 대체).
- **Fable 5.1 교차 판정 1회**(verifier, 리드 판단: 금액·엔트리 계산 결론을 구현 모델과 다른 모델로) — 포스터 원본에서 기대값 먼저 계산 후 대조 → **PASS**(레지마감 432/512/392/535/520분 · W-06 5.2 엔트리 · W-10 270,000 · 시상 합=GTD · 기준 엔트리 · 25:00 경계). 관찰: '첫 리바인 50%'(퀸)는 kind='rebuy' 가 모든 리바인에 허용 → firstRebuy 종류 필요(KW-1b 로).
- ✅ 20260930e **라이브 적용**(리드, begin…commit, md5 게이트 — 적용 전 `_clock_ledger_part` functiondef md5 `98ea7f30…`): 칸 2(early_tiers·addon_entry) · 트리거 2 · `_clock_ledger_part` md5 `704cc097…` · anon f. 리허설 R2 earlies3·dbl1·earlyChips20000·units4·rebuyOrd[1] / R3 첫 바인 rebuy 할인 제거 / R5 ACL f.
- 병합 14922e61(10:52), DB 선적용. ⚠ 오너 고지: 기존 클락 regCloseLevel 뜻이 한 레벨 뒤로 바뀜.

#### KW-3 표시 (PR #59) · 썸네일 (PR #61) · 리엔트리 스택 (PR #62)
- home-team Opus/high c60bcf37: 리엔트리 칸 = 리엔트리 스택(오너) · 브레이크 원문 라벨 · 폼 스택 표시 · 시드권(seats) · '예시' 문구 제거 · 프리즈아웃/무제한 단정 제거 · 카드 GTD 제목 잘림. 10:37 병합.
- 썸네일: Supabase `/render/image/` 에 width 만 + resize=cover 면 원본 높이 유지·가로 중앙 띠 크롭 → 포스터 13.6~20.7%만 보임. c1be6037(포스터만 contain) → 오너 결정 → 873674c1 **기본값 contain**(소비처 7곳 레터박스 0, 계약 9건). 첫 기본값 변경 시도는 분류기가 '공유 자원 수정'으로 거절 → 오너 결정 후 진행. 12:22 병합.
- 리엔트리 계단 스택: home-team **Sonnet 5.5**/high(필드명·동작 확정된 한 곳 연결) 109ec6e1·6d0f6664 → CI e2e(4) 실패: 320px 에서 `70,000 → 100,000` 요약 칸 넘침(로컬 윈도우 여유 0.95px, 리눅스 CI −5px) → home-team Opus 8d781d5f `chipShort` 무손실 K/M 축약 + 백만 케이스 + 여유 하한 12px → 12:50 병합. 후속 후보: '시작' 칸 320 여유 9.42px.

#### KW-2 포스터 폼 (PR #66)
- store-team Opus/high c9ea8761: W-02 수정 저장 병합(저장본 펴기 + 폼 소유 키만, 무변경은 키 생략 — 정본 `src/lib/posterPayload.ts`) · W-16 세부 규칙 칸 · W-18 첫 바인 프리셋(7만 '할인'→'첫 바인 7만') · 이용권 N장 칸 · 이미지 업로드 보증. `prevent_self_approve_poster` 가 buy_in 전체를 비교하므로 참가비 외 칸 변경도 재심사.
- e2e 함정: `getByPlaceholder('값')` 부분일치 → `exact: true`. 13:16 병합(34f84100 로 main 병합 후).

#### KW-1b 이용권 N장 = 바인 1회 · firstRebuy (20260930g · PR #69)
- store-team Opus b374434b: N 은 서버가 `ledger_sessions.schedule_id → schedules.buy_in.voucherPerEntry` 로 읽음(포스터 없는 게임 = 1). 묶음 = 바인 1행. firstRebuy = entry 2 만.
- critical(Opus): 적용 가능 + 보강 — **N 조회에 매장 결속 없음**(`sc.venue_id = r.venue_id`, 키키 세션에 퀸 포스터 연결 시 퀸 N 사용 재현, 라이브 연결 0건이라 휴면) · N 정규식 1000→1 · 폼 max 100 · 참가비 불일치 경고.
- **Fable 5.1 W-01 교차**: (a) N=10 10장 → 1바인·엔트리1·10T PASS (b) firstRebuy PASS (c) N≠참가비/1만이면 구현 10T vs 오너 문구 5T 불일치 · N 미설정 폴백 1장=참가 1회(W-01 원증상 잔존) · 할인 얹힌 묶음 T 미정 → 오너 질문 → 오후 결정 8건 ①~④.
- 157769c6 보강 반영 → ✅ **라이브 적용**(리드, ~13:1x, execute_sql 1회, 적용 전 md5 ② 일치 · §5 자가검사): approve `458be576…` · restore `2cbd9085…` · guard `73eafcc4…` 기대값 일치. 파일 md5(LF) `e9c809a3` @157769c6. 445f3a8c 표기.
- 13:50 병합. NEEDS_USER 였던 두 질문(N장 게임 애드온 장수 · N≠참가비 T)은 오후 결정 ①④로 닫힘.

#### KW-4 클락 K단계 (20260930h · PR #70)
- 계획: `PLAN-AB-exec.md §5-1`. store-team Opus(UI 포함이라 high) 5aa08f93: 왼쪽 칸 슬라이드(시상 30s → 추가 A → 추가 B → 광고 10s, 서버 시각 동기, 한 벌) · 시상 문구/메모(`text`·`note`) · 추가 페이지 2 · 팀 점수 페이지(teamStandings, W-11 클락 쪽) · 관리자 광고 관리(clock_ads, 840×1120·500KB·webp/jpg/png 버킷 강제).
- 병렬 검토: critical(Opus) — 적용 가능(권한 결함 0, md5 `e4553f36`), P3: null/문자 행 모양 검사 틈(TV visibleExtraPages 크래시, 자기 매장 한정)·시상 개수 상한 없음·§28 `contains_blocked_ugc` 적용 제안 / design-reviewer(Opus) — 시상만 매장은 픽셀·타이밍 동일 PASS · reduced-motion·모달·광고 관리 PASS, **FAIL 3**: 광고 2개 퇴장 첫 프레임에 다음 광고(ClockStage:341 cycle 먼저 증가) · 긴 추가 페이지가 Prize Pool 총액까지 15~40% 잘림 · 제목 30자 vs TV 7~8자 + 44px 3곳·모달 고정 푸터·금액+문구 합계 누락·black-marble 메모 4.41.
- b47cacf3: 9항목 반영(광고 cycle 유지·상한 줄8/이름14/내용16/메모20/제목12/시상문구12 — TV 칸 폭에서 역산·문구 입력 시 금액 잠금·44px·고정 푸터·메모 대비 5.22·서버 모양 검사·시상 200줄·contains_blocked_ugc). 0930h md5 `4c46b2d6`.
- critical 재검토 PASS · design 재측정 3건 FAIL→PASS, NOTE 2건(광고 상자 stretch 투명 띠·8줄 초과 옛 데이터 넘침) → 리드 e100c632(items-start·줄 8 자름).
- ✅ 20260930h **라이브 적용**(리드, ~13:5x, execute_sql 1회, 파일 md5 4c46b2d6 본문 그대로): 버킷 1 · 트리거 2 · 정책 4 · 기존 clock_states 전 행 재저장 통과 · `_clock_config_limits` authenticated 실행 불가 · 보안 어드바이저 ERROR 0.
- 🔴 **주의(HANDOFF 필수 기록)**: `contains_blocked_ugc` 의 **새 소비자 = 클락 config 트리거**. 나중에 authenticated 에서 이 함수 EXECUTE 를 회수하면 **업주 클락 저장이 전부 42501** 로 막힌다.
- 14:12 병합. 광고 **실제 업로드 3종 시험 = NOT_RUN**(관리자 로그인 필요).
- 범위 밖으로 남김: W-11 순위표 팀 합산(DB) · TV 날짜·제목 크게·진행시간·고급 테마(home-team) · presetFromClockConfig extraPages · `_mockOwner` clock_ads 라우트 · PRIZE_ROWS_MAX 편집기 미사용.

### 2-6. 이용권 할인·애드온·분납 (20260930i · PR #74)

**왜**: 오후 결정 ③ 할인만큼 덜 받음 ④ 애드온 금액÷1만 장 + 추가 "모자라면 거절 대신 분납".

| 차수 | 커밋 | 내용 |
|---|---|---|
| 초안 | (리드 결정) ④는 N 설정 게임만 | need=ceil(N×(참가비−할인)/참가비) |
| 재설계 | 96c2054b (md5 5400093d) | 모자라면 `VOUCHER_SHORT` 힌트 → 접수대에서 현금/카드/계좌/미수 선택 재호출, 서버가 남은 금액 확정. 바인=기존 분납 칸 + `_ledger_buyin_apply_amount_rule`, 애드온=새 칸 `addon_ticket_count`(가드·규칙·복원 트리거 3개) |
| 교차 | critical(Opus) + **Fable 5.1**(금액 교차, 병렬) | critical: 서버 금액·엔트리·복원·권한 PASS, 틈 — 애드온 ticket 전환(몫 남음)·승인 행 ticket_count 변경·ceil 과다 차감·N×1만>참가비 막다른 길. Fable: (a)~(d) 기대값 일치, 불일치 1 — 분납 애드온을 '티켓 미수'로 바꾸면 `addonFinance`(ledger.ts:341)가 이용권 몫을 0 으로 → 미수 부풀림. 경계: 7.5만 → 서버 ceil 8장 vs 정산 7.5T |
| 수정 | 7152e4d2 | 리드 결정: 이용권은 만원 단위 floor + 나머지 분납, 금액 기준 우선, 필요 장수만 묶기, 분납 애드온 티켓 전환 차단, 접수대 행 ticket_count 잠금(client_guard §E) |
| 수정 | 3e27808a (md5 aa65ae3c) | N=1 명시도 미설정 취급(v_n_set = N ≥ 2) |
| 수정 | 2f9439c4 | critical N7(12만·N=10 → 12장 요구) → 리드 결정 **min(N, floor(금액/1만))** — 포스터 약속 우선 |

- critical 최종: 적용 가능(N1~N8·P1·P2·회귀·client_guard 양성·정산 합계 PASS). 남은 틈 기록: 비밀번호 감액 RPC `update_ledger_buyin_reduce`(definer)가 §E 를 우회(업주 권한 범위).
- ✅ **라이브 적용**(리드, ~18:1x, **Management API database/query**, 파일 md5 `c192161a` 본문 그대로): 적용 전 게이트 5개 일치 → **1차 적용이 cp949 인코딩으로 함수 안 한글이 모지바케**(§5-E1) → 약 2분 뒤 UTF-8 재적용 → 사후 prosrc md5 5개 기대값 일치: approve `de5cd99d` · guard `fad4fc8e` · rule `35e7504a` · restore `f1d77776` · client_guard `eee44d4d` + 한글 표본 확인. 어드바이저 결과는 러닝 로그에 기록 없음(다음 세션 1회 확인).
- c39ddf1a 표기 → PR #74 18:30 병합 → main faac0e6f CI·Production success.
- 후속(범위 밖): 바인 취소로 active 복원된 이용권의 **used_for 잔존**(라이브 PRE 도 동일) · 클라 `buyinFinance` 의 '티켓+미수+현금0 = 티켓 미수' 휴리스틱은 requestId 있는 행 제외로 처리.

### 2-7. GTO 감사 · SPOT 두 스택 · 딜러 ICM

**감사** — gto-team Opus 5.5/high(읽기 전용, origin/main 14922e61): 독립 평가기(랭크 개수+무늬 마스크, 7장 1.3억 족보 공인값 일치)로 에퀴티 열거·ICM Malmuth-Harville·HU Nash 공개 차트·레인지 합·SPOT 손풀이·BB 앤티 대조.
- 계산식 **PASS 259**. 결함 2: OutsFromCards.tsx:164 outs=0 을 '드로잉 데드'(실제 승률 5.86%) · PushFoldChart.tsx:106 '블라인드 낸 뒤' 라벨(모델 S 는 블라인드 전). 해석 2: spotEvaluate Nash 가 effectiveBb 를 앤티 후로 읽음 vs 원장은 앤티 전 · preflopQuiz 가 3벳 표 잔여를 폴드로 채점(수비 표와 반대). HRC 노앤티 HU 불일치 8칸 모두 |Δ|≤0.011bb.
- 수정 ff826e7f(gto-team Opus): 드로잉 데드 문구 · 푸시폴드 라벨 · 드릴 3벳 제3안 '3벳 안 함'(콜 갈래 없는 표 26개) · ICM 소수 → critical(Opus) PASS(옛/새 6,253문제 grade/verdict 불변 전수). 비차단: ICM 색 경계 반올림(49.9 vs 49.949) · 아웃 화면 0%/0.3% 불일치 · quizCards.tsx:112 주석.
- **SPOT 앤티 유효 스택 — Fable 5.1 교차 판정**(리드, 해석이 갈린 계산 결론) → 감사자와 같은 결론(S28 → 9bb 표). `spotEvaluate.ts` 편집이 auto-mode 분류기 [Modify Shared Resources] 에 거부 → **오너 허가**("spotEvaluate.ts 수정 허가" + "20bb 표를 정확하게") → 리드 구현 f6d9598e(S=effectiveBb−ante, S 표 없으면 입력 스택 표 정확 일치; 기존 단언 spotEvaluate.test.ts:658-662 입력 20→21 로 의도 유지).
- critical: 앤티 0 은 25,380 평가 바이트 동일 PASS · **앤티 1 은 'BB 가 짧거나 같을 때만' 정확**(셔버가 짧으면 한 칸 아래 표 — Fable 검산 스크립트 자신이 S=min(…) 라 적음). 리드: 오너 1bb 허용 지시로 판정 유지 + 라벨에 '앤티 뺀 스택' 명시(2a44c44b). 정확히 하려면 사람별 스택 입력 → 오너 결정 ⑤.
- PR #65 12:22 병합.

**SPOT 두 스택(PR #67)** — gto-team Opus 58e85516: `heroStackBb/villainStackBb` 짝으로만(hasStackPair), fromJSON 이 effectiveBb=min 재정렬, S = min(내 − 내가 BB면 A, 상대 − 상대가 BB면 A). 옛 스팟은 판정 불변. toJSON 새 키는 spotPrivacy 분류에 PUBLIC 추가(서버 share_spot_post 는 deny-list 라 변경 불필요). 보호 해제 파일 e2e `nuri-spot.spec.ts:208` 셀렉터를 두 칸으로(5d8a096b).
- critical(Opus) **PASS**: 짝 스팟 269,606건 독립 S 오라클 불일치 0 · 옛 스팟 1,069,200 평가 부모와 동일 · 뮤턴트 4종 FAIL 확인 · 라이브 share_spot_post md5 `de1b0f04…` deny-list 확인.
- CI 초록 → 12:51 자동 병합(9fcbe0f0, Production success). 후속: 앞자리 상대 경고 · spot-review 엣지 함수 logic.ts:53 이 두 스택을 AI 에 전달하지 않음.

**딜러 ICM(PR #53)** — 앞 세션 gto-team dc380cde(variant="chop", 기본 variant 정적 마크업 바이트 동일 증명). #51 병합 뒤 DealerCommunity.tsx:159 충돌 → 리드 해소 `<Fold open={showIcm}><ICMCalculator variant="chop" /></Fold>`(CRLF 보존) 5f971fb1 · CodeQL high 1건(테스트 파일 태그 한 번만 제거) → 반복 제거 헬퍼 65e6588c → 08:47 병합.

### 2-8. 어문·법무 (PR #68 · #72)

- 1단계 감사(읽기 전용): general-purpose **Opus 5.5**/high 1개(총괄) + 조각 감사 7개(Opus) → src·public·서버 문구·메일·auth 템플릿 **965건**(scratchpad `copy-audit/findings.csv`), 용어·말투 기준 제안.
- 오너 결정 6건(§1-1 12:1x) → 2단계: home-team Opus/high(단일 편집자, store·clock·spot 병렬 파일 제외) 브랜치 `NURI/copy-fix-0930` 6커밋(eafc547f..d5dd4641): **처리 510 / 반려 11 / 보류 444**, 법무 3건(위치정보관리책임자 김윤혜 · 탈퇴 방법 정정 · 국민체육진흥법 인용 삭제 — ⑦로 뒤에 복원). 31529cb6 개정 이력(판 번호 유지, 날짜 항목) + 조문 4개 원문 대조(표준약관 명칭 정정).
- verifier Sonnet 5.5/high: 로직 변경 0(표시 2건: 이용권 T 단위 제거·data-note-state) · 법적 고지·§28 순증 0 · 보류 파일 미접촉 · **FAIL 1**: `nuri-spot-ai.spec.ts:166-167` 문구 → 리드 363f83f3.
- CI e2e 3건 실패(문구 결합: 게시물→게시글 탭, 업주→사장님) → aa2873fd: 탭 `data-testid`(exposure-sub-*) · 이용권 고지 '이 매장의 업주·공동운영자 중 관리자 승인을 받은 계정만'(서버 can_manage_pos 와 일치) · 사장님→업주 3곳 → 13:50 병합.
- #72(home-team **Sonnet 5.5**/high 6c78e398): ⑦ 체육진흥법 문장 복원 + 이력 정정 · ⑤ 리바인 7곳 · rules.json 재생성 → 16:56 병합 → **tda-assist 재배포**(비로그인 POST 확인). 클락 한글 라벨 '리바이'는 store 작업 뒤, 보드 영문 'Rebuy' 유지.
- 잔여: 해요체 StoreDashboard·NuriPosLedger(보류 파일) · manual.html 44 · tdaRules 24 · store 파일 어문 **248건** · 서버 문구 **112건**(마이그레이션 필요) — §7.

### 2-9. 서비스 소개·업주 가이드 (보관 중 — 마지막 단계)

- home-team Opus/high 1b885517(`NURI/guide-redesign-0930`, push 완료, **PR 없음**) + f6619ce5(업주 가이드 버튼 라벨 '슬라이드'→'가이드'). 소개 = 모바일 기준, 가이드 = PC 기준. 실제 앱 캡처(`CAPTURE_GUIDE=1 … e2e/capture-guide-shots.spec.ts` → public/guide/img/*.webp).
- 원인 발견: 정적 HTML 은 폰트 family 를 `'Pretendard Variable'` 로 적어야 붙는다(그동안 전부 맑은 고딕). 계약 `src/staticGuidePages.contract.test.ts`. `public/legal/*.html`(gen-legal.mjs)도 같은 결함(범위 밖).
- design-reviewer(Opus) 독립 검토 → **마지막 단계에서 처리할 목록**:
  1. 글꼴이 붙으면서 첫 방문 CLS 0→0.21~0.27(about 390·manual 모바일). `document.fonts.ready` 대기는 반증됨. 후보: 첫 화면 서브셋 preload / 폴백 size-adjust — 실측 필요
  2. owner 사진 1440 에서 보조 글자 ~9px(배율 0.752) → 캡처 폭 ~720 또는 열 비율 조정
  3. manual.html:433 푸터에 대표자·주소·전화·1336 없음(기존, **법정 고지**) · :196 '슬라이드' 문구·띄어쓰기
  4. about.html:140 개인정보처리방침 → /legal/privacy.html · owner.html:132 390 화살표 줄끝 · about 720+ 빈칸 212px · owner.html:17 smooth scroll reduced-motion
  5. owner.pdf 는 2026-07 구판(없는 메뉴명 '연합 리그'·'순위 입력', 1336 없음) → 마지막에 재생성
- §28: TV 사진의 PRIZE POOL/순위 배분은 기존 라이브 클락 화면 그대로 — 프라이즈풀은 가격 정보라 허용(리드).

### 2-10. 포스터 webp (PR #73)

- 오너 지적 1(~09:3x): 시드 일정 12건에 포스터 이미지 누락 → 리드: 이전 세션 `images\3~7.webp`(3 로티 부스터데이·4 깐부전·5 루나×베가·6 퀸·7 키키) 5장을 posters 버킷 `c8e3…/seed0929-poster*.webp` 로 업로드(관리 토큰으로 service_role 키 수령, 값 출력 0) · 12건 poster_url 연결 · 공개 URL 200 image/webp · 새 알림 0(schedules 트리거는 승인 변경 시에만).
- 오너 지적 2(~16:3x): "원본 말고 webp 압축" → 시드 5장 재압축(194~380KB → 132~180KB, Pillow thumbnail(1080,1440)+q80) · schedules 12건 poster_url 교체 · **옛 파일 참조 0, 삭제 보류**(Q1).
- 앱 경로 `src/lib/storage.ts uploadPoster` 목표 500KB→250KB(fabbdefb) → PR #73 16:59 병합.

### 2-11. 클락 테마 v3 · 슬라이드·광고

- 테마 v3(PR #58): home-team Opus/high(06:46~09:42, 앞 세션이 성능 측정 도중 끊김) c5f28698 — 코드 일러스트 14 + 폭우 유리창 = 15종 배선. sceneKit `blurGroup`(판에 모아 한 번 흐림)으로 1920 첫 그림 LoAF 1.28s→0.2~0.4s, 4K 2.8→0.58s. 패널 미리보기 가독 그늘 0→247. 게이트·clock e2e 80 PASS.
  - design-reviewer(Opus) **조건부 FAIL**: ① `isolation:isolate` 가 기존 10종 타이머 bloom(-z-10)을 배경 위로 드러냄(d>16 38,718px, 음성 대조 확정) ② 운영자 클락 탭 열 때 썸네일 15장 한 프레임 → LoAF 817ms(base 69) ③ 첫 전환 대체 바탕 0.3s 툭.
  - 77bb1c6e(ambIsolation 은 모션 테마일 때만·썸네일 idle 분할·첫 전환 페이드, 33조합 회귀 0) → 재측정 **PASS**(d>16 0 · LoAF 63ms · 번쩍임 0) → 09:57 병합. 후속 경미: 벚꽃 해질녘 첫 페이드 5회 중 1회 3프레임.
  - 오너 확인: Mixkit rain-window 상업 무료 라이선스 → 유지. 워크트리 `.env.local` 사본은 리드가 삭제.
- 슬라이드·광고·팀 점수 = §2-5 KW-4.
- 남은 것: TV 화면 날짜·제목 크게·진행시간 "3시간 38분"·고급 테마(오너가 고른 6항목 중 미구현 — PLAN-AB-exec §5-1) · 블라인드 '/' 구분자 대비.

### 2-12. 번들 예산

- #52 CI 실패 = VenueManageTab 청크 119.1/119KB(main 기준선 경계 0.1 초과) → #55 가 StaffPayroll·StaffSchedule 을 지연 청크로 빼 여유 확보 → #52 update-branch → 통과.
- 테마 v3: ClockThemePanel 을 lazyWithReload+preload 로 빼 VenueManageTab 116.1.
- JS 전체 합계 1021~1024 → KW-4 뒤 **1064.9 / 1014KB** 경고(09-28 구조상 경고만, 실패 아님) → 오너 결정 ⑧ **1080** 으로 상향(c04927ce, PR #71). 정본 `bundle-budget.json`. `--update` 금지, 손으로 올리고 오너 고지(기존 규칙).

### 2-13. 디자인 1차 문서(요금제 영상)와 오너 승인 절차

- 오너가 준 요금제 UX 영상(https://www.youtube.com/watch?v=iHqhtvWn_0s) 요약 → design-reviewer Opus/high 앱 감사(10:14~11:02): 원리 7개로 GTO·내 매장·일정 Before/After. 하네스 scratchpad `pricing-audit/h`.
- 실측으로 드러난 원인 3: ToolsPanel `LANE_TONE` 키가 실제 cat 과 달라 도구 타일 전부 violet(죽은 표) · VenueCustomizePanel `fieldset className="contents"` 로 부모 space-y-3 이 안 닿아 입력 묶음 간격 0 · 도구 시트 딥링크(#tool=)로 열면 첫 포커스가 '공유' 버튼에 링. 채운 선택 칩 복제 ~80곳/45파일. 비권장(오너 확정과 충돌): 일정 카드 라벨(E안 '라벨 없음') · 홈 날짜 칩 금색.
- 산출: 바탕화면 `누리홀덤_디자인개선안_0930\`(1_GTO·2_내매장·3_일정·4_공통·5_소개·가이드, 개선안.docx 1.9MB, 목차.md) + **1차 Google Docs(중간본)** https://docs.google.com/document/d/1bRQWeT1E-OpnXz1_q5XECzOTXV5wWXw1oXhl7GR9vPc (이미지 삽입 미확인).
- 전체 계획 v2 Google Docs: https://docs.google.com/document/d/1wdkNg1ByXxW4wTDQFasjxLmIlzTo9C5O1RgrsM4UoVE
- B2 구현 착수(gto-team Opus · store-team Opus, 11:03~11:24) → 오너 "바꾸라는 항목만" → **중단**. 작업트리 보존(미커밋): `b2-gto-0930`(HandGtoModal·ICMCalculator·ToolsPanel·GtoDeepPanel·NuriSpotPanel·chip.ts·tools/* 등 15파일) · `b2-store-0930`(StoreDashboard·NuriPosLedger·VenueManageTab·VoucherManageModal 등 10파일 + `e2e/store-design-0930.spec.ts`·`storeDesign0930.contract.test.ts`·`src/lib/statTone.ts`). 둘 다 main 14922e61 기준 — 재사용 시 main 과 충돌 확인 필요.
- **승인 절차(오너 확정)**: ① 개선안 문서의 모든 항목은 **고정 번호 + 구현 가능한 After**(실제 화면에 스타일을 주입해 찍은 것, 주입 CSS/클래스를 명세로 보관) ② 오너가 제목·번호를 주면 **After 이미지 그대로** 구현(임의 변형 금지) ③ 같은 폭·같은 데이터로 찍어 After 와 **픽셀 비교** ④ 모션(진입·중간·정착·뒤로/재방문)·버튼·연결(링크·이동·데이터)·반응형·콘솔 오류 **0 까지** 점검. 판정 폭: 내 매장 PC 1440, 일반 탭 모바일 390.
- 디자인 수정안은 Tailwind v4 기준(§2-14).

### 2-14. Tailwind v4

- 저장소 실제 = `tailwindcss ^4.3.3` + `@tailwindcss/vite`, `tailwind.config.js` 없음, 설정 본체 `src/index.css`(`@theme inline`, v3 값 복원 — "same screen, same motion as v3"). CLAUDE.md·AGENTS.md 의 "v3.4 (tailwind.config.js)" 표기는 낡음.
- general-purpose **Sonnet 5.5**/high(16:36~16:43) 참고서: scratchpad `uxui/tailwind4.md`(28KB) — [문서]/[컴파일]/[소스] 구분. 핵심: `@theme inline` · 토큰만(surface-*·ink-*·accent-*, 원색 금지 — 라이트 보정 깨짐) · v4 이름(shadow-xs·rounded-xs·outline-hidden) · space-y 는 v3 선택자 수동 유지 · `bg-(--var)` 문법.
- PR #71 로 **CLAUDE.md** 스택 줄 정정. **AGENTS.md 51행 "Tailwind CSS v3.4 (tailwind.config.js)" 는 origin/main 에 아직 남음**(§7).
- ⚠ 로컬 main checkout(`c3537d93`)은 origin/main 보다 **217커밋 뒤**이고 오너의 09-28 미커밋 40여 파일이 있다 — 그래서 로컬 CLAUDE.md 도 아직 v3.4 로 보인다. 함부로 pull/checkout 하지 말 것.

### 2-15. 앞 세션에서 이어받은 나머지 (모션 #51 · 메일 #52 · UI-06 #54)

- **#51 Fold**: home-team Opus bd25ec26(D1 space-y margin 한 프레임 −12.8→−0.4~−0.9 · 클락 블라인드 −8.5→−0.47 · D2 details 바깥 닫기 100ms→0ms · keepMounted 같은 노드) → design-reviewer 조건부 PASS, **N1**(keepMounted 재열림 때 Fold.tsx:154 가 display:none rect 로 오판 → 1440 재열림마다 scrollY −1 누적) → home-team Opus bb32ec2e(판정을 `display='flow-root'` 뒤로; 새 e2e 전 FAIL 602→545·후 PASS 3/3) → 재측정 PASS(scrollY 449 고정·앵커 끄기 0·회귀 108항목 차이 0) → 08:13 병합. 남은 기존 이슈: **R1** flex gap 부모(IntegratedSearchBar.tsx:437, AdminTab.tsx:324)는 gap 이 한 번에 튐 · D3 맨 위 밀림(TDA 13/88px·직원관리 399px) · D4 · D5.
- **#52 메일**: 메일 디자인 체계 `supabase/functions/_shared/email/layout.ts` · 사업자 정보는 BusinessFooter 에서 생성(`scripts/gen-email-templates.mjs`→brand.gen.ts) · `https://nuriholdem.com/2.png` 가 08-26 삭제돼 인증 메일·notify-sanction 로고가 깨져 있었음 → `public/email/logo.png`(운영 200 image/png 6,500B). 08:06 병합. 이어서 리드가 **인증 템플릿 5종 PATCH**(분류기 [Production Deploy] 차단 → 오너 규칙 추가 후, 백업 scratchpad `auth_config_backup_0930.json`, 다른 키 변경은 custom_contents 표식 2개뿐, otp 3600·SMTP resend 유지) · support-reply-email 배포본 최신 확인 · **notify-sanction v16** CLI 배포(main 2a53aed4 기준).
- **#54 UI-06**: root-cause-debugger Opus — main 에서도 3/3 실패, 원인 = D8(CommunityTab 첫 방문 판 정렬) + 목표 Y 가 운영 데이터(홀덤펍 섹션 길이, 09-29 더미 매장 3곳 추가로 80→300)에 묶임 → community-team **Sonnet 5.5** 98f4076f(Y=80·Y=200 고정 두 케이스, 음성 대조 3/3 실패 확인) → 07:23 병합(c394ab34). 제품 코드 무변경.

### 2-16. K1 학습지식서 (다른 프로젝트 재사용용)

- general-purpose **Opus 5.5**/high(총괄 집필) + 추출 7개(**Sonnet 5.5**: nuri-lead 기억·전역 기억·design/home·store/community·gto/verifier/rcd/critical·docs·handoff 문서).
- 산출: 바탕화면 `누리홀덤_학습지식서_0930\학습지식서.docx`(679KB, **728 교훈**). UX 5부는 영상 분석 뒤 채워 Google Docs 로 올림(680KB 라 base64 업로드는 비효율 — 리드 판단). → 아직 미업로드.

---

## 3. 운영 DB 적용 목록

프로젝트: NURI HOLDEM MAIN `idsxiqspecrucvfvtgbw`(조직 NH holdings/Pro). 브랜치·`supabase db push` 금지(CLAUDE.md). 모든 적용 전에 라이브 `begin…rollback`(또는 `raise` 로 암묵 트랜잭션 롤백) 리허설.

| 파일 | 적용(KST, 대략) | 방법 | 적용 전 게이트 | 사후 md5 / 확인 | 어드바이저 | origin/main 파일 머리 |
|---|---|---|---|---|---|---|
| 20260930a_support_reply_email | 앞 세션(09-30 새벽) | MCP execute_sql | — | 컬럼 answer_emailed_for · support_insert WITH CHECK 실측 | — | ✅ |
| 20260930b_staff_punch | ~07:50 직전 | MCP execute_sql | 자가검사 | punch_my_shift/my_punch_state DEFINER·anon f·auth t · src md5 `354189f7…`/`e4258817…` | 보안 ERROR 0(의도된 authenticated WARN 만) | **⏳ 미적용(표기 누락)** |
| 20260930c_rank_realname_optin | ~09:0x | MCP execute_sql begin…commit | guard_profile_privileged_cols md5 `c7e07691…` | 새 함수 2·반환형(real_name/optin_real_name)·anon 내부 f·가드 joined_at·인덱스 1·옵트인 표시 0행 | (기록: 적용 절차에 포함) | **⏳ 미적용(표기 누락)** |
| 20260930d_coowner_requires_approval | ~09:1x | MCP execute_sql | §0 functiondef md5 13개 · §0-b 정책 md5 | 자가검사 SC 전부 · 6매장 업주 true · 잃는 매장 0 · 로티 업주 JWT 양성 | — | **⏳ 미적용(표기 누락)** |
| 20260930e_chip_rules_early_tiers | ~10:4x | MCP execute_sql begin…commit | `_clock_ledger_part` functiondef `98ea7f30…` · 칸 0 | 칸 2·트리거 2·`_clock_ledger_part` md5 `704cc097…`·anon f · R2/R3/R5 | (R6 계획) | **⏳ 미적용(표기 누락)** |
| 20260930f_server_guards_sanction_verify | ~11:4x | MCP execute_sql 1회 | §0·§0-b | reserve_schedule `a4a8e96c…` · get_domestic_rankings 반환 TABLE(nickname,points,wins,overseas) · 파일 md5(LF) `b62c6cb6…` @dcbea41b | 보안 ERROR 0 (WARN 3 기존) | ✅ (6e3b7602) |
| 20260930g_voucher_bundle_first_rebuy | ~13:1x | MCP execute_sql 1회 | approve `619e033c…` · restore `36a8c2a7…` · guard `65dc8352…` | approve `458be576…` · restore `2cbd9085…` · guard `73eafcc4…` · 파일 md5(LF) `e9c809a3` @157769c6 | (§5 자가검사) | ✅ (445f3a8c) |
| 20260930h_clock_slides_ads | ~13:5x | MCP execute_sql 1회 | 파일 md5 `4c46b2d6` · 전사 확인 `8a3fbee9…` | 버킷 1·트리거 2·정책 4·기존 clock_states 재저장 통과·`_clock_config_limits` authenticated 불가 | 보안 ERROR 0 | ✅ (533dce8f) |
| 20260930i_voucher_discount_addon_bundle | ~18:1x (1차 깨짐 → ~2분 뒤 재적용) | **Management API** database/query | 게이트 5개 일치 · 파일 md5 `c192161a` | approve `de5cd99d` · guard `fad4fc8e` · rule `35e7504a` · restore `f1d77776` · client_guard `eee44d4d` + 한글 표본 | **기록 없음 → 다음 세션 확인** | ✅ (c39ddf1a) |

md5 주의: 파일마다 **prosrc md5 인지 functiondef md5 인지**, 주석 포함/제외인지가 다르다(20260930g 는 '줄 주석·빈 줄을 뺀' 본문으로 적용했다는 store-team 기록과 '주석 포함 원문 기준'이라는 critical 기록이 있다). 비교는 파일 LF 본문으로.

운영 DB 에 한 다른 쓰기(마이그레이션 아님): 시드 포스터 업로드·poster_url 12건(2회) · 인증 설정 PATCH(템플릿 5종).
하지 않은 것: 20260930 파일 외 적용 0. Supabase 브랜치·db push 0.

---

## 4. 배포 목록

### 4-1. main CI (gh run list, KST)

| main 커밋 | 포함 PR | CI | CodeQL | Vercel Production |
|---|---|---|---|---|
| a8623564 | #55 | success(러닝 로그) | — | READY `dpl_HM1mgpph`, 엔트리 CkbAnak0→JU9IbGDI |
| 73785bf8 · dbe49790 · c394ab34 | #52 · #51 · #54 | (목록 범위 밖, 러닝 로그상 병합 후 정상) | | |
| 2a53aed4 | #53 | success | success | |
| 566238b8 | #56 | success | success | |
| 42b80f3e | #57 | success | success | |
| c512b9c2 | #58 | success | success | |
| a4a834de | #59 | success | success | |
| 14922e61 | #60 | success | success | |
| fe24da85 · b458d1fa · d10d69ce · 4c4d7db2 | #64 · #63 · #65 · #61 | success · **cancelled** · **cancelled** · success | 전부 success | 4c4d7db2 Production success |
| d617cdd8 · 9fcbe0f0 | #62 · #67 | success · success | success | 9fcbe0f0 Production success |
| 3b54a4e7 | #66 | success | success | |
| c0057d4b · 6b62d70e · a45e27a7 | #68 · #69 · #70 | success ×3 | success | a45e27a7 Production success |
| 489191e8 · 729baf86 · 33e2a5b4 | #71 · #72 · #73 | success · **cancelled** · success | success | |
| **faac0e6f** | #74 | **success** | success | **Production success(최종)** |

cancelled 3건은 곧바로 뒤따른 병합 커밋이 같은 내용을 포함해 통과했다(줄 세우기 설정에도 연속 병합 시 앞 실행 취소가 남음). 교훈 `project_ci_cancels_on_push.md` 와 같은 부류 — 취소된 커밋 단독으로 배포된 적은 없다.

### 4-2. 엣지 함수·운영 설정

| 대상 | 방법 | 기준 | 확인 |
|---|---|---|---|
| notify-sanction v16 | Supabase CLI deploy | main 2a53aed4(새 로고 layout.ts) | 비로그인 POST 401 |
| verify-identity | CLI deploy | main 4c4d7db2(logic.ts 포함) | 비로그인 POST 401 |
| tda-assist | CLI deploy | #72 병합 후(rules.json 리바인) | 비로그인 POST 확인 |
| support-reply-email | (앞 세션 배포) | 배포본 = 최신(R2 confirmed 포함) 확인 | — |
| Supabase Auth 메일 템플릿 5종 | Management API PATCH | 템플릿 `supabase/templates/auth/templates.ts` 생성본 | PATCH 200 · 재조회 10/10 |

---

## 5. 오류·사고·실수 전부

형식: 무엇 → 원인 → 어떻게 발견 → 복구 → 재발 방지.

### A. 세션·환경
| # | 사건 | 원인 | 발견 | 복구 | 재발 방지 |
|---|---|---|---|---|---|
| A1 | 앞 세션 06:31 강제 종료, 팀원 6갈래 동시 중단 | 세션 종료(원인 미상) | 새 세션 시작 | transcript·subagent 로그 50MB 에서 끊긴 작업 복원, 워크트리 미커밋 변경 이어받아 재배정 | **러닝 로그**에 사건마다 한 줄(이 세션부터) |
| A2 | 로컬 main 이 origin/main 보다 **112커밋 뒤**인데 '앞'이라고 보고 | 비교 방향 착오 | 재확인 | 정정 보고 | 지금은 217커밋 뒤 — 대상 커밋에서 소스를 읽는다 |
| A3 | Supabase ref `lyjzjtejsbkijhgpkmdh` 를 KPI 프로젝트로 오보 | PR 용 유료 브랜치였음 | list_branches | 정정 | Preview fail·낯선 ref 는 list_branches 로 부모부터 |
| A4 | Supabase GitHub 연동이 PR 마다 **유료 빈 브랜치**(PR #15 용 09-04부터 26일, PR #55 용) + 운영 자동배포 켜짐(적용 0, 실패만) | 연동 기본 설정 | 비용·CI 체크 확인 | 브랜치 삭제, 오너가 둘 다 끔 | 기억 `project_supabase_github_integration_off.md` |
| A5 | Supabase MCP 가 작업 중 끊김(재인증 필요) | 인증 만료 | KW-1a 중 | PGlite(PG 18.3 WASM)로 식 동치, 리드가 재인증 후 적용 | — |
| A6 | Sentry MCP 등록·로그인·실호출 성공(조직 nh-holdings / 프로젝트 javascript-react)했는데 이후 이 세션에 도구 미로드 | 세션 도구 목록 갱신 안 됨 | DSN 조회 시 | 다음 세션(재시작) | — |
| A7 | 워크트리에 `.env.local`·node_modules 없음 → 빌드가 IS_MOCK, 로그인 e2e 19건 환경 실패 | 워크트리 구조 + `.env.local` 읽기·복사·삭제 deny 규칙 | 각 팀 | e2e/_session.ts 공개 URL·anon 키 env 로 빌드, node_modules 는 PowerShell Junction, 워크트리 e2e 는 NOT_RUN → CI 로 | 기존 교훈(worktree_builds_are_mock) |
| A8 | `cmd //c mklink /J` 가 한글 경로 정션을 `C:\C:\…` 로 깨뜨려 vitest 가 조용히 멈춤 | Git Bash 경로 변환 | critical·gto | PowerShell `New-Item -ItemType Junction`, 제거는 `[IO.Directory]::Delete(path,$false)` | 기억 기록 |
| A9 | git commit/fetch 때 auto-gc 가 `.git/worktrees/*` 삭제 시도 → Permission denied 대량 | maintenance.auto | 각 팀 | 무해(삭제 0, 75개 유지) | 무시 가능, 읽기 전용 검토에서는 fetch 하지 않기 |
| A10 | TaskStop 으로 끈 vite preview·playwright 가 포트·프로세스를 잡고 남음 | 자식 프로세스 고아 | 포트 충돌(4173·4191) | netstat PID → Stop-Process/taskkill, 다른 포트(4193 등) | — |
| A11 | 하네스가 서브에이전트의 scratchpad `.md` 쓰기를 거부하는 경우 | 권한 규칙 | critical·gto 보고 | 본문으로 보고 | 팀 보고는 기억 파일·커밋으로 대조 |
| A12 | 사용량 급소모 우려(주간 63%·Fable 42%) → 절약 지시 → 취소 → '필요한 곳에 필요한 모델' | — | 오너 | 정본 §3 문구 갱신 | 기억 `feedback_usage_pacing_0930.md` |

### B. auto-mode 분류기 차단 (우회 0 — 전부 오너 허가로 해결)
| # | 차단 | 분류 | 해결 |
|---|---|---|---|
| B1 | 인증 메일 템플릿 5종 PATCH | [Production Deploy] | 오너가 규칙 문구 전송 → settings.local.json 37개 |
| B2 | notify-sanction CLI 재배포 | [Production Deploy] | 오너 규칙 → 42개(execute_sql·apply_migration·deploy_edge_function·Vercel·functions deploy) |
| B3 | `spotEvaluate.ts` 편집(Edit·python 모두) | [Modify Shared Resources] | 오너 "spotEvaluate.ts 수정 허가" — 코디네이터 지시는 사용자 승인이 아니다 |
| B4 | thumbUrl 기본값 contain 변경 첫 시도 | '공유 자원 수정'(지시 범위 밖) | 오너 결정 후 873674c1 |
| B5 | 워크트리 `.env.local` 읽기·복사·삭제 | deny 규칙 | 공개 URL+키 env 로 대체, 삭제는 리드 |

### C. 설계·검토에서 잡힌 결함 (검토가 제 역할을 한 사례 — 재발 방지용)
| # | 결함 | 잡은 곳 | 교훈 |
|---|---|---|---|
| C1 | 실명 옵트인이 **현재 닉네임**으로 과거 행을 이음 → 닉 재사용 시 남의 기록에 실명 | critical 1차 | 사람 속성을 행에 붙일 땐 시간축 소유자로 |
| C2 | 판정 시각 created_at → delete+insert 재저장 때 now() 로 바뀌어 누출 재발 | critical 2차 | 판정 시각은 사용자·업무 동작으로 바뀌지 않는 칸(ranking_date) |
| C3 | profiles.joined_at 을 본인이 RLS 로 수정 가능 → 위조로 가입 전 기록에 실명 | critical 3차 | 시간축 판정 칸은 guard_profile_privileged_cols 부터 확인 |
| C4 | 승인 게이트가 **부여 함수**(respond_staff_invite)·**크론**(주간 리포트)을 놓침 | critical | 판정 함수뿐 아니라 grant 를 만드는 함수·크론까지 owner_id grep |
| C5 | posters_upload 를 좁혀 **첫 매장 생성 업로드** 회귀(42501) | critical 재검증 | 정책을 좁히기 전 그 정책을 타는 화면 흐름의 순서·'대상이 아직 없는 상태' 양성 |
| C6 | D-2 초안 F1 이 09-29 오너 결정(예약=로그인만)을 뒤집음 | critical 재검토 | 원인은 critical 자신의 D-1 낡은 기억. '화면만 막는다'를 쓰기 전 git log -S 로 최근 결정 |
| C7 | 이용권 N 조회에 매장 결속 없음 | critical(0930g) | 포스터 값을 서버가 금액에 쓰면 포스터→세션→요청 매장 결속을 반례로 |
| C8 | 분납 애드온을 ticket 으로 바꾸면 몫이 남음 · 미수 부풀림 | critical + Fable(0930i) | '다른 칸 값에 따라 의미가 바뀌는 새 칸'은 조건 칸 전환 반례부터 |
| C9 | #58 isolation 이 기존 10종 bloom 을 드러냄 · 패널 LoAF 817ms | design-reviewer | 병합 PR 기준선은 **병합한 main 부모** |
| C10 | KW-4 광고 퇴장 번쩍·총액 잘림·제목 상한 | design-reviewer | 상한은 TV 칸 폭에서 역산, 상수만 보는 테스트는 동어반복 |
| C11 | #51 N1 keepMounted 재열림 오판 | design-reviewer | layout effect 판정은 display 복원 뒤 |
| C12 | SPOT 앤티 커밋이 '정의를 인용'했지만 min 을 끝까지 따르지 않음 | critical | 정의 인용 수정도 정의의 min 끝까지 |
| C13 | KW-4 구현자 헤더의 '일반 7e435684' 는 실제 venue_owner | critical | 음성 계정은 역할을 먼저 조회 |

### D. CI·테스트
| # | 사건 | 원인 | 복구 |
|---|---|---|---|
| D1 | UI-06 main 3/3 실패 | D8 정렬 + 목표 Y 가 운영 데이터(매장 3곳 추가)에 묶임 — 코드 변경 0 | 스펙을 고정 Y 두 케이스로(#54). "코드 안 바꿨는데 빨갛다 → 운영 데이터 먼저" |
| D2 | #52 VenueManageTab 119.1/119 | 기준선 경계 | #55 지연 청크 뒤 update-branch |
| D3 | CodeQL #53 `js/incomplete-multi-character-sanitization`(테스트 파일) | 태그 한 번만 제거 | 반복 제거 헬퍼(65e6588c) |
| D4 | CodeQL #63 `js/bad-tag-filter` 2회 | 테스트 정규식 `</script>` 공백·속성 | e3af103a → 3c8ae16b(`</script\b[^>]*>`) |
| D5 | #62 320px 요약 칸 넘침(CI 리눅스만) | 윈도우 여유 0.95px, 리눅스 글꼴 −5px | chipShort + 여유 하한 12px |
| D6 | #67 보호 해제 e2e 셀렉터(nuri-spot.spec.ts:208) | 입력이 두 칸으로 | 셀렉터를 두 칸으로(5d8a096b) |
| D7 | **#68 e2e 문구 결합 3건 + nuri-spot-ai 1건** | 어문 변경이 e2e 기대 문구와 결합(게시물→게시글 탭, 업주→사장님, SPOT AI 안내) | testid(exposure-sub-*)로 교체 · 서버 권한과 같은 고지 문구 · 363f83f3. 자동 검사(HEAD 소스엔 있고 현재 소스엔 없는 e2e 한글 리터럴)는 정규식·배열 속 짧은 라벨을 못 잡는다 |
| D8 | main CI cancelled 3건 | 연속 병합 | 뒤 커밋이 포함·통과 |
| D9 | `input type=number max` 가 submit 이벤트 자체를 막아 토스트 안 뜸 | 브라우저 검증 | e2e 는 validity.rangeOverflow + 쓰기 0 으로 단언 |
| D10 | mystore-pc-tab-jank (d) --workers=2 1회 FAIL | 부하 플레이크 | --workers=1 repeat 3 → 18/18 |

### E. 운영 사고·리드 실수
| # | 사건 | 원인 | 발견 | 복구 | 재발 방지 |
|---|---|---|---|---|---|
| **E1** | **20260930i 1차 적용에서 함수 5개의 한글 오류 문구가 모지바케로 운영에 올라감** | Windows 파이썬 `sys.stdin` 이 cp949 — `… \| python -c "sys.stdin.read()"` 로 JSON 을 만들어 Management API 로 보냄 | 적용 직후 **prosrc md5 대조가 기대값과 다름** | 약 2분 뒤 파일을 `open(p,'rb').read().decode('utf-8')` 로 읽어 재적용 → md5 5개 일치 + 한글 표본 SELECT | 기억 `feedback_python_stdin_cp949.md`. 적용 직후 md5 대조·한글 표본은 필수. (이 인수인계서 작성 중에도 `gh … \| python` 에서 같은 cp949 서로게이트 오류가 재현됨 — gh 는 `--jq` 로) |
| E2 | 리드가 `git branch -D NURI/copy-0930` 를 확인 없이 실행 | 부주의 | 직후 | `git fsck` — 오늘자 고아 커밋 0, 가리키던 커밋은 다른 ref 에서 도달 가능 → **손실 없음** | 삭제 전 `git log -1 <branch>` 확인 |
| E3 | 시드 일정 12건에 포스터 이미지 누락(09-29 작업) | 텍스트만 SQL 로 넣음 | 오너 지적 | 업로드·연결 | 기억 `feedback_attach_poster_with_schedule.md` |
| E4 | 시드 포스터를 원본급(194~380KB)으로 올림 | 압축 기준 없음 | 오너 지적 | 재압축·교체 | 기억 `feedback_poster_webp_compress.md` |
| E5 | 리드가 불법 사행성 고지의 체육진흥법 문장을 뺐음 | 법령 인용 오류로 판단 | 오너 결정 ⑦ | #72 복원 | 법적 고지 문장 삭제는 오너 확인 먼저 |
| E6 | 파일 머리 ✅ 표기(b·c·d·e) 미갱신 | "최종 인수인계 PR 에서" 로 미룸 | 이 문서 작성 중 확인 | §7 P0 | 적용 커밋에 표기를 같이 |
| E7 | 디자인 "리드 판단으로 바로 구현" 착수 후 중단 | 오너 지시가 뒤집힘 | 오너 | B2 작업트리 보존 | 디자인은 오너가 고른 번호만 |

### F. 편집 도구 함정 (여러 팀 반복)
- **Git Bash `sed -i` 가 CRLF→LF 로 바꿈**(store·home·gto·community 모두 재발). `git hash-object` 는 autocrlf 정규화라 못 잡음 → node/바이트로 `\r\n` 개수. 편집은 python **바이트 치환** 또는 Edit 도구.
- bash heredoc/`-c` 안 python·node 문자열의 역슬래시·정규식이 깨짐(백스페이스 0x08·NUL·실제 NBSP 가 파일에 박힘, 테스트 파일 파싱 실패로 vitest 총수 감소) → 스크립트는 Write 로 파일을 만들어 실행.
- Windows 에서 python 출력 경로를 git add 에 넘기면 `\r` 이 붙어 pathspec 실패 → `tr -d '\r'`.
- vitest 는 `process.env.MODE` 를 'test' 로 덮음 → 탐침 스위치는 다른 이름.
- 감사 '현재→수정안' 치환은 수정안이 앞 문맥을 품으면 중복('회원은 언제든지 회원은 언제든지') → 겹침 검사 스크립트.
- 문구 계약(userScreenCopy.contract)은 주석 안 문구로도 통과함.
- 리허설 하네스 함정: 한 문장 스냅샷(as_user 안 INSERT 를 같은 문장이 못 봄) · smallint 리터럴 42883 · DO 블록 변수 대소문자 무시 충돌(42601/42702) · 레이트리밋 트리거(rl_posts 12초·rl_reservations 3초·rl_comments 5초) · storage.objects 직접 DELETE 는 `storage.protect_delete()` 가 막음(`set_config('storage.allow_delete_query','true',true)`) · MCP 오류 메시지는 길면 가운데가 잘림(~1.7KB) → 나눠 받기 · nickname_history 는 UPDATE 금지(추가만) · 라이브 이력 시각과 겹치는 가짜 시각은 거짓 결과.

### G. 영상 분석 파이프라인 사고 (상세는 §8)
- 처음 @UXUIDesign 을 45편으로 **오판**(실제 1,338) · firecrawl 무료 834크레딧으로 불가 → yt-dlp.
- Haiku 보류 재분류가 **키워드 방식이라 부정확** → 폐기, 보류 3,913 전부 수집 후 자막 내용으로 판정하기로.
- **C단계 1차: Sonnet 서브에이전트가 40편 배치에서 autocompact thrash** — CLI 2.1.280 이 `claude-sonnet-5-5` 를 모델 목록에서 몰라 **200k 창으로 가정**. 203편 카드만 건짐 → 헤드리스 배치당 새 세션으로 재설계.
- 수집 워커4 단독 진행·유휴 `http.server 4190` 방치 → 종료, 채널 분할 워커 6~9 재시작.

### H. 에이전트 메시지 지연
- 기존 교훈(`feedback_team_reports_as_files.md`): SendMessage 회신이 수십 분 늦을 수 있고 `idle` 은 '안 한다'가 아니다. 이번 세션 러닝 로그에는 개별 지연 사건이 기록되지 않았다 — 팀 결과는 **기억 파일·커밋·PR 코멘트로 대조**하는 방식이 계속 쓰였다.

---

## 6. 에이전트·모델 사용 기록

근거: 서브에이전트 로그 75개의 `message.model` 필드(요청 = 관찰, 불일치 0). 시각은 KST 시작~끝. 리드(메인 세션)는 `claude-opus-5-5`.

| 시작~끝 | 역할 | 관찰 모델 | 무엇 | 결과 |
|---|---|---|---|---|
| 06:46~07:01 | home-team | Opus 5.5 | PR #51 D1·D2·keepMounted 재개 | bd25ec26, FAIL→PASS 3건 |
| 06:46~07:10 | store-team | Opus 5.5 | 출근·퇴근 버튼 재개 | 4286d2f6, PR #55 |
| 06:46~09:42 | home-team | Opus 5.5 | 클락 테마 v3 배선 재개 | c5f28698·77bb1c6e, PR #58 |
| 06:46~06:54 | root-cause-debugger | Opus 5.5 | UI-06 CI 실패 원인 | D8 + 운영 데이터 방아쇠 |
| 06:54~07:05 | community-team | **Sonnet 5.5** | UI-06 테스트 수정 | 98f4076f, PR #54 |
| 07:01~08:13 | design-reviewer | Opus 5.5 | PR #51 재검토 | 조건부 PASS → N1 → PASS |
| 07:06~07:29 | store-team | Opus 5.5 | 순위 실명 옵트인 | 38707ed0, PR #56 |
| 07:12~07:17 | verifier | **Sonnet 5.5** | PR #55 검증 | PASS |
| 07:20~07:30 | store-team | **Sonnet 5.5** | 출근 02:00 보완 | 8b4cc8e6 |
| 07:29~08:33 | critical-reviewer | Opus 5.5 | PR #56 개인정보 검토(1~4차) | 조건부 → FAIL → FAIL → PASS |
| 07:32~08:29 | store-team | Opus 5.5 | 실명 업주 화면·지난 대회 위젯(2~4차) | a5ebd2e8·5a5b544e·75be5a46 |
| 07:47~07:57 | home-team | Opus 5.5 | Fold N1 수정 | bb32ec2e |
| 08:00~09:00 | store-team | Opus 5.5 | 승인 게이트 20260930d(1~4차) | 47456691→014ca98b, PR #57 |
| 08:17~09:03 | critical-reviewer | Opus 5.5 | 20260930d 검토 | 조건부 → FAIL → PASS |
| 08:34~09:57 | design-reviewer | Opus 5.5 | PR #58 시각 검토 | 조건부 FAIL → PASS |
| 09:44~10:29 | store-team | Opus 5.5 | KW-1a 계산 | 830e0351, PR #60 |
| 09:44~10:52 | home-team | Opus 5.5 | KW-3 표시(+썸네일) | c60bcf37·c1be6037·873674c1 |
| 10:14~11:02 | design-reviewer | Opus 5.5 | 요금제 UX 앱 감사 | 개선안 docx·Docs 1차 |
| 10:16~10:34 | general-purpose | **Sonnet 5.5** | @UXUIDesign 자막 수집 | 수집 방법 확정(yt-dlp) |
| 10:29~10:36 | verifier | **Fable 5.1** | ★ KW-1a 포스터 계산 교차 판정 | PASS |
| 10:29~11:04 | store-team | Opus 5.5 | KW-2 포스터 폼 | c9ea8761, PR #66 |
| 10:38~10:54 | critical-reviewer | Opus 5.5 | 보안 D-1 감사 | P0 0·P1 3 |
| 10:38~10:52 | critical-reviewer(fork) | Opus 5.5 | 화면-유일-가드 감사 | D-1 에 합류 |
| 10:49~11:26 | home-team | Opus 5.5 | 소개·가이드 개편 | 1b885517(보관) |
| 10:50~11:03 | general-purpose | Opus 5.5 | 어문 감사 총괄 | 965건 |
| 10:52~11:01 | home-team | **Sonnet 5.5** | rebuyStacks 표시 연결 | PR #62 |
| 10:53~11:22 | gto-team | Opus 5.5 | GTO 정확도 감사 | PASS 259·결함 2·해석 2 |
| 10:54~11:00 | general-purpose ×7 | Opus 5.5 | 어문 감사 조각 1~7 | findings.csv |
| 10:55~11:42 | store-team | Opus 5.5 | D-2 서버 20260930f | d2465127→dcbea41b |
| 10:55~11:20 | home-team | Opus 5.5 | CSP·verify-identity | d7154368, PR #63 |
| 10:56~11:46 | general-purpose | Opus 5.5 | K1 학습지식서 총괄 | docx 728 교훈 |
| 10:58~11:42 | general-purpose ×7 | **Sonnet 5.5** | 교훈 추출(기억·문서별) | K1 입력 |
| 11:03~11:24 | gto-team | Opus 5.5 | B2 GTO 디자인 | **중단·보존** |
| 11:03~11:24 | store-team | Opus 5.5 | B2 내 매장 디자인 | **중단·보존** |
| 11:19~11:23 | general-purpose | **Haiku 4.5** | 보류 영상 재분류 | 키워드식이라 폐기 |
| 11:21~11:30 | critical-reviewer | Opus 5.5 | PR #63 검토 | 5/5 PASS |
| 11:21~11:46 | critical-reviewer | Opus 5.5 | 20260930f 검토 | F1 FAIL → 2차 PASS |
| 11:22~11:26 | general-purpose | **Fable 5.1** | ★ SPOT 앤티 유효 스택 교차 판정 | 감사자와 같은 결론 |
| 11:22~11:40 | gto-team | Opus 5.5 | GTO 결함 수정 | ff826e7f |
| 11:24~11:27 | general-purpose | **Sonnet 5.5** | 제외 영상 제목 재판정 | 426편 구제 |
| 11:26~11:43 | design-reviewer | Opus 5.5 | 가이드 독립 검토 | 마지막 단계 목록 |
| 11:40~11:55 | critical-reviewer | Opus 5.5 | GTO 수정 검토(+f6d9598e) | PASS / 앤티1 한계 |
| 12:25~13:15 | store-team | Opus 5.5 | KW-1b | b374434b·157769c6, PR #69 |
| 12:25~13:47 | store-team | Opus 5.5 | KW-4 클락 | 5aa08f93·b47cacf3, PR #70 |
| 12:25~12:36 | gto-team | Opus 5.5 | SPOT 두 스택 | 58e85516, PR #67 |
| 12:25~13:36 | home-team | Opus 5.5 | 법무·어문 수정 | copy-fix 6커밋, PR #68 |
| 12:26~12:50 | home-team | Opus 5.5 | PR #62 320 넘침 | 8d781d5f |
| 12:37~12:44 | critical-reviewer | Opus 5.5 | SPOT 두 스택 검토 | PASS |
| 12:44~13:01 | critical-reviewer | Opus 5.5 | 20260930g 검토 | 적용 가능 + 보강 |
| 12:44~12:48 | general-purpose | **Fable 5.1** | ★ W-01 이용권 금액·엔트리 교차 | (a)(b) PASS, (c) 오너 질문 |
| 12:56~13:51 | critical-reviewer | Opus 5.5 | 20260930h 검토 | 적용 가능 → 재검토 PASS |
| 12:56~13:55 | design-reviewer | Opus 5.5 | KW-4 TV 시각 검토 | FAIL 3 → PASS |
| 13:03~13:12 | verifier | **Sonnet 5.5** | PR #68 diff 검증 | FAIL 1(e2e 문구) |
| 14:37~14:51 | general-purpose ×4 | **Sonnet 5.5** | UX 카드 파일럿(b001~b050) | autocompact thrash, 203편 건짐 |
| 16:36~18:14 | store-team | Opus 5.5 | 0930i 할인·애드온·분납 | 96c2054b→2f9439c4, PR #74 |
| 16:36~16:41 | home-team | **Sonnet 5.5** | 법령 문장 복원·리바인 | 6c78e398, PR #72 |
| 16:36~16:43 | general-purpose | **Sonnet 5.5** | Tailwind v4 참고서 | tailwind4.md |
| 17:18~18:07 | critical-reviewer | Opus 5.5 | 0930i 검토(최종까지) | 적용 가능 |
| 17:18~17:23 | general-purpose | **Fable 5.1** | ★ 0930i 분납 금액 교차 | 불일치 1(addonFinance) |
| 10-01 00:5x | general-purpose | Opus 5.5 | 이 인수인계서 초안 | 이 문서 |

헤드리스 배치(서브에이전트 아님, §8): `claude -p --model sonnet` **495회**, 결과 JSON `modelUsage` 전부 `claude-sonnet-5-5`(별칭 고정 `ANTHROPIC_DEFAULT_SONNET_MODEL` 효과 확인). JSON 이 보고한 API 환산 비용 합 약 $460 — Max 로그인 흐름이라 실제 청구가 아니라 구독 한도 소모로 본다(청구 여부 미확인). 규칙집 D2 는 `--model opus` 헤드리스(작성 시점 실행 기록 없음).

**Fable 5.1 사용 근거(4회, 전부 리드 판단 · 한 쟁점 · 읽기 전용 · 보안 쟁점 제외)**

| # | 쟁점 | 정본 §3 근거 | 결과 |
|---|---|---|---|
| 1 | KW-1a 포스터→장부→클락 금액·엔트리 계산(PR #60) | 오너 "필요한 곳에 필요한 모델" — 틀리면 정산 금액·엔트리 사고, 구현 모델(Opus)과 **다른 모델** 교차 | PASS + firstRebuy 관찰 |
| 2 | SPOT BB앤티 유효 스택 해석(감사자 해석이 갈림) | 조건 1(독립 기준 충돌) | 감사자와 같은 결론 |
| 3 | W-01 이용권 N장 금액·엔트리(0930g) | 오너 지시 "금액 교차는 Fable" | 오너 질문 3개 도출 → 결정 8건 |
| 4 | 0930i 분납 금액·정산 | 같은 이유 | addonFinance 불일치 발견 → 수정 |

보안 쟁점은 Fable 에 올리지 않았다(09-29 실측 `[cyber]` 거부). 러닝 로그 초반 "Fable 0회"는 06~07시 기준값이다.

**역할별 09-30 기억 파일(다음 세션 팀원이 읽을 것)**: `.claude/agent-memory-local/`
- store-team: coowner_approval · kw1a_calc · kw1b_voucher_bundle · kw2_poster_form · kw4_clock_k · rank_realname_optin · sec_d2_server_guards · staff_punch · voucher_disc_addon_0930i
- home-team: clock-scenes-v3 · copy-fix · email-templates · fold-d1-d2-keepmounted · fold-n1-reopen · guide-pages · kw3-display · reentry-summary-chipshort · sec-csp-idv
- gto-team: gto_accuracy_audit · gto_audit_fix · icm_chop_variant · spot_two_stacks
- critical-reviewer: clock_ads_k_review · coowner_approval_review · gto_fix_0930_review · kw1b_voucher_bundle_review · pr63_verify_identity_csp_review · rank_realname_optin_review · security_d1/d2 · spot_two_stacks_review · support_reply_email_review · voucher_disc_addon_0930i_review
- design-reviewer: clock-ambience-pr58 · guide-static-pages · kw4-clock-slides · pr51-fold-review · pricing-ux-audit
- verifier: copy_fix_pr68 · pr60_kw1a_calc_crosscheck · staff_punch_pr55 / community-team: ui06_d8_spec_fix / root-cause-debugger: ui06-short-section-d8-align
- nuri-lead(09-30): attach_poster_with_schedule · design_owner_picks · detailed_handoff_after_deploy · poster_webp_compress · python_stdin_cp949 · usage_pacing_0930 · owner_decisions_0930 · supabase_github_integration_off · supabase_mgmt_token

---

## 7. 남은 일·후속 과제

우선순위: **P0** 다음 세션 첫 작업 · **P1** 이번 주 · **P2** 순서 자유 · **B** 오너 결정·자료 대기.

| 우선 | 과제 | 담당(모델) | 선행 조건 | 완료 증거 |
|---|---|---|---|---|
| P0 | 이 초안을 `docs/HANDOFF.md` 로 옮기고 **20260930b·c·d·e 파일 머리 "✅ 적용 완료 + 실측값"** 으로 정정, 한 PR | 리드(Opus) | — | PR diff · CI |
| P0 | 20260930i 사후 보안 어드바이저 1회(기록 없음) | 리드 | Supabase MCP 재인증 | ERROR 0 기록 |
| P0 | 영상 규칙집 D 완료(f 배치 카드 → D1 재실행 → D2 Opus → D3 태그 장 병합 → D4 조립) — §8 | 리드 + 헤드리스 Opus | f 카드 1,812편 완료 | rules/out 33개 이상 · 규칙집 문서 |
| P1 | **Sentry DSN** 확보 → CSP Report-Only `report-uri`(오너 결정 ⑥) | home-team(Opus) | Sentry MCP 로드(재시작) 또는 오너가 DSN(공개값) 전달 · Vercel env `VITE_SENTRY_DSN` | 위반 1건 Sentry 수신(양성 대조) |
| P1 | **클락 광고 실제 업로드 3종 실측**(840×1120·500KB·형식 위반 거절 + 정상 업로드 → TV 슬라이드) | 리드 또는 오너(관리자 화면) | 관리자 로그인 | 버킷 거절 3·성공 1·TV 캡처 |
| P1 | 어문 보류분: **store 파일 248건**(StoreDashboard·NuriPosLedger 등, 해요체 포함) · **서버 문구 112건**(마이그레이션) · manual.html 44 · tdaRules 24(tda-assist 재배포 결합) | store-team(Opus/Sonnet) · 서버는 리드 마이그레이션 | 병렬 편집 파일 병합 끝 | 해요체 잔여 0 · e2e 문구 결합 testid 교체 |
| P1 | 클락 한글 라벨 '리바이'→'리바인'(보드 영문 Rebuy 유지) | store-team(Sonnet) | 어문 store 묶음과 같이 | 문구 계약 |
| P1 | **used_for 잔존**: 바인 취소로 active 복원된 이용권의 used_for 가 남음 | store-team(Opus) + 리드(DB) | 리허설 | 복원 5경로 후 used_for NULL |
| P1 | **W-11 순위표 팀 합산**(venue_rankings 팀 칸 · save_venue_rankings) — 클락 페이지는 완료 | store-team(Opus) + 리드(DB) | 설계(팀 2인·점수표) | 깐부 포스터 1st 14… 재현 |
| P1 | TV 화면 **날짜·제목 크게·진행시간 "3시간 38분"·고급 테마**(오너 선택 6항목 중 미구현) | home-team(Opus/high) + design-reviewer | PLAN-AB-exec §5-1 | TV 1920·1280·4K 실측 |
| P1 | 클락 '/' 구분자 대비 2.1~2.7 → 4.5:1 | home-team(Opus) | F 점검 묶음 | 대비 실측 |
| P1 | **매장 바인왕 보드 재설계**(venue_player_counts 공개 분기 — 가입 회원 닉네임, 미가입 장부 이름 비공개) | 리드 설계 → store-team + 리드(DB) | 오너 Q3 | 로티 관리 4행 → 공개 행 정의대로 |
| P1 | **AGENTS.md 51행** "Tailwind CSS v3.4 (tailwind.config.js)" → v4 | 리드 | 편집 범위 지정 | diff |
| P2 | SPOT: 앞자리 상대 경고(Q2) · spot-review AI 에 두 스택 전달(logic.ts:53) · ICM 색 경계 반올림 · 아웃 0%/0.3% · quizCards.tsx:112 주석 | gto-team(Opus/Sonnet) | — | 테스트 |
| P2 | #51 잔여: R1 flex gap 부모(IntegratedSearchBar:437·AdminTab:324) · D3 맨 위 밀림 · D4 · D5 | home-team(Opus/high) | — | 곡선 하네스 |
| P2 | 상세 포스터 로드 CLS 0.03~0.06(틀 높이 미예약) · '시작' 칸 320 여유 9.42px · 벚꽃 해질녘 첫 페이드 3프레임 | home-team | — | 실측 |
| P2 | KW-4 후속: presetFromClockConfig extraPages · `_mockOwner` clock_ads 라우트 · PRIZE_ROWS_MAX 편집기 미사용 | store-team | — | e2e |
| P2 | 20260930f 경미: is_account_active 15분 fail-closed | 리드 판단 | — | — |
| P2 | `public/legal/*.html` 폰트 family 'Pretendard Variable' 결함(gen-legal.mjs) | home-team | 가이드 단계와 묶기 | 계약 테스트 |
| P2 | can_manage_pos 계열 정책 잔여(venues_update 등 owner_id 직접) — 20260930d 범위 밖 | 리드 + critical | 전이 폐쇄 표 | — |
| 마지막 | **가이드·소개·PDF**: 사진 재촬영(`CAPTURE_GUIDE=1`) → §2-9 목록 1~5 처리(특히 manual 푸터 법정 고지) → 병합 → owner.pdf 재생성 | home-team(Opus/high) + design-reviewer | **모든 작업 + 디자인 승인분 구현 끝** | 캡처·CLS·PDF |
| 범위 밖 | 디자인 개선안 **E(앱 점검)·F(전후 이미지 개선안 문서)** — 규칙집 근거로 | 다음 세션 | 규칙집 D 완료 | Google Docs(이미지 포함), 항목마다 고정 번호+After |
| 범위 밖 | 오너 승인 항목 구현(B2 작업트리 재사용 가능) | 도메인 팀(Opus/high) | 오너가 번호 지정 | After 픽셀 대조 + 오류 0 |
| B | 시드 포스터 원본 삭제(Q1) · 비밀번호 감액 RPC §E 우회(Q4) · N7 규칙 확인(Q5) | 오너 | — | — |
| B | K1 학습지식서 UX 5부 채워 Google Docs 업로드 | 리드 | 규칙집 | Docs 링크 |
| B | dependabot PR #33(fast-uri 3.1.6→3.1.8) 열려 있음 | 리드 | CI | 병합 여부 |
| 정리 | 워크트리 45개 중 병합 끝난 것 정리(단 **b2-gto-0930·b2-store-0930·guide-0930 은 보존**) | 리드 | 미커밋 변경 없음 확인 | `git worktree list` |

---

## 8. 영상 분석 파이프라인

### 8-0. 목적·범위
오너가 준 UI/UX 레퍼런스 11개 채널(표: scratchpad `uxui/channels.md`) + 지침(`uxui/guideline.md`: Figma 기능 배제·Tailwind 클래스로 해법·DesignCourse/마디아식 조판 강약·8px 리듬·배치 변경엔 NNg 휴리스틱 근거)을 학습해 **누리홀덤 개선안의 근거**를 만든다. 리드 주석: 오너 토큰 매핑의 slate-* 를 그대로 쓰지 말고 **역할(primary/secondary/muted/border)을 우리 토큰**(surface-*·ink-*·accent-*)에 대응, 루트 17px, 남은 제약 3개 우선.

작업 폴더: `C:\Users\buffy\AppData\Local\Temp\claude\C--Users-buffy-OneDrive-----------\a1e61c23-3c36-41fc-b3c2-2b4c31dcd167\scratchpad\uxui\` (⚠ scratchpad — 세션 폴더라 오래 두면 사라질 수 있다. 규칙집 완성 뒤 결과물은 저장소 밖 영구 위치나 Google Docs 로 옮길 것.)

### 8-A. 메타 수집·분류
| 항목 | 내용 |
|---|---|
| 방법 | `yt-dlp --flat-playlist`(pip --user, 2026.08.19) → `meta/<채널>.jsonl` · `getids.py`/`getids2.py` → `ids.json` |
| 분류 | `classify.py` — **제목만** 정규식(제외 키워드·관련 키워드, 둘 다/둘 다 없음 = 보류) → `classify.md`(리드 검토용 전체 목록), `meta/*.classified.json` |
| 수치 | 7,947편 = 관련 **1,402** · 제외 **2,632** · 보류 **3,913** |
| 보정 1 | 보류 → Haiku 재분류(`reclass.jsonl`) — **키워드식이라 부정확 → 폐기**. 보류 3,913 전부 수집하고 무관 여부는 C단계에서 자막으로 판정 |
| 보정 2 | 제외 2,632 → Sonnet 이 제목 직접 재판정(`rescue.jsonl`) → **426편 구제** |
| 함정 | 처음 @UXUIDesign 을 45편으로 오판(실제 1,338 = 영상 878+쇼츠 460) · firecrawl 는 1크레딧/편, 무료 잔여 834 로 불가 |

### 8-B. 자막 수집
| 항목 | 내용 |
|---|---|
| 스크립트 | `subs_run.py`(단일) → `subs_run2.py`(워커 1/2/3 병렬) · `subs_run_extra.py` · `subs_run_rescue.py` |
| 산출 | `subs/<채널>/*.vtt` · `subs/done*.jsonl`(done_1~9) · 진행 로그 `progress.md`·`w1~w9.log`·`subs_run.log` |
| 원칙 | 한국어 원문 자막 우선, 천천히(차단 회피) |
| 경과 | 09-30 10:32 시작 → 관련·구제분 전부 완료 → 보류분 워커 6~9 채널 분할 → **10-01 00:27 오너 지시로 중단** |
| 결과 | **4,819 / 5,741** 수집(러닝 로그 표기 4,816). 미수집 ~925 는 주로 Flux·Jesse 보류분 — 오너: 목록은 문서에 안 적어도 됨, **수집한 것만 제대로 분석** |
| 사고 | 워커4 단독 진행·유휴 `http.server 4190` → 종료 후 재분할 |

### 8-C. 카드화(영상 1편 = 원리 카드 1장)
- 규격: `CARD_SPEC.md` — 카드 머리 `## <id> · <채널> · <제목>`, 관련 예/아니오, 원리 1~5개(각 원리 한 문장 + `[분:초]` 근거 + 분류태그 28종), Before→After 사례, 반대·조건, 누리홀덤 적용 후보(모바일 390 / PC 1440, 추측 표시). 자막에 없는 내용 금지. Tailwind v4 이름·저장소 토큰(오너 09-30).
- **1차 실패**: Sonnet 서브에이전트 4병렬(b001-003·b004-006·b027-029·b048-050, 40편 배치) → **autocompact thrash**. 원인: CLI 2.1.280 이 `claude-sonnet-5-5` 를 모델 목록에서 몰라 **200k 창으로 가정**. 203편 카드 건짐(`cards/b*.md` 8파일).
- **재설계**: `mkbatch.py`(vtt → `txt/<id>.txt` 평문·시각 포함·자동자막 반복 제거) → `rebatch.py`/`rebatch2.py <접두사>`(카드 있는 영상 제외, **30초 문단 압축 `txt2/`**, 크기 기준 **≤110KB·≤10편** 배치 `batches2/`, 접두사로 기존 카드 파일명 충돌 방지) → `one.sh <배치>`(**배치당 새 헤드리스 세션** `claude -p --model sonnet --permission-mode acceptEdits --allowedTools Read Write Glob --output-format json`, 카드 수 = id 수 검증, 1회 재시도, 결과 `runlog/done.txt`) → 4~5병렬 백그라운드.
- 배치별 현황(작성 시점):

| 접두사 | 배치 | 영상 | 카드 | 비고 |
|---|---|---|---|---|
| b | (1차) | — | 203 | 서브에이전트 파일럿 |
| c | 284 | 1,865 | 1,865 | 완료. c051 'FAIL' 은 7/7 로 실제 정상(검증식 오판) |
| d | 44 | 343 | 343 | 수집 증가분 |
| e | 75 | 579 | 579 | 추가 수집분 |
| f | 220 | 1,812 | **609 (진행 중)** | 10-01 00:27 이후 남은 수집분, 5병렬. f053·f057 FAIL 기록(재시도 필요 여부 확인) |
| 합 | | 4,802 txt | 유니크 **3,599** | f 완료 시 ~4,800 |

- 헤드리스 495회 전부 `claude-sonnet-5-5`(§6).
- **교훈**: 대량 문서 처리는 에이전트 1개에 몰지 말고 **새 세션 단위로 쪼갠다** · 이 CLI 판에서 sonnet-5-5 는 200k 창 · 결과 검증은 개수 대조(카드 수 = id 수)로.

### 8-D. 규칙집 (진행 중)
| 단계 | 파일 | 내용 | 상태 |
|---|---|---|---|
| D1 | `d1_extract.py` | 카드 전부에서 '관련: 예' 영상의 원리 줄(`[분:초]` 포함)만 뽑아 **주 태그(첫 태그)별** `rules/in/<태그>_<n>.txt`(≤900줄 조각), 한 줄 = `영상id\|채널\| 원리 [분:초] #태그` · `rules/stat.json` | **시험 실행만**(10-01 00:53, f 카드 완료 전): 영상 3,527 · 관련 2,040 · 원리 15,135 · 조각 33 |
| D2 | `d2.sh <조각>` + `RULE_SPEC.md` | 헤드리스 **Opus**(`--model opus`)가 조각을 규칙으로 합침: `### R-<태그>-<번호> 명령형 규칙` · 근거 수(영상 n·채널 m) · 대표 근거 3개 · 적용 조건/예외(충돌 양쪽) · NNg 휴리스틱 · Tailwind v4 · 누리홀덤 적용 지점. 단일 근거는 목록으로. 2회 시도, `runlog/d2.txt` | 미실행(`rules/out/` 없음) |
| D3 | (미작성) | 같은 태그의 조각 결과를 태그 장 하나로 병합(규칙 번호 재정렬·중복 합치기) | 대기 |
| D4 | (미작성) | 규칙집 조립(태그 장 + 교차 규칙 + 근거 색인) | 대기 |

stat 의 태그 분포(시험 실행): 기타 3,683 · 타이포 1,071 · 위계 880 · 색 803 · 레이아웃 764 · 사용성 718 · 여백 667 · 모션 632 · 디자인시스템 603 · 카드 575 · 버튼 551 · 내비 537 · 대비 456 · 리서치 439 · 폼 429 · IA 315 · 그리드 308 · 반응형 292 · 카피 281 · 모바일 272 · 마이크로인터랙션 267 · 접근성 153 · 표·데이터 113 · 온보딩 97 · 오류 85 · 탭 75 · 대시보드 43 · 빈상태 26.
⚠ **'기타' 가 24%(3,683)** — 첫 태그가 목록 밖이면 기타로 떨어진다. D2 에서 기타 조각 5개는 다른 태그로 재배치될 수 있으니 D3 병합 때 교차 확인.

### 8-E. 재현 명령 (scratchpad `uxui/` 에서, Git Bash)
```bash
# C: 남은 카드화 — 새 접두사로 재배치 후 배치마다 헤드리스 세션
python rebatch2.py g            # 카드 없는 영상만 txt2 압축 → batches2/g###.json
for b in $(ls batches2 | grep '^g' | sed 's/.json//'); do bash one.sh $b; done   # 병렬은 xargs -P 4
grep -c ok runlog/done.txt; grep FAIL runlog/done.txt
# D1: 원리 추출(카드 전부 완료 뒤 다시)
PYTHONIOENCODING=utf-8 python d1_extract.py && cat rules/stat.json
# D2: 조각마다 Opus
ls rules/in | sed 's/.txt//' | xargs -P 3 -I{} bash d2.sh {}
cat runlog/d2.txt
```
함정: Windows 파이썬 stdin·stdout 은 cp949 — 파일은 `encoding="utf-8"` 로 열고 파이프 대신 파일로(§5-E1) · `one.sh` 의 카드 수 검증 정규식이 11자 id 만 센다 · 헤드리스 결과 JSON `modelUsage` 로 실제 모델 확인 · scratchpad 는 세션 폴더.

### 8-F. 관련 산출물
- Tailwind v4 참고서: `uxui/tailwind4.md`(§2-14).
- 지침: `uxui/guideline.md` · 채널: `uxui/channels.md` · 파일럿: `uxui/pilot1.md`.
- 1차 디자인 문서(요금제 영상 1편 기반, 중간본): §2-13 링크.

### § 규칙집

**2026-10-01 완성 — 리드 nuri-lead 조립**

**전문 위치**(3.1MB, 규칙 1,254개 · 태그 30장): `C:\Users\buffy\OneDrive\바탕 화면\엔에이치홀딩스\누리홀덤\누리홀덤_규칙집_1001\누리홀덤_UIUX_규칙집_1001.md`
같은 폴더에 `교차충돌_우선순위20.md` · `태그별_장\*.md` 30개. 작업 원본: `C:\Users\buffy\Documents\누리홀덤_영상분석_0930\RULEBOOK.md` · `rules\`
이미지 포함 개선안(22항목 · 라이트/다크 44장): `C:\Users\buffy\OneDrive\바탕 화면\엔에이치홀딩스\누리홀덤\누리홀덤_디자인개선안_1001\개선안.docx`

| 항목 | 값 |
|---|---|
| 입력 | 카드 영상 4802편 · 관련 2633편 · 원리 18400줄 → 조각 53개 |
| 규칙 | 1,254개 · 태그 30장(기타 a·b·c 포함) · 기타 장에서 다른 태그로 표시 194개(규칙집 부록 A 색인) |
| 근거 대조(check_ids.py) | 인용 16,966개 중 입력에 없는 것 25개(0.15%) — 지우지 않고 `⚠근거미확인` 표시 |
| 근거 수 | 규칙마다 '인용 확인(스크립트): 영상 n편 · 채널 m곳(이름)' 줄 = 정확값. 에이전트가 적은 '약 n편' 은 대략값 |
| 모델(관찰) | C 카드: 헤드리스 claude-sonnet-5-5(runlog modelUsage) · D2: Sonnet 5.5 high(CLI 10조각 + 앱 하위 에이전트 43조각) · D3·D4: Opus 5.5 high · Fable 0회 |

**만드는 동안 난 사고(재발 방지)**
1. 헤드리스 Sonnet 이 규칙 파일 대신 생성 스크립트를 짜다 권한에 막혀 16분·결과 0 → 지시문에 "스크립트 금지, Write 로 직접" 추가(리드 기억 feedback_headless_sonnet_script_detour.md).
2. 터미널 CLI(claude -p)가 10-01 02:23 "주간 한도 · 오후 7시 재설정" 으로 전 모델 거부 — 같은 시각 앱 계정은 주간 2%. CLI 로그인이 다른 계정/한도로 보인다. 계정 자동 전환 안 함, 앱 하위 에이전트로 전환.
3. CLI 로 만든 D2 결과 4개(기타_4·5·7·8)가 이어쓰기 표시에서 **중간에 끊겨** 있었다 → Sonnet 으로 처음부터 재작성 후 기타_b·c 재병합. 검사법: 파일 끝 표시 · 머리 선언 수 vs '### R-' 수.
4. 파일이 있다고 끝난 게 아니다(에이전트가 나눠 쓰는 중) — 다음 단계는 **완료 알림 기준**으로만 띄웠다.
5. 조립 스크립트 결함 2건(heads.md 규칙 제목 0개 · 마지막 규칙이 단일 근거 목록까지 셈) — D4 가 발견, 고쳐 재실행.

#### 2. 누리홀덤 우선 점검 규칙 20개

고른 기준: ① 제목 줄의 **정확한 근거 수**(많은 순, 위 결함 의심값 제외) ② 채널 3곳 이상(예외는 표시) ③ 적용 지점이 누리홀덤의 두 판(모바일 390 일반 탭 / PC 1440 내 매장)에 **화면에서 점검 가능한 모양**으로 걸리는가 ④ 저장소에 남은 동작 계약 테스트(대비 AA·44px)와 직결되는가.
'제약 충돌' = 남은 제약 3개와 부딪칠 수 있어 옮길 때 범위를 좁혀야 하는 규칙.

| 순위 | 규칙 | 근거(정확값) | 주 적용 지점(추측) | 한 줄 이유 | 제약 충돌 |
|---|---|---|---|---|---|
| 1 | R-위계-03 이유를 댈 수 없는 장식·시각 잡음부터 걷는다 | 38편 · 5곳 | 모바일 커뮤니티·프로필 · PC 내 매장 | 근거 상위. 잘린 조각·중복 표시 같은 잡음이 실제로 있다(M-11·M-12) | **제약 충돌(③ 보존·① 법적 고지)** — 표시 약화·접기만(X-08) |
| 2 | R-버튼-05 모서리 반경은 한 방식으로 통일 | 38편 · 6곳 | 전역 버튼·칩·입력 | 저장소 반경 토큰이 6종(`rounded-input` 827곳 · `badge` 283 · `aura` 261 · `card` 151 · `chip` · `dialog`)이라 한 화면 안 혼재를 점검할 만하다 | 없음 |
| 3 | R-사용성-03 더하기 전에 목표 기여를 묻고 중복 정보·같은 기능 버튼을 덜어낸다 | 37편 · 6곳 | PC 장부 · 모바일 프로필 | 같은 숫자 두 번(P-02), 같은 칭호 두 번(M-11)이 실제로 있었다 | **제약 충돌(③ 보존)** — 중복 '표시' 만 덜기 |
| 4 | R-버튼-02 터치 버튼 높이 44 이상, 인접 대상과 띄운다 | 34편 · 4곳 | 모바일 동의·글쓰기·법정 푸터 | 44px 히트영역 계약 테스트의 직접 근거. `h-11`=46.75px 함정 | 없음(M-05 는 법정 푸터 문구 그대로, 누름만 키움) |
| 5 | R-레이아웃-01 한 영역의 정렬 기준선은 하나 | 34편 · 3곳 | 모바일 카드·목록 · PC 조작판 | 좌·가운데 정렬이 한 영역에 섞이는지는 화면에서 바로 잰다 | 없음 |
| 6 | R-폼-01 입력칸은 테두리·배경 차로 영역을 보이게 | 33편 · 4곳 | 모바일 글쓰기·검색 · PC 장부·설정 입력 | 다크 기본 테마에서 입력칸 경계가 묻히기 쉽다. 3절 Border 줄과 직결 | 없음 |
| 7 | R-레이아웃-03 읽는 글·목록·길이가 변하는 텍스트는 좌측 정렬 | 33편 · 5곳 | 모바일 커뮤니티 본문·일정 목록 | 가운데 정렬 남용 여부를 탭마다 점검 | 없음 |
| 8 | R-타이포-01 최소 글자 크기(12px 이하는 부가정보, 10px 이하 금지) | 30편 · 4곳 | 모바일 전 탭 · PC 클락 조작판 | `text-2xs`(11.69px) 2285곳과 9px 임의값이 선에 걸린다(X-03) | 없음(법정 푸터 글자를 줄이는 근거로 쓰지 않는다) |
| 9 | R-위계-12 구분선·박스·회색 단은 덜 쓰고 연하게, 경계가 애매한 곳만 확실히 | 30편 · 3곳 | PC 내 매장(상자·띠) | 상자·테두리 겹침이 PC 여러 화면에 있다 | 없음 |
| 10 | R-레이아웃-08 이미 여백·선·면으로 나눴으면 또 감싸지 않는다 | 30편 · 3곳 | PC 라이브 바·필터·운영 가이드 띠 | 개선안 P-03·P-07·P-09 가 이 규칙으로 상자를 걷었다 | 없음 |
| 11 | R-여백-01 관련은 좁게, 다른 묶음과는 더 넓게(근접성) | 29편 · 6곳 | 모바일 카드 안 · PC 문맥 줄 | 빈 칸이 묶음을 끊는 결함(P-05 179px)이 실제로 있었다 | 없음 |
| 12 | R-위계-02 가장 궁금한 값(가격·총액)을 가장 크고 먼저 | 29편 · **2곳** | 모바일 일정 상세 · PC 장부 | 채널은 2곳뿐이지만 참가비·GTD 가 첫 화면에 오는지가 일정 상세의 핵심 | **제약 충돌(§28)** — 참가비(바이인)·GTD·프라이즈풀은 가격 정보라 키워도 되지만, 상금·수익·이용권 환금 프레이밍의 금액은 키우지도 표시하지도 않는다 |
| 13 | R-카드-03 카드 안에 카드·회색 박스를 또 넣지 않는다 | 29편 · 4곳 | PC 정산·대시보드 · 모바일 상세 | 상자 안 상자는 PC 쪽에서 반복되는 부류 | 없음 |
| 14 | R-여백-04 같은 역할의 간격은 한 값으로, 전 화면에서 | 29편 · 5곳 | 전역(`gap-card-gap`·`px-page-x`·`py-section`) | 간격 토큰이 있는데 임의값이 섞였는지 점검 | 없음 |
| 15 | R-버튼-04 누르는 것은 버튼처럼, 안 눌리는 것은 버튼처럼 만들지 않는다 | 27편 · 5곳 | 모바일 배지·칩 · PC 띠 | 누르지 않는 배지가 칩 모양인 곳, 누르는 필터가 탭처럼 보이는 곳(P-07) | 없음 |
| 16 | R-대비-04 흐린 회색은 보조 글자·날짜에도 기준 아래로 X | 24편 · 4곳 | 모바일 날짜 레일·캘린더 | 불투명도로 흐린 글자가 AA 를 뚫는다(X-04) | 없음 |
| 17 | R-위계-18 선택 상태는 하나만 분명히, 너무 세서 나머지가 비활성처럼 보이지 않게 | 22편 · 6곳 | 모바일 알림·커뮤니티 칩 · PC 사이드바·레일 | 채움 알약이 한 화면에 여럿 켜지는 문제의 조정 규칙(X-06) | 없음 |
| 18 | R-색-01 포인트색은 꼭 필요한 한두 군데에만 | 21편 · 6곳 | 모바일 알림·칩 | 바이올렛 채움이 동시에 여러 곳 | 없음(금액을 '더 튀게' 할 때는 §28 범위 안에서만 — 색 장 머리) |
| 19 | R-대비-02 색·회색 배경 위에 중간 톤 글자 금지 | 20편 · 5곳 | 모바일 배지·틴트 칩 | 틴트 면 위 중간 톤 글자가 라이트에서 무너진다(M-01 1.87:1) | 없음 |
| 20 | R-대비-03 읽을 글자 4.5:1(큰 글자 3:1), 도구로 확인 | 14편 · 5곳 | 전 화면 · 라이트 모드 | 근거 수는 낮지만 **대비 AA 계약 테스트의 직접 근거**라 넣었다. 라이트는 실제 지면 `surface-base` 로 잰다 | 없음 |

##### 20위 밖으로 보류한 강한 규칙(이유)

| 규칙 | 근거 | 보류 이유 |
|---|---|---|
| R-사용성-02 예쁨보다 사용성, '왜'를 댈 수 없는 장식은 넣지 않는다 | 40편 · 8곳 | 1위 R-위계-03 과 같은 점검으로 흡수(원리 수준) |
| R-기타b-02(→위계) 과대한 요소는 한 단계 줄인다 | 40편 · 2곳 | 채널 2곳(madia·jesse). X-05 로 조건만 정리 |
| R-기타b-01(→대비) 선을 없앤다 · R-기타b-07(→타이포) · R-기타b-05(→타이포) · R-기타b-06(→카드) · R-기타b-11(→대비) · R-기타b-04(→색) · R-기타b-08(→디자인시스템) · R-기타b-03(잔류) | 31~43편 · 1~2곳 | **단일(또는 2) 채널 madia** — 근거 수는 크지만 한 채널 편향. 같은 뜻의 다채널 규칙(R-위계-12·R-대비-04·R-카드-03 등)을 대신 넣었다 |
| R-모션-02 스태거 · R-모션-01 선형 금지 · R-모션-03 수치로 정의 | 33~36편 | 저장소 이징 유틸이 전부 같은 비선형 곡선이고 시간 토큰(`--dur-*`)이 이미 있어 대부분 충족. 매일 쓰는 앱 화면에 스태거는 우선도 낮음 |
| R-레이아웃-04 구조 먼저, 색은 나중 · R-레이아웃-02 걷어낸다 | 35편 · 34편 | 레이아웃-04 는 작업 순서(방법론)라 화면 점검 대상이 아님. 레이아웃-02 는 1위와 같은 묶음 |
| R-여백-09 여백의 양이 인상을 정한다 | 31편 · 5곳 | 인상 원리. X-01 로 조건만 |
| R-사용성-01 관례를 따른다 · R-여백-02 넉넉하게 시작 · R-카피-02 첫 화면 한 문장 가치 제안 · R-리서치-01 | 27~28편 | 사용성-01·리서치-01 은 원리/방법론, 여백-02 는 X-01 조건, 카피-02 는 앱 탭보다 랜딩 성격 |
| R-버튼-01 채움 버튼 하나 | 21편 · 5곳 | R-위계-18(17위)이 이 충돌을 조정하는 규칙이라 그쪽을 넣었다. 21위 후보 |

---

#### 1. 태그를 넘는 충돌 (23건)

각 장 안의 충돌은 장 끝 '충돌' 절에 이미 있으므로 뺐다. 여기는 **서로 다른 태그 장의 규칙끼리** 반대 방향인 것만 적는다. 기타 규칙은 매핑된 태그로 판단했다. '가르는 조건' 은 누리홀덤에 옮길 때의 판단 기준이며 추측이다.

| # | 한쪽 | 반대쪽 | 무엇이 부딪히나 | 가르는 조건(누리홀덤) |
|---|---|---|---|---|
| X-01 | **여백** R-여백-02 넉넉하게 시작해 줄인다(28편·3곳) · R-여백-09 넉넉하면 고급·집중(31편·5곳) | **레이아웃** R-레이아웃-32 큰 화면(PC)은 정보 밀도를 살린다(15편·6곳) · **위계** R-기타a-31 정보 중심 화면은 과대 요소를 줄여 더 많이(5편·1곳) | 빈 공간 vs 정보 밀도 | 모바일 390 일반 탭(읽기·탐색)은 여백 쪽. PC 1440 내 매장 장부·클락 조작판은 밀도 쪽. P-02·P-03·P-04·P-09 가 모두 밀도 쪽을 골랐다 |
| X-02 | **위계** R-위계-01 크기 큰·중·작, 강조는 색보다 크기·굵기로(19편·4곳) | **타이포** R-기타b-05 위계는 크기보다 굵기·색 대비로(36편·2곳) | 위계 수단: 크기 vs 굵기·색 | 화면 제목 단위는 크기. 폭이 좁은 모바일 카드·목록 행 안은 굵기·색(더 키울 자리가 없다) |
| X-03 | **타이포** R-타이포-01 12px 이하는 날짜·푸터·배지 같은 부가정보에만(30편·4곳) · R-기타b-07 배지·메타만 예외(38편·1곳) | **접근성** R-접근성-07 본문·보조 글자를 12px 이하로 두지 말 것(11편·3곳) · **대비** R-대비-15 읽을 글자는 12~13px 아래로 내리지 않는다(17편·4곳) | 12px 미만 부가정보 허용 vs 금지 | 저장소 `text-2xs`=11.69px 가 2285곳이라 바로 걸린다. 배지·메타 한정 허용 여부는 오너 결정. 10px 이하는 양쪽 모두 금지(M-10·P-06 이 9px 를 올림) |
| X-04 | **위계** R-위계-06 덜 중요한 요소는 색·크기·불투명도를 낮춘다(16편·5곳) · R-기타c-02 메타는 작고 저대비로(28편·4곳) | **대비** R-대비-04 흐린 회색은 보조 글자·날짜에도 기준 아래로 X(24편·4곳) · **접근성** R-접근성-02 #767676 보다 연한 회색 금지(19편·4곳) · **색** R-색-51 불투명도와 색값을 섞지 않는다(9편·3곳) | 위계용 흐림 vs 읽힘 하한 | 흐리게 하되 4.5:1 아래로 내리지 않는다. 불투명도(`/60`·`opacity-35`)가 하한을 뚫는 주범(M-02·M-03 실측). 표·데이터 C-11(다른 달 날짜 #999)도 같은 충돌 |
| X-05 | **버튼** R-버튼-02 터치 버튼 높이 44 이상(34편·4곳) · **접근성** R-접근성-03 44px 안팎(16편·5곳) | **위계** R-기타b-02 과대한 버튼·아이콘은 한 단계 줄인다(40편·2곳) · **모바일** R-모바일-25 헤더는 낮게·로고 줄이기(6편·2곳) | 누름 크기 vs 보이는 크기 | 해법은 이미 있다: **R-내비-23**(아이콘 크기와 터치 영역은 따로)·**R-기타a-64**(→사용성). 보이는 것은 줄이고 누름은 `.tap-y-44`·`min-h-[44px]`(P-03·P-09 방식). 헤더 아이콘 가로 44 는 리드 결정(D4 2026-09-29)으로 닫힘 |
| X-06 | **버튼** R-버튼-01 한 영역의 채움 버튼은 하나(21편·5곳) · **위계** R-위계-08 주 행동 하나만 채움(22편·5곳) | **탭** R-탭-01 선택 탭은 면(채움)(18편·3곳) · R-탭-07 필터 칩 선택=채움(8편·4곳) | 채움 하나 vs 선택 표시는 채움 | 조정 규칙 **R-위계-18**(선택 표시는 하나만, 너무 세지 않게). 상위 탭·하위 필터·CTA 가 한 화면이면 하위는 틴트(M-06 권장). 탭 줄이 혼자면 채움 유지. M-07 은 이 충돌로 '조건부' |
| X-07 | **위계** R-위계-04 1순위만 강하게, 나머지는 힘을 뺀다(22편·5곳) · **색** R-색-23 나머지는 죽이거나 딤(18편·3곳) | **탭** R-탭-04 비선택을 비활성처럼 흐리게 X(14편·1곳) · R-기타b-32(→탭) 선택 안 된 쪽을 회색으로 죽이지 않는다(17편·1곳) | 나머지 죽이기 vs 비선택은 눌러야 하는 것 | 탭·칩 줄 안에서는 비선택도 `text-ink-secondary` 이상. 죽이는 대상은 장식·보조 정보이지 누를 수 있는 선택지가 아니다 |
| X-08 | **사용성** R-사용성-03 중복·잡음 덜어내기(37편·6곳) · **위계** R-위계-03 장식·잡음부터 걷기(38편·5곳) · **레이아웃** R-레이아웃-02 걷어낸다(34편·7곳) · **IA** R-IA-01 코너를 덜어낸다(6편·3곳) | **IA** R-IA-13 필수 항목을 빼지 말고 구조·순서만 바꾼다(6편·2곳) · **카피** R-카피-21 줄이면 위험한 정보(규제·금액)는 줄이지 않는다(7편·3곳) · **레이아웃** R-기타b-58 푸터를 가볍게 하되 법적 필수 정보는 남긴다(8편·1곳) + 제약 ①③ | 삭제 vs 보존 | 덜어내기는 **표시 약화·접기·순서 조정**으로만 옮긴다. 기능·화면·법적 고지를 지우는 근거로 쓰지 않는다. M-11(칭호 칩)은 같은 말 두 번 표시만 지워 기능 손실 없음 |
| X-09 | **레이아웃** R-레이아웃-05 넓은 화면은 max-width 컨테이너 가운데(26편·5곳) · **반응형** R-반응형-06 최대 폭 컨테이너(12편·6곳) | **대시보드** R-대시보드-01 컨테이너에 가두지 않고 화면을 채운다(5편·3곳) | 가두기 vs 채우기 | 조정 규칙 **R-기타b-36**(→레이아웃: 읽기 화면은 제한, 표·대시보드는 넓게). 모바일·PC 일반 탭은 레이아웃-05, PC 1440 내 매장 대시보드·장부는 대시보드-01 |
| X-10 | **모바일** R-모바일-03 가장 작은 폭을 기본으로 CSS(10편·4곳) | **대시보드** R-대시보드-01 기준 해상도로 여백·컨트롤 크기를 정한다 · **반응형** R-반응형-09 큰 화면은 따로 설계(10편·4곳) | 모바일 기본값 vs PC 기준 설계 | 조정 규칙 **R-기타c-64**(→반응형: 유저 탭은 390, 내 매장은 1440 먼저). 코드는 모바일 기본 + `lg:` 덧붙임, 설계 기준 폭은 내 매장 1440. P-02~P-09 가 이 절충(`lg:` 만 추가) |
| X-11 | **대비** R-대비-01 이미지 위 글자는 글자 쪽 검정 그라디언트(18편·4곳) · R-기타a-02·R-기타b-19·R-기타c-07(→대비) | **색** R-색-50 이미지를 보여 주고 고르게 하는 화면은 딤·그라디언트를 깔지 않는다(7편·3곳) · **기타(잔류)** R-기타b-48 덮지 말고 글자를 이미지 밖으로(13편·1곳) | 막을 깔까 vs 글자를 뺄까 | 대회 포스터처럼 **이미지에 글자가 인쇄된 상품 이미지**는 덮지 않고 정보를 밖으로(M-08 방향). 앱이 글자를 얹는 홈 배너는 그라디언트 |
| X-12 | **표·데이터** R-표·데이터-01 연한 1px 선·줄무늬(17편·5곳) · **폼** R-폼-01 입력칸은 테두리·배경 차로 보이게(33편·4곳) | **대비** R-기타b-01 여백·면으로 되면 선을 없앤다(43편·1곳) · **여백** R-여백-08 선보다 여백으로 먼저(21편·6곳) | 선 유지 vs 제거 | 표(장부·순위)와 입력칸은 선 유지. 카드·섹션 사이는 면·여백. 맨 `border` 는 `#e5e7eb` 라 쓰면 `border-border-*` 색을 같이 |
| X-13 | **디자인시스템** R-디자인시스템-05 같은 역할은 기기가 달라도 같은 값(17편·5곳) | **모바일** R-모바일-02 축소가 아니라 재구성(13편·5곳) · R-모바일-14 큰 제목은 데스크톱보다 줄인다(7편·4곳) · **반응형** R-반응형-22 작은 화면은 제목·패딩을 단계적으로 줄인다(11편·3곳) | 값 일관 vs 기기별 재구성 | 역할 토큰(색·`.t-*` 글자 역할·반경)은 같게, **배치·양·순서·제목 크기**만 기기별로 |
| X-14 | **반응형** R-반응형-01 고정 px 대신 유동 폭(13편·5곳) | **표·데이터** R-표·데이터-04 최대 자릿수로 자리를 먼저 잡는다(9편·1곳) · **카드** R-카드-44 금액 자리는 최대 길이 정책 먼저(5편·1곳) | 유동 vs 고정 자리 | 컨테이너 폭은 유동, **숫자 칸·클락 값 칸은 최대 자릿수로 고정**. P-01(클락 미리보기 겹침)은 고정 자리 하한이 누적된 부류 |
| X-15 | **카피** R-카피-01 글은 짧게(27편·5곳) | **오류** R-오류-01 문제 + 해결 방법을 함께(12편·6곳) · **폼** R-폼-30 필수 안내는 입력 전 상시 노출(7편·3곳) | 짧게 vs 완결 | 오류·법적 안내·금액(참가비·GTD) 안내는 길이보다 완결. 짧게는 버튼·라벨·제목에 |
| X-16 | **카피** R-카피-11 자명한 라벨·설명은 지운다(16편·4곳) · R-기타b-49(→카피) 중복 문구는 한 번만(10편·1곳) | **폼** R-폼-02 모든 입력칸에 항상 보이는 라벨(19편·3곳) · **사용성** R-사용성-16 아이콘엔 글자 라벨(19편·6곳) · **접근성** R-접근성-05 아이콘 라벨·접근 이름(10편·4곳) | 라벨 삭제 vs 라벨 필수 | 입력칸 라벨·아이콘 접근 이름은 남기고, 같은 말을 두 번 하는 설명 문구만 지운다 |
| X-17 | **마이크로인터랙션** R-마이크로인터랙션-08 hover 로 보조 정보·액션을 드러낸다(12편·4곳) · **모션** R-모션-44 부가 정보는 hover/선택 때만(4편·2곳) | **사용성** R-사용성-05 기억 말고 화면에서 알아보게(27편·4곳) · **모바일** R-모바일-18 hover 로만 보이던 정보는 처음부터 보이게(8편·4곳) · **대비** R-대비-17 호버해야만 읽히는 글자는 결함(8편·2곳) | hover 로 숨김 vs 늘 보이게 | 저장소 `hover:` 는 정밀 포인터에서만 켜진다 → 모바일 390 에선 영영 안 보인다. PC 내 매장의 보조 정보에만 |
| X-18 | **마이크로인터랙션** R-마이크로인터랙션-03 상태 전환은 0.2~0.3초로 보간(12편·5곳) · **모션** R-모션-06 상태 변화는 짧은 transition 으로(20편·4곳) | **탭** R-탭-15 자주 쓰는 메인 내비·세그먼트는 즉시 전환(27편 — 장 마지막 줄 결함 의심값) · **버튼** R-버튼-40 hover 는 '즉시' 또는 300ms 중 하나로 통일(3편·2곳) | 보간 vs 즉시 | 하단 탭·세그먼트 전환은 즉시(탭 keep-alive 로 재방문마다 재생되는 깜빡임 부류와도 맞물림). 색·선택 표시 변화는 짧은 보간(`--dur-fast .15s`) |
| X-19 | **접근성** R-접근성-14 자동 슬라이드엔 정지, 드래그만 X·화살표 필수(6편·1곳) · **내비** R-내비-04 화살표·점·스와이프(22편·5곳) | **기타(잔류)** R-기타a-38 PC 는 화살표, 모바일은 스와이프+인디케이터(13편·2곳) · **모바일** R-모바일-10 다음 카드 peek + 점(14편·7곳) | 모바일 화살표 필수 vs 스와이프+점 | 모바일 홈 배너는 peek + 점 인디케이터, 자동으로 흐르면 정지 수단(R-내비-53). PC 는 화살표 |
| X-20 | **카드** R-카드-02 그림자는 거의 안 보이게 한 값으로(23편·6곳) · **색** R-색-06 있는 듯 없는 듯(26편·3곳) | **기타(잔류)** R-기타b-03 대부분 빼고 면색·여백으로(31편·1곳) · R-기타b-43 그림자는 떠 있는 것에만(12편·1곳) | 옅게 쓰기 vs 빼기 | 저장소 `shadow-card` 는 그림자가 아니라 1px 링, box-shadow 는 합쳐지지 않는다(`.card-aura`·LED 와 덮어씀). 목록 안 카드는 면색 층, 시트·하단 바처럼 떠 있는 것만 그림자 |
| X-21 | **빈상태** R-빈상태-03 비어 보이지 않게 추천·다른 콘텐츠로 채운다(5편·5곳) | **대시보드** R-대시보드-02 요청하지 않은 요소는 더하지 않는다(6편·3곳) · **레이아웃** R-레이아웃-02 걷어낸다 | 채우기 vs 덜기 | 0건·첫 사용 상태에만 채운다. 데이터가 있는 평상 화면에 채우기 논리를 쓰지 않는다 |
| X-22 | **내비** R-내비-02 폭이 되면 햄버거로 숨기지 말고, 모바일에서도 핵심 1~3개는 밖에(21편·3곳) · R-내비-15 모바일 주요 목적지는 하단 탭바(14편·5곳) | **반응형** R-반응형-24 자리가 모자라면 폰에서는 햄버거로(8편·3곳) | 노출 vs 접기 | 누리홀덤 모바일은 하단 탭 5개가 이미 주 내비 → 내비-15 쪽. 햄버거는 보조 목적지에만(R-내비-43) |
| X-23 | **폼** R-폼-08 긴 폼은 단계로 나누고 진행을 보인다(14편·5곳) | **사용성** R-사용성-23 목표까지 단계·클릭을 줄인다(13편·5곳) · **온보딩** R-온보딩-08 첫 가치까지 단계를 최소로(6편·4곳) | 단계 쪼개기 vs 단계 줄이기 | 입력 부담이 큰 흐름(가입·본인인증·장부 입력)만 쪼갠다(R-IA-10 도 같은 조건). 정보 없는 중간 화면은 없앤다 |

---

#### 4. 우선 20개 × 개선안(M/P) 대조 — 다음 차수 후보

'있음' = M_items.md · P_items.md 의 '근거 규칙' 칸에 그 번호가 적힌 항목이 있다(권장 판정 함께). '없음' = 두 표 어디에도 그 번호가 없다 → **다음 차수 후보**. '먼저 볼 곳' 은 코드를 보지 않은 추측이다.
(M/P 가 인용한 번호는 모두 heads.md 에 있는 번호임을 확인했다.)

##### 4-1. 대조표

| 순위 | 규칙 | 개선안 | 해당 항목(권장 판정) | 다음 차수 먼저 볼 곳(추측) |
|---|---|---|---|---|
| 1 | R-위계-03 | **있음** | M-11 칭호 칩 중복 제거(조건부) · M-12 전광판 가장자리 페이드(권장) | — |
| 2 | R-버튼-05 | **없음** | — | 한 화면 안에서 `rounded-input`(0.5rem)·`rounded-card`(0.75rem)·`rounded-aura`(1rem)·`rounded-badge`(알약)가 버튼·칩·입력에 섞인 곳. 이웃한 버튼·입력칸의 반경 일치(R-디자인시스템-06) |
| 3 | R-사용성-03 | **있음** | M-11(조건부) | — (P-02 는 같은 문제를 R-위계-40 으로 인용) |
| 4 | R-버튼-02 | **있음** | M-04 동의 게이트 44(권장) · M-05 법정 푸터 링크 44(권장) · M-09 글쓰기 시트 44(권장) | — (360px 재측정은 M 문서가 NOT_RUN) |
| 5 | R-레이아웃-01 | **없음** | — | 모바일 일정 카드·게시글 행에서 좌/가운데 정렬 혼재, PC 클락 조작판·대시보드 카드의 시작선 |
| 6 | R-폼-01 | **없음** | — | 다크 기본 테마의 입력칸 경계(글쓰기 제목·검색·장부 날짜·매장 설정). 3절 16행과 함께 |
| 7 | R-레이아웃-03 | **없음** | — | 모바일 커뮤니티 본문·공지·빈 상태 문구의 가운데 정렬 사용처 |
| 8 | R-타이포-01 | **있음** | M-10 홈 날짜 칩 요일 9→11.69px(조건부) · P-06 클락 조작판 라벨 9→12.75px(권장) | — (남은 `text-2xs` 자리의 허용 범위는 X-03 오너 결정) |
| 9 | R-위계-12 | **없음** | (P-03·P-09 가 비슷한 상자 걷기를 R-레이아웃-08 로 인용) | PC 내 매장의 나머지 회색 단·구분선(정산·순위·매장 설정). 0930 목차 2-3 '정산 상자 안 상자' 와 겹치면 그쪽 결과 먼저 |
| 10 | R-레이아웃-08 | **있음** | P-03 라이브 바 한 줄(권장) · P-07 손님 유형 필터 칩(권장) · P-09 운영 가이드 띠(권장) | — |
| 11 | R-여백-01 | **있음** | P-05 문맥 줄 빈 칸 179→4.2px(권장) | — |
| 12 | R-위계-02 | **있음** | M-08 포스터 높이 65vh→42svh 로 참가비·GTD 를 첫 화면에(조건부) | — (§28 범위 유지) |
| 13 | R-카드-03 | **없음** | — | PC 정산·대시보드·매출 카드 안 박스, 모바일 일정 상세 안 회색 박스. 0930 목차 2-3 과 겹칠 수 있음 |
| 14 | R-여백-04 | **없음** | — | 같은 역할 간격(카드 사이·화면 좌우·섹션 사이)에 토큰(`gap-card-gap`·`px-page-x`·`py-section`) 대신 임의값이 섞인 곳 |
| 15 | R-버튼-04 | **없음** | (P-07 이 '필터가 탭처럼 보이는' 문제를 R-탭-07 로 다룸) | 누르지 않는 배지·칭호가 칩(버튼) 모양인 곳, 누르는 행·카드가 눌리는 단서 없는 곳 |
| 16 | R-대비-04 | **있음** | M-02 주말 요일 불투명도 제거(권장) · M-03 다른 달 날짜(권장) | — |
| 17 | R-위계-18 | **있음** | M-06 알림 패널 하위 필터 틴트(권장) · M-07 커뮤니티 칩 선택=틴트(조건부) | — (X-06 조건 유지) |
| 18 | R-색-01 | **있음** | M-06(권장) | — |
| 19 | R-대비-02 | **있음** | M-01 포스터 위 배지 라이트 대비 1.87→6.93(권장) | — |
| 20 | R-대비-03 | **있음** | M-01(권장) · M-02(권장) · M-03(권장) · M-10(조건부) | — |

##### 4-2. 집계와 읽을 점

- 우선 20개 중 **개선안 있음 12개**(R-위계-03 · R-사용성-03 · R-버튼-02 · R-타이포-01 · R-레이아웃-08 · R-여백-01 · R-위계-02 · R-대비-04 · R-위계-18 · R-색-01 · R-대비-02 · R-대비-03) / **없음 8개 = 다음 차수 후보**(R-버튼-05 · R-레이아웃-01 · R-폼-01 · R-레이아웃-03 · R-위계-12 · R-카드-03 · R-여백-04 · R-버튼-04).
- 있음 12개 중 **P(내 매장 PC)가 다룬 것은 3개**(R-타이포-01 → P-06, R-레이아웃-08 → P-03·P-07·P-09, R-여백-01 → P-05). 나머지 9개는 모두 M(모바일)이다.
- 없는 8개는 성격이 둘로 갈린다(추측):
  - **정렬·간격·반경 일관성 4개**(R-버튼-05 · R-레이아웃-01 · R-레이아웃-03 · R-여백-04) — 화면 한 곳이 아니라 **소비처 전수** 점검이 맞다. 토큰(`rounded-*`·`gap-card-gap`·`px-page-x`)의 사용처를 세는 방식.
  - **경계·상자 3개**(R-위계-12 · R-카드-03 · R-폼-01) — PC 내 매장에 몰려 있다. 0930 목차 2-3(정산 상자 안 상자)의 결과를 먼저 확인하고 겹치지 않는 화면만.
  - R-버튼-04 는 모바일 배지·칩과 PC 띠 양쪽.
- 개선안이 인용했지만 우선 20개 밖인 규칙(예: R-위계-06 · R-위계-09 · R-위계-40 · R-탭-07 · R-대시보드-02 · R-폼-31 · R-타이포-09·10 · R-레이아웃-14·36)은 이 표에 넣지 않았다.

---

#### 3. 오너 지침 대조표 (guideline.md 토큰 매핑)

- 판정: **뒷받침** = 방향과 값이 규칙과 맞음 · **부분** = 방향은 맞으나 값·방식이 어떤 규칙과 어긋남 · **충돌** = 규칙이 반대를 말함 · **근거 없음** = heads.md 에 이 줄을 받치는 규칙이 없음
- px 는 루트 17px 로 계산한 값(rem×17). 실제 렌더는 computed style 로 확인해야 한다. 대비 수치는 Tailwind 표준 slate hex 로 계산한 값이며, 저장소는 slate 대신 토큰을 쓰므로 **토큰 쪽 대비는 실측 필요**.
- 저장소 대응(리드 주석): Primary → `text-ink-primary`, Secondary → `text-ink-secondary`, Muted → `text-ink-muted`, Border → `border-border-subtle/default/strong`, hover → `transition-colors duration-[var(--dur-fast)]` + 터치는 `active:`.

| # | 오너 지침 줄 | 이 저장소 값(17px) | 뒷받침 규칙 | 어긋나는 규칙 · 조건 | 판정 |
|---|---|---|---|---|---|
| 1 | 여백 · `gap-1/1.5` 아이콘-텍스트 | 4.25 / 6.375px | R-여백-22 아이콘과 텍스트는 4~8 로 붙인다(8편·4곳) · R-버튼-25 아이콘+글자는 가깝게 한 덩어리(11편·4곳) | 없음(값이 4~8 안) | 뒷받침 |
| 2 | 여백 · 버튼 compact `px-3 py-1.5` | `text-sm`(줄높이 1.25rem) 기준 높이 약 34px | R-버튼-12 크기 2~3단 변형(24편·5곳) · R-버튼-08 가로 > 세로 패딩(26편·4곳) | **R-버튼-02 · R-접근성-03 44 최소 미달**(34px). 보이는 크기는 두되 누름은 `.tap-y-44`/`min-h-[44px]`(X-05) | 부분 |
| 3 | 여백 · 버튼 기본 `px-4 py-2` | 같은 기준 약 38.25px | R-버튼-08 · R-폼-03 높이 2~3종 통일(21편·4곳) | **R-버튼-02 44 미달**(38.25px). 모바일 390 에선 `min-h-[44px]` 필수 | 부분 |
| 4 | 여백 · 인접 `space-y-2 / gap-3 / space-y-4` | 8.5 / 12.75 / 17px | R-여백-03 4/8 배수 몇 개 값만(21편·4곳) · R-여백-04 같은 역할 한 값(29편·5곳) | 방식: R-여백-14 형제 간격은 부모 gap 한 곳, 자식마다 margin X(18편·4곳) — `space-y-*` 는 자식 margin 방식. 저장소도 허용 목록 밖은 명시도 0 이라 `gap` 을 권한다(tailwind4.md 4-4). 값 2·4 는 허용 목록 안 | 부분 |
| 5 | 여백 · 카드 `p-4`(모바일) / `p-6` / `p-8` | 17 / 25.5 / 34px | R-카드-05 사방 균등·충분히(26편·5곳) · R-여백-07 네 변 같게(23편·4곳) · R-모바일-07 데스크톱 큰 패딩은 모바일에서 줄인다(13편·4곳) | 반대 방향 R-기타b-40(→여백, 카드 디자인은 타이트, 13편·1곳). PC 내 매장 `p-8` 은 X-01(밀도) 조건 | 뒷받침 |
| 6 | 여백 · 섹션 `my-8 / 12 / 16` | 34 / 51 / 68px | R-여백-16 섹션 사이는 크게 띄우되 같은 값 반복(12편·3곳) · R-여백-01 · R-그리드-05 | 저장소 섹션 토큰 `py-section` 은 1.5rem(25.5px)로 오너 값보다 작다 → 둘 중 하나로 통일 필요(R-디자인시스템-03). margin 방식은 R-여백-14 와 어긋남(부모 gap 권장) | 부분 |
| 7 | 타이포 · Display `text-3xl bold tracking-tight md:text-4xl` | 31.875 → 38.25px | 크기: R-타이포-38 첫 화면 제목은 크게(15편·3곳) · R-위계-01. 자간: R-타이포-17 큰 제목은 자간을 음수로 조인다(20편·3곳) · R-타이포-18 한글 약 −2.5%(15편·2곳). 굵기: R-타이포-34 볼드는 화면당 한 곳의 타이틀에만(12편·2곳) | **R-타이포-03 크게 쓰면 굵기를 낮춘다(15편·3곳)와 bold 가 충돌**. 앱 탭에는 Display 자리가 드물다 — R-타이포-12 PC 글자는 과대하기 쉽다(14편·1곳) | 부분 |
| 8 | 타이포 · H1/H2 `text-xl semibold md:text-2xl` | 21.25 → 25.5px | R-타이포-34 세미볼드 주력(12편·2곳) · R-타이포-02 둘 이상의 축(17편·4곳) | R-타이포-06 제목은 본문의 약 1.5~2배 이상(15편·4곳) — 모바일 21.25 ÷ 본문 14.875 = **1.43배**로 미달(PC 25.5 ÷ 17 = 1.5배는 경계) | 부분 |
| 9 | 타이포 · H3 `text-base semibold md:text-lg` | 17 → 19.125px | R-타이포-45 굵기는 두 단계 이상 벌린다(세미볼드 vs 레귤러 본문, 6편·3곳) · R-타이포-02 | R-위계-01 '같은 듯 다른' 비슷한 크기 여럿 금지 — 본문과 1.14배(모바일)·1.125배(PC) 차이뿐. 크기 축이 거의 없고 굵기 한 축에 기댄다 | 부분 |
| 10 | 타이포 · Body `text-sm leading-relaxed md:text-base` | 14.875 → 17px, 행간 162.5% | 크기: R-타이포-08 모바일 본문 14px 이상(18편·4곳) · R-모바일-01 · R-접근성-07 14~16 전후. 행간: R-기타c-10(→타이포) 1.4~1.7(18편·4곳) · R-기타b-73(→타이포) 140% 보다 넓게 | 행간: **R-타이포-05 130~150%(25편·4곳)보다 넓다** · R-기타a-11(→타이포) 130~160% 도 살짝 넘음. 저장소는 `text-sm` 이 줄높이를 싣고 `leading-relaxed` 가 빌드 순서로 이긴다(참고 메모 실측) → computed style 확인 | 부분 |
| 11 | 타이포 · Caption `text-xs muted` | 12.75px, `text-ink-muted` | R-타이포-01 12 초과라 통과 · R-기타a-09(→타이포) 12 밑 금지 통과 · R-타이포-20 글자색 진함·연함·더 연함 3톤(16편·4곳) | 색: **R-대비-04 · R-접근성-02** 선 아래로 가면 안 된다 → `text-ink-muted` 를 실제 지면에서 4.5:1 확인 | 부분 |
| 12 | 타이포 · `md:` 단계 확대(Display·H·H3·Body 공통) | 모바일→`md`(768) 이상 한 단계씩 키움 | R-반응형-30 넓은 화면에선 본문과 여백을 함께 키우되 상한(9편·3곳) · R-기타a-43(→타이포) · R-타이포-27 모바일은 큰 제목만 한 단계 작게(13편·6곳) | 반대: R-타이포-12 PC 글자는 과대하기 쉬우니 줄인다 · R-디자인시스템-05 기기가 달라도 같은 값. 그리고 `md`(768)는 태블릿과 PC 1440 내 매장을 구분하지 않는다(R-반응형-32 태블릿은 별도 구간) | 부분 |
| 13 | 대비 · Primary `text-slate-900 / dark 50` | → `text-ink-primary` | R-대비-02 밝은 배경엔 어두운 글자(20편·5곳) · R-색-27 순흑 대신 near-black(16편·4곳) · R-타이포-20 순검정·순백 피함 | 없음 | 뒷받침 |
| 14 | 대비 · Secondary `slate-600 / 400` | → `text-ink-secondary` | R-대비-03 4.5:1 · R-대비-08 보조는 한 단계 낮춘다(20편·6곳) | 계산값: slate-600/흰 바탕 약 7.6:1, slate-400/slate-900 약 7.0:1 — AA 통과 | 뒷받침 |
| 15 | 대비 · Muted `slate-400 / 500` | → `text-ink-muted` | (위계용 흐림: R-위계-06 · R-기타c-02 → 위계) | **R-접근성-02(#767676 보다 연한 회색은 미달)·R-대비-04·R-대비-03 과 충돌**. 계산값: slate-400(#94A3B8)/흰 바탕 약 2.6:1, slate-500/slate-900 약 3.8:1 — 둘 다 본문 4.5:1 미달. 비활성·장식에만 쓰고 읽을 글자에는 쓰지 않는다(R-색-14 가장 연한 회색은 비활성 전용) | 충돌 |
| 16 | 대비 · Border `slate-200 / 800` | → `border-border-subtle` | R-색-10 1px 저대비 한 가지 색(23편·4곳) · R-카드-20 1px 옅은 저대비(7편·3곳) · R-대비-06 연하고 얇게(21편·3곳) | 입력칸은 R-폼-01 · R-대비-19 칸 경계 대비 확보(8편·3곳) — subtle 로는 부족할 수 있어 입력칸은 `border-border-default` 이상 검토 | 부분 |
| 17 | 대비 · hover `transition-colors duration-150` | → `transition-colors duration-[var(--dur-fast)]`(.15s) | R-버튼-23 호버는 약간만 색 변화(11편·5곳) · R-모션-23 UX 모션 100~500ms(19편·6곳) | R-마이크로인터랙션-03 상태 전환 0.2~0.3초 · R-버튼-40 '즉시' 또는 300ms 중 하나 — 150ms 는 어느 쪽도 아니다. 모바일 390 에선 `hover:` 가 안 켜지므로 `active:` 가 따로 필요(X-17) | 부분 |

집계(17줄): 뒷받침 4줄(1·5·13·14) · 부분 12줄(2·3·4·6·7·8·9·10·11·12·16·17) · 충돌 1줄(15) · **근거 없음 0줄**.
참고: 1판(결함 heads)에서 '근거 없음' 이던 12행(`md:` 확대)과 7행의 `tracking-tight` 는 이번 제목 목록에서 받치는 규칙(R-반응형-30·R-타이포-17)이 나와 '부분' 이 됐다.

---


---

## 9. 다음 세션 시작 절차

### 9-1. 읽을 파일 순서
1. 이 문서(또는 옮겨 적은 `docs/HANDOFF.md`)
2. `.claude/handoff/NURI-SESSION-2026-09-30-RUNLOG.md` — 원본 사건 기록
3. `CLAUDE.md`(**origin/main 판** — 로컬 checkout 은 217커밋 뒤) · `.claude/rules/nuri-team-capabilities.md`(모델 배정 정본, §3 Fable 조건 09-30 갱신)
4. `.claude/agent-memory-local/nuri-lead/MEMORY.md` → `project_owner_decisions_0929.md` · `project_owner_decisions_0930.md` · `feedback_design_owner_picks.md` · `feedback_python_stdin_cp949.md`
5. `.claude/handoff/specs-0930/W-defects.md`(W 결함 — 남은 W-11 순위 합산 등) · `PLAN-AB-exec.md §5-1`(K단계 남은 TV 항목)
6. 반복 실패 정본 `docs/HANDOVER-2026-09-23.md` §0·§5
7. DB 를 만질 때 `.claude/skills/nuri-migration/SKILL.md`, 게이트는 `nuri-ship`·`nuri-e2e`(sitemap 백업·복원)
8. 영상 규칙집을 이어 할 때 scratchpad `uxui/RULE_SPEC.md`·`CARD_SPEC.md`·`runlog/done.txt`

### 9-2. 확인 명령
```bash
cd "C:/Users/buffy/OneDrive/바탕 화면/누리홀덤"
git fetch origin && git rev-parse origin/main            # 기대: faac0e6f… 또는 그 뒤
git rev-list --count HEAD..origin/main                    # 로컬 checkout 이 얼마나 뒤인지(오너 미커밋 파일 주의 — pull 금지)
gh pr list -R buffyfan9303-spec/NURI-HOLDEM --state open --json number,title --jq '.[]|"\(.number) \(.title)"'
gh run list -R buffyfan9303-spec/NURI-HOLDEM --branch main --limit 5 --json headSha,conclusion,workflowName --jq '.[]|"\(.headSha[0:8]) \(.workflowName) \(.conclusion)"'
git worktree list | grep -E "b2-gto-0930|b2-store-0930|guide-0930"      # 보존 대상
git -C .claude/worktrees/b2-store-0930 status --short                   # 미커밋 디자인 변경 살아 있는지
for f in b c d e; do git show origin/main:supabase/migrations/20260930${f}_*.sql 2>/dev/null | head -1; done   # ⏳ 표기 남았는지(경로는 ls-tree 로)
claude auth status; claude --version                     # 로그인·CLI 판
```
Supabase(MCP, 재인증 먼저):
```sql
-- 20260930i 사후 확인(기대: de5cd99d / fad4fc8e / 35e7504a / f1d77776 / eee44d4d 접두)
select proname, left(md5(prosrc),8) from pg_proc
 where proname in ('approve_buyin_request','_ledger_buyins_addon_request_guard',
                   '_ledger_buyin_addon_rule','_ledger_buyins_addon_voucher_restore','_ledger_buyins_client_guard');
-- 20260930h 이후 contains_blocked_ugc 실행 권한이 authenticated 에 남아 있는지(회수하면 업주 클락 저장이 막힌다)
select p.oid::regprocedure, has_function_privilege('authenticated', p.oid, 'execute')
  from pg_proc p where p.proname = 'contains_blocked_ugc';
```
(proname 목록은 20260930i 파일 머리 '적용 전 확인 ①' 그대로다.) 이어서 `get_advisors`(security) 1회.

### 9-3. 도구·설정 상태(09-30 기준)
| 항목 | 상태 |
|---|---|
| MCP 끔(이 프로젝트만) | Slack·Figma·Linear·Notion·Asana·Jira·Intercom·Monday·ClickUp·Base44·Gmail·Google 캘린더(백업 scratchpad `claude.json.bak`). Google Drive 는 오너 요청으로 **다시 켬** |
| Sentry MCP | user 범위 등록 · 오너 로그인 · 실호출 성공(nh-holdings / javascript-react) — 이 세션 후반엔 도구 미로드 |
| Supabase MCP | 중간에 끊겨 재인증 필요했음 — 새 세션에서 먼저 확인 |
| Supabase 관리 토큰 | `~/.config/nuri/supabase_access_token`(90일 ~2026-12-29, 값 출력 금지) |
| 권한 규칙 | `.claude/settings.local.json` 42개(병합·update-branch·auth PATCH·execute_sql·apply_migration·deploy_edge_function·Vercel·functions deploy) |
| Supabase 조직 | NH holdings(Pro): nuri mind · NURI HOLDEM MAIN · NURI CRM. KPI 는 밖(무료). 누리홀덤 ref 불변, 사이트·REST·auth·크론·함수 11개·R2 백업 정상 확인 |
| GitHub 연동 | 자동 브랜치·운영 자동배포 **OFF**(오너) |
| 모델 | 정본 §0~§3 — Opus 5.5(구현·시각·보안), Sonnet 5.5 high(정형·실행·검증), Haiku(수집), Fable 5.1(금액 교차·판정 충돌·원인 불명만, 보안 제외) |
| yt-dlp | pip --user 설치(2026.08.19) — 영상 파이프라인 전용 |

### 9-4. 완료 선언 규칙(재확인)
"완료했습니다" 대신 "적용했습니다·확인 부탁". 문서 작성 · 설정 적용 · 로컬 실행 · 운영 검증을 구분해 보고한다. NOT_RUN 은 NOT_RUN 으로 적는다.

---
## § 영상 분석 이어하기 (2026-10-01 01:10 한도 3% 로 일시 정지 — 오너 지시)
**모든 파일을 옮긴 곳:** `C:\Users\buffy\Documents\누리홀덤_영상분석_0930\` (세션 임시 폴더는 사라질 수 있다 — 여기서 이어간다)
- 수집: **종료**(오너 "여기까지") — 4,819편. 더 수집하지 않는다. 미수집분은 문서에 적지 않는다(오너).
- C 요약: batches2 623묶음 중 **완료 526**, 남은 97묶음 목록 = `RESUME.txt`(f057 은 부분 카드라 삭제함). 카드 = `cards/*.md`.
- 이어서 요약(Git Bash, 그 폴더에서): `cat RESUME.txt | xargs -P 5 -I{} ./one.sh {}` → `runlog/done.txt` 에 ok/FAIL. FAIL 은 한 번 더 같은 명령. one.sh 는 배치마다 새 `claude -p --model sonnet` 세션(CARD_SPEC.md 규격, 카드 수=영상 수 검증).
- ⚠ 이 CLI(2.1.280)는 claude-sonnet-5-5 를 200k 창으로 본다 → 배치는 ≤110KB·≤10편 유지(서브에이전트 1개에 몰면 autocompact 실패).
- D 규칙집(아직 시작 안 함): ① `PYTHONIOENCODING=utf-8 python d1_extract.py` (관련 영상 원리 → rules/in/<태그>_<n>.txt, 통계 rules/stat.json) ② `ls rules/in | sed 's/.txt//' | xargs -P 4 -I{} ./d2.sh {}` (Opus 헤드리스, RULE_SPEC.md: 규칙·근거 수·대표 근거 3·조건/충돌·NNg·Tailwind v4·누리홀덤 적용 지점, 단일 근거 목록) ③ 태그별 조각 병합 → ④ 규칙집 조립(교차 충돌·Tailwind v4 매핑은 tailwind4.md, 오너 지침 guideline.md) → 이 문서 § 규칙집에 넣고 Google Docs 로.
- 한글 파일은 반드시 utf-8 로 읽는다(Windows 파이썬 stdin=cp949 사고 — §5 참조).
- 오너 범위: 규칙집까지 + 아주 상세한 인수인계. 앱 점검(E)·개선안 문서(F)는 그다음 세션. 디자인 구현은 오너가 번호로 고른 항목만.
