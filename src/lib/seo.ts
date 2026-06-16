// src/lib/seo.ts
// 클라이언트 동적 SEO — 대회/매장 상세 진입 시 문서 <head>의 title·메타·canonical·OG·JSON-LD 를 갱신한다.
//
// 배경: 이 앱은 쿼리파라미터 딥링크(?s=<대회id> / ?v=<매장코드>) 기반 SPA 라서 SSR 이 없다.
//   Googlebot·네이버 등 주요 검색 크롤러는 JS 를 렌더링하므로, 상세가 열릴 때 head 를 동적 갱신하면
//   개별 대회/매장 페이지가 "○○동 홀덤" 류 검색에 색인될 수 있다.
//   상세를 닫으면 기본(홈) 메타로 복원한다.
//
// 한계: 카카오톡/페북 등 JS 미실행 스크래퍼의 공유 미리보기에는 동적 OG 가 반영되지 않는다(기본 OG 노출).
//   진짜 공유 카드까지 필요하면 봇 UA 에 프리렌더 HTML 을 주는 엣지함수가 별도로 필요(후속 작업).

import type { Schedule } from '../api/schedules';
import type { Venue } from '../api/community';

const SITE = 'https://nuriholdem.com';
const DEFAULT_TITLE = 'NHoldem | 홀덤 대회 일정 · 커뮤니티 · 중고장터';
const DEFAULT_DESC = '전국 홀덤 대회 일정과 홀덤펍 커뮤니티, 중고장터를 한 곳에서. NURI HOLDEM.';
const DEFAULT_IMAGE = `${SITE}/nuri-logo.png`;
const JSONLD_ID = 'nuri-jsonld';

// ── 저수준 head 조작 ─────────────────────────────────────────────────────────
function upsertMeta(selector: string, attr: 'name' | 'property', keyVal: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, keyVal);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setName(name: string, content: string): void {
  upsertMeta(`meta[name="${name}"]`, 'name', name, content);
}
function setProp(property: string, content: string): void {
  upsertMeta(`meta[property="${property}"]`, 'property', property, content);
}

function setCanonical(url: string): void {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', url);
}

// JSON-LD 구조화데이터를 단일 <script id="nuri-jsonld"> 로 주입/교체/제거.
// obj=null 이면 제거. </script> 조기 종료를 막기 위해 < 를 유니코드 이스케이프.
function setJsonLd(obj: Record<string, unknown> | null): void {
  let el = document.getElementById(JSONLD_ID) as HTMLScriptElement | null;
  if (!obj) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement('script');
    el.type = 'application/ld+json';
    el.id = JSONLD_ID;
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(obj).replace(/</g, '\\u003c');
}

// 공통 메타(title·description·canonical·OG·twitter) 일괄 갱신
function applyCore(opts: { title: string; desc: string; url: string; image: string; ogType: string }): void {
  document.title = opts.title;
  setName('description', opts.desc);
  setCanonical(opts.url);
  setProp('og:type', opts.ogType);
  setProp('og:title', opts.title);
  setProp('og:description', opts.desc);
  setProp('og:image', opts.image);
  setProp('og:url', opts.url);
  setName('twitter:title', opts.title);
  setName('twitter:description', opts.desc);
  setName('twitter:image', opts.image);
}

function clip(s: string | undefined | null, n: number): string {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

const MAN = 10000; // 만원 단위

// ── 대회(Schedule) SEO ───────────────────────────────────────────────────────
export function applyScheduleSeo(s: Schedule): void {
  const url = `${SITE}/?s=${s.id}`;
  const image = s.posterUrl || DEFAULT_IMAGE;
  const where = s.pubName || s.region || '';
  const buyMan = s.buyIn?.amount ? Math.round(s.buyIn.amount / MAN) : 0;
  const gtd = s.guaranteed && s.prizePool ? ` · ${Math.round(s.prizePool / MAN).toLocaleString()}만 GTD` : '';
  // 제목: "오목 토너먼트 | 강남 홀덤펍 · 6/20 19:00 · 바인 10만"
  const titleBits = [s.title, where && `${where}`].filter(Boolean).join(' | ');
  const title = `${titleBits} | NHoldem 홀덤 대회`;
  const descBits = [
    where, `${s.date} ${s.startTime}`.trim(), s.format,
    buyMan ? `바이인 ${buyMan.toLocaleString()}만원` : '',
    gtd.replace(' · ', ''), s.region,
  ].filter(Boolean).join(' · ');
  const desc = clip(s.description ? `${descBits} — ${s.description}` : descBits, 155) || DEFAULT_DESC;

  applyCore({ title: clip(title, 65), desc, url, image, ogType: 'article' });

  // 시작 시각 ISO(KST) — 'YYYY-MM-DDTHH:MM:00+09:00'
  const startISO = /^\d{4}-\d{2}-\d{2}$/.test(s.date)
    ? `${s.date}T${(s.startTime && /^\d{1,2}:\d{2}/.test(s.startTime) ? s.startTime : '00:00')}:00+09:00`
    : undefined;

  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: s.title,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: {
      '@type': 'Place',
      name: where || 'NURI HOLDEM',
      address: s.address || s.region || 'KR',
    },
    organizer: { '@type': 'Organization', name: where || 'NURI HOLDEM' },
    url,
  };
  if (startISO) ld.startDate = startISO;
  if (image) ld.image = [image];
  if (s.description) ld.description = clip(s.description, 300);
  if (s.buyIn?.amount) {
    ld.offers = {
      '@type': 'Offer',
      price: s.buyIn.amount,
      priceCurrency: 'KRW',
      url,
      availability: 'https://schema.org/InStock',
    };
  }
  setJsonLd(ld);
}

// ── 매장(Venue) SEO ──────────────────────────────────────────────────────────
export function applyVenueSeo(v: Venue): void {
  // 공유 링크와 동일한 규칙: 슬러그 있으면 ?v=<slug>, 없으면 id 앞 8자리
  const code = v.slug || v.id.slice(0, 8);
  const url = `${SITE}/?v=${code}`;
  const image = v.imageUrl || (v.images && v.images[0]) || DEFAULT_IMAGE;
  const title = clip(`${v.name} | ${v.region || ''} 홀덤펍 | NHoldem`, 65);
  const descBits = [v.region, v.address, v.businessHours].filter(Boolean).join(' · ');
  const desc = clip(v.description ? `${v.name} — ${v.description}` : `${v.name} ${descBits} 홀덤 대회 일정·후기·예약`, 155) || DEFAULT_DESC;

  applyCore({ title, desc, url, image, ogType: 'website' });

  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: v.name,
    url,
    address: {
      '@type': 'PostalAddress',
      addressLocality: v.region || undefined,
      streetAddress: v.address || undefined,
      addressCountry: 'KR',
    },
  };
  if (image) ld.image = image;
  if (v.contactPhone) ld.telephone = v.contactPhone;
  if (v.description) ld.description = clip(v.description, 300);
  if (v.businessHours) ld.openingHours = v.businessHours;
  setJsonLd(ld);
}

// ── 지역 디렉토리(SEO 허브) SEO ──────────────────────────────────────────────
// "강남 홀덤", "분당 토너먼트" 류 long-tail 검색용 색인 페이지. CollectionPage + ItemList(매장).
export function applyDirectorySeo(
  region: string,
  venues: { id: string; name: string; slug?: string | null }[],
  tournamentCount: number,
): void {
  const url = `${SITE}/?directory=${encodeURIComponent(region)}`;
  const title = clip(`${region} 홀덤펍·홀덤 대회 일정 | NHoldem`, 65);
  const desc = clip(
    `${region} 지역 홀덤펍 ${venues.length}곳, 홀덤 토너먼트 ${tournamentCount}개의 일정·바이인·상금·결과를 한눈에. ${region}에서 홀덤 어디서 칠지 NURI HOLDEM 에서 확인하세요.`,
    155,
  ) || DEFAULT_DESC;

  applyCore({ title, desc, url, image: DEFAULT_IMAGE, ogType: 'website' });

  const items = venues.slice(0, 30).map((v, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name: v.name,
    url: `${SITE}/?v=${v.slug || v.id.slice(0, 8)}`,
  }));
  setJsonLd({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${region} 홀덤펍 디렉토리`,
    url,
    about: `${region} 홀덤펍·홀덤 토너먼트`,
    mainEntity: { '@type': 'ItemList', numberOfItems: venues.length, itemListElement: items },
  });
}

// ── 기본(홈)으로 복원 ─────────────────────────────────────────────────────────
export function resetSeo(): void {
  applyCore({ title: DEFAULT_TITLE, desc: DEFAULT_DESC, url: SITE, image: DEFAULT_IMAGE, ogType: 'website' });
  setJsonLd(null);
}
