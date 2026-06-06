// src/components/features/GroupPage.tsx
// 가입제 그룹 커뮤니티(딜러팀·동호회·유튜버) 페이지.
//  - 공개: 기본정보 + 이미지 + 공지
//  - 멤버 전용(승인된 멤버만): 실시간 채팅 · 게시판 2탭
//  - 매니저: 가입 승인/거절, 멤버 추방, 이미지·공지 관리
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../atoms/Toast';
import { useBackClose } from '../../lib/backstack';
import Avatar from '../atoms/Avatar';
import { relativeTime } from './MarketplaceTab';
import {
  GROUP_KIND_LABEL, type Venue, type GroupMember, type GroupMessage, type GroupPost,
  getMyMembership, getGroupMembers, joinGroup, approveMember, removeMember,
  getGroupMessages, sendGroupMessage, subscribeGroupMessages, deleteGroupMessage,
  getGroupPosts, createGroupPost, deleteGroupPost,
  getVenueNotices, createVenueNotice, deleteVenueNotice, type VenueNotice,
  updateVenueImages,
} from '../../api/community';
import { uploadVenueImages } from '../../lib/storage';

export default function GroupPage({ group, open, onClose }: { group: Venue | null; open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const toast = useToast();

  const [membership, setMembership] = useState<GroupMember | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [notices, setNotices] = useState<VenueNotice[]>([]);
  const [tab, setTab] = useState<'chat' | 'board'>('chat');
  const [managePanel, setManagePanel] = useState(false);

  const isAdmin = user?.role === 'admin';
  const isManager = !!group && (isAdmin || group.ownerId === user?.id || membership?.role === 'manager');
  const isMember = isManager || membership?.status === 'approved';

  useBackClose(!!open && !!group, onClose);
  useEffect(() => {
    if (!open || !group) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [open, group]);

  const reloadMembership = () => { if (group && user) getMyMembership(group.id).then(setMembership).catch(() => {}); };
  const reloadMembers = () => { if (group) getGroupMembers(group.id).then(setMembers).catch(() => {}); };

  useEffect(() => {
    if (!open || !group) return;
    setMembership(null); setMembers([]); setTab('chat');
    getVenueNotices(group.id).then(setNotices).catch(() => {});
    if (user) getMyMembership(group.id).then(setMembership).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, group?.id, user?.id]);

  // 멤버/매니저면 멤버 목록 로드(매니저는 승인 대기 포함)
  useEffect(() => { if (isMember) reloadMembers(); /* eslint-disable-next-line */ }, [isMember, group?.id]);

  if (!open || !group) return null;

  const kindLabel = GROUP_KIND_LABEL[group.kind ?? 'other'];
  const approvedMembers = members.filter((m) => m.status === 'approved');
  const pendingMembers = members.filter((m) => m.status === 'pending');

  const doJoin = async () => {
    if (!user) { toast.show('로그인 후 가입할 수 있습니다', 'error'); return; }
    try {
      const st = await joinGroup(group.id);
      toast.show(st === 'approved' ? '가입되었습니다' : '가입 신청이 접수되었습니다(승인 대기)', 'success');
      reloadMembership();
    } catch (e) { toast.show(e instanceof Error ? e.message : '가입 실패', 'error'); }
  };
  const doApprove = async (m: GroupMember) => {
    try { await approveMember(m.id); toast.show(`${m.name} 님을 승인했습니다`, 'success'); reloadMembers(); }
    catch (e) { toast.show(e instanceof Error ? e.message : '실패', 'error'); }
  };
  const doKick = async (m: GroupMember, label: string) => {
    if (!confirm(`${m.name} 님을 ${label}하시겠습니까?`)) return;
    try { await removeMember(m.id); toast.show(`${label} 완료`, 'info'); reloadMembers(); if (m.userId === user?.id) reloadMembership(); }
    catch (e) { toast.show(e instanceof Error ? e.message : '실패', 'error'); }
  };
  const leave = async () => {
    if (!membership) return;
    await doKick(membership, '탈퇴');
  };

  const addImages = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    try {
      const urls = await uploadVenueImages(group.id, Array.from(files));
      await updateVenueImages(group.id, [...(group.images ?? []), ...urls]);
      toast.show('이미지를 추가했습니다(새로고침 시 반영)', 'success');
    } catch (e) { toast.show(e instanceof Error ? e.message : '업로드 실패', 'error'); }
  };
  const addNotice = async () => {
    const content = prompt('공지 내용을 입력하세요');
    if (!content?.trim()) return;
    try { await createVenueNotice(group.id, content.trim()); getVenueNotices(group.id).then(setNotices); toast.show('공지를 등록했습니다', 'success'); }
    catch (e) { toast.show(e instanceof Error ? e.message : '실패', 'error'); }
  };

  const images = group.images ?? (group.imageUrl ? [group.imageUrl] : []);

  return (
    <div className="fixed inset-0 z-40 bg-surface-base flex flex-col animate-slide-up" style={{ animationDuration: '0.25s' }}>
      {/* 헤더 */}
      <header className="shrink-0 sticky top-0 z-30 flex items-center h-header-h px-page-x bg-surface-base border-b border-border-subtle">
        <button type="button" onClick={onClose} aria-label="뒤로 가기" className="w-9 h-9 -ml-2 flex items-center justify-center rounded-input text-ink-secondary hover:text-ink-primary hover:bg-surface-high transition-colors">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="14,5 7,11 14,17" /></svg>
        </button>
        <span className="ml-1 inline-flex items-center gap-1.5 min-w-0">
          <span className="shrink-0 px-1.5 py-0.5 text-2xs font-bold rounded-badge bg-gold-300/15 text-gold-300">{kindLabel}</span>
          <h1 className="text-base font-bold text-ink-primary truncate">{group.name}</h1>
        </span>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl">
          {/* 이미지 갤러리 */}
          <div className="relative w-full overflow-hidden h-40 sm:h-48 bg-surface-low">
            {images.length > 0 ? (
              <div className="flex h-full overflow-x-auto scrollbar-none [-webkit-overflow-scrolling:touch] snap-x">
                {images.map((src, i) => <img key={`${src}-${i}`} src={src} alt={`${group.name} ${i + 1}`} loading="lazy" decoding="async" className="h-full w-auto shrink-0 object-cover snap-center" />)}
              </div>
            ) : (
              <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, ${group.themeColor ?? '#1A1D24'} 0%, #0a0c0f 100%)` }} />
            )}
            {isManager && (
              <label className="absolute bottom-2 right-2 cursor-pointer rounded-input bg-black/60 px-2.5 py-1 text-2xs font-semibold text-white hover:bg-black/80">
                + 이미지
                <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => addImages(e.target.files)} />
              </label>
            )}
          </div>

          {/* 기본 정보 */}
          <div className="px-page-x py-4 border-b border-border-subtle">
            <div className="flex items-center gap-1.5 flex-wrap mb-1">
              <span className="px-1.5 py-0.5 text-2xs font-semibold rounded-badge bg-surface-high text-ink-secondary">{kindLabel}</span>
              {group.region && <span className="text-2xs text-ink-muted">{group.region}</span>}
              <span className="text-2xs text-ink-muted">· 멤버 {isMember ? approvedMembers.length : (group.followerCount ?? 0)}명</span>
            </div>
            <h2 className="text-xl font-bold text-ink-primary">{group.name}</h2>
            {group.description && <p className="text-sm text-ink-secondary mt-1 whitespace-pre-wrap leading-relaxed">{group.description}</p>}

            {/* 가입 상태 / 버튼 */}
            <div className="mt-3">
              {!user ? (
                <p className="rounded-input bg-surface-high px-3 py-2 text-center text-2xs text-ink-muted">로그인 후 가입할 수 있습니다</p>
              ) : isManager ? (
                <span className="inline-block rounded-input bg-gold-300/15 px-3 py-1.5 text-xs font-bold text-gold-300">운영 중인 그룹</span>
              ) : membership?.status === 'approved' ? (
                <button type="button" onClick={leave} className="rounded-input border border-border-default px-3 py-1.5 text-xs font-semibold text-ink-secondary hover:text-danger-light">가입됨 · 탈퇴</button>
              ) : membership?.status === 'pending' ? (
                <span className="inline-block rounded-input bg-surface-high px-3 py-1.5 text-xs font-semibold text-ink-muted">가입 승인 대기중…</span>
              ) : (
                <button type="button" onClick={doJoin} className="btn-primary text-sm px-5">{group.joinApproval ? '가입 신청' : '가입하기'}</button>
              )}
            </div>
          </div>

          {/* 공지 (공개) */}
          <div className="px-page-x py-3 border-b border-border-subtle">
            <div className="flex items-center justify-between mb-1.5">
              <h3 className="text-xs font-bold text-gold-300">공지사항</h3>
              {isManager && <button type="button" onClick={addNotice} className="text-2xs text-gold-300 hover:text-gold-200">+ 공지</button>}
            </div>
            {notices.length === 0 ? (
              <p className="text-2xs text-ink-muted py-1">등록된 공지가 없습니다</p>
            ) : (
              <ul className="space-y-1.5">
                {notices.map((n) => (
                  <li key={n.id} className="rounded-input bg-surface-low border border-border-subtle px-2.5 py-1.5">
                    <p className="text-xs text-ink-primary whitespace-pre-wrap break-words">{n.content}</p>
                    <div className="mt-0.5 flex items-center gap-2 text-2xs text-ink-muted">
                      <span>{relativeTime(n.createdAt)}</span>
                      {isManager && <button type="button" onClick={() => deleteVenueNotice(n.id).then(() => getVenueNotices(group.id).then(setNotices))} className="ml-auto hover:text-danger-light">삭제</button>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 매니저 패널 */}
          {isManager && (
            <div className="px-page-x py-2 border-b border-border-subtle">
              <button type="button" onClick={() => setManagePanel((v) => !v)} className="flex w-full items-center justify-between text-xs font-semibold text-ink-secondary">
                <span>멤버 관리 {pendingMembers.length > 0 && <span className="ml-1 text-gold-300">· 신청 {pendingMembers.length}</span>}</span>
                <span className="text-2xs text-ink-muted">{managePanel ? '닫기' : '열기'}</span>
              </button>
              {managePanel && (
                <div className="mt-2 space-y-2 animate-slide-up">
                  {pendingMembers.length > 0 && (
                    <div>
                      <p className="text-2xs font-bold text-gold-300 mb-1">가입 신청 ({pendingMembers.length})</p>
                      <ul className="space-y-1">
                        {pendingMembers.map((m) => (
                          <li key={m.id} className="flex items-center gap-2 rounded-input bg-surface-high px-2.5 py-1.5">
                            <Avatar name={m.name} color={m.color} size={22} />
                            <span className="text-xs text-ink-primary">{m.name}</span>
                            <div className="ml-auto flex gap-1">
                              <button type="button" onClick={() => doApprove(m)} className="rounded-input bg-gold-300 px-2 py-1 text-2xs font-bold text-ink-inverse">승인</button>
                              <button type="button" onClick={() => doKick(m, '거절')} className="rounded-input border border-border-default px-2 py-1 text-2xs text-ink-muted hover:text-danger-light">거절</button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div>
                    <p className="text-2xs font-bold text-ink-secondary mb-1">멤버 ({approvedMembers.length})</p>
                    <ul className="space-y-1">
                      {approvedMembers.map((m) => (
                        <li key={m.id} className="flex items-center gap-2 rounded-input bg-surface-high px-2.5 py-1.5">
                          <Avatar name={m.name} color={m.color} size={22} />
                          <span className="text-xs text-ink-primary">{m.name}</span>
                          {m.role === 'manager' && <span className="text-2xs font-bold text-gold-300">매니저</span>}
                          {m.role !== 'manager' && m.userId !== user?.id && (
                            <button type="button" onClick={() => doKick(m, '강제 탈퇴')} className="ml-auto text-2xs text-ink-muted hover:text-danger-light">추방</button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 멤버 전용 영역 */}
          {!isMember ? (
            <div className="px-page-x py-12 text-center">
              <p className="text-3xl mb-2">🔒</p>
              <p className="text-sm font-semibold text-ink-primary">멤버 전용 공간</p>
              <p className="text-2xs text-ink-muted mt-1">가입 후 실시간 채팅과 게시판을 이용할 수 있습니다</p>
            </div>
          ) : (
            <>
              {/* 2탭 */}
              <div className="sticky top-0 z-20 flex bg-surface-base border-b border-border-subtle">
                {(['chat', 'board'] as const).map((t) => (
                  <button key={t} type="button" onClick={() => setTab(t)}
                    className={['flex-1 py-3 text-sm font-medium border-b-2 -mb-px transition-colors', tab === t ? 'border-gold-300 text-gold-300' : 'border-transparent text-ink-muted hover:text-ink-secondary'].join(' ')}>
                    {t === 'chat' ? '실시간 채팅' : '게시판'}
                  </button>
                ))}
              </div>
              <div className="px-page-x py-3 min-h-[40vh]">
                {tab === 'chat' ? <GroupChat groupId={group.id} canManage={isManager} /> : <GroupBoard groupId={group.id} canManage={isManager} />}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 실시간 채팅 ───────────────────────────────────────────────────────────────
function GroupChat({ groupId, canManage }: { groupId: string; canManage: boolean }) {
  const { user } = useAuth();
  const toast = useToast();
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    getGroupMessages(groupId, 80).then((m) => { if (active) setMessages(m.reverse()); }).catch(() => {});
    const unsub = subscribeGroupMessages(groupId, (m) => setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m])));
    return () => { active = false; unsub(); };
  }, [groupId]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages.length]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body || !user) return;
    setSending(true);
    try {
      const m = await sendGroupMessage(groupId, { userName: user.nickname ?? user.name, userColor: user.avatarColor, content: body });
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      setDraft('');
    } catch (err) { toast.show(err instanceof Error ? err.message : '전송 실패', 'error'); }
    finally { setSending(false); }
  };

  return (
    <div className="space-y-2">
      <ul className="space-y-1.5 max-h-[55vh] overflow-y-auto">
        {messages.length === 0 ? <p className="py-8 text-center text-2xs text-ink-muted">첫 메시지를 남겨보세요</p> : messages.map((m) => (
          <li key={m.id} className="flex items-start gap-2">
            <Avatar name={m.userName} color={m.userColor} size={24} className="mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1 text-2xs">
                <span className="font-semibold text-ink-primary truncate">{m.userName}</span>
                <span className="text-ink-muted ml-auto shrink-0">{relativeTime(m.createdAt)}</span>
                {(canManage || m.userId === user?.id) && (
                  <button type="button" onClick={() => deleteGroupMessage(m.id).then(() => setMessages((p) => p.filter((x) => x.id !== m.id)))} aria-label="삭제" className="shrink-0 text-ink-muted hover:text-danger-light">×</button>
                )}
              </div>
              <p className="text-xs text-ink-primary leading-snug mt-0.5 break-words whitespace-pre-wrap">{m.content}</p>
            </div>
          </li>
        ))}
        <div ref={endRef} />
      </ul>
      <form onSubmit={send} className="flex items-center gap-2">
        <input type="text" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={500} placeholder="메시지 입력…" className="input flex-1" />
        <button type="submit" disabled={sending || !draft.trim()} className="btn-primary px-4 shrink-0 disabled:opacity-50">전송</button>
      </form>
    </div>
  );
}

// ── 게시판 ────────────────────────────────────────────────────────────────────
function GroupBoard({ groupId, canManage }: { groupId: string; canManage: boolean }) {
  const { user } = useAuth();
  const toast = useToast();
  const [posts, setPosts] = useState<GroupPost[]>([]);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);

  const reload = () => getGroupPosts(groupId).then(setPosts).catch(() => {});
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [groupId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || !user) return;
    setSending(true);
    try {
      await createGroupPost(groupId, { authorName: user.nickname ?? user.name, authorColor: user.avatarColor, title, content });
      setTitle(''); setContent(''); setOpen(false); reload();
      toast.show('등록되었습니다', 'success');
    } catch (err) { toast.show(err instanceof Error ? err.message : '등록 실패', 'error'); }
    finally { setSending(false); }
  };
  const del = async (p: GroupPost) => {
    if (!confirm('이 글을 삭제하시겠습니까?')) return;
    try { await deleteGroupPost(p.id); reload(); } catch (e) { toast.show(e instanceof Error ? e.message : '실패', 'error'); }
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <button type="button" onClick={() => setOpen((v) => !v)} className="btn-primary text-xs px-4">{open ? '닫기' : '+ 글쓰기'}</button>
      </div>
      {open && (
        <form onSubmit={submit} className="space-y-2 rounded-card border border-border-default bg-surface-low p-3 animate-slide-up">
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="제목(선택)" className="input w-full text-sm" />
          <textarea value={content} onChange={(e) => setContent(e.target.value)} maxLength={4000} rows={4} placeholder="내용" className="input w-full resize-none text-sm" />
          <div className="flex justify-end"><button type="submit" disabled={sending || !content.trim()} className="btn-primary px-4 disabled:opacity-60">등록</button></div>
        </form>
      )}
      {posts.length === 0 ? <p className="py-8 text-center text-2xs text-ink-muted">첫 글을 남겨보세요</p> : (
        <ul className="space-y-2">
          {posts.map((p) => (
            <li key={p.id} className="rounded-card border border-border-subtle bg-surface-low p-3">
              {p.title && <p className="text-sm font-bold text-ink-primary mb-0.5">{p.title}</p>}
              <p className="text-sm text-ink-primary whitespace-pre-wrap break-words">{p.content}</p>
              <div className="mt-1.5 flex items-center gap-2">
                <Avatar name={p.authorName} color={p.authorColor} size={18} />
                <span className="text-2xs text-ink-muted">{p.authorName}</span>
                <span className="text-2xs text-ink-muted">· {relativeTime(p.createdAt)}</span>
                {(canManage || p.authorId === user?.id) && <button type="button" onClick={() => del(p)} className="ml-auto text-2xs text-ink-muted hover:text-danger-light">삭제</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
