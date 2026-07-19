// src/contexts/BlockContext.tsx
// 사용자 차단 전역 상태 — 차단 목록을 한 번 로드해 피드·댓글·매물 필터와 차단/해제에 공유.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { getMyBlockedIds, listMyBlocks, blockUser, unblockUser, type BlockedUser } from '../api/blocks';

interface BlockContextValue {
  blockedIds: Set<string>;
  blocks: BlockedUser[];
  isBlocked: (userId?: string | null) => boolean;
  block: (userId: string, name?: string) => Promise<void>;
  unblock: (userId: string) => Promise<void>;
  reload: () => Promise<void>;
}

const BlockContext = createContext<BlockContextValue | null>(null);

export function BlockProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());
  const [blocks, setBlocks] = useState<BlockedUser[]>([]);

  const reload = useCallback(async () => {
    if (!user) { setBlockedIds(new Set()); setBlocks([]); return; }
    const [ids, list] = await Promise.all([getMyBlockedIds(), listMyBlocks()]);
    setBlockedIds(ids);
    setBlocks(list);
  }, [user]);

  useEffect(() => { reload().catch(() => {}); }, [reload]);

  const isBlocked = useCallback((userId?: string | null) => !!userId && blockedIds.has(userId), [blockedIds]);

  const block = useCallback(async (userId: string, name?: string) => {
    await blockUser(userId, name);
    setBlockedIds((s) => new Set(s).add(userId));
    await reload();
  }, [reload]);

  const unblock = useCallback(async (userId: string) => {
    await unblockUser(userId);
    setBlockedIds((s) => { const n = new Set(s); n.delete(userId); return n; });
    await reload();
  }, [reload]);

  return (
    <BlockContext.Provider value={{ blockedIds, blocks, isBlocked, block, unblock, reload }}>
      {children}
    </BlockContext.Provider>
  );
}

// 차단 컨텍스트가 없는 트리(예외)에서도 안전하게 동작하도록 no-op 폴백 제공.
const NOOP: BlockContextValue = {
  blockedIds: new Set(), blocks: [], isBlocked: () => false,
  block: async () => {}, unblock: async () => {}, reload: async () => {},
};
// eslint-disable-next-line react-refresh/only-export-components -- Provider+훅 동거(컨텍스트 표준 패턴)
export function useBlocks(): BlockContextValue {
  return useContext(BlockContext) ?? NOOP;
}
