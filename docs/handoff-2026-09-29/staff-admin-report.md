# 관리자 계정 '직원 관리' 미노출 조사 (store-team, 읽기 전용, 2026-09-29)

요구 키: 오너 채팅 2026-09-29 "관리자 계정으로 로그인 했는데 직원관리쪽이 없어"
작업트리 HEAD 69a7b81b / 운영 배포 = main 06f671eb (Vercel nuri-holdem production READY, 확인함)
제품 소스·DB 수정 0건. DB 는 select 와 `begin … rollback` 리허설만.

## 1. 진입점 조건표 (VenueManageTab.tsx)

| 진입점 | 조건 | 관리자(role=admin) 값 |
|---|---|---|
| 내 매장 탭 자체 | App.tsx:2700 `isOwner \|\| isStaff \|\| isAdmin` | 보임 |
| 매장 id | :257 `isAdmin ? adminVenueId : …` / adminVenueId = getAllVenues() 첫 매장(:664-671) | 운영 매장 4곳 중 첫 곳 |
| 권한 판정 | :677-683 `if (isAdmin) { setStaffOk(true); setSchedOk(true); … }` — RPC 조회 생략 | staffOk=true |
| 사이드바 '직원 관리' | :760 `if (staffOk) available.push({id:'staff', label:'직원 관리', group:'관리'})` | 들어감 |
| 성숙도 숨김 | :785 `(isAdmin \|\| navAll \|\| !staffOk) ? available : …` | 관리자는 필터 없음 |
| '매장 설정' | :771 `if (staffOk)` | 들어감 |
| '출근 관리' | :758 무조건 | 들어감(관리자는 :1184 미리보기 + readOnly) |
| 판 렌더 | :1192 `visited.includes('staff') && (staffOk \|\| schedOk)` → StaffHub(scheduleOnly=!staffOk) | 5칸 전체(구성원·스케줄·시급·정산·출근일지) |
| PC 사이드바 | :962 `hidden lg:flex` (**뷰포트 1024px 이상에서만**) | — |
| 폭 1024 미만 | :907-957 아코디언. 대시보드·게임·이용권 화면에서는 버튼 문구가 '전체 메뉴'(:909 railNav)이고 눌러야 목록이 펼쳐진다 | '직원 관리'는 펼친 목록 안에만 있음 |
| 관리자 설정 탭 | AdminTab.tsx:1261 매장 섹션 → 매장 편집 카드 안 :1650 `<VenueStaffManager>`(:1764 제목 '직원 관리') | 매장을 펼쳐야 보임 |

계약 e2e: `e2e/mystore-role-nav.spec.ts:41-47` — role=admin 이면 '출근 관리'·'직원 관리'가 보이는지 단언(커밋 f4e71df8, 2026-09-28). 이 조사에서는 **다시 실행하지 않았다(NOT_RUN)** — 빌드가 sitemap 을 덮고 다른 팀 검증이 진행 중이어서다.

## 2. 운영 DB 대조 (idsxiqspecrucvfvtgbw, 읽기 전용)

```
profiles: 닉네임 '나누리' → role=admin, status=active, profiles.venue_id 없음, venue_owners 행 0, venues.owner_id 로 소유 2곳
역할 분포: venue_owner 2 · admin 1 · user 4 · venue_staff 0
venue_staff 테이블: 전체 0행(모든 매장에 직원이 0명)
```

`begin; set_config(request.jwt.claims = 관리자 sub); set local role authenticated; … rollback;` 결과:
```
status=active, _actor_not_sanctioned()=true, 보이는 매장 4,
bool_and(can_manage_venue_staff(v))=true, bool_and(can_access_ledger(v))=true
```

서버 정의(pg_get_functiondef):
- `can_manage_venue_staff` = `my_role()='admin'` ∪ `_venue_owner_ok` ∪ 승인 공동운영자, 그리고 `_actor_not_sanctioned()`
- `can_manage_pos` / `can_manage_venue` 도 admin 분기 있음
- RLS `venue_staff_select` = `can_manage_venue_staff(venue_id) OR user_id = auth.uid()`

→ **서버는 관리자에게 모든 매장의 직원 데이터를 이미 허용한다.** 화면 게이트(staffOk=true)와 서버 게이트가 일치하고, 화면만 막고 있는 자리는 없다.

## 3. 결론 — 코드 조건으로는 관리자에게서 숨지 않는다

코드·서버 어느 조건에도 관리자가 걸리지 않는다. `git log -S "setStaffOk(true)"` → 0e834a79(2026-09-11) 이후 관리자에게 늘 true 였고,
f4e71df8(2026-09-28) 커밋 메시지가 "관리자 직원 화면 미리보기" 를 **의도한 기능**으로 적었다. 즉 "관리자는 직원 관리 불가" 는 의도가 아니고, 코드상 결함도 확인되지 않는다.

오너 증상을 설명할 수 있는 후보(실제 오너 화면을 보지 못해 확정 못 함):

1. **창 폭이 1024px 미만이면 사이드바가 없다.** 브라우저 창을 줄였거나, Windows 배율 150%(1366 화면 → CSS 911px)·브라우저 확대를 쓰면
   PC에서도 모바일 아코디언이 나오고, 대시보드에서는 버튼이 '전체 메뉴'라 눌러야 '관리 › 직원 관리'가 보인다. (가능성 높음, 확인 필요)
2. **직원 데이터가 0이다.** venue_staff 0행이라 '직원 관리 › 구성원 목록'이 비어 있고, '출근 관리' 미리보기에도 보여 줄 직원 정보가 없다.
   메뉴는 있는데 "직원 관리 쪽 내용이 없다"로 보였을 수 있다.
3. **다른 제품일 수 있다.** 같은 Vercel 계정에 별도 프로젝트 `nuri-crm`(NURI-CRM 저장소, 오늘 배포 3건)이 있다. 오너가 그 앱의 관리자 계정을 말했다면
   이 저장소와 무관하다. (그 저장소는 조사하지 않음)
4. '관리자 설정' 탭에서 찾았다면 직원 관리는 매장 편집 카드 **안쪽**(AdminTab.tsx:1650)에 있다.

**NEEDS_USER:** 오너에게 확인할 것 — (a) 어느 앱(누리홀덤 / NURI CRM)인지, (b) 어느 탭(내 매장 / 관리자 설정)인지, (c) 창 폭 또는 스크린샷.

## 4. 수정안 (결함이 확정될 때만)

- 서버: **바꿀 것 없다.** 관리자는 이미 모든 매장의 직원 데이터를 읽고 쓸 수 있다(can_manage_venue_staff admin 분기).
  반대로 이것을 좁히는 것은 오너 결정 사항이다 — 운영자가 모든 매장 직원 명부·시급을 보는 것이 의도인지는 개인정보 관점에서 따로 판단해야 한다
  (20260928b 에서 "직원 이메일은 관리자만" 이라 이미 관리자 열람을 전제한 설계다).
- 화면(후보 1이 맞을 때): 아코디언을 쓰는 폭(<1024)에서 '직원 관리'를 바로 보이게 한다. 예: 사이드바 기준점을 `lg`→`md`로 내리거나, 대시보드에서 아코디언 버튼을 '전체 메뉴'로 접지 말고
  '관리' 그룹을 짧은 칩 줄로 노출. 파일은 VenueManageTab.tsx 한 곳. PC 레이아웃(업주 99%)에 영향이 있으니 design-reviewer 실측이 필요하다.
- 화면(후보 2): 구성원 0명일 때 StaffHub 첫 칸에 "구성원 초대"를 먼저 보이게 하는 빈 상태 안내. 이미 초대 입력이 구성원 목록 안에 있으므로 문구만.
- 위험: 관리자 분기를 **서버에 새로 넓히지 않는다**(my_staff_wage·set_my_shift_time 은 직원 본인 전용 — VenueManageTab.tsx:1181-1182 주석의 오너 결정).

## 보고 형식

| 항목 | 값 |
|---|---|
| 요구 키 | 오너 채팅 2026-09-29 "관리자 계정 직원관리 없음" |
| 원천 경로 | src/components/features/VenueManageTab.tsx:240,257,664-706,758-785,907-990,1181-1192 · src/App.tsx:2700 · src/components/features/AdminTab.tsx:1650,1734 · e2e/mystore-role-nav.spec.ts:41 |
| 실제 diff | 없음(읽기 전용) |
| 명령·종료 코드 | execute_sql select 4회 + rollback 리허설 1회 성공 · git log -S 2회 · Vercel list_deployments 1회 |
| 판정 | 코드 결함 FAIL 아님 / 오너 화면 재현 NOT_RUN(관리자 로그인 필요) |
| 다음 한 단계 | nuri-lead 가 오너에게 앱·탭·창 폭(스크린샷)을 묻는다 |
