// 이전판(2026-06-15) 약관 아카이브 계약 — 개인정보처리방침 제14조③ "이전 방침을 함께 게시" 이행.
//   · 아카이브 파일이 실제로 있고 / 이전판 배너·사업자 정보·19세·1336 이 있고 / 옛 개인 연락처가 없고
//   · 검색 노출·sitemap 대상이 아니며 / 푸터·개정 안내가 그 URL 로 연결된다.
// 산출물은 `node scripts/gen-legal.mjs --archive` 가 git 이력에서 만든다(--check 대상 아님).
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { LEGAL_PREV_ARCHIVE_URL } from '../../lib/legalVersion';

const ROOT = path.join(__dirname, '../../..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf-8');
const DIR = 'public/legal/archive/2026-06-15';
const PAGES = ['index', 'terms', 'privacy', 'anti-gambling', 'footer-terms', 'footer-privacy', 'location'];

describe('이전판 아카이브', () => {
  it('URL 상수가 실제 파일을 가리킨다', () => {
    expect(existsSync(path.join(ROOT, 'public' + LEGAL_PREV_ARCHIVE_URL))).toBe(true);
  });

  for (const slug of PAGES) {
    it(`${slug}: 이전판 배너 · 사업자 정보 · 19세·1336 · noindex · 옛 개인 연락처 없음`, () => {
      const h = read(`${DIR}/${slug}.html`);
      expect(h).toContain('2026-09-29 전까지 적용된 이전판');
      expect(h).toContain('525-20-02937');
      expect(h).toContain('만 19세 미만은 이용할 수 없습니다');
      expect(h).toContain('1336');
      expect(h).toContain('noindex');
      expect(h, '옛 개인 메일').not.toContain('@gmail.com');
      expect(h, '옛 휴대전화').not.toContain('010-7508-7689');
      expect(h, '옛 사업장 주소').not.toContain('사릉로');
    });
  }

  it('sitemap 에 넣지 않는다(오너 보호 파일 · 색인 대상 아님)', () => {
    expect(read('public/sitemap.xml')).not.toContain('legal/archive');
    expect(read('scripts/gen-sitemap.mjs')).not.toContain('legal/archive');
  });

  it('푸터와 개정 안내 박스가 이전판 목록으로 연결된다', () => {
    expect(read('src/components/features/BusinessFooter.tsx')).toContain('LEGAL_PREV_ARCHIVE_URL');
    expect(read('src/pages/legal/RevisionBlocks.tsx')).toContain('LEGAL_PREV_ARCHIVE_URL');
    expect(read('public/legal/terms.html')).toContain(LEGAL_PREV_ARCHIVE_URL);
  });
});
