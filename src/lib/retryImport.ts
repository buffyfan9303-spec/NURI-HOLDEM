/**
 * 나중 청크(동적 import)를 **호출될 때마다 받아 보는** 로더 — 실패해도 다음 호출이 새 주소(?r=n)로 다시 받는다(2026-10-08 11회차 R11-01·R11-03).
 *
 * 왜: 브라우저는 실패한 동적 import 를 모듈 맵에 남긴다 — 같은 주소로 다시 import() 하면 망이 돌아와도 즉시 또 실패한다
 *   (Chromium·WebKit·Firefox 실측, iconsExtraLoader.ts 머리 주석). 그래서 `mod ??= import(...)` 한 줄짜리 로더는 한 번 끊기면
 *   새로고침 전까지 본인인증·업로드·SPOT AI·TDA 규칙·위치 동의 시트가 계속 실패했다(탐침: 망 복구 뒤에도 3/3 실패, 재요청 0회).
 * 어떻게: 실패하면 약속을 비우고 실패 횟수를 센다. 다음 호출은 빌드가 importer 본문에 써 넣은 해시 청크 이름(`import("./x-<해시>.js")`)을
 *   읽어 `?r=<횟수>` 를 붙인 주소로 받는다. 읽을 수 없으면(dev 서버·vitest 는 모양이 달라 정규식이 안 맞고, bare specifier 면 거른다)
 *   원래 importer 를 다시 부른다 — 이전 동작과 같다.
 * 호출부의 오류 처리는 그대로다: 던진 오류를 호출부가 보여 주고, 사용자가 다시 시도하면 이 로더가 새 주소로 받는다.
 *   타이머 재시도(chunkRetry.ts)는 걸지 않는다 — 기다리는 호출부가 없는 청크(사용할 때만 받는 것)라 두드릴 이유가 없다.
 * ⚠ 청크에 manualChunks 이름을 주지 마라 — rolldown 이 `import(…).then(e=>e.t)` 외피를 씌워 ?r= 맨 import 가 다른 모양을 받는다(PR B 실측).
 */
export function retryableImport<T>(importer: () => Promise<T>): () => Promise<T> {
  let mod: Promise<T> | undefined;
  let fails = 0;

  /** 재시도 주소 — 빌드된 importer 본문의 첫 `import("<상대/절대 경로>")` 를 읽는다. 호출 위치가 아니라 이 파일 기준으로 푼다:
   *  모든 청크가 /assets/ 한 폴더라 어느 청크 기준이어도 같다. */
  const retryUrl = (): string | undefined => {
    const m = /import\(\s*["'`]([^"'`]+)["'`]/.exec(String(importer));
    if (!m || !/^(\.{1,2}\/|\/)/.test(m[1])) return undefined;
    return `${new URL(m[1], import.meta.url).href}?r=${fails}`;
  };

  return () => {
    if (mod) return mod;
    const url = fails ? retryUrl() : undefined;
    const p = url ? (import(/* @vite-ignore */ url) as Promise<T>) : importer();
    return (mod = p.catch((err) => {
      mod = undefined;
      fails++;
      throw err;
    }));
  };
}
