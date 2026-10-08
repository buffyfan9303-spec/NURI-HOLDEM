import { describe, expect, it, vi } from 'vitest';
import { retryableImport } from './retryImport';

// 2026-10-08 R11-01·R11-03 — 실패한 동적 import 를 새로고침 전까지 붙들던 `mod ??= import()` 로더의 회귀 검사.
// vitest 는 import() 를 __vite_ssr_dynamic_import__ 로 바꿔 빌드된 `import("./x-<해시>.js")` 모양이 없다 → ?r=n 주소 경로는
// e2e/lazy-chunk-retry-1008.spec.ts 가 실제 빌드에서 지킨다. 여기서는 (1) 실패 약속을 비운다 (2) 주소를 못 읽으면 importer 를 다시 부른다
// (3) 받은 것·받는 중인 것은 공유한다 (4) 읽은 주소가 bare specifier 면 쓰지 않는다 를 본다.
describe('retryableImport', () => {
  it('실패한 약속을 붙들지 않는다 — 다음 호출이 다시 받는다', async () => {
    const imp = vi.fn().mockRejectedValueOnce(new Error('Failed to fetch dynamically imported module')).mockResolvedValue({ ok: 1 });
    const load = retryableImport(imp);
    await expect(load()).rejects.toThrow('Failed to fetch');
    await expect(load()).resolves.toEqual({ ok: 1 });
    expect(imp).toHaveBeenCalledTimes(2);
  });

  it('받은 모듈은 다시 받지 않고, 받는 중이면 같은 약속을 돌려준다', async () => {
    const imp = vi.fn().mockResolvedValue({ ok: 1 });
    const load = retryableImport(imp);
    const a = load();
    expect(load()).toBe(a);
    await a;
    await load();
    expect(imp).toHaveBeenCalledTimes(1);
  });

  it('여러 번 연속 실패해도 매번 다시 받는다(실패 횟수만큼 새 시도)', async () => {
    const imp = vi.fn().mockRejectedValue(new Error('x'));
    const load = retryableImport(imp);
    for (let i = 0; i < 3; i++) await expect(load()).rejects.toThrow('x');
    expect(imp).toHaveBeenCalledTimes(3);
  });

  it('빌드가 써 넣은 청크 주소를 읽으면 ?r=n 새 주소로 받는다(importer 는 다시 부르지 않는다)', async () => {
    // 자기 자신 모듈을 '청크'로 쓴다 — 읽은 주소(./retryImport.ts)에 ?r=1 이 붙은 새 모듈로 들어와야 한다.
    const imp = Object.assign(vi.fn().mockRejectedValue(new Error('chunk down')), {
      toString: () => '()=>u(()=>import(`./retryImport.ts`),[])',
    });
    const load = retryableImport(imp as unknown as () => Promise<{ retryableImport: unknown }>);
    await expect(load()).rejects.toThrow('chunk down');
    const m = await load();
    expect(typeof m.retryableImport).toBe('function');
    expect(imp).toHaveBeenCalledTimes(1);
  });

  it('읽은 주소가 bare specifier 면 쓰지 않고 importer 를 다시 부른다(dev 서버 모양)', async () => {
    const imp = Object.assign(vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue({ ok: 2 }), {
      toString: () => '()=>import("@supabase/storage-js/dist/index.mjs")',
    });
    const load = retryableImport(imp as unknown as () => Promise<unknown>);
    await expect(load()).rejects.toThrow('x');
    await expect(load()).resolves.toEqual({ ok: 2 });
    expect(imp).toHaveBeenCalledTimes(2);
  });
});
