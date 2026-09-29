(async () => {
  'use strict';

  // ============================================================
  //  設定
  // ============================================================

  // 版の表示（β版では 'β版'、正式版では空にする）
  const EDITION = 'β版';

  // でらっくスコア取得率(%) → 星の数（上から順に判定）
  const STAR_THRESHOLDS = [
    { stars: 7, pct: 100 },
    { stars: 6, pct: 99 },
    { stars: 5, pct: 97 },
    { stars: 4, pct: 95 },
    { stars: 3, pct: 93 },
    { stars: 2, pct: 90 },
    { stars: 1, pct: 85 },
  ];
  const MAX_STARS = STAR_THRESHOLDS[0].stars;

  // 計算するレートの種類（capStars: この☆を上限として計算。☆6以上を☆5扱いにするなら 5）
  const RATE_MODES = [
    { id: 'full', label: '☆7まで', capStars: MAX_STARS },
    { id: 'cap5', label: '☆5まで', capStars: 5 },
  ];

  const TOP_N = 50;          // 平均を取る曲数
  const WAIT_MS = 1500;      // ページ取得の間隔（サーバー負荷対策）
  const LEVEL_MAX = 23;      // level=23 が Lv15
  const PLAYER_URL = '/maimai-mobile/home/';

  // ジャケット画像：「曲名 → 画像ファイル名」の対応表（collect_jackets.js で作成）を読み、
  // maimai DX NET 上の画像をそのまま表示する（画像そのものはコピーしない）
  const JACKETS_URL = 'https://n4f1316.github.io/dxscore-tools/maimai_jackets.json';
  const JACKET_BASE = 'https://maimaidx.jp/maimai-mobile/img/Music/';
  const LEVEL_URL = (n) => `/maimai-mobile/record/musicLevel/search/?level=${n}`;

  // 譜面定数表（JSON）のURL。空なら表示レベルからの概算値（下限）を使う
  // 形式: { "曲名|DX|MASTER": 14.8, "曲名|ST|EXPERT": 12.3, ... }
  const CONST_URL = 'https://n4f1316.github.io/dxscore-tools/maimai_consts_magical.json';

  // 公式サイトのHTML構造に合わせたセレクタ（2026年9月時点の構造で確認済み）
  const SEL = {
    block: 'div[class*="_score_back"]', // 1譜面分の枠（例: music_master_score_back）
    name:  '.music_name_block',         // 曲名
    score: '.music_score_block',        // 達成率・でらっくスコア
    // DX / スタンダードの判定はアイコン画像のファイル名（music_dx.png / music_standard.png）で行う
    playerName: '.name_block',          // プレイヤー名（ホーム画面）
    profile: '.basic_block',            // プレイヤー情報の枠（ホーム画面）
    icon: 'img[src*="/img/Icon/"]',     // アイコン画像
    trophy: '.trophy_block',            // 称号の枠（クラス名 trophy_Gold などで色がわかる）
    trophyText: '.trophy_inner_block',  // 称号の文字
  };

  // 枠のクラス名 music_○○_score_back の ○○ → 難易度名
  const DIFF_BY_CLASS = {
    basic: 'BASIC',
    advanced: 'ADVANCED',
    expert: 'EXPERT',
    master: 'MASTER',
    remaster: 'Re:MASTER',
  };

  // ============================================================
  //  補助関数
  // ============================================================

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // level パラメータ → 表示ラベルと定数の範囲
  //   1〜6 は+なし、7 以降は「7, 7+, 8, 8+, …」の順（level=22 が 14+）
  function levelInfo(n) {
    if (n <= 6) return { label: String(n), min: n, max: n + 0.9 };
    const base = 7 + Math.floor((n - 7) / 2);
    const plus = (n - 7) % 2 === 1;
    return plus
      ? { label: `${base}+`, min: base + 0.6, max: base + 0.9 }
      : { label: String(base), min: base, max: base + 0.5 };
  }

  // そのレベルの譜面が取りうる値の上限（☆上限・定数最大のとき）
  const upperBound = (n, capStars) => (levelInfo(n).max ** 2 * capStars) / 1000;

  // 小数の誤差を避けるため整数同士で比較する（cur/max >= pct% と同じ意味）
  function starsOf(cur, max) {
    for (const t of STAR_THRESHOLDS) {
      if (cur * 100 >= max * t.pct) return t.stars;
    }
    return 0;
  }

  // 表示用の小数つき☆（例: 6.4）。次の☆までの進み具合を 0.1 刻みで表す
  //   ☆6(99%)→☆7(100%) の間で 99.48% なら 6.4。切り捨てなので次の☆に届くまで繰り上がらない
  //   計算には使わず、表示のみ
  function starDisplay(cur, max) {
    const s = starsOf(cur, max);
    const lo = STAR_THRESHOLDS.find((t) => t.stars === s)?.pct ?? 0;
    const hi = STAR_THRESHOLDS.find((t) => t.stars === s + 1)?.pct;
    if (hi === undefined) return s.toFixed(1); // 最高の☆
    const tenths = Math.floor(((cur * 100 - max * lo) * 10) / (max * (hi - lo)));
    return (s + tenths / 10).toFixed(1);
  }

  // ページ内の「譜面の枠」と「DX/STアイコン」を文書の並び順に走査し、
  // 各枠の直後（次の枠が現れるまで）にある最初のアイコンをその譜面の種別とする。
  // 親子関係に頼らないので、枠を囲む要素の構造が違っても判定できる。
  const KIND_ICON = 'img[src*="music_dx.png"], img[src*="music_standard.png"]';

  function buildKindMap(doc) {
    const map = new Map();
    let pending = null;
    doc.querySelectorAll(`${SEL.block}, ${KIND_ICON}`).forEach((el) => {
      if (el.tagName === 'IMG') {
        if (pending) {
          map.set(pending, (el.getAttribute('src') ?? '').includes('music_standard') ? 'ST' : 'DX');
          pending = null;
        }
      } else {
        pending = el;
      }
    });
    return map;
  }

  let kindWarned = false;

  function parsePage(html, levelNo) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const kindMap = buildKindMap(doc);
    const list = [];

    doc.querySelectorAll(SEL.block).forEach((block) => {
      const m = block.className.match(/music_(\w+?)_score_back/);
      const diff = DIFF_BY_CLASS[m?.[1]];
      if (!diff) return; // 宴など対象外の譜面

      const name = block.querySelector(SEL.name)?.textContent.trim();
      if (!name) return;

      // 「1,234 / 1,500」の形のテキストをでらっくスコアとみなす
      let dx = null;
      block.querySelectorAll(SEL.score).forEach((el) => {
        const s = el.textContent.replace(/,/g, '').match(/(\d+)\s*\/\s*(\d+)/);
        if (s) dx = { cur: Number(s[1]), max: Number(s[2]) };
      });
      if (!dx || dx.max === 0) return; // 未プレー

      // 見つからない場合は DX と決めつけず「?」にする
      const kind = kindMap.get(block) ?? '?';
      if (kind === '?' && !kindWarned) {
        kindWarned = true;
        // 原因調査用：判定できなかった譜面の周辺HTMLをコンソールに出す
        console.warn('種別を判定できなかった譜面の周辺HTML:', (block.parentElement ?? block).outerHTML);
      }

      list.push({ name, diff, kind, levelNo, level: levelInfo(levelNo).label, ...dx });
    });

    return list;
  }

  function score(s, constTable) {
    const key = `${s.name}|${s.kind}|${s.diff}`;
    const keyMax = `${key}|${s.max}`; // 同名の別曲はでらっくスコア最大値つきのキーで登録されている
    const hitKey = keyMax in constTable ? keyMax : key in constTable ? key : null;
    const inTable = hitKey !== null;
    const c = inTable ? constTable[hitKey] : levelInfo(s.levelNo).min;
    const stars = starsOf(s.cur, s.max);
    // レートの種類ごとに値を計算（☆は capStars を上限に切り詰める）
    const values = {};
    for (const m of RATE_MODES) values[m.id] = (c * c * Math.min(stars, m.capStars)) / 1000;
    return { ...s, c, estimated: !inTable, stars, values };
  }

  // ============================================================
  //  表示（見た目）
  // ============================================================

  const STYLE = `
    :host {
      all: initial; display: block;
      --ink: #2B2350; --sub: #6E6892; --line: #E4DFF3; --bg: #F6F4FC; --card: #FFFFFF;
      --pink: #E0348C; --cyan: #1FA9C9; --gold: #C98A00;
      --basic: #2E9E5B; --advanced: #D98E04; --expert: #E0434B; --master: #8E44D6; --remaster: #B68BE0;
      position: fixed; inset: 0; z-index: 99999; overflow: auto;
      background: var(--bg); color: var(--ink);
      font: 14px/1.6 "M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", "Hiragino Sans", "Yu Gothic", sans-serif;
      -webkit-text-size-adjust: 100%;
    }
    * { box-sizing: border-box; }
    .dxr-wrap {
      max-width: 760px; margin: 0 auto; padding: 16px 14px 40px;
      font: 14px/1.6 "M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", "Hiragino Sans", "Yu Gothic", sans-serif;
      color: var(--ink); text-align: left;
    }
    .dxr-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .dxr-title { font-size: 13px; color: var(--sub); font-weight: 700; }
    .dxr-close {
      font: inherit; font-weight: 700; color: var(--ink); background: var(--card);
      border: 1.5px solid var(--line); border-radius: 999px; padding: 6px 16px; cursor: pointer;
    }
    button:focus-visible { outline: 3px solid var(--cyan); outline-offset: 2px; }
    .dxr-status { margin: 10px 0 0; color: var(--sub); font-size: 13px; }
    .dxr-status.is-error { color: var(--expert); font-weight: 700; }

    /* プレイヤー情報（アイコン・称号・名前） */
    .dxr-profile { display: flex; align-items: center; gap: 14px; margin: 18px 0 14px; }
    .dxr-icon {
      width: 64px; height: 64px; flex: none; border-radius: 14px; object-fit: cover;
      background: #EFECF9; box-shadow: 0 0 0 1.5px var(--line);
    }
    .dxr-profile-text { min-width: 0; }
    .dxr-trophy {
      display: inline-block; max-width: 100%; font-size: 12px; font-weight: 700; line-height: 1.4;
      padding: 3px 12px; border-radius: 999px; margin-bottom: 4px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      background: #F1F1F4; color: #4A4A57; box-shadow: inset 0 0 0 1px #D9D9E2;
    }
    .dxr-trophy.t-Bronze { background: #F4E3D3; color: #7A4A1E; box-shadow: inset 0 0 0 1px #D9AC82; }
    .dxr-trophy.t-Silver { background: #ECEFF3; color: #4B5563; box-shadow: inset 0 0 0 1px #B8C0CC; }
    .dxr-trophy.t-Gold { background: #FFF1C7; color: #7A5600; box-shadow: inset 0 0 0 1px #E3B63A; }
    .dxr-trophy.t-Rainbow {
      color: #2B2350; box-shadow: none;
      background: linear-gradient(90deg, #FFD1DC, #FFE9B8, #D6F5C9, #C9EBFF, #E3D4FF);
    }
    .dxr-player { font-size: 22px; font-weight: 800; letter-spacing: .02em; line-height: 1.3; word-break: break-all; }

    /* レート表示：押すと表が切り替わる */
    .dxr-plates { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 18px; }
    .dxr-plate {
      font: inherit; text-align: left; cursor: pointer; color: var(--ink);
      background: var(--card); border: 2px solid var(--line); border-radius: 18px; padding: 12px 16px;
    }
    .dxr-plate[aria-pressed="true"] { border-color: var(--pink); box-shadow: 0 0 0 3px rgba(224,52,140,.15); }
    .dxr-plate-label { display: block; font-size: 12px; color: var(--sub); font-weight: 700; }
    .dxr-plate-value { display: block; font-size: 34px; font-weight: 800; line-height: 1.2; font-variant-numeric: tabular-nums; }
    .dxr-plate[aria-pressed="true"] .dxr-plate-value { color: var(--pink); }
    .dxr-plate-hint { display: block; font-size: 11px; color: var(--sub); }

    /* 譜面の一覧 */
    .dxr-list { background: var(--card); border: 1.5px solid var(--line); border-radius: 18px; overflow: hidden; }
    .dxr-row {
      display: grid; grid-template-columns: 2.2em 44px 1fr 4.2em 4.6em 4.4em; align-items: center; gap: 10px;
      padding: 9px 14px; border-top: 1px solid var(--line);
    }
    .dxr-row:nth-child(even) { background: #FBFAFE; }
    .dxr-head { border-top: 0; background: var(--ink) !important; color: #fff; font-size: 11px; font-weight: 700; padding: 7px 14px; }
    .dxr-rank { font-weight: 800; color: var(--sub); text-align: right; font-variant-numeric: tabular-nums; }
    .dxr-name { font-weight: 700; line-height: 1.35; word-break: break-word; }
    .dxr-meta { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
    .dxr-chip {
      display: inline-block; font-size: 11px; font-weight: 700; line-height: 1; padding: 4px 7px;
      border-radius: 6px; color: #fff; white-space: nowrap;
    }
    .dxr-kind-DX { background: linear-gradient(90deg, var(--pink), #F29A2E); }
    .dxr-kind-ST { background: #3B82C4; }
    .dxr-kind-unknown { background: #999; }
    .dxr-diff-BASIC { background: var(--basic); }
    .dxr-diff-ADVANCED { background: var(--advanced); }
    .dxr-diff-EXPERT { background: var(--expert); }
    .dxr-diff-MASTER { background: var(--master); }
    .dxr-diff-REMASTER { background: #fff; color: var(--master); box-shadow: inset 0 0 0 1.5px var(--remaster); }
    .dxr-const { background: #EFECF9; color: var(--ink); }
    .dxr-const.is-est { color: var(--sub); }
    .dxr-star, .dxr-diffmax, .dxr-val { text-align: right; font-variant-numeric: tabular-nums; }
    .dxr-star { font-weight: 800; }
    .dxr-star.s7 { color: var(--gold); }
    .dxr-star.s6 { color: var(--pink); }
    .dxr-star.s5 { color: var(--cyan); }
    .dxr-star.low { color: var(--sub); }
    .dxr-diffmax { font-size: 12px; color: var(--sub); }
    .dxr-diffmax.is-max { color: var(--gold); font-weight: 800; }
    .dxr-val { font-weight: 800; font-size: 15px; }
    .dxr-head .dxr-star, .dxr-head .dxr-diffmax, .dxr-head .dxr-val { color: #fff; font-size: 11px; }

    .dxr-jacket {
      width: 44px; height: 44px; border-radius: 8px; object-fit: cover; display: block;
      background: #EFECF9; box-shadow: 0 0 0 1px var(--line);
    }
    .dxr-note { margin-top: 14px; font-size: 12px; color: var(--sub); line-height: 1.7; }

    /* スマホ幅：MAX差を曲名の下へ回す */
    @media (max-width: 520px) {
      .dxr-plate-value { font-size: 28px; }
      .dxr-icon { width: 56px; height: 56px; border-radius: 12px; }
      .dxr-player { font-size: 20px; }
      .dxr-row { grid-template-columns: 1.6em 40px 1fr 3.6em 4em; gap: 7px; padding: 9px 10px; }
      .dxr-jacket { width: 40px; height: 40px; }
      .dxr-row > .dxr-diffmax { display: none; }
      .dxr-meta .dxr-diffmax-inline { display: inline-block; }
    }
    .dxr-diffmax-inline { display: none; background: transparent; color: var(--sub); padding-left: 2px; }
    .dxr-diffmax-inline.is-max { color: var(--gold); }
  `;

  // 要素を作る小さな補助関数（textContent で入れるので安全）
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function createPanel() {
    document.getElementById('dxr-panel')?.remove(); // 二重起動対策
    if (!document.getElementById('dxr-font')) {
      // フォントはページ全体に読み込む（シャドウDOMの中からも使える）
      const font = document.createElement('link');
      font.id = 'dxr-font';
      font.rel = 'stylesheet';
      font.href = 'https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@500;700;800&display=swap';
      document.head.appendChild(font);
    }

    // 公式サイトのCSSの影響を受けないよう、シャドウDOMの中に画面を作る
    const host = el('div');
    host.id = 'dxr-panel';
    // 外枠だけはページ側のCSSに上書きされないよう直接指定する
    host.style.cssText =
      'all:initial;position:fixed;inset:0;z-index:99999;display:block;' +
      'overflow:auto;background:#F6F4FC;color:#2B2350;font-size:14px;line-height:1.6;';
    const root = host.attachShadow({ mode: 'open' });
    const style = el('style');
    style.textContent = STYLE;

    const wrap = el('div', 'dxr-wrap');
    const top = el('div', 'dxr-top');
    const title = el('div', 'dxr-title', EDITION ? `2fRATE ${EDITION}` : '2fRATE');
    const close = el('button', 'dxr-close', '閉じる');
    close.type = 'button';
    close.onclick = () => host.remove();
    top.append(title, close);

    const status = el('p', 'dxr-status');
    const body = el('div');
    wrap.append(top, status, body);
    root.append(style, wrap);
    document.body.appendChild(host);

    return {
      body,
      status: (t, isError = false) => {
        status.textContent = t;
        status.classList.toggle('is-error', isError);
      },
    };
  }

  function starClass(stars) {
    if (stars >= 7) return 's7';
    if (stars === 6) return 's6';
    if (stars === 5) return 's5';
    return 'low';
  }

  function buildList(top, mode, jackets) {
    const list = el('div', 'dxr-list');

    const head = el('div', 'dxr-row dxr-head');
    head.append(el('div', 'dxr-rank', '#'), el('div'), el('div', '', '曲名'), el('div', 'dxr-star', '☆'),
      el('div', 'dxr-diffmax', 'MAX差'), el('div', 'dxr-val', 'レート値'));
    list.appendChild(head);

    top.forEach((s, i) => {
      const row = el('div', 'dxr-row');
      const diffText = s.cur === s.max ? 'MAX' : `MAX-${(s.max - s.cur).toLocaleString()}`;
      const isMax = s.cur === s.max;

      const main = el('div');
      main.appendChild(el('div', 'dxr-name', s.name));
      const meta = el('div', 'dxr-meta');
      meta.append(
        el('span', `dxr-chip dxr-kind-${s.kind === '?' ? 'unknown' : s.kind}`, s.kind),
        el('span', `dxr-chip dxr-diff-${s.diff.replace(':', '').toUpperCase()}`, `${s.diff} ${s.level}`),
        el('span', `dxr-chip dxr-const${s.estimated ? ' is-est' : ''}`, `定数 ${s.c.toFixed(1)}${s.estimated ? '*' : ''}`),
        el('span', `dxr-chip dxr-diffmax-inline${isMax ? ' is-max' : ''}`, diffText)
      );
      main.appendChild(meta);

      // ジャケット画像（見つからない・読み込めない場合は空の枠）
      let jacket;
      const file = jackets?.get(s.name);
      if (file) {
        jacket = el('img', 'dxr-jacket');
        jacket.src = JACKET_BASE + file;
        jacket.alt = '';
        jacket.loading = 'lazy';
        jacket.decoding = 'async';
        jacket.onerror = () => { jacket.removeAttribute('src'); };
      } else {
        jacket = el('div', 'dxr-jacket');
      }

      row.append(
        el('div', 'dxr-rank', String(i + 1)),
        jacket,
        main,
        el('div', `dxr-star ${starClass(s.stars)}`, `☆${starDisplay(s.cur, s.max)}`),
        el('div', `dxr-diffmax${isMax ? ' is-max' : ''}`, diffText),
        el('div', 'dxr-val', s.values[mode.id].toFixed(3))
      );
      list.appendChild(row);
    });
    return list;
  }

  // 「曲名 → 画像ファイル名」の対応表を読み込む（同名の別曲は null で登録されている）
  async function loadJacketMap() {
    try {
      const res = await fetch(JACKETS_URL + '?' + Date.now());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return new Map(Object.entries(await res.json()));
    } catch (e) {
      console.warn('ジャケット画像の対応表を読み込めませんでした', e);
      return null;
    }
  }

  // プレイヤー名を取得（今のページになければホーム画面から読む。失敗しても空文字で続行）
  // プレイヤー情報（名前・アイコン・称号）を取得する
  // 今のページがホーム画面ならそこから、そうでなければホーム画面を1回だけ取得して読む
  function readProfile(doc) {
    const box = doc.querySelector(SEL.profile) ?? doc;
    const name = box.querySelector(SEL.playerName)?.textContent.trim() ?? '';
    const icon = box.querySelector(SEL.icon)?.getAttribute('src') ?? '';
    const trophyEl = box.querySelector(SEL.trophy);
    const trophy = trophyEl?.querySelector(SEL.trophyText)?.textContent.trim() ?? '';
    const trophyRank = trophyEl?.className.match(/trophy_(Normal|Bronze|Silver|Gold|Rainbow)/)?.[1] ?? '';
    return { name, icon, trophy, trophyRank };
  }

  async function getPlayerProfile() {
    const here = readProfile(document);
    if (here.name && here.icon) return here;
    try {
      const res = await fetch(PLAYER_URL, { credentials: 'same-origin' });
      if (!res.ok) return here;
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      const got = readProfile(doc);
      return got.name ? got : here;
    } catch {
      return here;
    }
  }


  // results: [{ mode, rating, top }, ...]
  function renderResult(ui, profile, results, info, jackets) {
    // プレイヤー情報：アイコン / 称号 / 名前
    const player = el('div', 'dxr-profile');
    if (profile.icon) {
      const icon = el('img', 'dxr-icon');
      icon.src = profile.icon;
      icon.alt = '';
      icon.onerror = () => icon.remove();
      player.appendChild(icon);
    }
    const text = el('div', 'dxr-profile-text');
    if (profile.trophy) {
      const trophy = el('div', `dxr-trophy${profile.trophyRank ? ' t-' + profile.trophyRank : ''}`, profile.trophy);
      trophy.title = profile.trophy; // 長い称号は省略表示になるので、全文を確認できるように
      text.appendChild(trophy);
    }
    text.appendChild(el('div', 'dxr-player', profile.name || 'プレイヤー名を取得できませんでした'));
    player.appendChild(text);

    // レートの札（押すとその上位50に切り替わる）
    const plates = el('div', 'dxr-plates');
    const lists = results.map(({ mode, top }) => buildList(top, mode, jackets));
    const buttons = results.map(({ mode, rating }, i) => {
      const b = el('button', 'dxr-plate');
      b.type = 'button';
      b.append(
        el('span', 'dxr-plate-label', mode.label),
        el('span', 'dxr-plate-value', rating.toFixed(3)),
        el('span', 'dxr-plate-hint', `押すと上位${TOP_N}を表示`)
      );
      b.onclick = () => select(i);
      plates.appendChild(b);
      return b;
    });
    function select(i) {
      lists.forEach((l, j) => { l.style.display = i === j ? '' : 'none'; });
      buttons.forEach((b, j) => b.setAttribute('aria-pressed', String(i === j)));
    }
    select(0);

    const hasEst = results.some(({ top }) => top.some((s) => s.estimated));
    const note = el('p', 'dxr-note',
      `${info}。` +
      (hasEst ? '定数の * は定数表にない譜面で、レベル表示からの概算値（下限）です。' : '') +
      '☆の小数は次の☆までの進み具合で、計算には整数部分のみ使います。' +
      '「☆5まで」は☆6以上を☆5として計算しています。' +
      (jackets ? '' : 'ジャケット画像の対応表を読み込めなかったため、画像は表示していません。'));

    ui.body.append(player, plates, ...lists, note);
  }

  // ============================================================
  //  メイン処理
  // ============================================================

  if (location.hostname !== 'maimaidx.jp') {
    alert('maimai DX NET にログインした状態で実行してください。');
    return;
  }

  const ui = createPanel();

  try {
    // 譜面定数表の読み込み（任意）
    let constTable = {};
    if (CONST_URL) {
      try {
        const res = await fetch(CONST_URL + '?' + Date.now());
        if (!res.ok) throw new Error(`HTTP ${res.status}（ファイルが見つからない可能性があります）`);
        const text = await res.text();
        try {
          constTable = JSON.parse(text);
        } catch {
          throw new Error('JSONとして読み込めませんでした（ファイルの中身が壊れている可能性があります）');
        }
      } catch (err) {
        ui.status(`譜面定数表を読み込めませんでした：${err.message}／URL: ${CONST_URL}　概算値で計算します。`, true);
        console.error('定数表の読み込みエラー', err);
        await sleep(4000);
      }
    }

    // プレイヤー名
    ui.status('プレイヤー情報を取得中…');
    const profile = await getPlayerProfile();
    const jacketPromise = loadJacketMap(); // 別サーバーなので並行して読み込む

    // 高いレベルから順に取得し、下のレベルが上位に入り得なくなったら打ち切る
    let scored = [];
    let fetched = 0;
    let lastLevel = LEVEL_MAX;

    for (let n = LEVEL_MAX; n >= 1; n--) {
      ui.status(`Lv${levelInfo(n).label} を取得中…（${++fetched}ページ目）`);
      const res = await fetch(LEVEL_URL(n), { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`Lv${levelInfo(n).label} の取得に失敗しました (HTTP ${res.status})`);

      scored.push(...parsePage(await res.text(), n).map((s) => score(s, constTable)));
      lastLevel = n;

      // すべてのレートで「下のレベルはもう上位に入れない」状態になったら打ち切る
      const allDone = RATE_MODES.every((m) => {
        const nth = [...scored].sort((a, b) => b.values[m.id] - a.values[m.id])[TOP_N - 1];
        return nth && nth.values[m.id] >= upperBound(n - 1, m.capStars);
      });
      if (n === 1 || allDone) break;
      await sleep(WAIT_MS);
    }

    if (scored.length === 0) {
      throw new Error('スコアを1件も読み取れませんでした。ログイン状態を確認してください。');
    }

    // レートの種類ごとに上位 TOP_N を選んで平均
    // 50曲未満の場合も TOP_N で割る（少ない曲数で高く出ないように）
    const results = RATE_MODES.map((mode) => {
      const top = [...scored].sort((a, b) => b.values[mode.id] - a.values[mode.id]).slice(0, TOP_N);
      const rating = top.reduce((sum, s) => sum + s.values[mode.id], 0) / TOP_N;
      return { mode, rating, top };
    });

    ui.status('');
    ui.status('ジャケット画像の対応表を確認中…');
    const jackets = await jacketPromise;
    ui.status('');
    renderResult(
      ui,
      profile,
      results,
      `Lv15〜Lv${levelInfo(lastLevel).label} の ${fetched} ページを取得し、${scored.length} 譜面から計算`,
      jackets
    );
  } catch (e) {
    ui.status('エラー: ' + e.message, true);
    console.error(e);
  }
})();
