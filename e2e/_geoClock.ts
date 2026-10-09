// 위치 확인 출석 필수 시행일(GEO_REQUIRED_FROM_MS = 정식 오픈일 KST 0시 — 서버 _checkin_geo_required_from() 과 같은 시각) 앞·뒤로 브라우저 시계를 고정한다.
// 왜: 앱은 시행 전/뒤를 Date.now() 로 가른다(isGeoRequiredNow — 시트 문구·'동의 안 함' 기록자 재질문 힌트). 실제 시계에 맡기면 시행일이 지나는 순간
//   '시행일 전' 을 가정한 스펙이 코드 변경 0 으로 빨개진다(2026-10-08 location-consent L1·L4 · checkin-geo-retry G4 · qr-camera-checkin Q2).
//   page.clock.setFixedTime 은 Date 만 고정한다 — 타이머·rAF 는 그대로라 폴링·전환 애니메이션에 영향이 없다. page.goto 전에 부른다.
import type { Page } from '@playwright/test';
import { GEO_REQUIRED_FROM_MS } from '../src/lib/locationTerms';

const HOUR = 3_600_000;
/** 시행일 1시간 전(KST 전날 23시) — 위치 확인 출석이 아직 '필수' 가 아니다. */
export const pinBeforeGeoRequired = (page: Page) => page.clock.setFixedTime(new Date(GEO_REQUIRED_FROM_MS - HOUR));
/** 시행일 1시간 뒤(KST 0시 이후) — 위치 확인 출석 매장은 동의가 필수다. */
export const pinAfterGeoRequired = (page: Page) => page.clock.setFixedTime(new Date(GEO_REQUIRED_FROM_MS + HOUR));
