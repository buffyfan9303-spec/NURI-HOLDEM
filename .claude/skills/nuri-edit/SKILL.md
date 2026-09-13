---
name: nuri-edit
description: 기존 파일을 고치기 직전에 호출하라 — 이 저장소는 파일마다 줄끝(CRLF/LF)이 다르고 BOM 붙은 파일이 8개 있어, 도구가 내용을 제대로 바꾸고도 줄끝·BOM 을 뒤집어 파일 전체를 더럽힌다. 편집 전 줄끝·BOM 실측, Edit/Write/파이썬 중 무엇을 쓸지 판정, 앵커 유일성·원자적 쓰기 절차를 정한다. "안 고친 파일이 M 으로 뜬다"·"diff 가 비었는데 수정됨"·"첫 줄만 바뀌었다" 증상 조사에도 쓴다.
---

# nuri-edit — 파일 편집 안전 (줄끝·BOM·앵커)

이 저장소는 **줄끝이 섞여 있다.** 한 줄로 다시 재라(2026-09-13 실측값이 아래 주석):

```bash
git ls-files --eol | awk '{print $2}' | sort | uniq -c
#  485 w/lf   314 w/crlf   2 w/mixed   113 w/-text(바이너리)   1 w/(삭제된 파일)
git ls-files --eol -- '*.ts' | awk '{print $2}' | sort | uniq -c
#  169 w/lf   162 w/crlf   1 w/mixed     ← .ts 만 봐도 반반이다
```

**수치는 커밋마다 움직인다 — 문서의 숫자를 믿지 말고 위 명령을 돌려라.**

원인은 `core.autocrlf=true` (실측: `git config core.autocrlf` → `true`) 다.
`.gitattributes` 에는 규칙이 `public/legal/*.html eol=lf` **한 줄뿐**(주석 1줄 + 규칙 1줄)이라 나머지는 전부
autocrlf 에 맡겨져 있고, **텍스트 파일의 인덱스는 802개 전부 `i/lf`** 인데 작업본만 파일마다 다르다
(바이너리 113개는 `i/-text` 로 빠진다).

그래서 **"내 환경의 줄끝"이라는 건 없다. 파일마다 다르다. 열기 전에 재라.**

---

## 0) 편집 전 30초 — 반드시 먼저

```bash
git ls-files --eol <path>     # 추적 파일: i/(인덱스) w/(작업본) 을 한 줄로 말한다. 이게 1순위
```

`w/crlf` · `w/lf` · `w/mixed` 를 그대로 읽으면 된다. 미추적 파일이거나 BOM 까지 봐야 하면:

```bash
python -X utf8 -c "import sys;b=open(sys.argv[1],'rb').read();c=b.count(b'\r\n');l=b.count(b'\n')-c;print(sys.argv[1],'->','MIXED' if c and l else 'CRLF' if c else 'LF','bom=%s'%(b[:3]==b'\xef\xbb\xbf'))" <path>
```

실측 출력:
```
src/api/clock.ts      -> CRLF bom=False
src/lib/regStatus.ts  -> LF   bom=False
src/api/community.ts  -> CRLF bom=True
e2e/nuri-spot.spec.ts -> MIXED bom=False
```

교차 신호로 `file <path>` 도 정확하다 — `with CRLF line terminators` · `UTF-8 (with BOM) text` 를 그대로 말한다.

### 🔴 `grep` 으로 재지 마라 — 이 환경에서 **거짓말한다**

```bash
# 통제 실험(2026-09-13): 바이트로 CRLF 3개인 파일에 대해
grep -c $'\r' crlf.txt   # -> 0   ❌ (진짜 값은 3)
rg   -c $'\r' crlf.txt   # -> 3   ✅
```

`$'\r'` 자체는 정상 확장된다(`od -c` 로 확인). Git Bash 의 grep 이 파일을 텍스트 모드로 열어 **CR 을 먼저 지워버린다.**
결과적으로 `grep` 은 **CRLF 파일을 항상 LF 로 오판한다** — 그 말을 믿고 LF 로 쓰면 파일 전체 줄끝이 뒤집힌다.
`rg`(ripgrep 14.1.1, 설치돼 있음)는 정확하다.

> ⚠️ 과거 메모에 "`grep -c $'\r'` 가 빈 패턴이 되어 전 줄을 세므로 LF 를 CRLF 로 오판한다" 고 적힌 판본이 있다.
> **오판 방향이 반대다.** 실측은 양쪽 파일 모두 `0`(exit 1) — 위험은 "CRLF 를 LF 로 본다" 쪽이다.

---

## 1) 도구 선택 — 실측 기준 (2026-09-13 직접 시험)

| 도구 | CRLF | BOM | 언제 |
|---|---|---|---|
| **Edit** | ✅ 보존 | ✅ 보존 | **기본값.** 짧고 유일한 앵커 1~수 곳 |
| **Write** | ❌ **LF 로 바꿈** | ❌ **떨어뜨림** | **새 파일 전용** |
| **python(바이트)** | 스크립트가 책임 | 스크립트가 책임 | 대량·정규식·여러 곳 |

실측 근거:

- **Edit** — CRLF 파일에 `\n` 으로 쓴 여러 줄 앵커가 **정상 매칭**됐고, 저장 결과도
  `b'const a = 1;\r\nconst b = 99;\r\nconst c = 3;\r\n'` 로 **CRLF 유지**. BOM+CRLF 파일도 `\xef\xbb\xbf` 와 CRLF 둘 다 유지.
  → **"Edit 은 CRLF 파일에서 앵커가 안 맞는다"는 옛 메모는 현재 판본에서 재현되지 않는다.** 줄 번호 기반 교체로 우회할 필요 없다.
  🔴 **이건 `Edit` 도구 한정이다. 바이트 치환·`sed`·`grep` 은 여전히 깨진다** — CRLF 파일에서 `\n` 이 든 앵커는
  **조용히 0회 매칭**된다(실측: `src/api/clock.ts` 에서 두 줄 앵커를 `\r\n` 으로 주면 1회, `\n` 으로 주면 **0회**).
  `nuri-verify` 의 "앵커에 줄끝을 넣지 마라"(파이썬 `b.replace` 로 변형·원복하는 절차)는 **그대로 유효하다.**
- **Write** — CRLF 파일에 덮어쓰니 `crlf=0 lf_only=3`, BOM 파일은 `bom=False`. **둘 다 파괴된다.**
  → 기존 파일에 Write 를 쓰려거든 **먼저 위 0) 을 재고**, CRLF 거나 BOM 이면 Write 대신 Edit 이나 파이썬을 써라.

> `Read` 는 BOM 을 **보여주지 않는다.** BOM 있는 파일과 없는 파일의 Read 출력이 바이트까지 똑같다(실측).
> 눈으로는 절대 못 가린다 — 반드시 0) 을 재라.

---

## 2) 사고가 어떻게 보이는가 — 증상으로 역추적

격리 저장소(`core.autocrlf=true`, `i/lf w/crlf` 재현)에서 직접 만들어 본 결과:

| 무엇을 망쳤나 | `git status` | `git diff` | 눈에 띄나 |
|---|---|---|---|
| **줄끝 CRLF→LF** | ` M file` | **완전히 빈다** (warning 한 줄뿐) | ❌ **거의 안 보인다** |
| **BOM 제거** | ` M file` | `-<BOM>const x = 1;` / `+const x = 1;` 1줄 | ⚠️ 첫 줄만 바뀐 이상한 diff |

즉 **줄끝을 뒤집으면 "수정됨"으로는 뜨는데 diff 는 비어 있다.**
리뷰에서 안 보이고, 손대지도 않은 파일이 `M` 으로 남아 다음 사람을 혼란시킨다.

### 유령 수정 탐지 (읽기 전용)

```bash
cd "<repo>"
T="$(mktemp -d)"
git status --porcelain 2>/dev/null | grep '^ M' | sed 's/^ M //' | sort > "$T/mod.txt"
git diff --numstat  2>/dev/null | cut -f3            | sort > "$T/num.txt"
comm -23 "$T/mod.txt" "$T/num.txt"   # 여기 뜬 파일 = 내용 변화 0, 줄끝만 뒤집힌 것
```

> 고정 경로(`/tmp/_mod.txt`)를 쓰지 마라 — 이 저장소에는 **에이전트가 병렬로 붙는다.** 같은 파일명을 둘이 쓰면
> 서로의 목록을 덮어 **거짓 음성**(유령이 있는데 비어 보임)이 난다. `mktemp -d` 로 매번 새로 받아라.
> `2>/dev/null` 이 없으면 `LF will be replaced by CRLF ...` 경고가 결과를 묻는다(실측 59줄 — 수정 파일 수만큼
> 늘어난다). 경고 자체는 정상이다 — autocrlf 가 일하고 있다는 뜻일 뿐이다.

**판정**: 출력이 비면 정상. 2026-09-13 기준 이 저장소는 **0건**(수정 123개 전부 실제 내용 변화).
파일이 뜨면 그 파일은 내용을 안 고쳤으니 **줄끝만 되돌리면 된다**.

**빈 출력을 믿기 전에 양성 대조를 한 번 해라**(`nuri-verify` 의 논리다 — 안 울리는 탐지기는 탐지기가 아니다).
아래를 그대로 돌리면 `a.txt` 가 떠야 한다. 안 뜨면 탐지기 쪽이 고장난 것이다:

```bash
R="$(mktemp -d)" && cd "$R" && git init -q . && git config core.autocrlf true
printf 'const x = 1;\r\nconst y = 2;\r\n' > a.txt
git add -A && git -c user.email=t@t -c user.name=t commit -qm init
python -X utf8 -c "d=open('a.txt','rb').read().replace(b'\r\n',b'\n');open('a.txt','wb').write(d)"
git status --porcelain      # ' M a.txt'
git diff                    # 비어 있다  <- 이게 위험한 이유
```

> ⚠️ `git diff --stat` 으로 이 비교를 하지 마라 — 긴 경로를 `...` 로 잘라서 **거짓 양성**이 난다.
> 실제로 이 방법으로 migration 파일 2개를 유령으로 오진했다가 `--numstat` 으로 다시 재서 아님을 확인했다. **`--numstat` 을 써라.**

---

## 3) 안전 치환 템플릿 (대량·정규식용)

**정규식·백슬래시가 든 스크립트는 `-c` 인라인 말고 파일로 써서 실행해라**(Write 도구 → `python -X utf8 <path>`).
쉘 인용 층을 하나 없애는 게 목적이다.

```python
# -*- coding: utf-8 -*-
import sys
PATH = sys.argv[1]
OLD  = "..."   # 앵커
NEW  = "..."

raw  = open(PATH, 'rb').read()
bom  = raw.startswith(b'\xef\xbb\xbf')
body = raw[3:] if bom else raw

crlf = body.count(b'\r\n')
lf   = body.count(b'\n') - crlf
assert not (crlf and lf), "MIXED EOL: %s (crlf=%d lf=%d) - stop" % (PATH, crlf, lf)
nl = '\r\n' if crlf else '\n'

text = body.decode('utf-8')          # UTF-8 아니면 여기서 멈춘다
text = text.replace('\r\n', '\n')    # 정규화 -> 앵커는 \n 으로 쓴다

assert text.count(OLD) == 1, "anchor found %d times - stop" % text.count(OLD)
text = text.replace(OLD, NEW)

out = text.replace('\n', nl).encode('utf-8')
if bom:
    out = b'\xef\xbb\xbf' + out

with open(PATH, 'wb') as f:          # 모든 검증 통과 후 단 한 번 쓴다
    f.write(out)
sys.stdout.buffer.write(b"OK\n")
```

**왜 이 모양인가** — 5개 픽스처로 검증했다:

| 입력 | 결과 |
|---|---|
| CRLF | `\r\n` 유지 ✅ |
| LF | `\n` 유지 ✅ |
| BOM+CRLF | BOM·CRLF 둘 다 유지 ✅ |
| MIXED | **중단, 파일 무변경** ✅ |
| 앵커 2곳 | **중단, 파일 무변경** ✅ |

지켜야 할 네 가지:
1. **`'rb'`/`'wb'` 로만 연다.** 텍스트 모드로 열면 파이썬이 줄끝을 임의 변환한다.
2. **`assert count==1`** — 앵커가 0곳이면 조용한 실패, 2곳이면 엉뚱한 곳을 고친다. 둘 다 중단이 맞다.
3. **쓰기는 맨 마지막 한 번.** 중간에 죽어도 파일이 반쯤 고쳐진 상태로 남지 않는다.
4. **MIXED 는 스크립트가 거부하게 둬라.** 아래 4) 로 간다.

---

## 4) MIXED 가 나오면 — 고치지 말고 멈춰라

목록은 항상 다시 뽑아라 — `git ls-files --eol | grep 'w/mixed'`.
2026-09-13 기준 **2개**:

| 파일 | 비율 |
|---|---|
| `e2e/nuri-spot.spec.ts` | crlf=272 / lf=38 |
| `src/components/features/StoreDashboard.tsx` | crlf=1651 / lf=**4** |

`StoreDashboard.tsx` 의 lone LF 4개가 어디 있는지 실측하면 **172·201·245·368행**, 넷 다 `.catch(...)` 로 끝나는 줄이다
(172·201·368 은 `).catch(() => {});`, 245 는 `.catch((e) => { if (rFresh()) setResCountsErr(e); });`).
**과거 편집이 CRLF 파일에 LF 를 꽂아 넣은 자국**이다 — 같은 손질이 지나간 자리마다 남았다. MIXED 는 이렇게 생긴다.

**규칙**:
- MIXED 파일은 **전체 줄끝 통일을 임의로 하지 마라.** 통일하면 diff 는 비고(2 표 참조) 파일 전체가 `M` 으로 남아,
  이 파일들을 동시에 만지는 다른 작업과 충돌한다.
- 고칠 곳만 **Edit** 으로 건드려라(Edit 은 주변 줄끝을 보존한다 — 1 표).
- 줄끝 통일 자체가 목적이면 **그것만 하는 별도 변경**으로 분리하고, 근거(어떤 도구가 언제 꽂았는지)를 남겨라.
- ⚠️ `e2e/nuri-spot.spec.ts` 는 **사용자 작업물**이다. 줄끝을 이유로 손대지 마라.

---

## 5) 파이썬 출력이 죽어 스크립트가 중단되는 문제

실측: `sys.stdout.encoding` = **cp949** (콘솔 코드페이지 949).

```
print('한글')      -> 깨져 보이지만 exit 0  (cp949 에 한글은 있다)
print('a · b')    -> 깨져 보이지만 exit 0
print('a → b')    -> 깨져 보이지만 exit 0
print('a — b')    -> ❌ UnicodeEncodeError, exit 1   ← em dash U+2014
print('a ✅ b')    -> ❌ UnicodeEncodeError, exit 1   ← 이모지
```

**이 프로젝트 문서는 `—` 와 `✅` 로 가득하다.** 그걸 그대로 진행 메시지에 넣으면 스크립트가 **쓰기 전에 죽는다.**
(3 템플릿의 assert 메시지를 ASCII 로 적어 둔 이유다.)

셋 다 통하는 회피책(실측):
```bash
python -X utf8 <script>              # 가장 간단 — 이걸 써라
PYTHONIOENCODING=utf-8 python <script>
# 또는 스크립트 안에서: sys.stdout.buffer.write("....".encode('utf-8'))
```

> **콘솔이 깨져 보여도 파일은 UTF-8 로 멀쩡하다.** 출력 모지바케만 보고 "파일이 깨졌다" 고 판단하지 마라 —
> 판정은 항상 0) 의 바이트 측정으로 한다.

---

## 6) 알아 둘 잡다한 실측

- **bash 의 `/tmp` ≠ 윈도우 파이썬의 `/tmp`.** bash 가 `printf > /tmp/x` 로 만든 파일을 파이썬이
  `FileNotFoundError` 로 못 읽었다. 쉘과 파이썬이 파일을 주고받을 땐 **스크래치패드 절대경로**를 써라.
- **heredoc** — `<<'PY'`(따옴표 있음)는 백슬래시를 **보존했다**(`re.compile(r'\d+\s*\n')` 그대로 파일에 들어감).
  따옴표 없는 `<<PY` 도 `\d` 는 살았지만 `$`·`` ` ``·`\\` 는 쉘이 먹는다. **`<<'PY'` 로 쓰거나, 그냥 Write 도구로 파일을 만들어라.**
- **BOM 파일 8개** — 2026-09-13 결과:
  `src/api/auth.ts` · `src/api/community.ts` · `src/api/marketplace.ts` · `src/api/schedules.ts` ·
  `src/components/features/PosterFormModal.tsx` · `src/lib/content-filter.ts` · `src/lib/storage.ts` · `supabase/schema.sql`
  이 8개는 Write 로 덮는 순간 BOM 이 사라져 **첫 줄짜리 가짜 diff** 가 난다.
- **lone CR(구 Mac 줄끝) 0건 · 비 UTF-8 파일 0건** — 현재는 없다. 새로 생기면 0) 의 측정이 잡는다.

BOM 목록을 다시 뽑는 명령(추적 파일 전수, 수 초. `os.path.isfile` 가드가 없으면 **삭제 예정 파일**에서
`FileNotFoundError` 로 죽는다 — 실측: `src/components/features/gto/gto.deep.data.ts`):

```bash
python -X utf8 -c "import subprocess,os;[print(p) for p in (f.decode('utf-8') for f in subprocess.run(['git','ls-files','-z'],capture_output=True).stdout.split(b'\x00') if f) if os.path.isfile(p) and open(p,'rb').read(3)==b'\xef\xbb\xbf']"
```

- `git ls-files -z | xargs -0 ... od` 로 돌리지 마라 — 파일마다 프로세스를 띄워 **2분 타임아웃에 걸려 죽는다**(실측).
- **`python -c "…"` 를 목록 안에 들여쓴 코드블록으로 옮겨 적지 마라.** 복사하면 앞 공백까지 딸려가 파이썬이
  `IndentationError: unexpected indent` 로 죽는다(실측 — 이 문서를 쓰다 실제로 냈다). 여러 줄 파이썬은 **한 줄로 접거나 파일로 써라.**

---

## 이 스킬이 못 보는 것 (한계 — 숨기지 마라)

1. **UTF-16/EUC-KR 등 UTF-8 이 아닌 파일.** 0) 의 파이썬 한 줄은 `open('rb')` 라 열리긴 하지만,
   UTF-16 은 모든 ASCII 바이트 사이에 `\x00` 이 끼어 CRLF 계수가 무의미해진다. 현재 저장소엔 **0건**이지만
   새로 들어오면 이 절차는 **조용히 틀린 답을 준다.** 의심되면 `file <path>` 로 인코딩부터 확인해라.
2. **BOM 은 UTF-8 BOM(`EF BB BF`)만 본다.** UTF-16 BOM(`FF FE`/`FE FF`)은 판별하지 않는다.
3. **`git ls-files --eol` 은 추적 파일만.** 미추적·`.gitignore` 파일은 파이썬 한 줄로 재야 한다.
4. **MIXED 판정은 "섞였다"까지만** — 어느 쪽이 원본 의도인지 모른다. 위 `StoreDashboard.tsx` 처럼
   **소수 쪽이 나중에 꽂힌 자국**인 경우가 많지만, 자동 판정하지 말고 이력을 봐라.
5. **탭/스페이스·후행 공백·파일 끝 개행 유무는 다루지 않는다.** 이것들도 diff 를 더럽히지만 별개 문제다.
6. **도구 동작은 2026-09-13 판본 실측이다.** Edit 이 CRLF·BOM 을 보존하는 것은 현재 동작이지
   보장된 계약이 아니다 — 중요한 파일을 고친 뒤에는 2) 의 유령 탐지로 **결과를 재확인**해라.
7. **이 스킬은 "무엇을 고칠지"를 모른다.** 바이트 안전만 본다.
8. **유령 탐지(2)는 "스테이지되지 않은 수정"만 본다.** `git status` 의 `^ M` 과 `git diff`(= unstaged) 를 맞대는 구조라
   **이미 `git add` 한 변경(`M `·`MM`)은 비교 대상에서 빠진다.** 스테이지한 뒤 줄끝이 뒤집히면 이 검사는 **아무 말도 안 한다.**
   그 경우는 `git diff --cached --numstat` 으로 같은 비교를 한 번 더 해라.
9. **수치는 전부 2026-09-13 이 저장소 상태다.** 파일 수·MIXED 목록·BOM 8개는 커밋이 쌓이면 달라진다 —
   인용하지 말고 0) 과 4) 의 명령을 다시 돌려라.

---

## 다른 스킬과의 경계 (겹치면 넘겨라)

- **`nuri-verify`** — 자가검사·계약 테스트를 **일부러 깨뜨려 빨간불을 확인**하는 음성 대조. 거기에도 줄끝 측정이
  나오지만 그건 *음성 대조를 만들다 데인 기록*이다. **"통과를 믿어도 되나"는 `nuri-verify` 가 한다.**
  여기는 **"편집이 파일을 망쳤나"**만 본다.
- **`nuri-ship`** — lint/test/build 게이트. 편집이 끝난 뒤의 검증은 거기로.
- **`nuri-migration`** — `.sql` 을 고친다면 DB 절차는 그쪽. 단 `.sql` 도 **LF 152 / CRLF 52** 로 섞여 있으니
  파일을 여는 순간은 이 스킬의 0) 이 먼저다.
- **`nuri-e2e`** — `npm run test:e2e` 직접 실행 금지 절차는 그쪽이 관리한다.
