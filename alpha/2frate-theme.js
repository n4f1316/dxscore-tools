/* 2fRATE：表示（ダーク／ライト）の切り替え。各ページの <head> で、2frate.css のすぐあとに読み込む。
   - 選んだ表示はブラウザ（localStorage）に保存し、次に開いたときもその表示にする
   - まだ選んでいないときは、ライトで表示する
   - ページ内の class="theme-toggle" のボタンを切り替えボタンにする */
(() => {
  'use strict';
  const KEY = '2frate-theme';
  const root = document.documentElement;
  const load = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
  const current = () => (root.dataset.theme === 'dark' ? 'dark' : 'light');
  const label = () => (current() === 'dark' ? '表示：ダーク' : '表示：ライト');
  const paint = () => document.querySelectorAll('.theme-toggle').forEach((b) => {
    b.textContent = label();
    b.setAttribute('aria-label', `${label()}（押すと切り替え）`);
  });
  const apply = (theme) => { root.dataset.theme = theme; paint(); };

  // 読み込み時：保存してある表示 → なければライト
  apply(load() === 'dark' ? 'dark' : 'light');

  const wire = () => {
    document.querySelectorAll('.theme-toggle').forEach((b) => {
      b.type = 'button';
      b.onclick = () => {
        const next = current() === 'dark' ? 'light' : 'dark';
        try { localStorage.setItem(KEY, next); } catch { /* 保存できない環境では、このページの間だけ切り替える */ }
        apply(next);
      };
    });
    paint();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
