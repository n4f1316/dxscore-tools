/* 2fRATE：表示する言語（日本語／English／한국어）の切り替え。各ページの <head> で、2frate-theme.js より前に読み込む。
   - 選んだ言語はブラウザ（localStorage）に保存し、次に開いたときもその言語にする
   - まだ選んでいないときは、ブラウザの言語が日本語なら日本語、韓国語なら韓国語、それ以外は英語
   - ページの HTML は日本語のまま書き、英語・韓国語は下の辞書（日本語の文 → 訳）で差し替える
     （辞書は「要素の文字だけ（タグを除いたもの）」で引く。訳は HTML で書け、リンクなどを含められる）
     （同じ文でも場所によって訳の HTML を変えたいときは、要素に data-i18n="キー" を付けると、そのキーで引く）
   - 辞書にない文は日本語のまま表示する
   - class="theme-toggle" のボタンの前に、言語を選ぶ欄を自動で置く */
(() => {
  'use strict';
  const KEY = '2frate-lang';
  const LANGS = [['ja', '日本語'], ['en', 'English'], ['ko', '한국어']];
  const DICT = { en: {}, ko: {} };

  const load = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
  const guess = () => {
    const n = String(navigator.language || '').toLowerCase();
    if (n.startsWith('ja')) return 'ja';
    if (n.startsWith('ko')) return 'ko';
    return 'en';
  };
  let lang = LANGS.some(([l]) => l === load()) ? load() : guess();

  const norm = (s) => String(s).replace(/\s+/g, ' ').trim();

  // 訳す対象の要素（この中の文をまとめて差し替える）
  const SEL = 'h1, h2, h3, p, li, th, td, summary, dt, dd, label, button, footer, ' +
    '.badge, .tool-name, .tool-desc, .go, .community-name, .community-desc, .community-go, .author-label, .author-go, ' +
    '.tip, .warn, .ui, .lead, .formula, .page-title span, [data-i18n]';
  // 差し替えると困る要素（ページの処理が中の要素を使っている、入力欄がある など）
  const SKIP = '.code, .theme-toggle, .lang-select, input, select, textarea, canvas, [data-copy]';
  const isProtected = (el) => {
    if (el.matches('.code, .theme-toggle, .lang-select')) return true;
    if (el.id && !el.hasAttribute('data-i18n')) return true;
    return !!el.querySelector('[id], ' + SKIP);
  };

  const originals = new WeakMap(); // 要素 → 日本語の HTML（はじめて見たときのもの）
  const touched = new Set();

  function translateEl(el) {
    if (!originals.has(el)) originals.set(el, { html: el.innerHTML, key: el.getAttribute('data-i18n') || norm(el.textContent) });
    const o = originals.get(el);
    const tr = lang === 'ja' ? null : DICT[lang][o.key];
    const html = tr ?? o.html;
    if (el.innerHTML !== html) el.innerHTML = html; // 辞書（このファイルに書いた固定の文）だけを入れる
    touched.add(el);
  }
  function walk(node) {
    for (const el of node.children) {
      if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;
      if (el.matches(SEL) && !isProtected(el)) translateEl(el);
      else walk(el);
    }
  }

  let titleJa = null;
  function apply() {
    document.documentElement.lang = lang;
    if (titleJa === null) titleJa = document.title;
    document.title = lang === 'ja' ? titleJa : (DICT[lang][norm(titleJa)] ?? titleJa);
    // 一度訳した要素はまず日本語に戻してから、改めて訳す（言語を切り替えたとき用）
    touched.forEach((el) => { const o = originals.get(el); if (o && el.isConnected) el.innerHTML = o.html; });
    touched.clear();
    if (document.body) walk(document.body);
    document.querySelectorAll('.lang-select').forEach((s) => { s.value = lang; });
    document.dispatchEvent(new CustomEvent('2frate-lang', { detail: { lang } }));
  }

  function addSelects() {
    document.querySelectorAll('.theme-toggle').forEach((btn) => {
      if (btn.previousElementSibling?.classList.contains('lang-select')) return;
      const sel = document.createElement('select');
      sel.className = 'lang-select';
      sel.setAttribute('aria-label', 'Language / 言語 / 언어');
      for (const [code, name] of LANGS) {
        const o = document.createElement('option');
        o.value = code;
        o.textContent = name;
        sel.appendChild(o);
      }
      sel.value = lang;
      sel.onchange = () => {
        lang = sel.value;
        try { localStorage.setItem(KEY, lang); } catch { /* 保存できない環境では、このページの間だけ切り替える */ }
        apply();
      };
      // 言語の欄と表示の切り替えボタンを横に並べる
      const box = document.createElement('div');
      box.className = 'head-controls';
      btn.replaceWith(box);
      box.append(sel, btn);
    });
  }

  window.I18N = {
    get lang() { return lang; },
    // 辞書を足す：add({ en: { '日本語の文': 'English' }, ko: { ... } })
    add(d) { for (const l of Object.keys(DICT)) Object.assign(DICT[l], d[l] || {}); },
    // ページの処理（ボタンの文字など）で使う：日本語の文を今の言語にする（訳は文字のみ。辞書にないときは日本語）
    t(ja) {
      if (lang === 'ja') return ja;
      const tr = DICT[lang][norm(ja)];
      return tr === undefined ? ja : tr.replace(/<[^>]+>/g, '');
    },
    apply,
    // 翻訳の確認用（i18n_check.html）：ページ（DOM）の中で訳す対象の文のうち、辞書にないものを返す
    //   返り値：[{ key: '日本語の文', missing: ['en', 'ko'] }, …]
    check(root) {
      const out = [];
      const seen = new Set();
      const look = (node) => {
        for (const el of node.children) {
          if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;
          if (el.matches(SEL) && !isProtected(el)) {
            const key = el.getAttribute('data-i18n') || norm(el.textContent);
            if (/[\u3040-\u30ff\u4e00-\u9fff]/.test(key) && !seen.has(key)) {
              seen.add(key);
              const missing = Object.keys(DICT).filter((l) => DICT[l][key] === undefined);
              if (missing.length) out.push({ key, missing });
            }
          } else look(el);
        }
      };
      look(root);
      return out;
    },
    // 翻訳の確認用：日本語の文が辞書にあるか（ページの処理の中の文を調べるとき）
    has(ja, l) { return DICT[l][norm(ja)] !== undefined; },
    langs: Object.keys(DICT),
  };

  const start = () => { addSelects(); apply(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();

// ===== 辞書（日本語の文 → 訳）。ページの文を変えたときは、ここの日本語（キー）も同じに直す =====
window.I18N.add({
 "en": {
  "2fRATE（α版）": "2fRATE (alpha)",
  "非公式・ファンメイドツール": "Unofficial fan-made tool",
  "2fRATE は、maimai でらっくす の「でらっくスコア」の☆（☆1〜☆7）と譜面定数から計算する、非公式の独自レートです。": "<strong>2fRATE</strong> is an unofficial rating for maimai DX, calculated from the ☆ (☆1–☆7) of your DX Score and the chart constant.",
  "公式のレーティングとは別に、「どれだけでらっくスコアを詰めたか」を数値で確かめられます。公式サイト「maimaiでらっくすNET」にログインした状態で、ブックマークから実行して使います。": "Separate from the official rating, it shows in numbers how far you have pushed your DX Scores. Log in to the official site \"maimai DX NET\" and run it from a bookmark.",
  "ツール": "Tools",
  "2fRATE レート計算ブックマーク": "2fRATE Calculator<span class=\"tag tag-bm\">Bookmark</span>",
  "自分のでらっくスコアから 2fRATE を計算し、レート対象曲50譜面の一覧を表示します。画像の保存やランキングへの登録もここから行えます。": "Calculates your 2fRATE from your DX Scores and lists your top 50 rated charts. You can also save it as an image here.",
  "登録のしかた・使い方を見る →": "How to set it up and use it →",
  "ランキングWeb": "Ranking<span class=\"tag tag-web\">Web</span>",
  "登録された 2fRATE のランキング。☆7まで・☆6まで・☆5までの3種類で見られます。": "Ranking of registered 2fRATE, in three types: up to ☆7, up to ☆6 and up to ☆5. (Japan version only for now)",
  "マイページWeb": "My Page<span class=\"tag tag-web\">Web</span>",
  "ランキングに登録したユーザー名とPINで入り、最後に保存した自分の記録（レート・ベスト枠・達成譜面）を見られます。": "Log in with your ranking user name and PIN to see your last saved record (ratings, best 50, achieved charts). (Japan version only for now)",
  "単曲レート計算Web": "Chart Rating Calculator<span class=\"tag tag-web\">Web</span>",
  "楽曲と☆を選ぶと、その譜面の単曲レート値がわかります。": "Pick a song and a ☆ to see the rating value of that chart.",
  "譜面データビューアWeb": "Chart Data Viewer<span class=\"tag tag-web\">Web</span>",
  "全国ランキング上位100人のでらっくスコアから集計した、譜面ごとのでらっくスコアの取りやすさの目安です。": "How easy each chart is to score on, based on the DX Scores of the top 100 players in the national ranking (Japan version).",
  "レートとランクのしくみ": "How the rating and ranks work",
  "☆の決まり方、単曲レート値の計算式、ランク（WAKABA〜LEGEND）の一覧。": "How ☆ is decided, the chart rating formula, and the list of ranks (WAKABA–LEGEND).",
  "はじめかた": "Getting started",
  "ブックマークを登録「2fRATE レート計算」のページにあるコードを、ブラウザのブックマークに登録します。": "<b>Add the bookmark</b><span>Add the code from the \"2fRATE Calculator\" page to your browser bookmarks.</span>",
  "maimaiでらっくすNET にログイン公式サイトにログインして、どのページでもよいので開きます。": "<b>Log in to maimai DX NET</b><span>Log in to the official site and open any page.</span>",
  "ブックマークを実行登録したブックマークを開くと、数秒〜十数秒で結果が表示されます。": "<b>Run the bookmark</b><span>Open the bookmark you added. The result appears in a few to a dozen or so seconds.</span>",
  "コミュニティ・お問い合わせ": "Community & contact",
  "2fRATE Discord サーバー": "2fRATE Discord server",
  "お知らせ、不具合の報告、要望などはこちらへ。どなたでも参加できます。": "News, bug reports and requests go here. Anyone can join. (Mainly in Japanese)",
  "参加する →": "Join →",
  "製作者": "Author",
  "注意事項": "Notes",
  "非公式のファンメイドツールです。株式会社セガおよび関連会社とは一切関係ありません。このツールに関するお問い合わせは、セガ（公式）ではなく、2fRATE Discord サーバーまたは製作者の X（@Porto_mint）までお願いします。": "This is an unofficial fan-made tool and has no relation to SEGA Corporation or its affiliates. Please send questions about this tool not to SEGA but to the <a href=\"https://discord.gg/FtwW32pdaA\" target=\"_blank\" rel=\"noopener\">2fRATE Discord server</a> or the author on X (<a href=\"https://x.com/Porto_mint\" target=\"_blank\" rel=\"noopener\">@Porto_mint</a>).",
  "楽曲・ジャケット画像・アイコン画像の著作権は、株式会社セガおよび各権利者に帰属します。ジャケット画像・アイコン画像は公式サイトの画像を表示しているもので、本ツールでは保存・配布していません。": "Copyrights of songs, jacket images and icon images belong to SEGA Corporation and their respective owners. Jacket and icon images are displayed from the official site; this tool does not store or distribute them.",
  "譜面データビューアは、公式の全国ランキングをもとに独自に集計した統計で、公式の情報ではありません。プレイヤー名などの個人情報は保存・公開していません。": "The Chart Data Viewer shows our own statistics based on the official national ranking, not official information. Personal information such as player names is not stored or published.",
  "権利者の方からご連絡をいただいた場合は、該当部分の公開停止などに速やかに対応します。": "If we are contacted by a rights holder, we will promptly take down the relevant part or take other action.",
  "レートの計算はすべてお使いのブラウザ内で行います。プレイデータが外部に送られるのは、ご自身で「ランキングに登録」したときだけです。": "All rating calculations are done in your browser. Your play data is sent outside only when you choose \"Register to ranking\" yourself.",
  "公式サイトへの負荷を抑えるため、短時間に何度も連続で実行しないでください。": "To avoid putting load on the official site, please do not run it many times in a short period.",
  "公式サイトの変更などにより、予告なく動作しなくなることがあります。": "It may stop working without notice due to changes to the official site.",
  "2fRATE（非公式）・Discord・X（@Porto_mint）・GitHub © 2026 なふ（2fRATE）。2fRATE のプログラム・デザイン・ロゴの無断転載・無断使用を禁じます。": "2fRATE (unofficial) · <a href=\"https://discord.gg/FtwW32pdaA\" target=\"_blank\" rel=\"noopener\">Discord</a> · <a href=\"https://x.com/Porto_mint\" target=\"_blank\" rel=\"noopener\">X (@Porto_mint)</a> · <a href=\"https://github.com/n4f1316/dxscore-tools\">GitHub</a><br>© 2026 なふ (2fRATE). Unauthorized reproduction or use of the 2fRATE program, design and logo is prohibited.",
  "2fRATE レート計算（α版）": "2fRATE Calculator (alpha)",
  "guide-title": "2fRATE Calculator<span class=\"tag-bm\">Bookmark</span>",
  "maimaiでらっくすNET にログインした状態でブックマークから実行すると、あなたのでらっくスコアから 2fRATE を計算します。": "Run it from a bookmark while logged in to maimai DX NET, and it calculates your 2fRATE from your DX Scores.",
  "できること": "What it does",
  "「☆7まで」「☆6まで」「☆5まで」の3種類の 2fRATE と、ランクを表示": "Shows three types of 2fRATE (up to ☆7, up to ☆6, up to ☆5) and their ranks",
  "レート対象曲（上位50譜面）を、ジャケット・譜面定数・☆・単曲レート値つきで一覧表示": "Lists your rated charts (top 50) with jacket, chart constant, ☆ and chart rating",
  "レート対象曲50譜面を1枚の画像にして保存（名前・称号を隠すこともできます）": "Saves your 50 rated charts as a single image (you can hide your name and title)",
  "次に☆を伸ばすとよい譜面を「おすすめ楽曲」として表示": "Shows \"Recommended charts\" where raising your ☆ helps most",
  "ランキングへの登録・更新": "Registering to the <a href=\"ranking.html\">ranking</a> (Japan version only for now)",
  "マイページで、達成人数の少ない譜面の確認・お気に入り譜面の登録・PINの変更": "My Page: your achieved charts by rarity, favorite chart and PIN change (some features are Japan version only)",
  "1コードをコピーする": "<span class=\"num\">1</span>Copy the code",
  "下のコードがブックマークの中身になります。1行まるごとコピーしてください。": "The code below is what goes into the bookmark. Copy the whole line.",
  "コードをコピー": "Copy code",
  "PCなら": "On PC, you can also drag",
  "をブックマークバーへドラッグしても登録できます": "to your bookmarks bar to add it",
  "2ブックマークに登録する": "<span class=\"num\">2</span>Add it as a bookmark",
  "Ctrl + Shift + B（Macは ⌘ + Shift + B）でブックマークバーを表示します。": "Press <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>B</kbd> (on Mac <kbd>⌘</kbd> + <kbd>Shift</kbd> + <kbd>B</kbd>) to show the bookmarks bar.",
  "ブックマークバーの空いているところを右クリックし、ページを追加（Edgeは お気に入りを追加）を選びます。": "Right-click an empty spot on the bookmarks bar and choose <span class=\"ui\">Add page</span> (on Edge, <span class=\"ui\">Add favorite</span>).",
  "「名前」に 2fRATE など、わかりやすい名前を入力します。": "Enter an easy name such as <b>2fRATE</b> in \"Name\".",
  "「URL」に、コピーしたコードを貼り付けて保存します。": "Paste the copied code into \"URL\" and save.",
  "上の「★ 2fRATE」ボタンをブックマークバーへドラッグ＆ドロップするだけでも登録できます。": "You can also just drag and drop the \"★ 2fRATE\" button above to the bookmarks bar.",
  "Safariでこのページを開いたまま、共有ボタン（□に↑）をタップし、ブックマークを追加で保存します。": "With this page open in Safari, tap the Share button (square with an arrow) and save it with <span class=\"ui\">Add Bookmark</span>.",
  "ブックマーク一覧（本のアイコン）を開き、右下の 編集 をタップして、今保存したブックマークを選びます。": "Open your bookmarks (book icon), tap <span class=\"ui\">Edit</span> at the bottom right, and select the bookmark you just saved.",
  "名前を 2fRATE に変更します。": "Change the name to <b>2fRATE</b>.",
  "URL欄の中身をすべて消し、コピーしたコードを貼り付けて 完了 をタップします。": "Delete everything in the URL field, paste the copied code and tap <span class=\"ui\">Done</span>.",
  "URL欄はとても長くなります。古いURLが残らないよう、全部消してから貼り付けてください。": "The URL field gets very long. Delete everything before pasting so no part of the old URL remains.",
  "Chromeでこのページを開いたまま、右上の ⋮ から ☆（ブックマークに追加）をタップします。": "With this page open in Chrome, tap <span class=\"ui\">☆</span> (Add bookmark) from <span class=\"ui\">⋮</span> at the top right.",
  "画面下に出る 編集（または ⋮ → ブックマーク から、今追加したものの ⋮ → 編集）を開きます。": "Open <span class=\"ui\">Edit</span> shown at the bottom of the screen (or ⋮ → Bookmarks, then <span class=\"ui\">⋮</span> → Edit on the one you just added).",
  "URL欄の中身をすべて消し、コピーしたコードを貼り付けて戻ります（自動で保存されます）。": "Delete everything in the URL field, paste the copied code and go back (it saves automatically).",
  "3maimaiでらっくすNET で実行する": "<span class=\"num\">3</span>Run it on maimai DX NET",
  "maimaiでらっくすNET にログインします（どのページを開いていても構いません）。": "Log in to <a href=\"https://maimaidx-eng.com/maimai-mobile/\" target=\"_blank\" rel=\"noopener\">maimai DX NET</a> (any page is fine). Japan version players use <a href=\"https://maimaidx.jp/maimai-mobile/\" target=\"_blank\" rel=\"noopener\">maimaidx.jp</a>.",
  "ブックマークバーの 2fRATE をクリックします。": "Click <b>2fRATE</b> on the bookmarks bar.",
  "メニューが表示されたら レート計算・ランキング登録 を選びます。数秒〜十数秒待つと、結果画面が表示されます。": "When the menu appears, choose <span class=\"ui\">Calculate rating</span>. After a few to a dozen or so seconds, the result appears.",
  "Safariで maimaiでらっくすNET にログインします（どのページを開いていても構いません）。": "Log in to <a href=\"https://maimaidx-eng.com/maimai-mobile/\" target=\"_blank\" rel=\"noopener\">maimai DX NET</a> in Safari (any page is fine).",
  "ブックマーク一覧（本のアイコン）を開き、2fRATE をタップします。": "Open your bookmarks (book icon) and tap <b>2fRATE</b>.",
  "Chromeで maimaiでらっくすNET にログインします（どのページを開いていても構いません）。": "Log in to <a href=\"https://maimaidx-eng.com/maimai-mobile/\" target=\"_blank\" rel=\"noopener\">maimai DX NET</a> in Chrome (any page is fine).",
  "アドレスバーをタップし、2fRATE（登録した名前）と入力します。": "Tap the address bar and type <b>2fRATE</b> (the name you registered).",
  "候補に出てくる、☆マークのついた 2fRATE をタップします。": "Tap <b>2fRATE</b> with the ☆ mark in the suggestions.",
  "Android の Chrome では、ブックマーク一覧からタップしても実行されません。必ずアドレスバーに名前を入力して、候補から選んでください。": "On Android Chrome, tapping it from the bookmark list does not run it. Always type the name in the address bar and pick it from the suggestions.",
  "コードをアドレスバーに直接貼り付けても動きません（貼り付けると先頭の javascript: が消えてしまうため）。必ずブックマークとして登録してから実行してください。": "Pasting the code directly into the address bar does not work (the leading <code>javascript:</code> is removed when you paste). Always register it as a bookmark first.",
  "結果画面の見方": "Reading the result",
  "レートの札": "Rating plates",
  "「☆7まで」「☆6まで」「☆5まで」の3種類の 2fRATE。札を押すと、そのレートのレート対象曲に切り替わります。計算方法はレートとランクのしくみへ。": "Three types of 2fRATE: up to ☆7, up to ☆6 and up to ☆5. Tap a plate to switch to the rated charts of that rating. See <a href=\"about.html\">How the rating and ranks work</a> for the formula.",
  "でらっくす譜面 / スタンダード譜面": "DX chart / Standard chart",
  "譜面定数": "Constant",
  "* 付きは定数表にない譜面で、レベル表示から見積もった値です。": "Values marked <code>*</code> are charts not in the constant table, estimated from the displayed level.",
  "でらっくスコアの☆。小数部分は次の☆までの進み具合です。": "The ☆ of your DX Score. The decimal part shows progress toward the next ☆.",
  "MAX差": "Gap to MAX",
  "でらっくスコア最大値（理論値）までの差。理論値なら MAX。": "The difference to the maximum DX Score. Shows <code>MAX</code> if you have the maximum.",
  "レート値": "Rating",
  "その譜面の単曲レート値。": "The rating value of that chart.",
  "ランキングへの登録": "Registering to the ranking (Japan version only for now)",
  "結果画面の ランキングに登録・更新する から、ランキングに自分の記録を載せられます。登録は任意です。": "From <span class=\"ui\">Register / update ranking</span> on the result screen, you can put your record on the <a href=\"ranking.html\">ranking</a>. Registering is optional.",
  "ユーザー名とPINは、2fRATE のランキング専用のものを自分で決めます（maimaiでらっくすNET や SEGA ID のパスワードは絶対に入力しないでください）。次回以降、同じユーザー名とPINで記録を更新できます。PINを忘れると更新できなくなるので、控えておいてください。": "You choose a <b>user name</b> and <b>PIN</b> just for the 2fRATE ranking (<b>never enter</b> your maimai DX NET or SEGA ID password). You can update your record later with the same user name and PIN. If you forget your PIN you cannot update, so keep a note of it.",
  "公開されるのは、表示名とプレイヤーアイコン（匿名の場合は「匿名#記号」と初期アイコン）、3種類のレートとランク、ベスト枠（公開を選んだ場合のみ）です。ユーザー名とPINは公開されません。": "What is published: your display name and player icon (if anonymous, \"Anonymous#symbol\" and a default icon), the three ratings and ranks, and your best 50 (only if you choose to publish it). Your user name and PIN are not published.",
  "マイページ": "My Page",
  "実行したときのメニューで マイページ を選ぶと、次の機能が使えます。": "Choose <span class=\"ui\">My Page</span> from the menu when you run it to use the following features.",
  "達成人数で見る自分の達成譜面：自分が☆7・☆6以上を達成した MASTER・Re:MASTER の譜面を、全国ランキング上位100人で同じく達成している人数の少ない順（または多い順）に表示します。人数は譜面データビューアと同じ集計（Lv10+以上）です。": "<b>Your achieved charts by rarity</b>: lists the MASTER / Re:MASTER charts where you reached ☆7 or ☆6+, ordered by how few (or many) of the top 100 players in the national ranking (Japan version) have also reached it. The counts are the same as the <a href=\"viewer.html\">Chart Data Viewer</a> (Lv10+ and above).",
  "お気に入り譜面：1譜面を登録すると、ランキングの「ベスト枠を見る」に表示されます（ランキング登録者のみ）。": "<b>Favorite chart</b>: register one chart to show it in \"View best 50\" on the <a href=\"ranking.html\">ranking</a> (ranking users only; Japan version only for now).",
  "PINの変更：ランキング用のPINを変更できます。管理者から仮のPINを受け取った方は、ここで自分のPINに変更してください。": "<b>Change PIN</b>: change your ranking PIN. If you received a temporary PIN from the admin, change it to your own here.",
  "お気に入り譜面とPINの変更は、ランキングに登録したユーザー名とPINで入ります。": "Favorite chart and PIN change require the user name and PIN you registered to the ranking.",
  "うまくいかないとき": "Troubleshooting",
  "ブックマークを押しても何も起きない": "Nothing happens when I tap the bookmark",
  "URL欄の先頭が javascript: で始まっているか確認してください。貼り付けたときに消えてしまうことがあります。": "Check that the URL field starts with <code>javascript:</code>. It can disappear when you paste.",
  "Android の Chrome は、ブックマーク一覧からではなくアドレスバーに名前を入力して実行してください。": "On Android Chrome, run it by typing the name in the address bar, not from the bookmark list.",
  "「ログインしていないようです」と表示される": "It says I am not logged in",
  "maimaiでらっくすNET にログインしていないか、ログインの有効期限が切れています。一度ログインし直してから、もう一度実行してください。": "You are not logged in to maimai DX NET, or your login has expired. Log in again and run it once more.",
  "maimaiでらっくすNET 以外のページで実行した場合は「maimaiでらっくすNET にログインした状態で実行してください」と表示されます。": "If you run it on a page other than maimai DX NET, it asks you to run it while logged in to maimai DX NET.",
  "途中で止まる・エラーが出る": "It stops midway or shows an error",
  "通信状況が悪いと、レコードの読み込みに失敗することがあります。少し時間をおいてから、もう一度実行してください。": "Loading records can fail on a poor connection. Wait a little and run it again.",
  "公式サイトの機能の利用状況（コースの加入状況など）によっては、一部のページが見られず正しく計算できない場合があります。": "Depending on what you can use on the official site, some pages may not be viewable and the calculation may not be correct.",
  "レートや譜面定数が古い気がする": "The rating or chart constants seem out of date",
  "ブックマークは実行のたびに最新のプログラムを読み込みます。譜面定数は新バージョンの稼働後、順次更新します。": "The bookmark loads the latest program every time it runs. Chart constants are updated after a new version starts. The International version uses the constants of the matching Japanese version.",
  "計算と画像の作成はすべてブラウザ内で行います。データが外部（2fRATE のサーバー）に送られるのは「ランキングに登録」したときと、マイページでお気に入り譜面の登録・PINの変更をしたときだけです。": "All calculations and image creation are done in your browser. Data is sent outside (to the 2fRATE server) only when you \"Register to ranking\", or register a favorite chart or change your PIN on My Page.",
  "公式サイトへの負荷を抑えるため、ページの読み込みは間隔を空けて行っています。短時間に何度も連続で実行しないでください。": "To reduce load on the official site, pages are loaded at intervals. Please do not run it many times in a short period.",
  "2fRATE（非公式）・トップ・GitHub© 2026 なふ（2fRATE）。2fRATE のプログラム・デザイン・ロゴの無断転載・無断使用を禁じます。": "2fRATE (unofficial) · <a href=\"./\">Top</a> · <a href=\"https://github.com/n4f1316/dxscore-tools\">GitHub</a><br>© 2026 なふ (2fRATE). Unauthorized reproduction or use of the 2fRATE program, design and logo is prohibited.",
  "2fRATE のしくみ（α版）": "How 2fRATE works (alpha)",
  "2fRATE がどのように計算されているかをまとめています。": "A summary of how 2fRATE is calculated.",
  "☆の決まり方": "How ☆ is decided",
  "☆は、でらっくスコアの取得率（現在のでらっくスコア ÷ 最大値）で決まります。": "☆ is decided by your DX Score ratio (current DX Score ÷ maximum).",
  "取得率": "Ratio",
  "100%（理論値）": "100% (maximum)",
  "99% 以上": "99% or more",
  "97% 以上": "97% or more",
  "95% 以上": "95% or more",
  "93% 以上": "93% or more",
  "90% 以上": "90% or more",
  "85% 以上": "85% or more",
  "計算には☆を小数第一位まで使います。小数部分は「次の☆までの進み具合」を10段階で表したもの（切り捨て）です。たとえば☆6の範囲（99%〜100%）のちょうど中間なら☆6.5、理論値まであと少しでも☆6.9です。☆1未満（85%未満）の譜面は0として扱います。": "☆ is used to one decimal place. The decimal part shows progress toward the next ☆ in 10 steps (rounded down). For example, exactly halfway through the ☆6 range (99%–100%) is ☆6.5, and just short of the maximum is still ☆6.9. Charts below ☆1 (under 85%) count as 0.",
  "単曲レート値": "Chart rating",
  "譜面ごとの値（単曲レート値）は、次の式で計算します。": "The value of each chart (chart rating) is calculated with this formula.",
  "（譜面定数 × 譜面定数 × ☆の整数部分 ＋ 譜面定数 × 譜面定数 × ☆の小数部分 × 0.5）÷ 100 ＋ 0.1（☆がレートの上限に達したときだけ） ＋ 希少ボーナス（下記。☆7まで・☆6まで のみ）": "(constant × constant × <span class=\"v\">integer part of ☆</span><br> + constant × constant × <span class=\"v\">decimal part of ☆</span> × 0.5) ÷ 100<br> + <span class=\"bonus\">0.1 (only when ☆ reaches the cap of the rating)</span><br> + <span class=\"rare\">rarity bonus (below; up to ☆7 and up to ☆6 only)</span>",
  "☆の小数部分は半分の重みで加わります。☆がそのレートの上限（☆7まで なら☆7、☆6まで なら☆6、☆5まで なら☆5）に達した譜面には、さらに 0.1 のボーナスがつきます。下の表は「☆7まで」の例です。": "The decimal part of ☆ counts at half weight. Charts whose ☆ reaches the cap of the rating (☆7 for up to ☆7, ☆6 for up to ☆6, ☆5 for up to ☆5) get an extra 0.1 bonus. The table below is an example for \"up to ☆7\".",
  "好きな譜面の値は 単曲レート計算 で調べられます。": "You can look up any chart with the <a href=\"calculator.html\">Chart Rating Calculator</a>.",
  "希少ボーナス": "Rarity bonus",
  "でらっくスコアの全国ランキング（上位100人）で☆6以上（☆6＋☆7）を達成している人が少ない譜面は、自分が☆6以上を達成していると、「☆7まで」「☆6まで」の単曲レート値に次の値が加わります。「☆5まで」には加わりません。": "For charts where few of the top 100 players in the DX Score national ranking have reached ☆6 or more (☆6 + ☆7), the following value is added to your chart rating for \"up to ☆7\" and \"up to ☆6\" if you have reached ☆6 or more. It is not added for \"up to ☆5\". (The ranking is from the Japan version.)",
  "上位100人のうち☆6以上の人数": "Players with ☆6+ in the top 100",
  "加算": "Bonus",
  "3人以下": "3 or fewer",
  "10人以下": "10 or fewer",
  "20人以下": "20 or fewer",
  "人数は、全国ランキングを定期的に集計したデータから求めています（集計データがない譜面には加算されません）。対象の譜面は 譜面データビューア の「希少ボーナス対象のみ」で確認できます。": "The counts come from regularly collected national ranking data (charts with no data get no bonus). You can check the target charts with \"Rarity bonus only\" in the <a href=\"viewer.html\">Chart Data Viewer</a>.",
  "単曲レート値の高い上位50譜面（レート対象曲）の平均が 2fRATE です。50譜面に満たない場合も50で割ります。": "2fRATE is the average of your top 50 charts by chart rating (rated charts). It is divided by 50 even if you have fewer than 50 charts.",
  "☆7まで：上の式そのままのレートです。☆7（理論値）の譜面に 0.1 のボーナスがつきます。希少ボーナスも加わります。": "<b>Up to ☆7</b>: the formula above as is. Charts at ☆7 (maximum) get the 0.1 bonus. The rarity bonus is also added.",
  "☆6まで：☆7の譜面を☆6.0として計算します。☆6.0以上の譜面に 0.1 のボーナスがつきます。希少ボーナスも加わります。": "<b>Up to ☆6</b>: charts at ☆7 count as ☆6.0. Charts at ☆6.0 or more get the 0.1 bonus. The rarity bonus is also added.",
  "☆5まで：☆5を超える譜面を☆5.0として計算します。☆5.0以上の譜面に 0.1 のボーナスがつきます（希少ボーナスはありません）。": "<b>Up to ☆5</b>: charts above ☆5 count as ☆5.0. Charts at ☆5.0 or more get the 0.1 bonus (no rarity bonus).",
  "レート対象曲は、レートの種類ごとに別々に選びます。": "Rated charts are chosen separately for each type of rating.",
  "ランク": "Ranks",
  "3種類の 2fRATE それぞれにランクがあり、表示している値（小数第3位まで）で決まります。区切りは「☆7まで」が LEGEND 12.000 以上、「☆6まで」が 11.500 以上、「☆5まで」が 10.500 以上で、それより下はどれも 0.500 刻みです。": "Each of the three 2fRATE types has a rank, decided by the displayed value (to three decimal places). LEGEND starts at 12.000 for \"up to ☆7\", 11.500 for \"up to ☆6\" and 10.500 for \"up to ☆5\", and every rank below is 0.500 apart.",
  "☆7まで": "Up to ☆7",
  "☆6まで": "Up to ☆6",
  "☆5まで": "Up to ☆5",
  "ブックマークバーへドラッグしてください": "Drag it to your bookmarks bar",
  "コピーしました": "Copied",
  "コピーできませんでした（長押しで選択してください）": "Could not copy (long-press to select it)",
  "2fRATE ランキング（α版）": "2fRATE Ranking (alpha)",
  "ランキング（α版・デザイン検証中）": "Ranking (alpha, design in testing)",
  "2fRATE の「ランキングに登録」から登録された記録です。自分の記録（非公開にしたベスト枠を含む）はマイページで見られます。": "Records registered from \"Register to ranking\" in 2fRATE. You can see your own record (including a private best 50) in <a href=\"mypage.html\">My Page</a>.",
  "記録は各プレイヤーが自分で登録したもので、数値は自己申告です。匿名の記録は「匿名#記号」で表示しています。 非公式のファンメイドツールです。株式会社セガおよび関連会社とは一切関係ありません。楽曲・ジャケット画像・アイコン画像の著作権は、株式会社セガおよび各権利者に帰属します。ジャケット画像・アイコン画像は公式サイトの画像を表示しているもので、本ツールでは保存・配布していません。権利者の方からご連絡をいただいた場合は、該当部分の公開停止などに速やかに対応します。 © 2026 なふ（2fRATE）。2fRATE のプログラム・デザイン・ロゴの無断転載・無断使用を禁じます。": "Records are registered by each player and the values are self-reported. Anonymous records are shown as \"Anonymous#code\".<br> This is an unofficial fan-made tool and has no relation to SEGA Corporation or its affiliates. Copyrights of songs, jacket images and icon images belong to SEGA Corporation and their respective owners. Jacket and icon images are displayed from the official site; this tool does not store or distribute them. If we are contacted by a rights holder, we will promptly take down the relevant part or take other action.<br> © 2026 なふ (2fRATE). Unauthorized reproduction or use of the 2fRATE program, design and logo is prohibited.",
  "☆7達成数": "☆7 count",
  "☆6達成数": "☆6 count",
  "☆5達成数": "☆5 count",
  "合計": "Total",
  "MASのみ": "MAS only",
  "Re:MASのみ": "Re:MAS only",
  "カメラで撮影したアイコン": "Icon taken with the camera",
  "{0} のベスト枠": "{0}'s best 50",
  "{0} のお気に入り譜面": "{0}'s favorite chart",
  "お気に入り": "Favorite",
  "閉じる": "Close",
  "曲名": "Song",
  "この記録には「{0}」のレート対象曲がありません（以前の版で登録された記録です。登録し直すと表示されます）。": "This record has no rated charts for \"{0}\" (it was registered with an older version; registering again will show them).",
  "ベスト枠のデータがありません。": "No best 50 data.",
  "希少 +{0}": "Rare +{0}",
  "{0} の☆6・☆7達成譜面": "{0}'s ☆6/☆7 charts",
  "達成譜面 ☆7 {0}・☆6以上 {1}": "Charts: ☆7 {0} · ☆6 or more {1}",
  "曲名で絞り込み": "Filter by song name",
  "« 前へ": "« Prev",
  "次へ »": "Next »",
  "☆6以上（{0}）": "☆6 or more ({0})",
  "すべての難易度": "All difficulties",
  "MASTERのみ": "MASTER only",
  "Re:MASTERのみ": "Re:MASTER only",
  "DX・ST": "DX & ST",
  "DXのみ": "DX only",
  "STのみ": "ST only",
  "{0} 譜面中 {1}〜{2} 件目（譜面定数の高い順）": "{1}–{2} of {0} charts (highest constant first)",
  "{0} 譜面（譜面定数の高い順）": "{0} charts (highest constant first)",
  "スコア": "Score",
  "この条件の譜面はありません。": "No charts match these conditions.",
  "定数の指定なし": "Any constant",
  "譜面定数の下限": "Minimum constant",
  "譜面定数の上限": "Maximum constant",
  "読み込み中…": "Loading…",
  "読み込めませんでした。": "Could not load.",
  "☆6・☆7達成譜面を読み込めませんでした。": "Could not load the ☆6/☆7 charts.",
  "ベスト枠を読み込めませんでした。": "Could not load the best 50.",
  "日本版": "Japan",
  "International版": "International",
  "全世界": "Worldwide",
  "ページ切り替え（{0}）": "Pages ({0})",
  "{0} 人が登録": "{0} players registered",
  "（定数表：{0}）": " (constants: {0})",
  "{0} 人中 {1}〜{2} 人目": "  ({1}–{2} of {0})",
  "該当する記録はありません。": "No matching records.",
  "更新 {0}": "Updated {0}",
  "ベスト枠を見る": "View best 50",
  "お気に入り譜面を見る": "View favorite chart",
  "☆6・☆7達成譜面を見る": "View ☆6/☆7 charts",
  "譜面": " charts",
  "上": "top",
  "下": "bottom",
  "ランキングを読み込めませんでした。時間をおいて再読み込みしてください。": "Could not load the ranking. Please wait and reload.",
  "名前で絞り込み": "Filter by name",
  "ランキングを読み込み中…": "Loading the ranking…"
 },
 "ko": {
  "2fRATE（α版）": "2fRATE (알파판)",
  "非公式・ファンメイドツール": "비공식 팬메이드 툴",
  "2fRATE は、maimai でらっくす の「でらっくスコア」の☆（☆1〜☆7）と譜面定数から計算する、非公式の独自レートです。": "<strong>2fRATE</strong>는 maimai DX의 「DX 스코어」 ☆(☆1~☆7)와 보면 상수로 계산하는 비공식 독자 레이트입니다.",
  "公式のレーティングとは別に、「どれだけでらっくスコアを詰めたか」を数値で確かめられます。公式サイト「maimaiでらっくすNET」にログインした状態で、ブックマークから実行して使います。": "공식 레이팅과는 별개로, DX 스코어를 얼마나 올렸는지를 수치로 확인할 수 있습니다. 공식 사이트 「maimai DX NET」에 로그인한 상태에서 북마크로 실행해 사용합니다.",
  "ツール": "툴",
  "2fRATE レート計算ブックマーク": "2fRATE 레이트 계산<span class=\"tag tag-bm\">북마크</span>",
  "自分のでらっくスコアから 2fRATE を計算し、レート対象曲50譜面の一覧を表示します。画像の保存やランキングへの登録もここから行えます。": "자신의 DX 스코어로 2fRATE를 계산하고, 레이트 대상 50보면 목록을 표시합니다. 이미지 저장도 여기서 할 수 있습니다.",
  "登録のしかた・使い方を見る →": "등록 방법·사용법 보기 →",
  "ランキングWeb": "랭킹<span class=\"tag tag-web\">Web</span>",
  "登録された 2fRATE のランキング。☆7まで・☆6まで・☆5までの3種類で見られます。": "등록된 2fRATE 랭킹. ☆7까지·☆6까지·☆5까지 3종류로 볼 수 있습니다. (현재 일본판 전용)",
  "マイページWeb": "마이페이지<span class=\"tag tag-web\">Web</span>",
  "ランキングに登録したユーザー名とPINで入り、最後に保存した自分の記録（レート・ベスト枠・達成譜面）を見られます。": "랭킹에 등록한 사용자명과 PIN으로 들어가, 마지막으로 저장한 기록(레이트·베스트 50·달성 보면)을 볼 수 있습니다. (현재 일본판 전용)",
  "単曲レート計算Web": "곡별 레이트 계산<span class=\"tag tag-web\">Web</span>",
  "楽曲と☆を選ぶと、その譜面の単曲レート値がわかります。": "곡과 ☆를 고르면 그 보면의 곡별 레이트 값을 알 수 있습니다.",
  "譜面データビューアWeb": "보면 데이터 뷰어<span class=\"tag tag-web\">Web</span>",
  "全国ランキング上位100人のでらっくスコアから集計した、譜面ごとのでらっくスコアの取りやすさの目安です。": "전국 랭킹(일본판) 상위 100명의 DX 스코어로 집계한, 보면별 DX 스코어를 얻기 쉬운 정도의 기준입니다.",
  "レートとランクのしくみ": "레이트와 랭크의 구조",
  "☆の決まり方、単曲レート値の計算式、ランク（WAKABA〜LEGEND）の一覧。": "☆가 정해지는 방법, 곡별 레이트 값 계산식, 랭크(WAKABA~LEGEND) 목록.",
  "はじめかた": "시작하기",
  "ブックマークを登録「2fRATE レート計算」のページにあるコードを、ブラウザのブックマークに登録します。": "<b>북마크 등록</b><span>「2fRATE 레이트 계산」 페이지에 있는 코드를 브라우저 북마크에 등록합니다.</span>",
  "maimaiでらっくすNET にログイン公式サイトにログインして、どのページでもよいので開きます。": "<b>maimai DX NET에 로그인</b><span>공식 사이트에 로그인해 아무 페이지나 엽니다.</span>",
  "ブックマークを実行登録したブックマークを開くと、数秒〜十数秒で結果が表示されます。": "<b>북마크 실행</b><span>등록한 북마크를 열면 몇 초~십몇 초 후에 결과가 표시됩니다.</span>",
  "コミュニティ・お問い合わせ": "커뮤니티·문의",
  "2fRATE Discord サーバー": "2fRATE Discord 서버",
  "お知らせ、不具合の報告、要望などはこちらへ。どなたでも参加できます。": "공지, 버그 신고, 요청 등은 이쪽으로. 누구나 참가할 수 있습니다. (주로 일본어)",
  "参加する →": "참가하기 →",
  "製作者": "제작자",
  "注意事項": "주의 사항",
  "非公式のファンメイドツールです。株式会社セガおよび関連会社とは一切関係ありません。このツールに関するお問い合わせは、セガ（公式）ではなく、2fRATE Discord サーバーまたは製作者の X（@Porto_mint）までお願いします。": "비공식 팬메이드 툴이며, 주식회사 세가 및 관련 회사와는 일절 관계가 없습니다. 이 툴에 관한 문의는 세가(공식)가 아니라 <a href=\"https://discord.gg/FtwW32pdaA\" target=\"_blank\" rel=\"noopener\">2fRATE Discord 서버</a> 또는 제작자의 X(<a href=\"https://x.com/Porto_mint\" target=\"_blank\" rel=\"noopener\">@Porto_mint</a>)로 부탁드립니다.",
  "楽曲・ジャケット画像・アイコン画像の著作権は、株式会社セガおよび各権利者に帰属します。ジャケット画像・アイコン画像は公式サイトの画像を表示しているもので、本ツールでは保存・配布していません。": "악곡·재킷 이미지·아이콘 이미지의 저작권은 주식회사 세가 및 각 권리자에게 있습니다. 재킷 이미지·아이콘 이미지는 공식 사이트의 이미지를 표시하는 것이며, 본 툴에서는 저장·배포하지 않습니다.",
  "譜面データビューアは、公式の全国ランキングをもとに独自に集計した統計で、公式の情報ではありません。プレイヤー名などの個人情報は保存・公開していません。": "보면 데이터 뷰어는 공식 전국 랭킹을 바탕으로 독자적으로 집계한 통계이며, 공식 정보가 아닙니다. 플레이어 이름 등의 개인 정보는 저장·공개하지 않습니다.",
  "権利者の方からご連絡をいただいた場合は、該当部分の公開停止などに速やかに対応します。": "권리자분께 연락을 받은 경우, 해당 부분의 공개 중지 등에 신속히 대응합니다.",
  "レートの計算はすべてお使いのブラウザ内で行います。プレイデータが外部に送られるのは、ご自身で「ランキングに登録」したときだけです。": "레이트 계산은 모두 사용 중인 브라우저 안에서 이루어집니다. 플레이 데이터가 외부로 전송되는 것은 직접 「랭킹에 등록」했을 때뿐입니다.",
  "公式サイトへの負荷を抑えるため、短時間に何度も連続で実行しないでください。": "공식 사이트의 부하를 줄이기 위해, 짧은 시간에 여러 번 연속으로 실행하지 마세요.",
  "公式サイトの変更などにより、予告なく動作しなくなることがあります。": "공식 사이트의 변경 등으로 예고 없이 작동하지 않게 될 수 있습니다.",
  "2fRATE（非公式）・Discord・X（@Porto_mint）・GitHub © 2026 なふ（2fRATE）。2fRATE のプログラム・デザイン・ロゴの無断転載・無断使用を禁じます。": "2fRATE(비공식) · <a href=\"https://discord.gg/FtwW32pdaA\" target=\"_blank\" rel=\"noopener\">Discord</a> · <a href=\"https://x.com/Porto_mint\" target=\"_blank\" rel=\"noopener\">X(@Porto_mint)</a> · <a href=\"https://github.com/n4f1316/dxscore-tools\">GitHub</a><br>© 2026 なふ(2fRATE). 2fRATE의 프로그램·디자인·로고의 무단 전재·무단 사용을 금지합니다.",
  "2fRATE レート計算（α版）": "2fRATE 레이트 계산 (알파판)",
  "guide-title": "2fRATE 레이트 계산<span class=\"tag-bm\">북마크</span>",
  "maimaiでらっくすNET にログインした状態でブックマークから実行すると、あなたのでらっくスコアから 2fRATE を計算します。": "maimai DX NET에 로그인한 상태에서 북마크로 실행하면, 당신의 DX 스코어로 2fRATE를 계산합니다.",
  "できること": "할 수 있는 것",
  "「☆7まで」「☆6まで」「☆5まで」の3種類の 2fRATE と、ランクを表示": "「☆7까지」「☆6까지」「☆5까지」 3종류의 2fRATE와 랭크 표시",
  "レート対象曲（上位50譜面）を、ジャケット・譜面定数・☆・単曲レート値つきで一覧表示": "레이트 대상 곡(상위 50보면)을 재킷·보면 상수·☆·곡별 레이트 값과 함께 목록 표시",
  "レート対象曲50譜面を1枚の画像にして保存（名前・称号を隠すこともできます）": "레이트 대상 곡 50보면을 한 장의 이미지로 저장(이름·칭호를 숨길 수도 있습니다)",
  "次に☆を伸ばすとよい譜面を「おすすめ楽曲」として表示": "다음에 ☆를 올리면 좋은 보면을 「추천 곡」으로 표시",
  "ランキングへの登録・更新": "<a href=\"ranking.html\">랭킹</a> 등록·갱신(현재 일본판 전용)",
  "マイページで、達成人数の少ない譜面の確認・お気に入り譜面の登録・PINの変更": "마이페이지에서 달성 인원이 적은 보면 확인·즐겨찾기 보면 등록·PIN 변경(일부 기능은 일본판 전용)",
  "1コードをコピーする": "<span class=\"num\">1</span>코드 복사하기",
  "下のコードがブックマークの中身になります。1行まるごとコピーしてください。": "아래 코드가 북마크의 내용이 됩니다. 한 줄 전체를 복사하세요.",
  "コードをコピー": "코드 복사",
  "PCなら": "PC에서는",
  "をブックマークバーへドラッグしても登録できます": "을(를) 북마크바로 드래그해서 등록할 수도 있습니다",
  "2ブックマークに登録する": "<span class=\"num\">2</span>북마크에 등록하기",
  "Ctrl + Shift + B（Macは ⌘ + Shift + B）でブックマークバーを表示します。": "<kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>B</kbd>(Mac은 <kbd>⌘</kbd> + <kbd>Shift</kbd> + <kbd>B</kbd>)로 북마크바를 표시합니다.",
  "ブックマークバーの空いているところを右クリックし、ページを追加（Edgeは お気に入りを追加）を選びます。": "북마크바의 빈 곳을 우클릭하고 <span class=\"ui\">페이지 추가</span>(Edge는 <span class=\"ui\">즐겨찾기 추가</span>)를 선택합니다.",
  "「名前」に 2fRATE など、わかりやすい名前を入力します。": "「이름」에 <b>2fRATE</b> 등 알기 쉬운 이름을 입력합니다.",
  "「URL」に、コピーしたコードを貼り付けて保存します。": "「URL」에 복사한 코드를 붙여 넣고 저장합니다.",
  "上の「★ 2fRATE」ボタンをブックマークバーへドラッグ＆ドロップするだけでも登録できます。": "위의 「★ 2fRATE」 버튼을 북마크바로 드래그 앤 드롭하기만 해도 등록할 수 있습니다.",
  "Safariでこのページを開いたまま、共有ボタン（□に↑）をタップし、ブックマークを追加で保存します。": "Safari에서 이 페이지를 연 채로 공유 버튼(□에 ↑)을 탭하고, <span class=\"ui\">책갈피 추가</span>로 저장합니다.",
  "ブックマーク一覧（本のアイコン）を開き、右下の 編集 をタップして、今保存したブックマークを選びます。": "책갈피 목록(책 아이콘)을 열고 오른쪽 아래의 <span class=\"ui\">편집</span>을 탭해, 방금 저장한 책갈피를 선택합니다.",
  "名前を 2fRATE に変更します。": "이름을 <b>2fRATE</b>로 변경합니다.",
  "URL欄の中身をすべて消し、コピーしたコードを貼り付けて 完了 をタップします。": "URL 칸의 내용을 모두 지우고, 복사한 코드를 붙여 넣은 뒤 <span class=\"ui\">완료</span>를 탭합니다.",
  "URL欄はとても長くなります。古いURLが残らないよう、全部消してから貼り付けてください。": "URL 칸은 매우 길어집니다. 이전 URL이 남지 않도록 전부 지운 뒤 붙여 넣으세요.",
  "Chromeでこのページを開いたまま、右上の ⋮ から ☆（ブックマークに追加）をタップします。": "Chrome에서 이 페이지를 연 채로, 오른쪽 위의 <span class=\"ui\">⋮</span>에서 <span class=\"ui\">☆</span>(북마크 추가)를 탭합니다.",
  "画面下に出る 編集（または ⋮ → ブックマーク から、今追加したものの ⋮ → 編集）を開きます。": "화면 아래에 나오는 <span class=\"ui\">수정</span>을 엽니다(또는 ⋮ → 북마크에서, 방금 추가한 것의 <span class=\"ui\">⋮</span> → 수정).",
  "URL欄の中身をすべて消し、コピーしたコードを貼り付けて戻ります（自動で保存されます）。": "URL 칸의 내용을 모두 지우고, 복사한 코드를 붙여 넣은 뒤 돌아갑니다(자동으로 저장됩니다).",
  "3maimaiでらっくすNET で実行する": "<span class=\"num\">3</span>maimai DX NET에서 실행하기",
  "maimaiでらっくすNET にログインします（どのページを開いていても構いません）。": "<a href=\"https://maimaidx-eng.com/maimai-mobile/\" target=\"_blank\" rel=\"noopener\">maimai DX NET</a>에 로그인합니다(어느 페이지를 열어 두어도 괜찮습니다). 일본판 플레이어는 <a href=\"https://maimaidx.jp/maimai-mobile/\" target=\"_blank\" rel=\"noopener\">maimaidx.jp</a>을 사용합니다.",
  "ブックマークバーの 2fRATE をクリックします。": "북마크바의 <b>2fRATE</b>를 클릭합니다.",
  "メニューが表示されたら レート計算・ランキング登録 を選びます。数秒〜十数秒待つと、結果画面が表示されます。": "메뉴가 표시되면 <span class=\"ui\">레이트 계산</span>을 선택합니다. 몇 초~십몇 초 기다리면 결과 화면이 표시됩니다.",
  "Safariで maimaiでらっくすNET にログインします（どのページを開いていても構いません）。": "Safari에서 <a href=\"https://maimaidx-eng.com/maimai-mobile/\" target=\"_blank\" rel=\"noopener\">maimai DX NET</a>에 로그인합니다(어느 페이지를 열어 두어도 괜찮습니다).",
  "ブックマーク一覧（本のアイコン）を開き、2fRATE をタップします。": "책갈피 목록(책 아이콘)을 열고 <b>2fRATE</b>를 탭합니다.",
  "Chromeで maimaiでらっくすNET にログインします（どのページを開いていても構いません）。": "Chrome에서 <a href=\"https://maimaidx-eng.com/maimai-mobile/\" target=\"_blank\" rel=\"noopener\">maimai DX NET</a>에 로그인합니다(어느 페이지를 열어 두어도 괜찮습니다).",
  "アドレスバーをタップし、2fRATE（登録した名前）と入力します。": "주소창을 탭하고 <b>2fRATE</b>(등록한 이름)를 입력합니다.",
  "候補に出てくる、☆マークのついた 2fRATE をタップします。": "후보에 나오는, ☆ 표시가 붙은 <b>2fRATE</b>를 탭합니다.",
  "Android の Chrome では、ブックマーク一覧からタップしても実行されません。必ずアドレスバーに名前を入力して、候補から選んでください。": "Android Chrome에서는 북마크 목록에서 탭해도 실행되지 않습니다. 반드시 주소창에 이름을 입력하고 후보에서 선택하세요.",
  "コードをアドレスバーに直接貼り付けても動きません（貼り付けると先頭の javascript: が消えてしまうため）。必ずブックマークとして登録してから実行してください。": "코드를 주소창에 직접 붙여 넣어도 작동하지 않습니다(붙여 넣으면 앞의 <code>javascript:</code>가 사라지기 때문). 반드시 북마크로 등록한 뒤 실행하세요.",
  "結果画面の見方": "결과 화면 보는 법",
  "レートの札": "레이트 패",
  "「☆7まで」「☆6まで」「☆5まで」の3種類の 2fRATE。札を押すと、そのレートのレート対象曲に切り替わります。計算方法はレートとランクのしくみへ。": "「☆7까지」「☆6까지」「☆5까지」 3종류의 2fRATE. 패를 누르면 그 레이트의 레이트 대상 곡으로 전환됩니다. 계산 방법은 <a href=\"about.html\">레이트와 랭크의 구조</a>를 참고하세요.",
  "でらっくす譜面 / スタンダード譜面": "디럭스 보면 / 스탠다드 보면",
  "譜面定数": "보면 상수",
  "* 付きは定数表にない譜面で、レベル表示から見積もった値です。": "<code>*</code>가 붙은 것은 상수표에 없는 보면으로, 레벨 표시로 추정한 값입니다.",
  "でらっくスコアの☆。小数部分は次の☆までの進み具合です。": "DX 스코어의 ☆. 소수 부분은 다음 ☆까지의 진행 정도입니다.",
  "MAX差": "MAX까지 차이",
  "でらっくスコア最大値（理論値）までの差。理論値なら MAX。": "DX 스코어 최대값(이론치)까지의 차이. 이론치라면 <code>MAX</code>.",
  "レート値": "레이트 값",
  "その譜面の単曲レート値。": "그 보면의 곡별 레이트 값.",
  "ランキングへの登録": "랭킹 등록(현재 일본판 전용)",
  "結果画面の ランキングに登録・更新する から、ランキングに自分の記録を載せられます。登録は任意です。": "결과 화면의 <span class=\"ui\">랭킹에 등록·갱신하기</span>에서 <a href=\"ranking.html\">랭킹</a>에 자신의 기록을 올릴 수 있습니다. 등록은 선택입니다.",
  "ユーザー名とPINは、2fRATE のランキング専用のものを自分で決めます（maimaiでらっくすNET や SEGA ID のパスワードは絶対に入力しないでください）。次回以降、同じユーザー名とPINで記録を更新できます。PINを忘れると更新できなくなるので、控えておいてください。": "<b>사용자명</b>과 <b>PIN</b>은 2fRATE 랭킹 전용으로 직접 정합니다(maimai DX NET이나 SEGA ID의 비밀번호는 <b>절대 입력하지 마세요</b>). 다음부터 같은 사용자명과 PIN으로 기록을 갱신할 수 있습니다. PIN을 잊으면 갱신할 수 없으니 메모해 두세요.",
  "公開されるのは、表示名とプレイヤーアイコン（匿名の場合は「匿名#記号」と初期アイコン）、3種類のレートとランク、ベスト枠（公開を選んだ場合のみ）です。ユーザー名とPINは公開されません。": "공개되는 것은 표시 이름과 플레이어 아이콘(익명인 경우 「익명#기호」와 기본 아이콘), 3종류의 레이트와 랭크, 베스트 50(공개를 선택한 경우만)입니다. 사용자명과 PIN은 공개되지 않습니다.",
  "マイページ": "마이페이지",
  "実行したときのメニューで マイページ を選ぶと、次の機能が使えます。": "실행했을 때의 메뉴에서 <span class=\"ui\">마이페이지</span>를 선택하면 다음 기능을 사용할 수 있습니다.",
  "達成人数で見る自分の達成譜面：自分が☆7・☆6以上を達成した MASTER・Re:MASTER の譜面を、全国ランキング上位100人で同じく達成している人数の少ない順（または多い順）に表示します。人数は譜面データビューアと同じ集計（Lv10+以上）です。": "<b>달성 인원으로 보는 내 달성 보면</b>: 자신이 ☆7·☆6 이상을 달성한 MASTER·Re:MASTER 보면을, 전국 랭킹(일본판) 상위 100명 중 같은 달성 인원이 적은 순(또는 많은 순)으로 표시합니다. 인원은 <a href=\"viewer.html\">보면 데이터 뷰어</a>와 같은 집계(Lv10+ 이상)입니다.",
  "お気に入り譜面：1譜面を登録すると、ランキングの「ベスト枠を見る」に表示されます（ランキング登録者のみ）。": "<b>즐겨찾기 보면</b>: 1보면을 등록하면 <a href=\"ranking.html\">랭킹</a>의 「베스트 50 보기」에 표시됩니다(랭킹 등록자만, 현재 일본판 전용).",
  "PINの変更：ランキング用のPINを変更できます。管理者から仮のPINを受け取った方は、ここで自分のPINに変更してください。": "<b>PIN 변경</b>: 랭킹용 PIN을 변경할 수 있습니다. 관리자에게 임시 PIN을 받은 분은 여기서 자신의 PIN으로 변경하세요.",
  "お気に入り譜面とPINの変更は、ランキングに登録したユーザー名とPINで入ります。": "즐겨찾기 보면과 PIN 변경은 랭킹에 등록한 사용자명과 PIN으로 들어갑니다.",
  "うまくいかないとき": "잘 안 될 때",
  "ブックマークを押しても何も起きない": "북마크를 눌러도 아무 일도 일어나지 않는다",
  "URL欄の先頭が javascript: で始まっているか確認してください。貼り付けたときに消えてしまうことがあります。": "URL 칸의 맨 앞이 <code>javascript:</code>로 시작하는지 확인하세요. 붙여 넣을 때 사라지는 경우가 있습니다.",
  "Android の Chrome は、ブックマーク一覧からではなくアドレスバーに名前を入力して実行してください。": "Android Chrome은 북마크 목록이 아니라 주소창에 이름을 입력해서 실행하세요.",
  "「ログインしていないようです」と表示される": "「로그인하지 않은 것 같습니다」라고 표시된다",
  "maimaiでらっくすNET にログインしていないか、ログインの有効期限が切れています。一度ログインし直してから、もう一度実行してください。": "maimai DX NET에 로그인하지 않았거나 로그인 유효 기간이 지났습니다. 다시 로그인한 뒤 한 번 더 실행하세요.",
  "maimaiでらっくすNET 以外のページで実行した場合は「maimaiでらっくすNET にログインした状態で実行してください」と表示されます。": "maimai DX NET 이외의 페이지에서 실행한 경우 「maimai DX NET에 로그인한 상태에서 실행하세요」라고 표시됩니다.",
  "途中で止まる・エラーが出る": "도중에 멈춘다·오류가 난다",
  "通信状況が悪いと、レコードの読み込みに失敗することがあります。少し時間をおいてから、もう一度実行してください。": "통신 상태가 나쁘면 기록을 불러오지 못할 수 있습니다. 잠시 후 다시 실행하세요.",
  "公式サイトの機能の利用状況（コースの加入状況など）によっては、一部のページが見られず正しく計算できない場合があります。": "공식 사이트의 기능 이용 상황에 따라 일부 페이지를 볼 수 없어 올바르게 계산되지 않는 경우가 있습니다.",
  "レートや譜面定数が古い気がする": "레이트나 보면 상수가 오래된 것 같다",
  "ブックマークは実行のたびに最新のプログラムを読み込みます。譜面定数は新バージョンの稼働後、順次更新します。": "북마크는 실행할 때마다 최신 프로그램을 불러옵니다. 보면 상수는 새 버전 가동 후 순차적으로 갱신합니다. 인터내셔널판은 해당하는 일본판 버전의 상수를 사용합니다.",
  "計算と画像の作成はすべてブラウザ内で行います。データが外部（2fRATE のサーバー）に送られるのは「ランキングに登録」したときと、マイページでお気に入り譜面の登録・PINの変更をしたときだけです。": "계산과 이미지 생성은 모두 브라우저 안에서 이루어집니다. 데이터가 외부(2fRATE 서버)로 전송되는 것은 「랭킹에 등록」했을 때와, 마이페이지에서 즐겨찾기 보면 등록·PIN 변경을 했을 때뿐입니다.",
  "公式サイトへの負荷を抑えるため、ページの読み込みは間隔を空けて行っています。短時間に何度も連続で実行しないでください。": "공식 사이트의 부하를 줄이기 위해 페이지는 간격을 두고 불러옵니다. 짧은 시간에 여러 번 연속으로 실행하지 마세요.",
  "2fRATE（非公式）・トップ・GitHub© 2026 なふ（2fRATE）。2fRATE のプログラム・デザイン・ロゴの無断転載・無断使用を禁じます。": "2fRATE(비공식) · <a href=\"./\">톱</a> · <a href=\"https://github.com/n4f1316/dxscore-tools\">GitHub</a><br>© 2026 なふ(2fRATE). 2fRATE의 프로그램·디자인·로고의 무단 전재·무단 사용을 금지합니다.",
  "2fRATE のしくみ（α版）": "2fRATE의 구조 (알파판)",
  "2fRATE がどのように計算されているかをまとめています。": "2fRATE가 어떻게 계산되는지 정리했습니다.",
  "☆の決まり方": "☆가 정해지는 방법",
  "☆は、でらっくスコアの取得率（現在のでらっくスコア ÷ 最大値）で決まります。": "☆는 DX 스코어 취득률(현재 DX 스코어 ÷ 최대값)로 정해집니다.",
  "取得率": "취득률",
  "100%（理論値）": "100%(이론치)",
  "99% 以上": "99% 이상",
  "97% 以上": "97% 이상",
  "95% 以上": "95% 이상",
  "93% 以上": "93% 이상",
  "90% 以上": "90% 이상",
  "85% 以上": "85% 이상",
  "計算には☆を小数第一位まで使います。小数部分は「次の☆までの進み具合」を10段階で表したもの（切り捨て）です。たとえば☆6の範囲（99%〜100%）のちょうど中間なら☆6.5、理論値まであと少しでも☆6.9です。☆1未満（85%未満）の譜面は0として扱います。": "계산에는 ☆를 소수 첫째 자리까지 사용합니다. 소수 부분은 「다음 ☆까지의 진행 정도」를 10단계로 나타낸 것(버림)입니다. 예를 들어 ☆6 범위(99%~100%)의 정확히 중간이면 ☆6.5, 이론치까지 조금 남아도 ☆6.9입니다. ☆1 미만(85% 미만)인 보면은 0으로 취급합니다.",
  "単曲レート値": "곡별 레이트 값",
  "譜面ごとの値（単曲レート値）は、次の式で計算します。": "보면별 값(곡별 레이트 값)은 다음 식으로 계산합니다.",
  "（譜面定数 × 譜面定数 × ☆の整数部分 ＋ 譜面定数 × 譜面定数 × ☆の小数部分 × 0.5）÷ 100 ＋ 0.1（☆がレートの上限に達したときだけ） ＋ 希少ボーナス（下記。☆7まで・☆6まで のみ）": "(보면 상수 × 보면 상수 × <span class=\"v\">☆의 정수 부분</span><br> + 보면 상수 × 보면 상수 × <span class=\"v\">☆의 소수 부분</span> × 0.5) ÷ 100<br> + <span class=\"bonus\">0.1(☆가 레이트 상한에 도달했을 때만)</span><br> + <span class=\"rare\">희소 보너스(아래 참고. ☆7까지·☆6까지만)</span>",
  "☆の小数部分は半分の重みで加わります。☆がそのレートの上限（☆7まで なら☆7、☆6まで なら☆6、☆5まで なら☆5）に達した譜面には、さらに 0.1 のボーナスがつきます。下の表は「☆7まで」の例です。": "☆의 소수 부분은 절반의 가중치로 더해집니다. ☆가 그 레이트의 상한(☆7까지라면 ☆7, ☆6까지라면 ☆6, ☆5까지라면 ☆5)에 도달한 보면에는 추가로 0.1의 보너스가 붙습니다. 아래 표는 「☆7까지」의 예입니다.",
  "好きな譜面の値は 単曲レート計算 で調べられます。": "원하는 보면의 값은 <a href=\"calculator.html\">곡별 레이트 계산</a>에서 확인할 수 있습니다.",
  "希少ボーナス": "희소 보너스",
  "でらっくスコアの全国ランキング（上位100人）で☆6以上（☆6＋☆7）を達成している人が少ない譜面は、自分が☆6以上を達成していると、「☆7まで」「☆6まで」の単曲レート値に次の値が加わります。「☆5まで」には加わりません。": "DX 스코어 전국 랭킹(상위 100명)에서 ☆6 이상(☆6+☆7)을 달성한 사람이 적은 보면은, 자신이 ☆6 이상을 달성했다면 「☆7까지」「☆6까지」의 곡별 레이트 값에 다음 값이 더해집니다. 「☆5까지」에는 더해지지 않습니다. (랭킹은 일본판 기준입니다.)",
  "上位100人のうち☆6以上の人数": "상위 100명 중 ☆6 이상 인원",
  "加算": "가산",
  "3人以下": "3명 이하",
  "10人以下": "10명 이하",
  "20人以下": "20명 이하",
  "人数は、全国ランキングを定期的に集計したデータから求めています（集計データがない譜面には加算されません）。対象の譜面は 譜面データビューア の「希少ボーナス対象のみ」で確認できます。": "인원은 전국 랭킹을 정기적으로 집계한 데이터로 구합니다(집계 데이터가 없는 보면에는 더해지지 않습니다). 대상 보면은 <a href=\"viewer.html\">보면 데이터 뷰어</a>의 「희소 보너스 대상만」에서 확인할 수 있습니다.",
  "単曲レート値の高い上位50譜面（レート対象曲）の平均が 2fRATE です。50譜面に満たない場合も50で割ります。": "곡별 레이트 값이 높은 상위 50보면(레이트 대상 곡)의 평균이 2fRATE입니다. 50보면에 못 미쳐도 50으로 나눕니다.",
  "☆7まで：上の式そのままのレートです。☆7（理論値）の譜面に 0.1 のボーナスがつきます。希少ボーナスも加わります。": "<b>☆7까지</b>: 위 식 그대로의 레이트입니다. ☆7(이론치) 보면에 0.1의 보너스가 붙습니다. 희소 보너스도 더해집니다.",
  "☆6まで：☆7の譜面を☆6.0として計算します。☆6.0以上の譜面に 0.1 のボーナスがつきます。希少ボーナスも加わります。": "<b>☆6까지</b>: ☆7 보면을 ☆6.0으로 계산합니다. ☆6.0 이상 보면에 0.1의 보너스가 붙습니다. 희소 보너스도 더해집니다.",
  "☆5まで：☆5を超える譜面を☆5.0として計算します。☆5.0以上の譜面に 0.1 のボーナスがつきます（希少ボーナスはありません）。": "<b>☆5까지</b>: ☆5를 넘는 보면을 ☆5.0으로 계산합니다. ☆5.0 이상 보면에 0.1의 보너스가 붙습니다(희소 보너스는 없습니다).",
  "レート対象曲は、レートの種類ごとに別々に選びます。": "레이트 대상 곡은 레이트 종류마다 따로 고릅니다.",
  "ランク": "랭크",
  "3種類の 2fRATE それぞれにランクがあり、表示している値（小数第3位まで）で決まります。区切りは「☆7まで」が LEGEND 12.000 以上、「☆6まで」が 11.500 以上、「☆5まで」が 10.500 以上で、それより下はどれも 0.500 刻みです。": "3종류의 2fRATE 각각에 랭크가 있으며, 표시되는 값(소수 셋째 자리까지)으로 정해집니다. 경계는 「☆7까지」가 LEGEND 12.000 이상, 「☆6까지」가 11.500 이상, 「☆5까지」가 10.500 이상이며, 그 아래는 모두 0.500 간격입니다.",
  "☆7まで": "☆7까지",
  "☆6まで": "☆6까지",
  "☆5まで": "☆5까지",
  "ブックマークバーへドラッグしてください": "북마크바로 드래그하세요",
  "コピーしました": "복사했습니다",
  "コピーできませんでした（長押しで選択してください）": "복사하지 못했습니다(길게 눌러 선택하세요)",
  "2fRATE ランキング（α版）": "2fRATE 랭킹 (알파판)",
  "ランキング（α版・デザイン検証中）": "랭킹(알파판·디자인 검증 중)",
  "2fRATE の「ランキングに登録」から登録された記録です。自分の記録（非公開にしたベスト枠を含む）はマイページで見られます。": "2fRATE의 「랭킹에 등록」으로 등록된 기록입니다. 자신의 기록(비공개로 한 베스트 50 포함)은 <a href=\"mypage.html\">마이페이지</a>에서 볼 수 있습니다.",
  "記録は各プレイヤーが自分で登録したもので、数値は自己申告です。匿名の記録は「匿名#記号」で表示しています。 非公式のファンメイドツールです。株式会社セガおよび関連会社とは一切関係ありません。楽曲・ジャケット画像・アイコン画像の著作権は、株式会社セガおよび各権利者に帰属します。ジャケット画像・アイコン画像は公式サイトの画像を表示しているもので、本ツールでは保存・配布していません。権利者の方からご連絡をいただいた場合は、該当部分の公開停止などに速やかに対応します。 © 2026 なふ（2fRATE）。2fRATE のプログラム・デザイン・ロゴの無断転載・無断使用を禁じます。": "기록은 각 플레이어가 직접 등록한 것이며, 수치는 자기 신고입니다. 익명 기록은 「익명#기호」로 표시합니다.<br> 비공식 팬메이드 툴이며, 주식회사 세가 및 관련 회사와는 일절 관계가 없습니다. 악곡·재킷 이미지·아이콘 이미지의 저작권은 주식회사 세가 및 각 권리자에게 있습니다. 재킷 이미지·아이콘 이미지는 공식 사이트의 이미지를 표시하는 것이며, 본 툴에서는 저장·배포하지 않습니다. 권리자분께 연락을 받은 경우, 해당 부분의 공개 중지 등에 신속히 대응합니다.<br> © 2026 なふ(2fRATE). 2fRATE의 프로그램·디자인·로고의 무단 전재·무단 사용을 금지합니다.",
  "☆7達成数": "☆7 달성 수",
  "☆6達成数": "☆6 달성 수",
  "☆5達成数": "☆5 달성 수",
  "合計": "합계",
  "MASのみ": "MAS만",
  "Re:MASのみ": "Re:MAS만",
  "カメラで撮影したアイコン": "카메라로 찍은 아이콘",
  "{0} のベスト枠": "{0}의 베스트 50",
  "{0} のお気に入り譜面": "{0}의 즐겨찾기 보면",
  "お気に入り": "즐겨찾기",
  "閉じる": "닫기",
  "曲名": "곡명",
  "この記録には「{0}」のレート対象曲がありません（以前の版で登録された記録です。登録し直すと表示されます）。": "이 기록에는 「{0}」의 레이트 대상 곡이 없습니다(이전 버전으로 등록된 기록입니다. 다시 등록하면 표시됩니다).",
  "ベスト枠のデータがありません。": "베스트 50 데이터가 없습니다.",
  "希少 +{0}": "희소 +{0}",
  "{0} の☆6・☆7達成譜面": "{0}의 ☆6·☆7 달성 보면",
  "達成譜面 ☆7 {0}・☆6以上 {1}": "달성 보면 ☆7 {0}·☆6 이상 {1}",
  "曲名で絞り込み": "곡명으로 좁히기",
  "« 前へ": "« 이전",
  "次へ »": "다음 »",
  "☆6以上（{0}）": "☆6 이상({0})",
  "すべての難易度": "모든 난이도",
  "MASTERのみ": "MASTER만",
  "Re:MASTERのみ": "Re:MASTER만",
  "DX・ST": "DX·ST",
  "DXのみ": "DX만",
  "STのみ": "ST만",
  "{0} 譜面中 {1}〜{2} 件目（譜面定数の高い順）": "{0}보면 중 {1}~{2}번째(보면 상수가 높은 순)",
  "{0} 譜面（譜面定数の高い順）": "{0}보면(보면 상수가 높은 순)",
  "スコア": "스코어",
  "この条件の譜面はありません。": "이 조건의 보면은 없습니다.",
  "定数の指定なし": "상수 지정 없음",
  "譜面定数の下限": "보면 상수 하한",
  "譜面定数の上限": "보면 상수 상한",
  "読み込み中…": "불러오는 중…",
  "読み込めませんでした。": "불러오지 못했습니다.",
  "☆6・☆7達成譜面を読み込めませんでした。": "☆6·☆7 달성 보면을 불러오지 못했습니다.",
  "ベスト枠を読み込めませんでした。": "베스트 50을 불러오지 못했습니다.",
  "日本版": "일본판",
  "International版": "인터내셔널판",
  "全世界": "전 세계",
  "ページ切り替え（{0}）": "페이지 전환({0})",
  "{0} 人が登録": "{0}명 등록",
  "（定数表：{0}）": "(상수표: {0})",
  "{0} 人中 {1}〜{2} 人目": "  {0}명 중 {1}~{2}번째",
  "該当する記録はありません。": "해당하는 기록이 없습니다.",
  "更新 {0}": "갱신 {0}",
  "ベスト枠を見る": "베스트 50 보기",
  "お気に入り譜面を見る": "즐겨찾기 보면 보기",
  "☆6・☆7達成譜面を見る": "☆6·☆7 달성 보면 보기",
  "譜面": "보면",
  "上": "위",
  "下": "아래",
  "ランキングを読み込めませんでした。時間をおいて再読み込みしてください。": "랭킹을 불러오지 못했습니다. 잠시 후 다시 불러오세요.",
  "名前で絞り込み": "이름으로 좁히기",
  "ランキングを読み込み中…": "랭킹을 불러오는 중…"
 }
});
