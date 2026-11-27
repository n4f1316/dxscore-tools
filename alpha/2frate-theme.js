/* 2fRATE：表示（ダーク／ライト）の切り替え。各ページの <head> で、2frate.css のすぐあとに読み込む。
   - 選んだ表示はブラウザ（localStorage）に保存し、次に開いたときもその表示にする
   - まだ選んでいないときは、ライトで表示する
   - ページ内の class="theme-toggle" のボタンを切り替えボタンにする */
// 数字を1文字ずつ同じ幅の枠に入れる（使っている書体は数字ごとに幅が違うため、桁の位置をそろえる）
//   例：tnum(要素) … 要素の文字を <span class="dg"> に分ける。小数点は細い枠（dg-dot）
window.tnum = (node) => {
  const text = node.textContent;
  node.textContent = '';
  node.setAttribute('aria-label', text); // 読み上げでは元の数値として読む
  for (const ch of text) {
    const s = document.createElement('span');
    s.className = /[0-9]/.test(ch) ? 'dg' : (ch === '.' ? 'dg dg-dot' : 'dg-other');
    s.setAttribute('aria-hidden', 'true');
    s.textContent = ch;
    node.appendChild(s);
  }
  return node;
};

(() => {
  'use strict';
  const KEY = '2frate-theme';
  const root = document.documentElement;
  const load = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
  const current = () => (root.dataset.theme === 'dark' ? 'dark' : 'light');
  // 言語の切り替え（2frate-i18n.js）があれば、ボタンの文字もその言語にする
  const LABELS = {
    ja: { dark: '表示：ダーク', light: '表示：ライト', hint: '（押すと切り替え）' },
    en: { dark: 'Theme: Dark', light: 'Theme: Light', hint: ' (tap to switch)' },
    ko: { dark: '화면: 다크', light: '화면: 라이트', hint: ' (눌러서 전환)' },
  };
  const words = () => LABELS[window.I18N?.lang] || LABELS.ja;
  const label = () => words()[current()];
  const paint = () => document.querySelectorAll('.theme-toggle').forEach((b) => {
    b.textContent = label();
    b.setAttribute('aria-label', label() + words().hint);
  });
  document.addEventListener('2frate-lang', () => paint());
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
