// supabase/functions/_shared/email/supportReply.ts — 1:1 문의 답변 메일(제목·본문). 순수 함수.
// 🔴 제목·카테고리·닉네임·답변은 전부 사람이 쓴 값이다 — 여기서 esc/nl2br 를 거친다. 메일 제목(subject)에는 사용자 값을 싣지 않는다.
import { button, eyebrow, esc, h1, infoRows, layout, nl2br, notice, p, strong, SUPPORT_URL, textBox } from './layout.ts';

export interface SupportReplyInput {
  nickname: string | null;
  category: string;
  title: string;
  answer: string;
  answeredAt: string; // ISO
  /** 이미 한 번 보낸 답변을 수정해 다시 보내는 경우 */
  isUpdate: boolean;
}

const KST = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
});

export function supportReplyEmail(i: SupportReplyInput): { subject: string; html: string } {
  const subject = i.isUpdate ? '[NURI HOLDEM] 1:1 문의 답변이 수정되었습니다' : '[NURI HOLDEM] 1:1 문의에 답변이 등록되었습니다';
  const who = esc((i.nickname ?? '').trim() || '회원');
  const when = Number.isNaN(Date.parse(i.answeredAt)) ? '' : KST.format(new Date(i.answeredAt));
  const title = esc(i.title);
  const body = [
    eyebrow('고객센터 답변'),
    h1(i.isUpdate ? '문의 답변이 수정되었어요' : '문의하신 내용에 답변드려요'),
    p(`${strong(who)}님, 남겨 주신 1:1 문의에 운영팀 답변이 ${i.isUpdate ? '수정' : '등록'}되었습니다.`, 20),
    infoRows([['카테고리', esc(i.category)], ['문의 제목', title], ...(when ? [['답변 일시', esc(when)] as [string, string]] : [])]),
    textBox('운영팀 답변', nl2br(i.answer)),
    button(SUPPORT_URL, '앱에서 답변 확인하기'),
    notice('이 메일에 회신하시면 전달되지 않아요. 추가로 궁금한 점은 앱 고객센터에서 새 문의로 남겨 주세요.'),
  ].join('\n');
  return { subject, html: layout({ title: esc(subject), preheader: `「${title}」 문의에 답변이 도착했어요`, body }) };
}
