// linkify — 매장 소개·공지의 링크/전화 토막 나누기(2026-10-09 VEN-02).
// 음성 대조(2026-10-09 실측): safeHttpHref 의 프로토콜 검사 줄을 지우면 'ftp://'·'mailto:' 단언이,
//   TEL_RE 의 앞(숫자·영문) 가드를 지우면 '12010-1234-5678', 뒤 숫자 가드를 지우면 '010-1234-56789' 단언이 빨개진다.
//   (처음엔 세 변형이 모두 살아남았다 — javascript:/data: 는 호스트 검사가 따로 막아서. 그래서 위 케이스를 넣었다.)
import { describe, it, expect } from 'vitest';
import { linkify, safeHttpHref, type LinkToken } from './linkify';

const join = (t: LinkToken[]) => t.map((x) => x.text).join('');
const links = (t: LinkToken[]) => t.filter((x) => x.kind !== 'text').map((x) => [x.kind, x.text, (x as { href: string }).href]);

describe('linkify', () => {
  it('운영 로티아레나 소개문 — 두 URL 이 링크가 되고 원문은 글자 하나까지 같다', () => {
    const s = '■ 매일 진행하는 토너먼트 정보·이벤트: http://www.rotiarena.com\n■ 링크 모음: https://litt.ly/rotiarena\n■ 주차 안내: /주차 검색';
    const t = linkify(s);
    expect(join(t)).toBe(s);
    expect(links(t)).toEqual([
      ['url', 'http://www.rotiarena.com', 'http://www.rotiarena.com/'],
      ['url', 'https://litt.ly/rotiarena', 'https://litt.ly/rotiarena'],
    ]);
  });

  it('운영 로티 공지 — 한글이 바로 붙은 URL 은 한글 앞에서 끊고, 전화번호는 tel 로', () => {
    const s = '🌐 http://www.rotiarena.com에서\n확인하세요.\n📲010-5248-8587';
    const t = linkify(s);
    expect(join(t)).toBe(s);
    expect(links(t)).toEqual([
      ['url', 'http://www.rotiarena.com', 'http://www.rotiarena.com/'],
      ['tel', '010-5248-8587', 'tel:01052488587'],
    ]);
  });

  it('위험 스킴은 링크가 되지 않는다(글자로 남는다)', () => {
    for (const s of ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:msgbox', 'file:///etc/passwd']) {
      const t = linkify(s);
      expect(t.every((x) => x.kind === 'text'), s).toBe(true);
      expect(join(t)).toBe(s);
    }
    expect(safeHttpHref('javascript:alert(1)')).toBeNull();
    expect(safeHttpHref('data:text/html,x')).toBeNull();
    expect(safeHttpHref('ftp://a.kr/x'), '호스트가 있어도 http(s) 가 아니면 거부').toBeNull();
    expect(safeHttpHref('mailto:a@b.kr')).toBeNull();
    expect(safeHttpHref('https://a.kr')).toBe('https://a.kr/');
  });

  it('URL 안에 숨긴 javascript 는 경로일 뿐이다 — href 는 여전히 https', () => {
    const t = linkify('https://evil.kr/javascript:alert(1)');
    expect(links(t)).toEqual([['url', 'https://evil.kr/javascript:alert(1)', 'https://evil.kr/javascript:alert(1)']]);
  });

  it('꼬리 문장부호·짝 없는 괄호는 URL 에서 뺀다, 짝 있는 괄호는 둔다', () => {
    expect(links(linkify('(https://a.kr/x)'))).toEqual([['url', 'https://a.kr/x', 'https://a.kr/x']]);
    expect(links(linkify('주소 https://a.kr/x. 다음'))).toEqual([['url', 'https://a.kr/x', 'https://a.kr/x']]);
    expect(links(linkify('https://ko.wikipedia.org/wiki/A_(B)'))).toEqual([['url', 'https://ko.wikipedia.org/wiki/A_(B)', 'https://ko.wikipedia.org/wiki/A_(B)']]);
  });

  it('www. 로 시작하면 https 를 붙인다, 단어 중간 www 는 무시', () => {
    expect(links(linkify('www.rotiarena.com 방문'))).toEqual([['url', 'www.rotiarena.com', 'https://www.rotiarena.com/']]);
    expect(linkify('abc.www.x.kr').every((x) => x.kind === 'text')).toBe(true);
  });

  it('전화 — 지역·휴대·대표번호는 잡고, 날짜·금액·사업자번호·긴 숫자는 안 잡는다', () => {
    expect(links(linkify('문의 02-123-4567 / 031.555.1234 / 01012345678 / 1588-1234'))).toEqual([
      ['tel', '02-123-4567', 'tel:021234567'],
      ['tel', '031.555.1234', 'tel:0315551234'],
      ['tel', '01012345678', 'tel:01012345678'],
      ['tel', '1588-1234', 'tel:15881234'],
    ]);
    for (const s of ['회원번호 12010-1234-5678', '주문 010-1234-56789', '2026-10-09', '10-12시 5-10만', '사업자 123-45-67890', '계좌 1002010123456789', '5-10만to 500-2000', '바인 100,000']) {
      expect(linkify(s).every((x) => x.kind === 'text'), s).toBe(true);
    }
  });

  it('URL 안의 숫자열은 전화로 잡지 않는다', () => {
    const t = linkify('https://a.kr/p/010-1234-5678');
    expect(links(t)).toEqual([['url', 'https://a.kr/p/010-1234-5678', 'https://a.kr/p/010-1234-5678']]);
  });

  it('빈 글·링크 없는 글은 글자 한 토막(또는 0개)', () => {
    expect(linkify('')).toEqual([]);
    expect(linkify('그냥 글\n두 줄')).toEqual([{ kind: 'text', text: '그냥 글\n두 줄' }]);
  });

  it('HTML 은 글자 그대로 남는다(토막은 HTML 을 만들지 않는다)', () => {
    const s = '<img src=x onerror=alert(1)> https://a.kr';
    const t = linkify(s);
    expect(join(t)).toBe(s);
    expect(t[0]).toEqual({ kind: 'text', text: '<img src=x onerror=alert(1)> ' });
  });

  // PR #258 독립 검증 P3 — URL 모양으로 잡혔지만 safeHttpHref 가 거부한 토막(점 없는 호스트)은 **글자**로 남는다.
  //   linkify 의 `if (!href) continue` 를 지우면 href 없는 url 토막이 생겨 이 단언이 빨개진다.
  it('URL 모양이지만 안전 검사에서 떨어진 주소(https://localhost/x)는 링크가 아니라 글자다', () => {
    const s = '내부 주소 https://localhost/x 는 링크가 아니다';
    const t = linkify(s);
    expect(join(t)).toBe(s);
    expect(links(t)).toEqual([]);
    expect(t).toEqual([{ kind: 'text', text: s }]);
  });
});
