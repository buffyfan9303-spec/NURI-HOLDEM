// src/lib/paidExposure.ts — 공개 화면의 유료 노출 스위치 하나.
//
// 오너 결정(2026-10-09): "유료 광고 노출 하지마". 근거: 10_출시실행표_1008.md ③ R1 —
//   Play 는 자사·네이티브 광고도 광고로 보고, 홀덤펍 유료 노출이 '도박 광고'로 분류되면 장부·대회 안내 기능과 충돌한다.
// 끄는 것: 손님이 보는 상단 고정·우선 정렬(매장 is_paid_ad · 포스터 부스트 is_premium)·AD/TOP/프리미엄 배지·커뮤니티 광고 칸.
// 남기는 것: 데이터와 관리 화면(관리자 지정·해제, 광고 슬롯 관리, 업주 자기 화면), 프리미엄 매장의 포스터 즉시 공개(기능 권한).
// 다시 켜려면 이 값 하나만 true 로 바꾼다 — 모든 공개 소비처가 paidShown 을 거친다.
export const PAID_EXPOSURE_ON = false;

/** 공개 화면에서 이 유료 표시를 보여도 되는가. 스위치가 꺼져 있으면 언제나 false. */
export const paidShown = (flag: boolean | null | undefined): boolean => PAID_EXPOSURE_ON && !!flag;
