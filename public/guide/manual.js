// 읽기 진행률 — 긴 문서에서 '얼마나 남았나' 를 보여 준다. 라이브러리 없이 스크롤 비율 한 줄.
// (public/guide/manual.html 의 인라인 스크립트였다 — 강제 CSP(SEC-03) 때문에 같은 출처 파일로 옮겼다. 동작 동일.)
(function () {
  var pg = document.querySelector('.bar .pg');
  if (!pg) return;
  var tick = function () {
    var h = document.documentElement;
    var max = h.scrollHeight - h.clientHeight;
    pg.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + '%';
  };
  addEventListener('scroll', tick, { passive: true });
  addEventListener('resize', tick);
  tick();
})();
