// src/components/features/tools/GlossaryPanel.tsx
// GKR-4 — 홀덤 용어사전. 한국 홀덤 유저가 현장·방송에서 실제로 듣는 한글 표기 기준으로
// 용어를 정리한 자기완결 데이터(파일 내 const). 검색은 용어·영문·설명 3필드 동시 매칭 —
// 초보가 "오즈"만 쳐도 팟 오즈/임플라이드 오즈가 걸리도록 부분 문자열 검색을 쓴다.
import { useMemo, useState } from 'react';
import Icon from '../../atoms/Icon';

type Cat = '기본' | '액션' | '핸드' | '보드' | '수치' | '토너먼트' | '전략';

interface Term {
  term: string;
  en: string;
  cat: Cat;
  desc: string;
}

const CATS: Cat[] = ['기본', '액션', '핸드', '보드', '수치', '토너먼트', '전략'];

// §28 준수: 설명 전반에서 '환전·현금·수익' 계열 단어를 배제하고 참가비·상금·기대값으로 통일.
const TERMS: Term[] = [
  // ── 기본 ──
  { term: '블라인드', en: 'Blind', cat: '기본', desc: '카드를 보기 전에 의무적으로 내는 베팅. 스몰 블라인드와 빅 블라인드 두 자리가 매 핸드 시계 방향으로 돌아간다.' },
  { term: '앤티', en: 'Ante', cat: '기본', desc: '블라인드와 별도로 전원(또는 BB 한 명)이 내는 소액 의무 베팅. 팟을 키워 액션을 유도한다.' },
  { term: '스몰 블라인드', en: 'SB (Small Blind)', cat: '기본', desc: '버튼 왼쪽 자리. 빅 블라인드의 절반가량을 미리 내며, 포스트플랍에서 가장 먼저 액션한다.' },
  { term: '빅 블라인드', en: 'BB (Big Blind)', cat: '기본', desc: 'SB 왼쪽 자리. 기준 베팅 단위 1BB를 미리 낸다. 스택 크기도 보통 BB 개수로 센다.' },
  { term: 'UTG', en: 'Under the Gun', cat: '기본', desc: '프리플랍에서 가장 먼저 액션하는 자리. 뒤에 남은 상대가 많아 가장 타이트한 레인지가 요구된다.' },
  { term: '하이잭', en: 'HJ (Hijack)', cat: '기본', desc: '컷오프 오른쪽 자리. 레이트 포지션의 시작점으로, 오픈 레인지가 넓어지기 시작한다.' },
  { term: '컷오프', en: 'CO (Cutoff)', cat: '기본', desc: '버튼 바로 오른쪽 자리. 버튼 다음으로 유리한 포지션이라 스틸 시도가 잦다.' },
  { term: '버튼', en: 'BTN (Button)', cat: '기본', desc: '딜러 버튼이 놓인 자리. 포스트플랍 모든 스트리트에서 마지막에 액션하는 최고의 포지션.' },
  { term: '포지션', en: 'Position', cat: '기본', desc: '액션 순서상의 자리. 늦게 액션할수록 상대 정보를 더 보고 결정할 수 있어 유리하다.' },
  { term: '스트리트', en: 'Street', cat: '기본', desc: '베팅이 일어나는 각 단계. 프리플랍 → 플랍 → 턴 → 리버 순으로 진행된다.' },
  { term: '쇼다운', en: 'Showdown', cat: '기본', desc: '리버 액션까지 끝난 뒤 남은 플레이어가 핸드를 공개해 승자를 가리는 단계.' },
  // ── 액션 ──
  { term: '오픈', en: 'Open (Open Raise)', cat: '액션', desc: '아직 아무도 레이즈하지 않은 팟에 처음으로 레이즈해 들어가는 것. 오픈 레이즈의 준말.' },
  { term: '콜', en: 'Call', cat: '액션', desc: '상대의 베팅·레이즈 금액만큼만 맞춰 내고 핸드를 계속하는 액션.' },
  { term: '레이즈', en: 'Raise', cat: '액션', desc: '상대의 베팅보다 금액을 올려 다시 베팅하는 액션. 밸류와 폴드 유도 두 목적 모두에 쓰인다.' },
  { term: '체크', en: 'Check', cat: '액션', desc: '앞선 베팅이 없을 때 베팅하지 않고 차례를 넘기는 액션. 핸드는 그대로 유지된다.' },
  { term: '폴드', en: 'Fold', cat: '액션', desc: '핸드를 포기하고 팟 경쟁에서 빠지는 액션. 이미 낸 칩은 돌려받지 못한다.' },
  { term: '림프', en: 'Limp', cat: '액션', desc: '프리플랍에서 레이즈 없이 빅 블라인드 금액만 콜로 들어가는 것. 일반적으로 수동적인 플레이로 본다.' },
  { term: '3벳', en: '3-bet', cat: '액션', desc: '오픈 레이즈에 대한 리레이즈. 블라인드가 1벳, 오픈이 2벳이므로 세 번째 베팅이라는 뜻이다.' },
  { term: '4벳', en: '4-bet', cat: '액션', desc: '3벳에 대한 리레이즈. 보통 프리미엄 핸드나 블러프로 레인지가 양극화된다.' },
  { term: '체크레이즈', en: 'Check-raise', cat: '액션', desc: '먼저 체크한 뒤 상대가 베팅하면 레이즈로 되받는 플레이. 강한 핸드 은폐나 블러프에 쓴다.' },
  { term: '돈크벳', en: 'Donk Bet', cat: '액션', desc: '전 스트리트의 어그레서가 아닌 쪽이 아웃 오브 포지션에서 먼저 베팅하는 것. 도네이션 벳이라고도 부른다.' },
  { term: '올인', en: 'All-in', cat: '액션', desc: '남은 스택 전부를 베팅하는 것. 이후 액션에는 참여하지 못하고 사이드 팟이 생길 수 있다.' },
  { term: '스틸', en: 'Steal', cat: '액션', desc: '레이트 포지션에서 블라인드·앤티를 가져가려는 목적의 오픈 레이즈.' },
  // ── 핸드 ──
  { term: '수티드', en: 'Suited', cat: '핸드', desc: '홀카드 두 장의 무늬가 같은 것. 플러시 가능성이 생겨 같은 숫자의 오프수트보다 강하다.' },
  { term: '오프수트', en: 'Offsuit', cat: '핸드', desc: '홀카드 두 장의 무늬가 다른 것. AKo처럼 소문자 o로 표기한다.' },
  { term: '포켓 페어', en: 'Pocket Pair', cat: '핸드', desc: '홀카드 두 장이 같은 숫자인 핸드. 보드에 한 장 더 맞으면 셋이 된다.' },
  { term: '커넥터', en: 'Connector', cat: '핸드', desc: '87, JT처럼 숫자가 연속된 두 장. 스트레이트를 만들 가능성이 높다.' },
  { term: '수티드 커넥터', en: 'Suited Connector', cat: '핸드', desc: '무늬까지 같은 커넥터. 스트레이트와 플러시 양쪽 가능성으로 멀티웨이 팟에서 가치가 크다.' },
  { term: '블로커', en: 'Blocker', cat: '핸드', desc: '상대가 특정 핸드를 가질 조합 수를 줄여 주는 카드. A를 들고 있으면 상대의 AA·너츠 플러시 콤보가 줄어든다.' },
  { term: '콤보', en: 'Combo', cat: '핸드', desc: '한 핸드를 구성하는 카드 조합의 개수. 포켓 페어는 6콤보, 수티드는 4콤보, 오프수트는 12콤보다.' },
  { term: '킥커', en: 'Kicker', cat: '핸드', desc: '같은 족보끼리 붙었을 때 승부를 가르는 나머지 카드. 탑 페어 싸움에서 특히 중요하다.' },
  { term: '홀카드', en: 'Hole Cards', cat: '핸드', desc: '각 플레이어에게만 비공개로 주어지는 두 장의 카드.' },
  // ── 보드 ──
  { term: '플랍', en: 'Flop', cat: '보드', desc: '프리플랍 베팅 후 한꺼번에 공개되는 커뮤니티 카드 석 장.' },
  { term: '턴', en: 'Turn', cat: '보드', desc: '플랍 다음에 공개되는 네 번째 커뮤니티 카드.' },
  { term: '리버', en: 'River', cat: '보드', desc: '마지막으로 공개되는 다섯 번째 커뮤니티 카드. 이후 최종 베팅과 쇼다운이 이어진다.' },
  { term: '드로우', en: 'Draw', cat: '보드', desc: '아직 완성되지 않았지만 특정 카드가 나오면 강한 족보가 되는 상태. 플러시 드로우·스트레이트 드로우가 대표적.' },
  { term: '거트샷', en: 'Gutshot', cat: '보드', desc: '스트레이트 가운데 한 숫자만 비어 있는 드로우. 아우츠가 4장뿐이라 인사이드 스트레이트 드로우라고도 한다.' },
  { term: 'OESD', en: 'Open-Ended Straight Draw', cat: '보드', desc: '양쪽 끝 어느 숫자가 와도 스트레이트가 완성되는 드로우. 아우츠 8장으로 거트샷의 두 배다.' },
  { term: '백도어', en: 'Backdoor', cat: '보드', desc: '턴과 리버가 연달아 도와줘야 완성되는 간접 드로우. 단독 가치는 작지만 블러프 지분을 더해 준다.' },
  { term: '레인보우', en: 'Rainbow', cat: '보드', desc: '플랍 석 장의 무늬가 모두 다른 보드. 즉시 플러시 드로우가 존재하지 않는다.' },
  { term: '모노톤', en: 'Monotone', cat: '보드', desc: '플랍 석 장의 무늬가 전부 같은 보드. 플러시가 이미 가능해 베팅 사이즈가 작아지는 경향이 있다.' },
  { term: '페어드 보드', en: 'Paired Board', cat: '보드', desc: '보드에 같은 숫자가 두 장 깔린 상태. 풀하우스·트립스가 가능해져 레인지 해석이 달라진다.' },
  { term: '웻 보드', en: 'Wet Board', cat: '보드', desc: '드로우가 많이 걸리는 보드. 상대적으로 드로우가 적은 보드는 드라이 보드라고 부른다.' },
  // ── 수치 ──
  { term: '에퀴티', en: 'Equity', cat: '수치', desc: '지금 올인해 끝까지 갔을 때 팟을 가져올 확률로 계산한 내 지분. 드로우의 가치를 수치화하는 기준.' },
  { term: '팟 오즈', en: 'Pot Odds', cat: '수치', desc: '콜 금액 대비 받을 수 있는 팟의 비율. 필요한 에퀴티보다 팟 오즈가 좋으면 콜이 정당화된다.' },
  { term: '임플라이드 오즈', en: 'Implied Odds', cat: '수치', desc: '드로우가 맞았을 때 이후 스트리트에서 추가로 딸 수 있는 칩까지 포함해 계산한 실질 오즈.' },
  { term: 'MDF', en: 'Minimum Defense Frequency', cat: '수치', desc: '상대의 블러프가 자동으로 이득이 되지 않게 하기 위해 지켜야 하는 최소 수비 빈도.' },
  { term: 'EV', en: 'Expected Value', cat: '수치', desc: '한 액션을 무한히 반복했을 때의 평균 기대값. +EV 결정을 쌓는 것이 홀덤 실력의 본질이다.' },
  { term: 'ICM', en: 'Independent Chip Model', cat: '수치', desc: '토너먼트 칩을 상금 기대값으로 환산하는 모델. 칩 2배가 상금 기대값 2배는 아니라는 점을 설명한다.' },
  { term: 'SPR', en: 'Stack-to-Pot Ratio', cat: '수치', desc: '팟 대비 남은 스택의 비율. 낮을수록 커밋 기준이 낮아져 탑 페어로도 스택이 들어간다.' },
  { term: 'M존', en: 'M-ratio', cat: '수치', desc: '블라인드·앤티 한 바퀴 비용으로 스택을 나눈 값. M이 낮아질수록 푸시/폴드 위주로 전환해야 한다.' },
  { term: '아우츠', en: 'Outs', cat: '수치', desc: '내 핸드를 승리 족보로 완성시켜 주는 남은 카드 수. 아우츠×2(턴)·×4(플랍) 근사로 에퀴티를 어림한다.' },
  { term: 'VPIP', en: 'Voluntarily Put In Pot', cat: '수치', desc: '자발적으로 팟에 참여한 핸드 비율. 플레이어의 루즈·타이트 성향을 보여 주는 대표 지표.' },
  // ── 토너먼트 ──
  { term: '레지', en: 'Registration', cat: '토너먼트', desc: '토너먼트 참가 등록. 시작 후에도 일정 레벨까지 등록을 받는 레이트 레지가 일반적이다.' },
  { term: '리엔트리', en: 'Re-entry', cat: '토너먼트', desc: '탈락 후 등록 마감 전까지 참가비를 다시 내고 재입장하는 것.' },
  { term: '애드온', en: 'Add-on', cat: '토너먼트', desc: '정해진 시점에 참가비를 추가로 내고 칩을 더 받는 옵션. 보통 레지 마감 직전 한 번 제공된다.' },
  { term: '버블', en: 'Bubble', cat: '토너먼트', desc: '한 명만 더 탈락하면 전원 상금권에 진입하는 구간. ICM 압박이 가장 큰 시기다.' },
  { term: 'ITM', en: 'In the Money', cat: '토너먼트', desc: '상금권 진입. 버블이 터진 뒤 남아 있는 플레이어는 모두 최소 상금을 확보한 상태다.' },
  { term: '파이널 테이블', en: 'Final Table', cat: '토너먼트', desc: '마지막 한 테이블(보통 9명 이하)만 남은 단계. 상금 점프가 커서 ICM 판단이 중요해진다.' },
  { term: '헤즈업', en: 'Heads-up', cat: '토너먼트', desc: '두 명이 일대일로 겨루는 상황. 우승을 가리는 마지막 승부이자 별도의 게임 형식이기도 하다.' },
  { term: '딜', en: 'Deal', cat: '토너먼트', desc: '남은 플레이어끼리 합의해 남은 상금을 나누는 것. ICM 딜과 칩찹이 대표적인 분배 방식이다.' },
  { term: '칩찹', en: 'Chip Chop', cat: '토너먼트', desc: '남은 상금을 각자의 칩 비율 그대로 나누는 단순 딜 방식. 빅스택에게 ICM 딜보다 유리한 경향이 있다.' },
  { term: 'GTD', en: 'Guaranteed', cat: '토너먼트', desc: '참가 인원과 무관하게 주최 측이 보장하는 최소 프라이즈풀. "1000만 GTD"처럼 표기한다.' },
  { term: '새틀라이트', en: 'Satellite', cat: '토너먼트', desc: '더 큰 토너먼트의 참가권을 상품으로 거는 예선 토너먼트. 적은 참가비로 본선 시트를 노린다.' },
  { term: '프리즈아웃', en: 'Freezeout', cat: '토너먼트', desc: '리엔트리·리바이 없이 탈락하면 끝나는 형식. 한 번의 스택으로만 승부한다.' },
  { term: '칩리더', en: 'Chip Leader', cat: '토너먼트', desc: '현재 가장 많은 칩을 가진 플레이어. 버블 구간에서 압박을 가장 자유롭게 넣을 수 있다.' },
  // ── 전략 ──
  { term: 'GTO', en: 'Game Theory Optimal', cat: '전략', desc: '상대가 어떤 전략을 쓰든 착취당하지 않는 균형 전략. 솔버가 계산한 빈도·사이즈가 기준점이 된다.' },
  { term: '익스플로잇', en: 'Exploit', cat: '전략', desc: '상대의 편향(과폴드·과콜 등)을 겨냥해 균형에서 의도적으로 이탈하는 전략. 그만큼 역착취 여지도 생긴다.' },
  { term: '밸류벳', en: 'Value Bet', cat: '전략', desc: '내 핸드보다 약한 핸드의 콜을 받아내려는 베팅. 얇게 넣을수록 밸류가 정교하다는 뜻이 된다.' },
  { term: '블러프', en: 'Bluff', cat: '전략', desc: '더 강한 핸드를 폴드시키려는 베팅. 성공 확률과 리스크 비율이 맞아야 +EV가 된다.' },
  { term: '세미블러프', en: 'Semi-bluff', cat: '전략', desc: '지금은 약하지만 드로우가 있는 핸드로 하는 블러프. 폴드를 받아도 좋고 맞아도 좋은 이중 승리 경로.' },
  { term: 'C벳', en: 'Continuation Bet', cat: '전략', desc: '프리플랍 어그레서가 플랍에서도 이어서 하는 베팅. 레인지 우위를 앞세운 가장 기본적인 공격.' },
  { term: '프로브 벳', en: 'Probe Bet', cat: '전략', desc: '전 스트리트에서 어그레서가 체크로 넘긴 뒤, 아웃 오브 포지션이 턴·리버에 먼저 찔러 보는 베팅.' },
  { term: '오버벳', en: 'Overbet', cat: '전략', desc: '팟보다 큰 사이즈의 베팅. 너츠급과 블러프로 양극화된 레인지에서 최대 압박을 만든다.' },
  { term: '폴드 에퀴티', en: 'Fold Equity', cat: '전략', desc: '베팅으로 상대를 폴드시켜 얻는 기대값 지분. 세미블러프와 숏스택 올인의 핵심 근거다.' },
  { term: '레인지', en: 'Range', cat: '전략', desc: '특정 상황에서 가질 수 있는 모든 핸드의 집합. 한 핸드가 아니라 레인지 대 레인지로 사고하는 것이 기본이다.' },
  { term: '폴라라이즈', en: 'Polarized', cat: '전략', desc: '레인지가 매우 강한 핸드와 블러프로 양극화된 상태. 중간 강도 위주인 머지드·컨덴스드와 대비된다.' },
  { term: '캡트', en: 'Capped', cat: '전략', desc: '이전 액션 때문에 레인지에 최상위 핸드가 없다고 읽히는 상태. 캡트 레인지는 오버벳 압박에 취약하다.' },
  { term: '너츠', en: 'Nuts', cat: '전략', desc: '현재 보드에서 가능한 가장 강한 족보. 두 번째로 강한 조합은 세컨드 너츠라고 부른다.' },
];

export default function GlossaryPanel() {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<Cat | 'all'>('all');

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return TERMS.filter((t) => {
      if (cat !== 'all' && t.cat !== cat) return false;
      if (!needle) return true;
      return (
        t.term.toLowerCase().includes(needle) ||
        t.en.toLowerCase().includes(needle) ||
        t.desc.toLowerCase().includes(needle)
      );
    });
  }, [q, cat]);

  return (
    <div className="space-y-3">
      {/* 검색 — 용어·영문·설명 동시 매칭 */}
      <div className="relative">
        <Icon name="search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="용어 검색 — 한글·영문·설명"
          className="input w-full pl-9 text-sm"
          aria-label="용어 검색"
        />
      </div>

      {/* 카테고리 칩 필터 — aria-pressed 토글(켜진 칩 다시 누르면 전체로 복귀) */}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="용어 분류 필터">
        {(['all', ...CATS] as const).map((c) => {
          const on = cat === c;
          return (
            <button
              key={c}
              type="button"
              aria-pressed={on}
              onClick={() => setCat(on && c !== 'all' ? 'all' : c)}
              className={[
                'inline-flex h-8 items-center rounded-input border px-2.5 text-2xs font-semibold transition-colors',
                on ? 'border-accent-300 bg-accent-300 text-white' : 'border-border-default bg-surface-high text-ink-secondary hover:text-ink-primary',
              ].join(' ')}
            >
              {c === 'all' ? '전체' : c}
            </button>
          );
        })}
      </div>

      {/* 용어 리스트 */}
      <div className="rounded-card border border-border-default bg-surface-low">
        {filtered.length === 0 ? (
          <p className="py-6 text-center text-2xs text-ink-muted">검색 결과가 없습니다</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {filtered.map((t) => (
              <li key={t.term} className="px-3.5 py-2.5">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-bold text-ink-primary">{t.term}</span>
                  <span className="min-w-0 truncate text-2xs text-ink-muted">{t.en}</span>
                  <span className="ml-auto shrink-0 text-2xs text-ink-muted">{t.cat}</span>
                </div>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-secondary">{t.desc}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-2xs text-ink-muted">총 {TERMS.length}개 용어 — 현장·방송에서 통용되는 한글 표기 기준입니다.</p>
    </div>
  );
}
