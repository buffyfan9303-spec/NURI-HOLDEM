// 실행: npx vitest run src/lib/notifBootTab.test.ts
// 음성 대조: '/admin' 분기를 지우면 첫 테스트가 빨개진다.
import { describe, it, expect } from 'vitest';
import { bootTabForNotifLink } from './notifBootTab';

describe('bootTabForNotifLink — 알림 부팅 링크의 권한 시작 탭', () => {
  it('권한 목적지', () => {
    expect(bootTabForNotifLink('/admin')).toBe('admin');
    expect(bootTabForNotifLink('/my-store')).toBe('my-store');
    expect(bootTabForNotifLink('/my-store/ledger')).toBe('my-store');
    expect(bootTabForNotifLink('/my-store/partners?x=1')).toBe('my-store');
    expect(bootTabForNotifLink('/staff-schedule')).toBe('my-store');
  });
  it('권한 탭이 아니거나 외부·이상한 링크는 null(시작 탭 = 홈 그대로)', () => {
    for (const l of [null, undefined, '', '/', '/wallet', '/support', '/posts/1', '?tab=admin', '//evil.example/admin', 'https://x/admin', '/administrator', '/my-storey'])
      expect(bootTabForNotifLink(l)).toBeNull();
  });
});
