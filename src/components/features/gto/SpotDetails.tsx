// src/components/features/gto/SpotDetails.tsx — 작성한 스팟을 **그대로 읽어 주는** 표시 전용 컴포넌트.
//
// 왜 생겼나 (2026-09-22 오너 요구 A)
//   NURI SPOT 의 주인공은 '평가·수학 리포트' 가 아니라 **내가 적은 상황**이다.
//   오너: "분석 카드는 지우고, 작성하고 저장하고 게시판에 공유해서 보여 주는 게 목적이다."
//   그래서 같은 표현이 세 곳에 필요해졌다 — 작성 화면 / 내 스팟 상세 / 게시판 스팟 카드.
//   그 셋이 각자 마크업을 가지면 한 곳만 고치는 사고가 난다(이 저장소가 반복해 밟은 '정본 두 벌').
//
// 🔴 이 컴포넌트가 **하지 않는 것** — 여기가 계약이다.
//   · 계산하지 않는다. 팟·승률·필요 승률·추천 액션을 만들어 내지 않는다.
//   · 사용자가 적지 않은 값을 추측해 채우지 않는다.
//   · `shared` 모드에서 서버가 안 준 값을 클라이언트가 복원하지 않는다(스포일러 경계).
//   표시만 한다. 그래서 props 도 `SpotReview` 하나와 모드뿐이다.
import { memo } from 'react';
import type { SpotReview } from '../../../lib/spot';
import { actionLabel, streetLabel } from '../../../lib/spot';

/** 카드 한 장 — 무늬로 색을 준다. 값이 없으면 자리를 만들지 않는다(빈 카드 = 모른다). */
function Cards({ codes, empty = '—' }: { codes: string[]; empty?: string }) {
  if (!codes.length) return <span className="text-ink-muted">{empty}</span>;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {codes.map((c, i) => {
        const red = c[1] === 'h' || c[1] === 'd';
        return (
          <span key={`${c}-${i}`}
            className={['inline-flex min-w-[1.65rem] justify-center rounded-[4px] border border-border-default bg-surface-high px-1 py-0.5 text-2xs font-extrabold tabular-nums',
              red ? 'text-danger-light' : 'text-ink-primary'].join(' ')}>
            {c}
          </span>
        );
      })}
    </span>
  );
}

/** 라벨 + 값 한 줄. 값이 비면 렌더하지 않는다(빈 줄로 화면을 늘리지 않는다). */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-baseline gap-2 py-1">
      <span className="w-[4.5rem] shrink-0 text-2xs text-ink-muted">{label}</span>
      <span className="min-w-0 flex-1 text-xs text-ink-primary [overflow-wrap:anywhere]">{children}</span>
    </div>
  );
}

export type SpotDetailsMode =
  /** 작성자 본인 화면(작성 중·내 스팟) — `SpotReview` 에 있는 값을 전부 보여 준다. */
  | 'owner'
  /** 공유된 글 — **서버가 내려준 sanitized 값만** 보여 준다. 없는 값은 '비공개' 로 둔다. */
  | 'shared';

/**
 * @param spot  표시할 스팟. `shared` 모드에서는 반드시 `fetchPostSpot` 이 내려준 것이어야 한다.
 * @param revealed `shared` 모드에서 글쓴이가 공개를 눌렀는가. false 면 상대 카드·내 선택·결과를 '비공개' 로 적는다.
 */
function SpotDetailsBase({ spot, mode = 'owner', revealed = false }: {
  spot: SpotReview;
  mode?: SpotDetailsMode;
  revealed?: boolean;
}) {
  // 🔴 이중 방어(명세 §2.3). 서버가 이미 지워서 내려주지만, 클라이언트도 한 겹 더 가린다.
  //   `shared` + 미공개일 때는 상대 카드·글쓴이 선택·선택 크기·결과를 **그리지 않는다.**
  //   서버 응답에 값이 남아 있더라도 화면에는 나가지 않게 하는 것이 목적이다.
  const hideSecrets = mode === 'shared' && !revealed;
  const secret = <span className="text-ink-muted">공개 전</span>;

  const ante = spot.anteBb > 0 ? ` · BB앤티 ${spot.anteBb}BB` : '';
  const villains = [
    { label: 'A', pos: spot.villainPos, cards: spot.villain },
    ...spot.extra.map((v, i) => ({ label: ['B', 'C', 'D', 'E'][i] ?? '?', pos: v.pos, cards: v.cards })),
  ];

  return (
    <div className="min-w-0" data-testid="spot-details">
      {/* ① 판 — 형식·인원·블라인드·앤티 */}
      <Row label="판">
        {/* 용어 정본: 'mtt' 의 화면 표기는 '대회' 다(terminology.contract) — '토너먼트' 로 쓰지 마라. */}
        {spot.format === 'mtt' ? '대회' : '캐시'} · {spot.tableSize}인 · SB {spot.sbBb}BB{ante}
      </Row>
      {/* ② 자리와 스택 */}
      <Row label="자리">
        나 <b className="font-bold">{spot.heroPos}</b>
        {' · 상대 '}
        {villains.map((v) => `${v.label}(${v.pos})`).join(', ')}
      </Row>
      <Row label="유효 스택"><span className="tabular-nums">{spot.effectiveBb}BB</span></Row>
      {/* ③ 카드 */}
      <Row label="내 카드"><Cards codes={spot.hero} empty="적지 않음" /></Row>
      <Row label="상대 카드">
        {/* data-testid 는 e2e 손잡이다 — 라벨 문구에 셀렉터를 묶지 않는다(문구를 바꾸면 검사가 조용히 빗나간다). */}
        {hideSecrets ? <span data-testid="spot-villain-hidden">{secret}</span> : (
          <span className="inline-flex flex-wrap items-center gap-2" data-testid="spot-villain-cards">
            {villains.map((v) => (
              <span key={v.label} className="inline-flex items-center gap-1">
                <span className="text-2xs text-ink-muted">{v.label}</span>
                <Cards codes={v.cards} empty="모름" />
              </span>
            ))}
          </span>
        )}
      </Row>
      <Row label="보드">
        <span className="inline-flex items-center gap-2">
          <Cards codes={spot.board} empty="없음" />
          <span className="text-2xs text-ink-muted">{streetLabel(spot.street)}</span>
        </span>
      </Row>
      {/* ④ 결정 전 액션 — **적은 순서 그대로**. 정렬하거나 합치지 않는다. */}
      <Row label="진행">
        {spot.actions.length === 0 ? <span className="text-ink-muted">액션 없음</span> : (
          <span className="flex flex-col gap-0.5">
            {spot.actions.map((a, i) => (
              <span key={i} className="tabular-nums">
                <span className="text-ink-muted">{streetLabel(a.street)}</span>{' '}
                {a.pos ?? (a.actor === 'hero' ? spot.heroPos : spot.villainPos)}{' '}
                <b className="font-bold">{actionLabel(a.type)}</b>
                {a.sizeBb !== undefined && <span className="text-ink-secondary"> {a.sizeBb}BB</span>}
              </span>
            ))}
          </span>
        )}
      </Row>
      {/* ⑤ 그때 내 선택 */}
      <Row label="내 선택">
        {hideSecrets ? secret : spot.heroAction ? (
          <>
            <b className="font-bold">{actionLabel(spot.heroAction)}</b>
            {spot.heroActionSizeBb !== undefined && ['call', 'bet', 'raise'].includes(spot.heroAction) && (
              <span className="ml-1 tabular-nums text-ink-secondary">{spot.heroActionSizeBb}BB</span>
            )}
          </>
        ) : <span className="text-ink-muted">아직 고르지 않음</span>}
      </Row>
      {/* ⑥⑦ 사용자가 적었을 때만 */}
      {spot.potBbInput !== undefined && (
        <Row label="기록한 팟"><span className="tabular-nums">{spot.potBbInput}BB</span></Row>
      )}
      {spot.note && <Row label="메모">{spot.note}</Row>}
      {(spot.result !== undefined || hideSecrets) && (
        <Row label="결과">
          {hideSecrets ? secret : spot.result ? (
            <>
              <b className="font-bold">{spot.result.won ? '이김' : '짐'}</b>
              {spot.result.deltaBb !== undefined && (
                <span className="ml-1 tabular-nums text-ink-secondary">
                  {spot.result.deltaBb > 0 ? '+' : ''}{spot.result.deltaBb}BB
                </span>
              )}
            </>
          ) : <span className="text-ink-muted">적지 않음</span>}
        </Row>
      )}
    </div>
  );
}

export default memo(SpotDetailsBase);
