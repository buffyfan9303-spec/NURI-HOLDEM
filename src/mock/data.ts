import type { Schedule } from '../api/schedules';
import type { User } from '../api/auth';
import type { Venue, Comment, CommunityPost } from '../api/community';
import type { AppNotification } from '../api/notifications';
import type { MarketplaceListing, MarketplaceNotice } from '../api/marketplace';

const today = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

const now = (minutesAgo: number) =>
  new Date(Date.now() - minutesAgo * 60_000).toISOString();

// ── 목업 사용자 ──────────────────────────────────────────────────────────────

export const MOCK_USERS: User[] = [
  { id: 'u1', email: 'user@demo.com',  name: '김플레이어', role: 'user',        avatarColor: '#0EA5E9', status: 'active',    joinedAt: now(60 * 24 * 90) },
  { id: 'o1', email: 'owner@demo.com', name: 'ROTI ARENA', role: 'venue_owner', approved: true,  venueId: 'v_roti', avatarColor: '#C9A961', status: 'active', joinedAt: now(60 * 24 * 180) },
  { id: 'o2', email: 'newbie@demo.com', name: '신규업주(승인대기)', role: 'venue_owner', approved: false, venueId: 'v_pending', avatarColor: '#A78BFA', status: 'pending', joinedAt: now(60 * 24 * 2) },
  { id: 'a1', email: 'admin@demo.com', name: '운영자',     role: 'admin',       avatarColor: '#EF4444', status: 'active',    joinedAt: now(60 * 24 * 365) },
  // 회원관리 데모용 추가
  { id: 'u2', email: 'spam@demo.com',  name: '스팸유저',  role: 'user',        avatarColor: '#6B7280', status: 'banned',     joinedAt: now(60 * 24 * 30) },
  { id: 'u3', email: 'rude@demo.com',  name: '욕설러',    role: 'user',        avatarColor: '#F59E0B', status: 'suspended',  suspendedUntil: new Date(Date.now() + 60*60*24*1000*7).toISOString(), joinedAt: now(60 * 24 * 60) },
  { id: 'u4', email: 'rookie@demo.com', name: '뉴비왕',   role: 'user',        avatarColor: '#10B981', status: 'active',     joinedAt: now(60 * 24 * 5) },
  { id: 'o3', email: 'venue3@demo.com', name: '강남펍 신청', role: 'venue_owner', approved: false, avatarColor: '#A855F7', status: 'pending', joinedAt: now(60 * 12) },
];

// ── 목업 매장 — ROTI ARENA를 최상단 플래그십 매장으로 ────────────────────────

export const MOCK_VENUES: Venue[] = [
  // ── ROTI ARENA — 헤럴드 브랜드 매장 (실제 정보 적용) ─────────────────────
  {
    id: 'v_roti',
    name: '로티 아레나',
    region: '남양주',
    address: '경기 남양주시 다산동 6087 한강플라자 4층',
    description:
      '🏆 ROTI ARENA — 헤럴드 컨셉의 프리미엄 홀덤 아레나\n\n' +
      '· NPC · K-STAR · S-ENT · JOPT · SPT 파트너 시드권 운영\n' +
      '· 로티 단독 파이널롤백 시리즈 정기 호스팅\n' +
      '· 첫 방문 50% 할인 / 매장이용권·대회초대권 교차 지급\n' +
      '· Roti GP 결제 시스템 지원\n\n' +
      '초보부터 베테랑까지 모두 환영합니다.',
    themeColor: '#C9A961',  // 헤럴드 골드
    ownerId: 'o1',
    approved: true,
    contactPhone: '010-5248-8587 / 010-7584-1247',
    businessHours:
      '매일 17:00 OPEN\n' +
      '정기 토너먼트: 17시 START (레지마감 16LV, 약 00:12)\n' +
      '사전예약 얼리칩 EVENT — 오픈 채팅 17:00 이전 예약자 한정',
    followerCount: 3284,
    isPaidAd: true,
  },
  // ── 기존 매장들 ─────────────────────────────────────────────────────────
  {
    id: 'v2', name: '에이스 포커클럽', region: '홍대', address: '서울 마포구 양화로 78',
    description: '홍대 위클리 토너먼트 전문. 학생·직장인 대상 미들 스택 토너먼트.',
    themeColor: '#0369A1', approved: true,
    contactPhone: '02-2345-6789', businessHours: '매일 19:00 ~ 익일 05:00', followerCount: 892,
  },
  {
    id: 'v3', name: '로얄 홀덤', region: '강남', address: '서울 강남구 강남대로 234',
    description: '하이롤러 전용 살롱. 미드나잇 딥스택 정기 운영.',
    themeColor: '#B91C1C', approved: true,
    contactPhone: '02-3456-7890', businessHours: '22:00 ~ 익일 08:00', followerCount: 567,
  },
  {
    id: 'v4', name: '블루칩 클럽', region: '부산', address: '부산 해운대구 우동 567',
    description: '부산 최대 토너먼트 클럽. 시즌별 메이저 이벤트 개최.',
    themeColor: '#065F46', approved: true,
    contactPhone: '051-4567-8901', businessHours: '15:00 ~ 익일 03:00', followerCount: 743,
  },
  {
    id: 'v5', name: '스택 홀덤', region: '판교', address: '경기 성남시 분당구 판교역로 89',
    description: 'IT인 친선 리그 정기 개최. 캐주얼한 분위기.',
    themeColor: '#92400E', approved: true,
    contactPhone: '031-5678-9012', businessHours: '평일 19:00 ~ 24:00', followerCount: 412,
  },
  {
    id: 'v6', name: '그랜드 포커 라운지', region: '인천', address: '인천 연수구 송도동 12',
    description: '인천 최고급 라운지형 홀덤펍. 인비테이셔널 이벤트 전문.',
    themeColor: '#1E3A5F', approved: true,
    contactPhone: '032-6789-0123', businessHours: '12:00 ~ 익일 04:00', followerCount: 1098,
    isPaidAd: true,
  },
];

// ── 목업 요강 — ROTI ARENA 메인 토너먼트 ─────────────────────────────────────

export const MOCK_SCHEDULES: Schedule[] = [
  {
    id: 'roti-1100',
    title: '로티 단독 파이널롤백20 1100 GTD',
    venueId: 'v_roti', pubName: '로티 아레나', region: '남양주',
    address: '경기 남양주시 다산동 6087 한강플라자 4층',
    date: today(0), startTime: '17:00',
    duration: '레지마감 16LV (약 00:12)',
    format: 'MTT', guaranteed: true, prizePool: 11_000_000,
    buyIn: { amount: 100000, rebuy: 100000 },  // Re-Entry 70,000 chips
    structure: { startingChips: 50_000, blindLevelMinutes: 25, lateRegLevels: 16 },
    description:
      '로티 단독 — 파이널롤백20 1100 GTD 메인이벤트.\n' +
      'BUY-IN 100,000 (VAT 포함, 현장결제 or Roti GP).\n' +
      'Starting 50,000 / Re-Entry 70,000 / Blind 25M(1~16LV) → 15M(17LV~) / 레지마감 16LV.\n\n' +
      '※ 첫 방문자는 언제든 50% 할인 — 1LV 바인시 단 5만원에 1100 GTD 참가 가능.\n' +
      '※ 첫 바인은 무조건 7만원 대동단결.',

    // 포스터에서 가져온 풍부한 정보 ─────────
    partners: ['NPC', 'K-STAR', 'S-ENT', 'JOPT', 'SPT', '로티GP'],
    paymentMethods: ['현장결제', 'Roti GP'],
    promotions: [
      { badge: '첫방문',  title: '50% 할인',  detail: '언제든 적용 가능' },
      { badge: '1LV',     title: '5만원',     detail: '1LV 바인 시' },
      { badge: '대동단결', title: '7만원',    detail: '첫 바인 무조건' },
      { badge: '얼리칩',  title: '5만 할인',  detail: '1LV 바인 (오픈 17:00 이전 예약자)' },
      { badge: '얼리칩',  title: '+10,000 칩', detail: '2LV 시작 전 참가' },
      { badge: '얼리칩',  title: '+5,000 칩',  detail: '5LV 시작 전 참가' },
    ],
    sideEvents: [
      { name: '플립앤고', startBefore: '5LV 시작 전',  note: '5gp씩 총50' },
      { name: '핀볼',     startBefore: '17LV 시작 전', note: '5gp씩 총50' },
    ],
    rankingPrizes: [
      { rank: '1st',     amount: 400 },
      { rank: '2nd',     amount: 200 },
      { rank: '3rd',     amount: 100 },
      { rank: '4th',     amount:  80 },
      { rank: '5th',     amount:  60 },
      { rank: '6th',     amount:  50 },
      { rank: '7th',     amount:  40 },
      { rank: '8th',     amount:  30 },
      { rank: '9th',     amount:  20 },
      { rank: '10-11th', amount:  15 },
      { rank: '12-15th', amount:  10 },
      { rank: '이벤트',  amount:  50 },
    ],
    rules: [
      '추가 시상 및 모든 이벤트는 gp로 시상',
      '2블라인드 자리비움시 떡차리 됩니다',
      'TDA룰 기준으로 로티아레나 하우스룰 우선 적용',
      '5만 할인은 0.5엔트리 적용, 3만 할인은 0.7엔트리 적용',
      '플립앤고는 5레벨 스타트 전, 핀볼은 17레벨 스타트 전',
      '대회초대권과 매장이용권 교차 지급 가능',
    ],

    posterColor: '#7C2D7E',
    displayOrder: 1, isPremium: true, ownerId: 'o1', unreadQnaCount: 12, approved: true,
  },
  {
    id: 'roti-daily',
    title: '로티 데일리 라이브',
    venueId: 'v_roti', pubName: '로티 아레나', region: '남양주',
    address: '경기 남양주시 다산동 6087 한강플라자 4층',
    date: today(1), startTime: '20:00', duration: '4-6시간',
    format: 'MTT', guaranteed: true, prizePool: 1_500_000,
    buyIn: { amount: 50000, rebuy: 50000 },
    structure: { startingChips: 30_000, blindLevelMinutes: 15, lateRegLevels: 6 },
    description: '로티 아레나 평일 정규 데일리 토너먼트. 직장인 플레이어 환영.',
    posterColor: '#0a0c0f',
    displayOrder: 2, isPremium: true, ownerId: 'o1', unreadQnaCount: 3, approved: true,
  },
  {
    id: '3',
    title: '강남 미드나잇 딥스택',
    venueId: 'v3', pubName: '로얄 홀덤', region: '강남',
    date: today(2), startTime: '22:00', duration: '6-8시간',
    format: 'MTT', guaranteed: true, prizePool: 2_000_000,
    buyIn: { amount: 55000, rebuy: 55000, rebuyLimit: 1 },
    seats: [{ label: 'WSOP 메인이벤트 패키지', count: 1 }],
    structure: { startingChips: 50_000, blindLevelMinutes: 30, lateRegLevels: 5 },
    posterColor: '#B91C1C',
    displayOrder: 3, isPremium: true, ownerId: 'o1', unreadQnaCount: 0, approved: true,
  },
  {
    id: '4',
    title: '홍대 위클리 화요 토너먼트',
    venueId: 'v2', pubName: '에이스 포커클럽', region: '홍대',
    date: today(3), startTime: '19:30', duration: '4-6시간',
    format: 'MTT', guaranteed: false, prizePool: 500_000,
    buyIn: { amount: 22000, rebuy: 22000 },
    structure: { startingChips: 20_000, blindLevelMinutes: 15, lateRegLevels: 4 },
    posterColor: '#0369A1',
    displayOrder: 4, isPremium: true, ownerId: 'o1', unreadQnaCount: 1, approved: true,
  },
  {
    id: '5',
    title: '판교 IT인 친선 리그',
    venueId: 'v5', pubName: '스택 홀덤', region: '판교',
    date: today(4), startTime: '20:00', duration: '3-4시간',
    format: 'SNG', guaranteed: false, prizePool: 300_000,
    buyIn: { amount: 16500 },
    structure: { startingChips: 15_000, blindLevelMinutes: 12, lateRegLevels: 3 },
    posterColor: '#92400E',
    displayOrder: 5, isPremium: true, ownerId: 'o1', unreadQnaCount: 7, approved: true,
  },
  // ── 일반(비프리미엄) 포스터 ─────────────────────────────────────────────
  {
    id: '6',
    title: '인천 그랜드 인비테이셔널',
    venueId: 'v6', pubName: '그랜드 포커 라운지', region: '인천',
    date: today(5), startTime: '12:00', duration: 'Day1A + Day2',
    format: 'MTT', guaranteed: true, prizePool: 50_000_000,
    buyIn: { amount: 110000, rebuy: 110000, rebuyLimit: 1 },
    seats: [
      { label: 'WSOP Circuit 링', count: 3 },
      { label: 'APT 마닐라',      count: 2 },
    ],
    structure: { startingChips: 100_000, blindLevelMinutes: 40, lateRegLevels: 8 },
    posterColor: '#1E3A5F',
    displayOrder: 6, isPremium: false, ownerId: 'o1', unreadQnaCount: 0, approved: true,
  },
  {
    id: 'roti-pko',
    title: '로티 토요 PKO',
    venueId: 'v_roti', pubName: '로티 아레나', region: '남양주',
    date: today(6), startTime: '13:00', duration: '4-5시간',
    format: 'PKO', guaranteed: false, prizePool: 800_000,
    buyIn: { amount: 27500, rebuy: 27500 },
    posterColor: '#0F766E',
    displayOrder: 7, isPremium: false, ownerId: 'o1', unreadQnaCount: 0, approved: true,
  },
  {
    id: '8',
    title: '부산 사우스 오픈 시즌3',
    venueId: 'v4', pubName: '블루칩 클럽', region: '부산',
    date: today(7), startTime: '15:00', duration: '8시간',
    format: 'MTT', guaranteed: false, prizePool: 800_000,
    buyIn: { amount: 44000, rebuy: 44000, addon: 22000 },
    seats: [{ label: 'KPT 부산 오픈', count: 2 }],
    structure: { startingChips: 40_000, blindLevelMinutes: 20 },
    posterColor: '#065F46',
    displayOrder: 8, isPremium: false, ownerId: 'o1', unreadQnaCount: 0, approved: true,
  },
];

// ── 목업 알림 ────────────────────────────────────────────────────────────────

export const MOCK_NOTIFICATIONS: AppNotification[] = [
  { id: 'n1', type: 'qna', title: '새 Q&A 댓글',
    message: '"로티 단독 파이널롤백20 1100 GTD"에 새 질문이 등록되었습니다.',
    read: false, createdAt: now(2),
    link: '/schedules/roti-1100',
    avatarText: 'R', avatarColor: '#C9A961' },
  { id: 'n2', type: 'comment', title: '댓글 답글',
    message: '김플레이어 님이 회원님의 댓글에 답글을 남겼습니다.',
    read: false, createdAt: now(15),
    link: '/community/v_roti',
    avatarText: '김', avatarColor: '#0EA5E9' },
  { id: 'n3', type: 'mention', title: '@언급',
    message: '커뮤니티에서 @회원님이 언급되었습니다.',
    read: false, createdAt: now(45),
    link: '/posts/p1',
    avatarText: '로', avatarColor: '#B91C1C' },
  { id: 'n4', type: 'approval', title: '포스터 승인 완료',
    message: '"로티 토요 PKO" 포스터가 승인되어 게시되었습니다.',
    read: true, createdAt: now(180),
    link: '/admin',
    avatarText: '✓', avatarColor: '#10B981' },
  { id: 'n5', type: 'system', title: '시스템 공지',
    message: '5월 26일 02:00 ~ 04:00 정기 점검이 예정되어 있습니다.',
    read: true, createdAt: now(720),
    avatarText: '!', avatarColor: '#6B7280' },
];

// ── 목업 매장 댓글 ────────────────────────────────────────────────────────────

export const MOCK_COMMENTS: Comment[] = [
  { id: 'c1', venueId: 'v_roti', userId: 'u1', userName: '김플레이어', userRole: 'user', isOwner: false,
    content: '이번 주 토요일 세미파테 메인 현장 등록 가능한가요? 13:30까지 가면 될까요?',
    createdAt: now(20) },
  { id: 'c2', venueId: 'v_roti', parentId: 'c1', userId: 'o1', userName: 'ROTI ARENA', userRole: 'venue_owner', isOwner: true,
    content: '안녕하세요! Day1A는 13:30까지 입장하시면 됩니다. 레이트레지 8레벨까지 가능하니 늦어도 괜찮습니다.',
    createdAt: now(15) },
  { id: 'c3', venueId: 'v_roti', userId: 'u1', userName: '딥스택러버', userRole: 'user', isOwner: false,
    content: '여기 칩 진짜 좋네요. 11.5g 클레이 감촉이 다릅니다.',
    createdAt: now(120) },
  { id: 'c4', venueId: 'v3', userId: 'u1', userName: '딥스택러버', userRole: 'user', isOwner: false,
    content: '미드나잇 배틀 스택 깊어서 너무 좋네요.',
    createdAt: now(240) },
  { id: 'c5', venueId: 'v2', userId: 'u1', userName: '홍대단골', userRole: 'user', isOwner: false,
    content: '화요일 위클리 분위기 너무 좋아요.',
    createdAt: now(60) },
];

// ── 목업 전역 커뮤니티 포스트 ────────────────────────────────────────────────

export const MOCK_COMMUNITY_POSTS: CommunityPost[] = [
  {
    id: 'p1', userId: 'o1', userName: 'ROTI ARENA',
    userRole: 'venue_owner', userColor: '#C9A961',
    content: '🏆 이번 주 토요일 세미파테 메인이벤트 8M GTD 진행됩니다! Day1A 14:00 시작, 좌석 한정. 사전 등록 환영합니다.',
    createdAt: now(10), likeCount: 87, commentCount: 24,
  },
  {
    id: 'p2', userId: 'u1', userName: '강남타이트',
    userRole: 'user', userColor: '#0EA5E9',
    content: '이번 주말 강남 쪽에서 딥스택 추천 부탁드려요! 블라인드 30분 이상이면 더 좋겠습니다.',
    createdAt: now(35), likeCount: 12, commentCount: 5,
  },
  {
    id: 'p3', userId: 'u1', userName: '폴드킹',
    userRole: 'user', userColor: '#10B981',
    content: '어제 PKO에서 바운티 12개 모았네요... 너무 행복합니다',
    createdAt: now(95), likeCount: 28, commentCount: 9,
  },
  {
    id: 'p4', userId: 'u1', userName: '레이트레지',
    userRole: 'user', userColor: '#A78BFA',
    content: '레이트 레지 가능한 토너먼트 추천해주세요. 주말 저녁 시작하는 걸로요.',
    createdAt: now(180), likeCount: 6, commentCount: 12,
  },
  { id: 'p5', userId: 'u1', userName: '디플레이', userRole: 'user', userColor: '#F472B6',
    content: '플롭에서 셋오버셋 당한 분 계신가요... 멘탈관리 어떻게 하시나요',
    createdAt: now(220), likeCount: 18, commentCount: 32 },
  { id: 'p6', userId: 'u1', userName: 'ICM마스터', userRole: 'user', userColor: '#34D399',
    content: '버블 직전 ICM 공부 자료 추천 부탁드립니다.',
    createdAt: now(280), likeCount: 9, commentCount: 7 },
  { id: 'p7', userId: 'u1', userName: '주말토너러', userRole: 'user', userColor: '#FBBF24',
    content: '이번 주 토요일 강남 쪽에서 같이 가실 분 구합니다!',
    createdAt: now(340), likeCount: 4, commentCount: 11 },
  { id: 'p8', userId: 'o1', userName: 'ROTI ARENA', userRole: 'venue_owner', userColor: '#C9A961',
    content: '🎁 첫 방문자 50% 할인 — 1LV 바인 시 5만원에 1100GTD 참가 가능!',
    createdAt: now(420), likeCount: 64, commentCount: 21 },
  { id: 'p9', userId: 'u1', userName: '하트킹', userRole: 'user', userColor: '#06B6D4',
    content: '오늘 첫 챔피언 됐습니다 🏆 다들 응원 감사해요!',
    createdAt: now(540), likeCount: 142, commentCount: 56 },
  { id: 'p10', userId: 'u1', userName: '뉴비입니다', userRole: 'user', userColor: '#A855F7',
    content: '홀덤 입문자인데 초보 환영하는 매장 추천 부탁드려요!',
    createdAt: now(680), likeCount: 11, commentCount: 19 },
  { id: 'p11', userId: 'u1', userName: 'GTO러버', userRole: 'user', userColor: '#10B981',
    content: 'PIO Solver 사용법 강의 영상 정리해드릴까요?',
    createdAt: now(820), likeCount: 38, commentCount: 24 },
  { id: 'p12', userId: 'u1', userName: '딜러지망생', userRole: 'user', userColor: '#EF4444',
    content: '딜러 자격증 시험 후기 궁금합니다. 어디서 보셨어요?',
    createdAt: now(960), likeCount: 5, commentCount: 8 },
];

// ── 목업 중고장터 공지 ───────────────────────────────────────────────────────

export const MOCK_NOTICES: MarketplaceNotice[] = [
  {
    id: 'nt1',
    type: 'caution',
    title: '거래 사기 주의 안내',
    body: '직거래 시 반드시 매장 또는 사람 많은 공공장소에서 만나주세요. 선입금 요구하는 거래는 모두 거절하세요.',
    authorName: '운영자',
    createdAt: now(60 * 24 * 2), // 2일 전
  },
  {
    id: 'nt2',
    type: 'event',
    title: 'ROTI ARENA 매장 단체 처분 — 칩셋·테이블 다수 등록',
    body: '리뉴얼 진행에 따라 ROTI ARENA에서 보유 중인 일부 칩셋·테이블을 정리합니다. 본 매장 방문 후 직거래 가능.',
    authorName: 'ROTI ARENA',
    createdAt: now(60 * 8),
  },
];

// ── 목업 중고장터 리스팅 (안전거래 필드 제거, 이미지 선택) ───────────────────

export const MOCK_LISTINGS: MarketplaceListing[] = [
  {
    id: 'm1', title: '정품 KEM 100% 플라스틱 카드 세트 (블랙/레드)',
    category: 'pokerGear',
    description: '미국 KEM 사 정품 플라스틱 카드 2덱 세트입니다.\n1년 정도 사용했고 코너 마모 거의 없습니다.',
    price: 70000, condition: 'S', status: 'on_sale',
    images: [],
    region: '강남', shippingAvailable: true, pickupOnly: false,
    sellerId: 'u1', sellerName: '카드매니아', sellerAvatarColor: '#0EA5E9',
    sellerTradeCount: 53, sellerVerified: true,
    createdAt: now(20), viewCount: 142, likeCount: 8, commentCount: 3,
  },
  {
    id: 'm2', title: '카지노급 11.5g 클레이 칩셋 500개 (알루미늄 케이스)',
    category: 'gameMoney',
    description: '11.5g 정품 클레이 칩 500개 풀세트. 알루미늄 캐리 케이스 포함.',
    price: 180000, condition: 'A', status: 'on_sale',
    images: [],
    region: '강남', shippingAvailable: true, pickupOnly: false,
    sellerId: 'o1', sellerName: 'ROTI ARENA', sellerAvatarColor: '#C9A961',
    sellerTradeCount: 21, sellerVerified: true,
    createdAt: now(60), viewCount: 287, likeCount: 24, commentCount: 7,
  },
  {
    id: 'm3', title: '폴딩 포커 테이블 9인용 (피드 패치 양호)',
    category: 'pokerGear',
    description: '오프라인 매장에서 사용하던 9인용 폴딩 테이블입니다.\n부피가 커서 직거래만 가능합니다.',
    price: 250000, condition: 'B', status: 'on_sale',
    images: [],
    region: '판교', shippingAvailable: false, pickupOnly: true,
    sellerId: 'u1', sellerName: '스택홀덤', sellerAvatarColor: '#92400E',
    sellerTradeCount: 8, sellerVerified: true,
    createdAt: now(180), viewCount: 89, likeCount: 5, commentCount: 4,
  },
  {
    id: 'm4', title: '오토매틱 카드 셔플러 (2덱용, 건전지 작동)',
    category: 'pokerGear',
    description: '자동 셔플러입니다. 2덱까지 사용 가능. AA 건전지 4개로 작동합니다.',
    price: 95000, condition: 'A', status: 'reserved',
    images: [],
    region: '홍대', shippingAvailable: true, pickupOnly: false,
    sellerId: 'u1', sellerName: '딜링장인', sellerAvatarColor: '#A78BFA',
    sellerTradeCount: 34, sellerVerified: true,
    createdAt: now(240), viewCount: 198, likeCount: 11, commentCount: 5,
  },
  {
    id: 'm5', title: 'WSOP 공식 후드 (사이즈 L, 미착용)',
    category: 'etc',
    description: '라스베가스 WSOP 굿즈샵에서 구매한 후드티입니다. 사이즈가 안 맞아 미착용.',
    price: 35000, condition: 'S', status: 'sold',
    images: [],
    region: '강남', shippingAvailable: true, pickupOnly: false,
    sellerId: 'u1', sellerName: 'WSOP갈래', sellerAvatarColor: '#DC2626',
    sellerTradeCount: 12, sellerVerified: false,
    createdAt: now(1440), viewCount: 412, likeCount: 19, commentCount: 12,
  },
  {
    id: 'm6', title: 'Super System 2 한정판 양장본',
    category: 'etc',
    description: 'Doyle Brunson 슈퍼시스템 2 한정판 양장본 (영문). 본문 깨끗.',
    price: 25000, condition: 'A', status: 'on_sale',
    images: [],
    region: '강남', shippingAvailable: true, pickupOnly: false,
    sellerId: 'u1', sellerName: '책벌레딜러', sellerAvatarColor: '#10B981',
    sellerTradeCount: 67, sellerVerified: true,
    createdAt: now(300), viewCount: 76, likeCount: 4, commentCount: 1,
  },
  {
    id: 'm7', title: 'Holdem Manager 3 정품 라이센스 양도',
    category: 'gameMoney',
    description: 'HM3 정품 라이센스 양도합니다. 잔여 사용일 약 11개월.',
    price: 120000, condition: 'S', status: 'on_sale',
    images: [],
    region: '비대면', shippingAvailable: false, pickupOnly: false,
    sellerId: 'u1', sellerName: 'GTO마스터', sellerAvatarColor: '#06B6D4',
    sellerTradeCount: 4, sellerVerified: true,
    createdAt: now(45), viewCount: 105, likeCount: 9, commentCount: 6,
  },
  {
    id: 'm8', title: '4덱용 디스카드 카드슈 + 컷카드 2장',
    category: 'pokerGear',
    description: '4덱용 카드슈와 컷카드 2장 세트입니다.',
    price: 45000, condition: 'B', status: 'on_sale',
    images: [],
    region: '부산', shippingAvailable: true, pickupOnly: false,
    sellerId: 'u1', sellerName: '딜러7년차', sellerAvatarColor: '#F59E0B',
    sellerTradeCount: 18, sellerVerified: true,
    createdAt: now(720), viewCount: 134, likeCount: 6, commentCount: 2,
  },
];
