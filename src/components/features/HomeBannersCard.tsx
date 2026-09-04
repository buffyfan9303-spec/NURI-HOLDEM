// 홈 상단 배너 관리(오너 지시 2026-09-04: "관리자설정에 배너 관리도 추가 — 이미지, 클릭시 링크,
// 제목, 순서, 날짜가 되면 삭제").
//
// 파이프라인 위치: **노출** — 사슬의 첫 칸. 종전 홈 캐러셀 고정 배너는 PosterCarousel.tsx 소스에
// 하드코딩돼 있어 한 장 바꾸려면 배포가 필요했다. 여기서 운영으로 다룬다.
//
// AdminTab.tsx 가 아니라 별도 파일인 이유: AdminTab 은 이미 1800줄이고, 이 카드는 자기 API 만
// 쓰는 자기완결 블록이다. AdminTab 은 lazy 청크라 import 한 줄로 같은 번들에 들어간다.
import { useCallback, useEffect, useState } from 'react';
import Icon from '../atoms/Icon';
import { useToast } from '../atoms/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { uploadPoster } from '../../lib/storage';
import {
  getAllHomeBanners, saveHomeBanner, deleteHomeBanner, reorderHomeBanners,
  purgeExpiredHomeBanners, type HomeBanner,
} from '../../api/homeBanners';

const EMPTY: Omit<HomeBanner, 'id'> = {
  title: '', subtitle: '', imageUrl: '', linkUrl: '', sortOrder: 999,
  startsAt: null, endsAt: null, active: true,
};

export default function HomeBannersCard() {
  const toast = useToast();
  const { user } = useAuth();
  const [rows, setRows] = useState<HomeBanner[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [draft, setDraft] = useState<Omit<HomeBanner, 'id'> & { id?: string }>({ ...EMPTY });
  const [uploading, setUploading] = useState(false);
  const today = new Date().toLocaleDateString('en-CA');

  const reload = useCallback(() => { getAllHomeBanners().then(setRows).catch(() => {}); }, []);
  useEffect(() => { reload(); }, [reload]);

  // 노출 판정은 getActiveHomeBanners 와 **같은 조건**이어야 한다 —
  // 관리 화면 배지가 실제 노출과 어긋나면 오너가 화면을 못 믿게 된다.
  const statusOf = (b: HomeBanner): { label: string; on: boolean } => {
    if (!b.imageUrl.trim()) return { label: '이미지 없음', on: false };
    if (b.startsAt && b.startsAt > today) return { label: '예약', on: false };
    if (b.endsAt && b.endsAt < today) return { label: '만료', on: false };
    if (!b.active) return { label: '꺼짐', on: false };
    return { label: '게재중', on: true };
  };

  const pickImage = async (file: File | undefined) => {
    if (!file || !user) return;
    setUploading(true);
    try {
      const url = await uploadPoster(user.id, file);   // 기존 포스터 파이프라인 재사용(리사이즈·webp·cacheControl 1년)
      setDraft((d) => ({ ...d, imageUrl: url }));
      toast.show('이미지를 올렸습니다', 'success');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '이미지 업로드 실패', 'error');
    } finally { setUploading(false); }
  };

  const submit = async () => {
    if (!draft.imageUrl.trim()) { toast.show('배너 이미지를 올려 주세요', 'error'); return; }
    setBusy('draft');
    try {
      await saveHomeBanner(draft);
      toast.show(draft.id ? '배너를 수정했습니다' : '배너를 등록했습니다', 'success');
      setDraft({ ...EMPTY });
      reload();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '저장 실패', 'error');
    } finally { setBusy(null); }
  };

  const toggle = async (b: HomeBanner) => {
    setBusy(b.id);
    try { await saveHomeBanner({ ...b, active: !b.active }); reload(); }
    catch (e) { toast.show(e instanceof Error ? e.message : '변경 실패', 'error'); }
    finally { setBusy(null); }
  };

  const remove = async (b: HomeBanner) => {
    if (!window.confirm(`'${b.title || '제목 없음'}' 배너를 삭제할까요?`)) return;
    setBusy(b.id);
    try { await deleteHomeBanner(b.id); toast.show('삭제했습니다', 'success'); reload(); }
    catch (e) { toast.show(e instanceof Error ? e.message : '삭제 실패', 'error'); }
    finally { setBusy(null); }
  };

  const move = async (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    setRows(next);                       // 낙관적 반영 — 실패하면 reload 가 되돌린다
    setBusy(rows[i].id);
    try { await reorderHomeBanners(next.map((r) => r.id)); }
    catch (e) { toast.show(e instanceof Error ? e.message : '순서 변경 실패', 'error'); reload(); }
    finally { setBusy(null); }
  };

  const purge = async () => {
    if (!window.confirm('만료 후 7일이 지난 배너를 정리할까요? (되돌릴 수 없습니다)')) return;
    setBusy('purge');
    try {
      const n = await purgeExpiredHomeBanners();
      toast.show(n > 0 ? `${n}건을 정리했습니다` : '정리할 배너가 없습니다', 'success');
      reload();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '정리 실패', 'error');
    } finally { setBusy(null); }
  };

  return (
    <section className="rounded-card border border-border-default bg-surface-low p-3 space-y-2">
      <p className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-ink-primary">
        <Icon name="image" size={15} className="shrink-0" />홈 상단 배너
        <span className="text-xs font-normal text-ink-muted">
          이미지·링크·기간을 지정하면 홈 캐러셀에 뜹니다. 종료일이 지나면 자동으로 내려갑니다(행 삭제는 7일 뒤 정리 버튼)
        </span>
      </p>

      {/* 등록·수정 폼 */}
      <div className="space-y-1.5 rounded-input border border-border-subtle bg-surface-high/40 p-2">
        <p className="text-xs font-bold text-ink-secondary">{draft.id ? '배너 수정' : '새 배너'}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <label className="btn-ghost cursor-pointer px-3 py-1.5 text-xs">
            {uploading ? '올리는 중…' : '이미지 선택'}
            <input type="file" accept="image/*" className="hidden" disabled={uploading}
              onChange={(e) => { void pickImage(e.target.files?.[0]); e.currentTarget.value = ''; }} />
          </label>
          {draft.imageUrl && (
            <img src={draft.imageUrl} alt="배너 미리보기" width={120} height={56}
              className="h-14 w-[120px] rounded-input border border-border-subtle object-cover" />
          )}
          <span className="text-2xs text-ink-muted">가로형 권장(960×448)</span>
        </div>
        <div className="grid gap-1.5 sm:grid-cols-2">
          <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} maxLength={40}
            placeholder="제목(카드 위에 표시)" className="input w-full min-w-0 text-sm" />
          <input value={draft.subtitle} onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })} maxLength={60}
            placeholder="부제(일시·매장 등)" className="input w-full min-w-0 text-sm" />
          <input value={draft.linkUrl} onChange={(e) => setDraft({ ...draft, linkUrl: e.target.value })} maxLength={300}
            placeholder="클릭 시 이동할 링크(선택)" className="input w-full min-w-0 text-sm sm:col-span-2" />
          <label className="flex items-center gap-1.5 text-2xs text-ink-secondary">시작
            <input type="date" value={draft.startsAt ?? ''} onChange={(e) => setDraft({ ...draft, startsAt: e.target.value || null })}
              className="input w-full min-w-0 text-sm" />
          </label>
          <label className="flex items-center gap-1.5 text-2xs text-ink-secondary">종료
            <input type="date" value={draft.endsAt ?? ''} onChange={(e) => setDraft({ ...draft, endsAt: e.target.value || null })}
              className="input w-full min-w-0 text-sm" />
          </label>
        </div>
        <div className="flex gap-1.5">
          <button type="button" onClick={submit} disabled={busy === 'draft' || uploading}
            className="btn-primary flex-1 px-3 py-1.5 text-xs disabled:opacity-60">
            {draft.id ? '수정 저장' : '배너 등록'}
          </button>
          {draft.id && (
            <button type="button" onClick={() => setDraft({ ...EMPTY })} className="btn-ghost px-3 py-1.5 text-xs">취소</button>
          )}
        </div>
      </div>

      {/* 목록 */}
      {rows.length === 0 ? (
        <p className="py-4 text-center text-xs text-ink-muted">등록된 배너가 없습니다</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((b, i) => {
            const st = statusOf(b);
            return (
              <li key={b.id} className="flex flex-wrap items-center gap-1.5 rounded-input border border-border-subtle bg-surface-high/40 p-1.5">
                <span className="flex shrink-0 gap-0.5">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0 || busy !== null} aria-label="위로 이동"
                    className="min-h-8 min-w-8 rounded border border-border-default text-2xs text-ink-secondary hover:border-accent-400/50 hover:text-accent-300 disabled:opacity-25">▲</button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === rows.length - 1 || busy !== null} aria-label="아래로 이동"
                    className="min-h-8 min-w-8 rounded border border-border-default text-2xs text-ink-secondary hover:border-accent-400/50 hover:text-accent-300 disabled:opacity-25">▼</button>
                </span>
                {b.imageUrl
                  ? <img src={b.imageUrl} alt="" width={64} height={30} className="h-[30px] w-16 shrink-0 rounded border border-border-subtle object-cover" />
                  : <span className="h-[30px] w-16 shrink-0 rounded border border-border-subtle bg-surface-float" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink-primary">{b.title || '(제목 없음)'}</span>
                  <span className="block truncate text-2xs text-ink-muted">
                    {b.startsAt || '즉시'} ~ {b.endsAt || '무기한'}{b.linkUrl ? ' · 링크 있음' : ''}
                  </span>
                </span>
                <span className={['shrink-0 rounded-badge px-1.5 py-0.5 text-2xs font-bold', st.on ? 'bg-accent-300 text-white' : 'bg-surface-float text-ink-muted'].join(' ')}>
                  {st.label}
                </span>
                <button type="button" onClick={() => toggle(b)} disabled={busy === b.id}
                  className={['min-h-8 rounded-input border px-2.5 text-xs font-bold disabled:opacity-60',
                    b.active ? 'border-accent-400/50 bg-accent-300/15 text-accent-200' : 'border-border-default text-ink-muted'].join(' ')}>
                  {b.active ? '켜짐' : '꺼짐'}
                </button>
                <button type="button" onClick={() => setDraft({ ...b })} disabled={busy === b.id}
                  className="btn-ghost min-h-8 px-2.5 text-xs">수정</button>
                <button type="button" onClick={() => remove(b)} disabled={busy === b.id}
                  className="min-h-8 rounded-input border border-danger/40 px-2.5 text-xs font-bold text-danger-light hover:bg-danger/10 disabled:opacity-40">삭제</button>
              </li>
            );
          })}
        </ul>
      )}
      <button type="button" onClick={purge} disabled={busy === 'purge'}
        className="btn-ghost w-full py-1.5 text-xs disabled:opacity-60">만료 후 7일 지난 배너 정리</button>
    </section>
  );
}
