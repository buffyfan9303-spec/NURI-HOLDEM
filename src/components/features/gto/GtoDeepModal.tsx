// src/components/features/gto/GtoDeepModal.tsx
// 공유 링크(#gto=) 진입용 모달 래퍼 — 인라인 패널(GtoDeepPanel)을 전체화면 모달로 표시.
// (도구 탭에서는 GtoDeepPanel 을 인라인으로 직접 렌더한다.)
import Modal from '../../atoms/Modal';
import GtoDeepPanel from './GtoDeepPanel';
import type { DeepGtoInit } from './useDeepGto';

export default function GtoDeepModal({ open, onClose, initialState }: { open: boolean; onClose: () => void; initialState?: DeepGtoInit }) {
  return (
    <Modal open={open} onClose={onClose} title="GTO 검색" variant="page" maxWidth="md">
      <div className="px-4 py-3">
        <GtoDeepPanel initialState={initialState} />
      </div>
    </Modal>
  );
}
