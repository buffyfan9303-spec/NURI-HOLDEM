// Play 업로드용 Android 패키지(AAB) 생성 — Bubblewrap(TWA) 래퍼.
//
// 설정 원본은 playstore/twa/twa-manifest.json 하나다(패키지 com.nuriholdem.twa · 색·아이콘·바로가기).
// 이 스크립트는 그 파일을 **저장소 밖** 작업 폴더로 복사해 Gradle 프로젝트를 만들고 빌드한다 —
// 생성된 android 프로젝트·빌드 산출물·서명 키는 저장소에 들어오지 않는다(공개 저장소, 보안 표준 §1).
//
// 실행
//   검증 빌드(서명 없음 — 누구나): node scripts/playstore-twa.mjs
//   업로드 빌드(오너 PC 에서만):     node scripts/playstore-twa.mjs --release --keystore <업로드 키 경로>
//     비밀번호는 환경변수 BUBBLEWRAP_KEYSTORE_PASSWORD · BUBBLEWRAP_KEY_PASSWORD 로만 받는다(인자·파일에 적지 않는다).
//   공통 옵션: --out <작업 폴더>(기본: OS 임시 폴더/nuri-twa-build) · --version-code <정수> · --version-name <문자열>
//
// 전제: Bubblewrap CLI(npm i -g @bubblewrap/cli) + JDK 17 + Android SDK — `bubblewrap doctor` 로 확인.
//   이 PC 에는 ~/.bubblewrap 에 JDK 17.0.20.1·SDK(platform 36, build-tools 36.1.0)가 이미 있다(2026-10-08 실측).
//
// ⚠ Windows 함정(2026-10-08 실측): 이 PC 는 NoDefaultCurrentDirectoryInExePath=1 이라 cmd 가 현재 폴더의
//   gradlew.bat 을 찾지 못해 `bubblewrap build` 가 "'gradlew.bat' 은(는) … 아닙니다" 로 실패한다.
//   그래서 작업 폴더를 PATH 맨 앞에 넣고 부른다.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir, homedir } from 'node:os';

const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i > -1 ? process.argv[i + 1] : d;
};
const RELEASE = process.argv.includes('--release');
const OUT = resolve(arg('--out', join(tmpdir(), 'nuri-twa-build')));
const SRC = resolve('playstore/twa/twa-manifest.json');
const MIN_TARGET_SDK = 36; // Play: 2026-08-31 부터 신규 앱·업데이트 Android 16(API 36) 이상

if (OUT.startsWith(resolve('.'))) {
  console.error('✗ --out 은 저장소 밖이어야 한다(생성 프로젝트·키가 커밋되지 않게): ' + OUT);
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

// twa-manifest 복사 + 버전 덮어쓰기(원본은 그대로 둔다 — 버전은 업로드 때마다 올리는 값이라 인자로 받는다)
const twa = JSON.parse(readFileSync(SRC, 'utf8'));
const vc = arg('--version-code');
const vn = arg('--version-name');
if (vc) twa.appVersionCode = Number(vc);
if (vn) twa.appVersion = vn;
if (RELEASE) {
  const ks = arg('--keystore');
  if (!ks || !existsSync(ks)) { console.error('✗ --release 에는 실제로 있는 --keystore <경로> 가 필요하다'); process.exit(1); }
  if (!process.env.BUBBLEWRAP_KEYSTORE_PASSWORD || !process.env.BUBBLEWRAP_KEY_PASSWORD) {
    console.error('✗ BUBBLEWRAP_KEYSTORE_PASSWORD · BUBBLEWRAP_KEY_PASSWORD 환경변수가 필요하다(값은 출력하지 않는다)');
    process.exit(1);
  }
  twa.signingKey = { path: resolve(ks), alias: arg('--alias', twa.signingKey.alias) };
}
writeFileSync(join(OUT, 'twa-manifest.json'), JSON.stringify(twa, null, 2));

const env = { ...process.env, PATH: OUT + (process.platform === 'win32' ? ';' : ':') + process.env.PATH };
const run = (args) => {
  console.log('\n$ bubblewrap ' + args.join(' '));
  const r = spawnSync('bubblewrap', args, { cwd: OUT, env, stdio: ['ignore', 'inherit', 'inherit'], shell: true });
  if (r.status !== 0) { console.error('✗ bubblewrap ' + args[0] + ' 실패(종료 코드 ' + r.status + ')'); process.exit(r.status || 1); }
};

run(['update', '--skipVersionUpgrade']);
run(RELEASE ? ['build', '--skipPwaValidation'] : ['build', '--skipSigning', '--skipPwaValidation']);

// 산출물 확인 — targetSdk 가 Play 하한 이상인지 aapt2 로 직접 읽는다(템플릿 버전을 믿지 않는다)
const apk = join(OUT, RELEASE ? 'app-release-signed.apk' : 'app-release-unsigned-aligned.apk');
const aab = join(OUT, 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab');
const signedAab = join(OUT, 'app-release-bundle.aab');
const cfgPath = join(homedir(), '.bubblewrap', 'config.json');
const sdk = existsSync(cfgPath) ? JSON.parse(readFileSync(cfgPath, 'utf8')).androidSdkPath : process.env.ANDROID_HOME;
const bt = sdk && existsSync(join(sdk, 'build-tools')) ? readdirSync(join(sdk, 'build-tools')).sort().pop() : null;
if (bt && existsSync(apk)) {
  const r = spawnSync(join(sdk, 'build-tools', bt, process.platform === 'win32' ? 'aapt2.exe' : 'aapt2'), ['dump', 'badging', apk], { encoding: 'utf8' });
  const target = Number((r.stdout.match(/targetSdkVersion:'(\d+)'/) || [])[1]);
  const pkg = (r.stdout.match(/package: name='([^']+)'/) || [])[1];
  console.log(`\n패키지 ${pkg} · targetSdk ${target}`);
  if (pkg !== 'com.nuriholdem.twa' || !(target >= MIN_TARGET_SDK)) {
    console.error(`✗ 패키지명 또는 targetSdk(${MIN_TARGET_SDK} 이상) 불일치 — Play 가 업로드를 거부한다`);
    process.exit(1);
  }
}
const finalAab = RELEASE && existsSync(signedAab) ? signedAab : aab;
if (!existsSync(finalAab)) { console.error('✗ AAB 가 없다: ' + finalAab); process.exit(1); }
if (!RELEASE) {
  copyFileSync(finalAab, join(OUT, 'nuri-unsigned-verify.aab'));
  console.log('✓ 검증용(서명 없음) AAB: ' + join(OUT, 'nuri-unsigned-verify.aab') + ' — Play 에는 올릴 수 없다(업로드 키 서명 필요)');
} else {
  console.log('✓ 업로드용 AAB: ' + finalAab);
}
