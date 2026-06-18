// src/lib/kakao.ts — 카카오톡 공유(Kakao Share). 카카오맵과 동일 JS 앱키(VITE_KAKAO_MAP_KEY) 사용.
//   ⚠ 동작 조건(사용자 설정): 카카오 개발자콘솔에서 ① '카카오링크/메시지' 활성 ② 사이트 도메인 등록.
//   미설정/실패 시 false 를 반환 → 호출부가 기존 navigator.share/다운로드로 폴백한다.
const KEY = import.meta.env.VITE_KAKAO_MAP_KEY as string | undefined;
const SDK = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js';
let loadP: Promise<boolean> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function K(): any { return (window as unknown as { Kakao?: any }).Kakao; }

export function kakaoConfigured(): boolean { return !!KEY; }

function load(): Promise<boolean> {
  if (!KEY) return Promise.resolve(false);
  if (K()?.isInitialized?.()) return Promise.resolve(true);
  if (loadP) return loadP;
  loadP = new Promise((resolve) => {
    const done = () => {
      try { const k = K(); if (!k) return resolve(false); if (!k.isInitialized()) k.init(KEY); resolve(!!k.isInitialized()); }
      catch { resolve(false); }
    };
    if (document.querySelector('script[data-kakao-sdk]')) { done(); return; }
    const s = document.createElement('script');
    s.src = SDK; s.async = true; s.crossOrigin = 'anonymous'; s.setAttribute('data-kakao-sdk', '1');
    s.onload = done; s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
  return loadP;
}

/** 링크(URL) 리치 공유 — 초대 링크 등. 성공 true. */
export async function kakaoShareLink(opts: { title: string; description: string; link: string; imageUrl?: string }): Promise<boolean> {
  if (!(await load())) return false;
  try {
    K().Share.sendDefault({
      objectType: 'feed',
      content: {
        title: opts.title, description: opts.description,
        imageUrl: opts.imageUrl || 'https://nuriholdem.com/nuri-logo.png',
        link: { mobileWebUrl: opts.link, webUrl: opts.link },
      },
      buttons: [{ title: '열기', link: { mobileWebUrl: opts.link, webUrl: opts.link } }],
    });
    return true;
  } catch { return false; }
}

/** 이미지 카드 공유 — 캔버스 카드(blob)를 카카오에 업로드 후 리치 공유. 성공 true. */
export async function kakaoShareImage(blob: Blob, opts: { title: string; description: string; link?: string }): Promise<boolean> {
  if (!(await load())) return false;
  try {
    const file = new File([blob], 'nuriholdem.png', { type: 'image/png' });
    const up = await K().Share.uploadImage({ file: [file] });
    const imageUrl = up?.infos?.original?.url;
    if (!imageUrl) return false;
    const link = opts.link || 'https://nuriholdem.com';
    K().Share.sendDefault({
      objectType: 'feed',
      content: { title: opts.title, description: opts.description, imageUrl, link: { mobileWebUrl: link, webUrl: link } },
      buttons: [{ title: 'NURI HOLDEM 열기', link: { mobileWebUrl: link, webUrl: link } }],
    });
    return true;
  } catch { return false; }
}
