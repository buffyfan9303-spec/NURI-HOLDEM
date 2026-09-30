// W-02 소스 계약 — App 의 포스터 저장은 buy_in·structure 를 **직접 만들지 않고** 폼의 saveParts 만 싣는다.
// 예전엔 handleSubmitPoster 가 buy_in 을 여섯 칸 리터럴로 새로 만들어 rebuy·rebuyLimit 를 지웠다(2026-09-29 실측).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const app = readFileSync(resolve(__dirname, '../App.tsx'), 'utf-8');
const start = app.indexOf('const handleSubmitPoster = useCallback(');
const body = app.slice(start, app.indexOf('}, [user, venues, toast, reloadSchedules]);', start));

describe('App.handleSubmitPoster — 포스터 저장 페이로드', () => {
  it('함수를 찾았다(0개 수집 거짓 통과 방지)', () => {
    expect(start).toBeGreaterThan(0);
    expect(body.length).toBeGreaterThan(500);
  });
  it('수정·신규 두 경로 모두 saveParts 를 편다', () => {
    expect(body.match(/\.\.\.data\.saveParts/g)?.length).toBe(2);
  });
  it('buy_in 을 폼 칸으로 새로 조립하지 않는다(폼이 모르는 키 소실 경로)', () => {
    expect(body).not.toMatch(/buyIn:\s*\{\s*amount:\s*data\.buyIn\s*,/);
    expect(body).not.toMatch(/rebuyStack:\s*data\.rebuyStack/);
  });
  it('structure 를 levels 만으로 새로 만들지 않는다', () => {
    expect(body).not.toMatch(/structure:\s*\{\s*levels:\s*data\.blindLevels/);
    expect(body).not.toMatch(/levels:\s*data\.blindLevels/);
  });
});
