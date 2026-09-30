(async () => {
  'use strict';

  // ============================================================
  //  設定
  // ============================================================

  // 版の表示（β版では 'β版'、正式版では空に(async () => {
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
    { id: 'cap6', label: '☆6まで', capStars: 6 },
    { id: 'cap5', label: '☆5まで', capStars: 5 },
  ];

  // 単曲レート値 = 定数 × ☆ × ☆（☆は小数第一位まで）÷ RATE_DIVISOR
  //   最大は 15.0 × 7.0 × 7.0 ÷ 10 = 73.5
  const RATE_DIVISOR = 10;

  const TOP_N = 50;          // 平均を取る曲数
  const WAIT_MS = 1500;      // ページ取得の間隔（サーバー負荷対策）
  const LEVEL_MAX = 23;      // level=23 が Lv15
  const PLAYER_URL = '/maimai-mobile/home/';

  // ジャケット画像：「曲名 → 画像ファイル名」の対応表（collect_jackets.js で作成）を読み、
  // maimai DX NET 上の画像をそのまま表示する（画像そのものはコピーしない）
  const JACKETS_URL = 'https://n4f1316.github.io/dxscore-tools/maimai_jackets.json';
  const OVERRIDES_URL = 'https://n4f1316.github.io/dxscore-tools/jacket_overrides.json'; // 同名曲の手動対応表
  let jacketOverrides = {};
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
  const upperBound = (n, capStars) => (levelInfo(n).max * capStars * capStars) / RATE_DIVISOR;

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
  // 計算に使う☆（0.1刻み。例：6.4）を「10倍した整数」で返す（小数の誤差を避けるため）
  //   ☆1未満（取得率85%未満）は 0 とする
  function starTenths(cur, max) {
    const s = starsOf(cur, max);
    if (s === 0) return 0;
    const lo = STAR_THRESHOLDS.find((t) => t.stars === s).pct;
    const hi = STAR_THRESHOLDS.find((t) => t.stars === s + 1)?.pct;
    if (hi === undefined) return s * 10; // 最高の☆
    return s * 10 + Math.floor(((cur * 100 - max * lo) * 10) / (max * (hi - lo)));
  }

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
    // ☆は小数第一位まで反映（6.4なら6.4で計算）。レートの種類ごとの上限（☆5まで等）で切り詰める
    const tenths = starTenths(s.cur, s.max);
    for (const m of RATE_MODES) {
      const t = Math.min(tenths, m.capStars * 10); // ☆×10 の整数
      values[m.id] = (c * t * t) / 100 / RATE_DIVISOR;  // 定数 × ☆ × ☆ ÷ RATE_DIVISOR
    }
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
    .dxr-trophy-official { max-width: 100%; margin-bottom: 4px; }
    .dxr-trophy-official > * { max-width: 100%; margin-left: 0 !important; }
    .dxr-player { font-size: 22px; font-weight: 800; letter-spacing: .02em; line-height: 1.3; word-break: break-all; }

    /* レート表示：押すと表が切り替わる */
    .dxr-plates { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-bottom: 18px; }
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
      display: grid; grid-template-columns: 30px 44px 1fr 66px 72px 72px; align-items: center; gap: 10px;
      padding: 9px 14px; border-top: 1px solid var(--line);
    }
    .dxr-row:nth-child(even) { background: #FBFAFE; }
    .dxr-head { border-top: 0; background: var(--ink) !important; color: #fff; font-size: 11px; font-weight: 700; padding-top: 7px; padding-bottom: 7px; }
    .dxr-rank { font-weight: 800; color: var(--sub); text-align: center; font-variant-numeric: tabular-nums; }
    .dxr-name { font-weight: 700; line-height: 1.35; word-break: break-word; }
    .dxr-genre { font-size: 11px; font-weight: 700; color: var(--sub); margin-left: 2px; }
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
    .dxr-diffmax { text-align: right; font-variant-numeric: tabular-nums; }
    .dxr-val { text-align: right; font-variant-numeric: tabular-nums; }
    .dxr-head .dxr-val { text-align: center; }
    .dxr-star { text-align: center; font-variant-numeric: tabular-nums; }
    /* ☆の色分け（Discordアイコンと共通）：☆1・2 黄緑 / ☆3・4 オレンジ / ☆5・6 黄色 / ☆7 虹色 */
    .dxr-star-pill {
      display: inline-block; min-width: 3.6em; padding: 3px 7px; border-radius: 999px; text-align: center;
      font-size: 13px; font-weight: 800; line-height: 1.3; color: #2B2350; background: #EFECF9;
    }
    .dxr-star-pill.g12 { background: #B5E05A; }
    .dxr-star-pill.g34 { background: #FF8C2E; }
    .dxr-star-pill.g56 { background: #FFE066; }
    .dxr-star-pill.g7 { background: linear-gradient(90deg, #FF5E7E, #FFB347, #FFE66D, #7EE081, #5CC8FF, #A78BFA); }
    .dxr-star-pill.g0 { color: var(--sub); }
    .dxr-diffmax { font-size: 12px; color: var(--sub); }
    .dxr-diffmax.is-max { color: var(--gold); font-weight: 800; }
    .dxr-val { font-weight: 800; font-size: 15px; }
    .dxr-head .dxr-star, .dxr-head .dxr-diffmax, .dxr-head .dxr-val { color: #fff; font-size: 11px; }

    .dxr-jacket {
      width: 44px; height: 44px; border-radius: 8px; object-fit: cover; display: block;
      background: #EFECF9; box-shadow: 0 0 0 1px var(--line);
    }
    .dxr-share {
      display: block; width: 100%; margin: -6px 0 16px; padding: 10px 16px; border-radius: 999px;
      font: inherit; font-weight: 800; color: #fff; background: var(--pink); border: 0; cursor: pointer;
    }
    .dxr-share:disabled { opacity: .6; cursor: default; }
    .dxr-note { margin-top: 14px; font-size: 12px; color: var(--sub); line-height: 1.7; }

    /* スマホ幅：MAX差を曲名の下へ回す */
    @media (max-width: 520px) {
      .dxr-plates { gap: 6px; }
      .dxr-plate { padding: 10px 10px; border-radius: 14px; }
      .dxr-plate-value { font-size: 22px; }
      .dxr-plate-hint { display: none; }
      .dxr-icon { width: 56px; height: 56px; border-radius: 12px; }
      .dxr-player { font-size: 20px; }
      .dxr-star-pill { min-width: 0; padding: 3px 5px; font-size: 12px; }
      .dxr-row { grid-template-columns: 22px 40px 1fr 54px 60px; gap: 7px; padding: 9px 10px; }
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
    if (stars >= 7) return 'g7';
    if (stars >= 5) return 'g56';
    if (stars >= 3) return 'g34';
    if (stars >= 1) return 'g12';
    return 'g0';
  }


  // ジャケット対応表から曲を特定する
  //   通常の曲：値は画像ファイル名（文字列）
  //   同名の別曲：値は候補の配列 [{ img, genre, st: [BAS..ReMAS のレベル], dx: [...] }]
  //   → 種別・難易度・レベルが一致する候補が1つだけなら、その曲と判断する
  const DIFF_ORDER = ['BASIC', 'ADVANCED', 'EXPERT', 'MASTER', 'Re:MASTER'];
  function resolveSong(map, name, kind, diff, level, max) {
    const v = map?.get(name);
    if (!v) return null;
    if (typeof v === 'string') return { img: v, genre: null };
    if (!Array.isArray(v)) return null;
    // 手動の対応表（同名の別曲で、レベルまで同じ譜面用）：「曲名|種別|難易度|最大値」→ ジャンル
    const g = jacketOverrides?.[`${name}|${kind}|${diff}|${max}`];
    if (g) {
      const c = v.find((x) => x.genre === g);
      if (c) return { img: c.img, genre: c.genre };
    }
    const k = kind === 'ST' ? 'st' : 'dx';
    const i = DIFF_ORDER.indexOf(diff);
    const hits = v.filter((c) => c[k]?.[i] === level);
    return hits.length === 1 ? { img: hits[0].img, genre: hits[0].genre } : null;
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
      const song = resolveSong(jackets, s.name, s.kind, s.diff, s.level, s.max);
      const nameEl = el('div', 'dxr-name', s.name);
      // 同名の別曲は、判別できたときにジャンルを添える
      if (song?.genre) nameEl.appendChild(el('span', 'dxr-genre', `（${song.genre}）`));
      main.appendChild(nameEl);
      const meta = el('div', 'dxr-meta');
      meta.append(
        el('span', `dxr-chip dxr-kind-${s.kind === '?' ? 'unknown' : s.kind}`, s.kind),
        el('span', `dxr-chip dxr-diff-${s.diff.replace(':', '').toUpperCase()}`, s.diff),
        el('span', `dxr-chip dxr-const${s.estimated ? ' is-est' : ''}`, `${s.c.toFixed(1)}${s.estimated ? '*' : ''}`),
        el('span', `dxr-chip dxr-diffmax-inline${isMax ? ' is-max' : ''}`, diffText)
      );
      main.appendChild(meta);

      // ジャケット画像（見つからない・読み込めない場合は空の枠）
      let jacket;
      const file = song?.img;
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
        (() => {
          const cell = el('div', 'dxr-star');
          cell.appendChild(el('span', `dxr-star-pill ${starClass(s.stars)}`, `☆${starDisplay(s.cur, s.max)}`));
          return cell;
        })(),
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
      const map = new Map(Object.entries(await res.json()));
      jacketOverrides = await fetch(OVERRIDES_URL + '?' + Date.now())
        .then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
      return map;
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
    return { name, icon, trophy, trophyRank, trophyEl };
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


  // 公式サイトの称号の見た目を再現するため、今のページに読み込まれている公式CSSから、
  // 称号の要素に関係するルールだけを取り出す（画面全体には適用しないので崩れない）
  function extractOfficialCss(node) {
    const used = new Set();
    [node, ...node.querySelectorAll('*')].forEach((e) => e.classList.forEach((c) => used.add(c)));

    const relevant = (selector) =>
      selector.split(',').some((sel) => {
        const t = sel.trim();
        if (t.includes('trophy')) return true;
        // 「.p_3」「.t_c.f_13」のような、クラスだけで書かれたルールで、称号に使われているもの
        if (!/^(\.[\w-]+)+$/.test(t)) return false;
        return t.slice(1).split('.').every((c) => used.has(c));
      });

    const out = [];
    const walk = (rules, base) => {
      for (const r of rules) {
        if (r.cssRules && r.media) {
          const inner = [];
          const saved = out.length;
          walk(r.cssRules, base);
          inner.push(...out.splice(saved));
          if (inner.length) out.push(`@media ${r.media.mediaText}{${inner.join('')}}`);
        } else if (r.selectorText && relevant(r.selectorText)) {
          // 画像の相対パスは、CSSファイルの場所を基準に絶対URLへ直す
          out.push(r.cssText.replace(/url\((['"]?)([^'")]+)\1\)/g, (m, q, u) => {
            try { return `url("${new URL(u, base).href}")`; } catch { return m; }
          }));
        }
      }
    };
    for (const sheet of document.styleSheets) {
      try {
        walk(sheet.cssRules, sheet.href || location.href);
      } catch {
        // 読めないCSS（別サイトのもの）は飛ばす
      }
    }
    return out.join('\n');
  }

  // ============================================================
  //  レート対象曲の画像化（5列×10行）
  // ============================================================

  // 画像の注意書きに載せるツールのURL
  const TOOL_URL = 'https://github.com/n4f1316/dxscore-tools';

  const IMG = {
    cols: 5, rows: 10, pad: 32, gap: 12,
    cellW: 240, jacket: 224, cellH: 320, headH: 204, footH: 110,
    font: '"M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", "Hiragino Sans", "Yu Gothic", sans-serif',
    ink: '#2B2350', sub: '#6E6892', line: '#E4DFF3', bg: '#F6F4FC', pink: '#E0348C',
  };
  const DIFF_COLOR = { BASIC: '#2E9E5B', ADVANCED: '#D98E04', EXPERT: '#E0434B', MASTER: '#8E44D6', 'Re:MASTER': '#8E44D6' };
  const TROPHY_COLOR = {
    Normal: ['#F1F1F4', '#4A4A57'], Bronze: ['#F4E3D3', '#7A4A1E'], Silver: ['#ECEFF3', '#4B5563'],
    Gold: ['#FFF1C7', '#7A5600'], Rainbow: [null, '#2B2350'],
  };
  const RAINBOW = ['#FF5E7E', '#FFB347', '#FFE66D', '#7EE081', '#5CC8FF', '#A78BFA'];

  // 画像を読み込む（失敗や時間切れなら null）。maimai DX NET 上で実行しているので同じサイトの画像は描ける
  function loadImage(src, ms = 8000) {
    return new Promise((resolve) => {
      if (!src) return resolve(null);
      const img = new Image();
      const t = setTimeout(() => resolve(null), ms);
      img.onload = () => { clearTimeout(t); resolve(img); };
      img.onerror = () => { clearTimeout(t); resolve(null); };
      img.src = src;
    });
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function rainbow(ctx, x, w) {
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    RAINBOW.forEach((c, i) => g.addColorStop(i / (RAINBOW.length - 1), c));
    return g;
  }

  // 文字がはみ出すときは末尾を「…」にする
  function fitText(ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    let t = text;
    while (t.length && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
    return t + '…';
  }

  // 角丸のラベル（塗り＋文字）。幅を返す
  function pill(ctx, x, y, text, { bg, fg, h = 24, size = 13, padX = 9, border = null, align = 'left' }) {
    ctx.font = `800 ${size}px ${IMG.font}`;
    const w = Math.ceil(ctx.measureText(text).width) + padX * 2;
    const left = align === 'right' ? x - w : x;
    roundRect(ctx, left, y, w, h, h / 2 > 8 ? 8 : h / 2);
    ctx.fillStyle = typeof bg === 'function' ? bg(left, w) : bg;
    ctx.fill();
    if (border) { ctx.lineWidth = 2; ctx.strokeStyle = border; ctx.stroke(); }
    ctx.fillStyle = fg;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(text, left + padX, y + h / 2 + 1);
    return w;
  }

  function starPillColor(stars) {
    if (stars >= 7) return (x, w) => null;
    if (stars >= 5) return '#FFE066';
    if (stars >= 3) return '#FF8C2E';
    if (stars >= 1) return '#B5E05A';
    return '#EFECF9';
  }

  async function buildShareImage(profile, result, jackets) {
    const { cols, rows, pad, gap, cellW, jacket: J, cellH, headH, footH } = IMG;
    const W = pad * 2 + cols * cellW + (cols - 1) * gap;
    const H = pad * 2 + headH + rows * cellH + (rows - 1) * gap + footH;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // 丸ゴシックの読み込みを待つ（読めなければ端末のフォントで描く）
    try {
      await Promise.all([
        document.fonts.load(`800 20px "M PLUS Rounded 1c"`),
        document.fonts.load(`700 20px "M PLUS Rounded 1c"`),
      ]);
    } catch { /* そのまま */ }

    // 画像をまとめて読み込む
    const top = result.top.slice(0, cols * rows);
    const files = top.map((s) => resolveSong(jackets, s.name, s.kind, s.diff, s.level, s.max)?.img);
    const [iconImg, ...jacketImgs] = await Promise.all([
      loadImage(profile.icon),
      ...files.map((f) => loadImage(f ? JACKET_BASE + f : null)),
    ]);

    // 背景
    ctx.fillStyle = IMG.bg;
    ctx.fillRect(0, 0, W, H);

    // ---- 上部：アイコン・称号・名前・レート ----
    const hx = pad, hy = pad;
    roundRect(ctx, hx, hy, W - pad * 2, headH - 20, 22);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = IMG.line;
    ctx.stroke();

    const iconSize = 136;
    const ix = hx + 18, iy = hy + (headH - 20 - iconSize) / 2;
    ctx.save();
    roundRect(ctx, ix, iy, iconSize, iconSize, 18);
    ctx.clip();
    if (iconImg) ctx.drawImage(iconImg, ix, iy, iconSize, iconSize);
    else { ctx.fillStyle = '#EFECF9'; ctx.fillRect(ix, iy, iconSize, iconSize); }
    ctx.restore();

    const tx = ix + iconSize + 20;
    const rateW = 400;
    const textMax = W - pad * 2 - (tx - hx) - rateW - 20;
    if (profile.trophy) {
      ctx.font = `800 21px ${IMG.font}`;
      const [tbg, tfg] = TROPHY_COLOR[profile.trophyRank] ?? TROPHY_COLOR.Normal;
      pill(ctx, tx, iy + 8, fitText(ctx, profile.trophy, textMax - 36), {
        bg: tbg ?? ((x, w) => rainbow(ctx, x, w)), fg: tfg, h: 40, size: 21, padX: 18,
      });
    }
    ctx.font = `800 50px ${IMG.font}`;
    ctx.fillStyle = IMG.ink;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillText(fitText(ctx, profile.name || 'プレイヤー', textMax), tx, iy + 114);

    const rx = W - pad - 24;
    ctx.textAlign = 'right';
    ctx.fillStyle = IMG.sub;
    ctx.font = `800 23px ${IMG.font}`;
    ctx.fillText(`2fRATE（${result.mode.label}）`, rx, iy + 36);
    ctx.fillStyle = IMG.pink;
    ctx.font = `800 80px ${IMG.font}`;
    ctx.fillText(result.rating.toFixed(3), rx, iy + 120);

    // ---- 譜面の一覧（5列×10行） ----
    const gy = pad + headH;
    top.forEach((s, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const x = pad + col * (cellW + gap);
      const y = gy + row * (cellH + gap);

      roundRect(ctx, x, y, cellW, cellH, 16);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = IMG.line;
      ctx.stroke();

      // ジャケット
      const jx = x + 8, jy = y + 8;
      ctx.save();
      roundRect(ctx, jx, jy, J, J, 12);
      ctx.clip();
      if (jacketImgs[i]) ctx.drawImage(jacketImgs[i], jx, jy, J, J);
      else { ctx.fillStyle = '#EFECF9'; ctx.fillRect(jx, jy, J, J); }
      ctx.restore();

      // 順位（ジャケット左上）
      pill(ctx, jx + 6, jy + 6, `#${i + 1}`, { bg: 'rgba(43,35,80,.88)', fg: '#FFFFFF', h: 32, size: 18, padX: 11 });

      // ジャケット下部：DX/ST・難易度（左）、譜面定数（右）
      // 文字が絵柄に埋もれないよう、下側を暗くしてからラベルを置く
      ctx.save();
      roundRect(ctx, jx, jy, J, J, 12);
      ctx.clip();
      const shade = ctx.createLinearGradient(0, jy + J - 68, 0, jy + J);
      shade.addColorStop(0, 'rgba(20,16,40,0)');
      shade.addColorStop(1, 'rgba(20,16,40,.72)');
      ctx.fillStyle = shade;
      ctx.fillRect(jx, jy + J - 68, J, 68);
      ctx.restore();

      const r1 = jy + J - 36;
      let px = jx + 6;
      px += pill(ctx, px, r1, s.kind, {
        bg: s.kind === 'ST' ? '#3B82C4' : (lx, w) => {
          const g = ctx.createLinearGradient(lx, 0, lx + w, 0);
          g.addColorStop(0, '#E0348C'); g.addColorStop(1, '#F29A2E');
          return g;
        },
        fg: '#FFFFFF', h: 30, size: 15, padX: 8,
      }) + 4;
      const isRe = s.diff === 'Re:MASTER';
      pill(ctx, px, r1, s.diff, {
        bg: isRe ? '#FFFFFF' : DIFF_COLOR[s.diff] ?? '#999', fg: isRe ? '#8E44D6' : '#FFFFFF',
        border: isRe ? '#B68BE0' : null, h: 30, size: 15, padX: 8,
      });
      pill(ctx, jx + J - 6, r1, `${s.c.toFixed(1)}${s.estimated ? '*' : ''}`, {
        bg: 'rgba(255,255,255,.95)', fg: IMG.ink, h: 30, size: 18, padX: 9, align: 'right',
      });

      // 1段目：楽曲名（長い場合は末尾を「…」で省略）
      const r0 = jy + J + 8;
      ctx.font = `700 20px ${IMG.font}`;
      ctx.fillStyle = IMG.ink;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(fitText(ctx, s.name, J), jx, r0 + 14);

      // 2段目：☆（左）、単曲レート値（右）
      const r2 = r0 + 36;
      const sc = starPillColor(s.stars);
      pill(ctx, jx, r2, `☆${starDisplay(s.cur, s.max)}`, {
        bg: s.stars >= 7 ? (lx, w) => rainbow(ctx, lx, w) : sc, fg: IMG.ink, h: 34, size: 19, padX: 12,
      });
      ctx.font = `800 29px ${IMG.font}`;
      ctx.fillStyle = IMG.ink;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(s.values[result.mode.id].toFixed(3), jx + J, r2 + 18);
    });

    // ---- 下部：注意書き ----
    const d = new Date();
    const p2 = (v) => String(v).padStart(2, '0');
    const fy = H - pad - footH + 34;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = IMG.ink;
    ctx.font = `800 20px ${IMG.font}`;
    ctx.fillText(`Generated by 2fRATE（${TOOL_URL}）`, pad, fy);
    ctx.fillStyle = IMG.sub;
    ctx.font = `700 17px ${IMG.font}`;
    ctx.fillText('楽曲のジャケット画像の著作権は、各権利者に帰属します。', pad, fy + 32);
    ctx.fillText('2fRATE は非公式のファンメイドツールであり、株式会社セガおよび関連会社とは一切関係ありません。', pad, fy + 60);
    ctx.textAlign = 'right';
    ctx.fillText(`作成日時 ${d.getFullYear()}/${p2(d.getMonth() + 1)}/${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`,
      W - pad, fy);

    return canvas;
  }

  // 別タブに画像を表示する（スマホは長押しで保存、PCはダウンロードボタン）
  async function openShareImage(profile, result, jackets, button) {
    // ポップアップがブロックされないよう、押した瞬間に先にタブを開いておく
    const win = window.open('', '_blank');
    if (win) {
      win.document.title = '2fRATE 画像を作成中…';
      win.document.body.style.cssText = 'font-family:sans-serif;padding:20px;color:#2B2350;';
      win.document.body.textContent = '画像を作成しています…';
    }
    const label = button.textContent;
    button.disabled = true;
    button.textContent = '画像を作成中…';
    try {
      const canvas = await buildShareImage(profile, result, jackets);
      const url = canvas.toDataURL('image/png');
      const d = new Date();
      const p2 = (v) => String(v).padStart(2, '0');
      const fileName = `2fRATE_${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}.png`;
      if (win && !win.closed) {
        const doc = win.document;
        doc.title = '2fRATE レート対象曲';
        doc.head.innerHTML = '<meta name="viewport" content="width=device-width, initial-scale=1">';
        doc.body.style.cssText = 'margin:0;padding:12px;background:#F6F4FC;color:#2B2350;font-family:sans-serif;text-align:center;';
        doc.body.textContent = '';
        const msg = doc.createElement('p');
        msg.style.cssText = 'margin:4px 0 10px;font-size:14px;';
        msg.textContent = 'スマホは画像を長押しして「写真に保存」、PCは下のボタンから保存できます。';
        const a = doc.createElement('a');
        a.href = url;
        a.download = fileName;
        a.textContent = '画像をダウンロード';
        a.style.cssText = 'display:inline-block;margin-bottom:12px;padding:8px 18px;border-radius:999px;background:#E0348C;color:#fff;font-weight:bold;text-decoration:none;';
        const img = doc.createElement('img');
        img.src = url;
        img.alt = '2fRATE レート対象曲';
        img.style.cssText = 'max-width:100%;height:auto;border-radius:12px;box-shadow:0 4px 20px rgba(43,35,80,.15);';
        doc.body.append(msg, a, doc.createElement('br'), img);
      } else {
        // 別タブが開けなかった場合は、その場でダウンロード
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    } catch (e) {
      console.error(e);
      if (win && !win.closed) win.document.body.textContent = '画像の作成に失敗しました：' + e.message;
    } finally {
      button.disabled = false;
      button.textContent = label;
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
      const officialCss = profile.trophyEl ? extractOfficialCss(profile.trophyEl) : '';
      if (officialCss) {
        // 公式の称号をそのまま複製し、取り出した公式CSSで表示する
        const style = el('style');
        style.textContent = officialCss;
        ui.body.getRootNode().appendChild(style);
        const clone = document.importNode(profile.trophyEl, true);
        [clone, ...clone.querySelectorAll('[id]')].forEach((e) => e.removeAttribute('id'));
        const holder = el('div', 'dxr-trophy-official');
        holder.appendChild(clone);
        text.appendChild(holder);
      } else {
        // 公式CSSが読めない場合は、色だけ合わせた簡易表示
        const trophy = el('div', `dxr-trophy${profile.trophyRank ? ' t-' + profile.trophyRank : ''}`, profile.trophy);
        trophy.title = profile.trophy;
        text.appendChild(trophy);
      }
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
    let selected = 0;
    const shareBtn = el('button', 'dxr-share', '');
    shareBtn.type = 'button';
    function select(i) {
      selected = i;
      lists.forEach((l, j) => { l.style.display = i === j ? '' : 'none'; });
      buttons.forEach((b, j) => b.setAttribute('aria-pressed', String(i === j)));
      shareBtn.textContent = `「${results[i].mode.label}」の上位${TOP_N}を画像にする`;
    }
    select(0);
    shareBtn.onclick = () => openShareImage(profile, results[selected], jackets, shareBtn);

    const hasEst = results.some(({ top }) => top.some((s) => s.estimated));
    const note = el('p', 'dxr-note',
      `${info}。` +
      (hasEst ? '定数の * は定数表にない譜面で、レベル表示からの概算値（下限）です。' : '') +
      '☆の小数は次の☆までの進み具合で、計算には整数部分のみ使います。' +
      '「☆6まで」は☆7を☆6として、「☆5まで」は☆6以上を☆5として計算しています。' +
      (jackets ? '' : 'ジャケット画像の対応表を読み込めなかったため、画像は表示していません。'));

    ui.body.append(player, plates, shareBtn, ...lists, note);
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
})();する）
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
    { id: 'cap6', label: '☆6まで', capStars: 6 },
    { id: 'cap5', label: '☆5まで', capStars: 5 },
  ];

  // 単曲レート値 = 定数 × 定数 × ☆（小数第一位まで）÷ RATE_DIVISOR
  const RATE_DIVISOR = 100;

  const TOP_N = 50;          // 平均を取る曲数
  const WAIT_MS = 1500;      // ページ取得の間隔（サーバー負荷対策）
  const LEVEL_MAX = 23;      // level=23 が Lv15
  const PLAYER_URL = '/maimai-mobile/home/';

  // ジャケット画像：「曲名 → 画像ファイル名」の対応表（collect_jackets.js で作成）を読み、
  // maimai DX NET 上の画像をそのまま表示する（画像そのものはコピーしない）
  const JACKETS_URL = 'https://n4f1316.github.io/dxscore-tools/maimai_jackets.json';
  const OVERRIDES_URL = 'https://n4f1316.github.io/dxscore-tools/jacket_overrides.json'; // 同名曲の手動対応表
  let jacketOverrides = {};
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
  const upperBound = (n, capStars) => (levelInfo(n).max ** 2 * capStars) / RATE_DIVISOR;

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
  // 計算に使う☆（0.1刻み。例：6.4）を「10倍した整数」で返す（小数の誤差を避けるため）
  //   ☆1未満（取得率85%未満）は 0 とする
  function starTenths(cur, max) {
    const s = starsOf(cur, max);
    if (s === 0) return 0;
    const lo = STAR_THRESHOLDS.find((t) => t.stars === s).pct;
    const hi = STAR_THRESHOLDS.find((t) => t.stars === s + 1)?.pct;
    if (hi === undefined) return s * 10; // 最高の☆
    return s * 10 + Math.floor(((cur * 100 - max * lo) * 10) / (max * (hi - lo)));
  }

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
    // ☆は小数第一位まで反映（6.4なら6.4で計算）。レートの種類ごとの上限（☆5まで等）で切り詰める
    const tenths = starTenths(s.cur, s.max);
    for (const m of RATE_MODES) {
      values[m.id] = (c * c * Math.min(tenths, m.capStars * 10)) / 10 / RATE_DIVISOR;
    }
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
    .dxr-trophy-official { max-width: 100%; margin-bottom: 4px; }
    .dxr-trophy-official > * { max-width: 100%; margin-left: 0 !important; }
    .dxr-player { font-size: 22px; font-weight: 800; letter-spacing: .02em; line-height: 1.3; word-break: break-all; }

    /* レート表示：押すと表が切り替わる */
    .dxr-plates { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-bottom: 18px; }
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
      display: grid; grid-template-columns: 30px 44px 1fr 66px 72px 72px; align-items: center; gap: 10px;
      padding: 9px 14px; border-top: 1px solid var(--line);
    }
    .dxr-row:nth-child(even) { background: #FBFAFE; }
    .dxr-head { border-top: 0; background: var(--ink) !important; color: #fff; font-size: 11px; font-weight: 700; padding-top: 7px; padding-bottom: 7px; }
    .dxr-rank { font-weight: 800; color: var(--sub); text-align: center; font-variant-numeric: tabular-nums; }
    .dxr-name { font-weight: 700; line-height: 1.35; word-break: break-word; }
    .dxr-genre { font-size: 11px; font-weight: 700; color: var(--sub); margin-left: 2px; }
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
    .dxr-diffmax { text-align: right; font-variant-numeric: tabular-nums; }
    .dxr-val { text-align: right; font-variant-numeric: tabular-nums; }
    .dxr-head .dxr-val { text-align: center; }
    .dxr-star { text-align: center; font-variant-numeric: tabular-nums; }
    /* ☆の色分け（Discordアイコンと共通）：☆1・2 黄緑 / ☆3・4 オレンジ / ☆5・6 黄色 / ☆7 虹色 */
    .dxr-star-pill {
      display: inline-block; min-width: 3.6em; padding: 3px 7px; border-radius: 999px; text-align: center;
      font-size: 13px; font-weight: 800; line-height: 1.3; color: #2B2350; background: #EFECF9;
    }
    .dxr-star-pill.g12 { background: #B5E05A; }
    .dxr-star-pill.g34 { background: #FF8C2E; }
    .dxr-star-pill.g56 { background: #FFE066; }
    .dxr-star-pill.g7 { background: linear-gradient(90deg, #FF5E7E, #FFB347, #FFE66D, #7EE081, #5CC8FF, #A78BFA); }
    .dxr-star-pill.g0 { color: var(--sub); }
    .dxr-diffmax { font-size: 12px; color: var(--sub); }
    .dxr-diffmax.is-max { color: var(--gold); font-weight: 800; }
    .dxr-val { font-weight: 800; font-size: 15px; }
    .dxr-head .dxr-star, .dxr-head .dxr-diffmax, .dxr-head .dxr-val { color: #fff; font-size: 11px; }

    .dxr-jacket {
      width: 44px; height: 44px; border-radius: 8px; object-fit: cover; display: block;
      background: #EFECF9; box-shadow: 0 0 0 1px var(--line);
    }
    .dxr-share {
      display: block; width: 100%; margin: -6px 0 16px; padding: 10px 16px; border-radius: 999px;
      font: inherit; font-weight: 800; color: #fff; background: var(--pink); border: 0; cursor: pointer;
    }
    .dxr-share:disabled { opacity: .6; cursor: default; }
    .dxr-note { margin-top: 14px; font-size: 12px; color: var(--sub); line-height: 1.7; }

    /* スマホ幅：MAX差を曲名の下へ回す */
    @media (max-width: 520px) {
      .dxr-plates { gap: 6px; }
      .dxr-plate { padding: 10px 10px; border-radius: 14px; }
      .dxr-plate-value { font-size: 22px; }
      .dxr-plate-hint { display: none; }
      .dxr-icon { width: 56px; height: 56px; border-radius: 12px; }
      .dxr-player { font-size: 20px; }
      .dxr-star-pill { min-width: 0; padding: 3px 5px; font-size: 12px; }
      .dxr-row { grid-template-columns: 22px 40px 1fr 54px 60px; gap: 7px; padding: 9px 10px; }
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
    if (stars >= 7) return 'g7';
    if (stars >= 5) return 'g56';
    if (stars >= 3) return 'g34';
    if (stars >= 1) return 'g12';
    return 'g0';
  }


  // ジャケット対応表から曲を特定する
  //   通常の曲：値は画像ファイル名（文字列）
  //   同名の別曲：値は候補の配列 [{ img, genre, st: [BAS..ReMAS のレベル], dx: [...] }]
  //   → 種別・難易度・レベルが一致する候補が1つだけなら、その曲と判断する
  const DIFF_ORDER = ['BASIC', 'ADVANCED', 'EXPERT', 'MASTER', 'Re:MASTER'];
  function resolveSong(map, name, kind, diff, level, max) {
    const v = map?.get(name);
    if (!v) return null;
    if (typeof v === 'string') return { img: v, genre: null };
    if (!Array.isArray(v)) return null;
    // 手動の対応表（同名の別曲で、レベルまで同じ譜面用）：「曲名|種別|難易度|最大値」→ ジャンル
    const g = jacketOverrides?.[`${name}|${kind}|${diff}|${max}`];
    if (g) {
      const c = v.find((x) => x.genre === g);
      if (c) return { img: c.img, genre: c.genre };
    }
    const k = kind === 'ST' ? 'st' : 'dx';
    const i = DIFF_ORDER.indexOf(diff);
    const hits = v.filter((c) => c[k]?.[i] === level);
    return hits.length === 1 ? { img: hits[0].img, genre: hits[0].genre } : null;
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
      const song = resolveSong(jackets, s.name, s.kind, s.diff, s.level, s.max);
      const nameEl = el('div', 'dxr-name', s.name);
      // 同名の別曲は、判別できたときにジャンルを添える
      if (song?.genre) nameEl.appendChild(el('span', 'dxr-genre', `（${song.genre}）`));
      main.appendChild(nameEl);
      const meta = el('div', 'dxr-meta');
      meta.append(
        el('span', `dxr-chip dxr-kind-${s.kind === '?' ? 'unknown' : s.kind}`, s.kind),
        el('span', `dxr-chip dxr-diff-${s.diff.replace(':', '').toUpperCase()}`, s.diff),
        el('span', `dxr-chip dxr-const${s.estimated ? ' is-est' : ''}`, `${s.c.toFixed(1)}${s.estimated ? '*' : ''}`),
        el('span', `dxr-chip dxr-diffmax-inline${isMax ? ' is-max' : ''}`, diffText)
      );
      main.appendChild(meta);

      // ジャケット画像（見つからない・読み込めない場合は空の枠）
      let jacket;
      const file = song?.img;
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
        (() => {
          const cell = el('div', 'dxr-star');
          cell.appendChild(el('span', `dxr-star-pill ${starClass(s.stars)}`, `☆${starDisplay(s.cur, s.max)}`));
          return cell;
        })(),
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
      const map = new Map(Object.entries(await res.json()));
      jacketOverrides = await fetch(OVERRIDES_URL + '?' + Date.now())
        .then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
      return map;
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
    return { name, icon, trophy, trophyRank, trophyEl };
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


  // 公式サイトの称号の見た目を再現するため、今のページに読み込まれている公式CSSから、
  // 称号の要素に関係するルールだけを取り出す（画面全体には適用しないので崩れない）
  function extractOfficialCss(node) {
    const used = new Set();
    [node, ...node.querySelectorAll('*')].forEach((e) => e.classList.forEach((c) => used.add(c)));

    const relevant = (selector) =>
      selector.split(',').some((sel) => {
        const t = sel.trim();
        if (t.includes('trophy')) return true;
        // 「.p_3」「.t_c.f_13」のような、クラスだけで書かれたルールで、称号に使われているもの
        if (!/^(\.[\w-]+)+$/.test(t)) return false;
        return t.slice(1).split('.').every((c) => used.has(c));
      });

    const out = [];
    const walk = (rules, base) => {
      for (const r of rules) {
        if (r.cssRules && r.media) {
          const inner = [];
          const saved = out.length;
          walk(r.cssRules, base);
          inner.push(...out.splice(saved));
          if (inner.length) out.push(`@media ${r.media.mediaText}{${inner.join('')}}`);
        } else if (r.selectorText && relevant(r.selectorText)) {
          // 画像の相対パスは、CSSファイルの場所を基準に絶対URLへ直す
          out.push(r.cssText.replace(/url\((['"]?)([^'")]+)\1\)/g, (m, q, u) => {
            try { return `url("${new URL(u, base).href}")`; } catch { return m; }
          }));
        }
      }
    };
    for (const sheet of document.styleSheets) {
      try {
        walk(sheet.cssRules, sheet.href || location.href);
      } catch {
        // 読めないCSS（別サイトのもの）は飛ばす
      }
    }
    return out.join('\n');
  }

  // ============================================================
  //  レート対象曲の画像化（5列×10行）
  // ============================================================

  // 画像の注意書きに載せるツールのURL
  const TOOL_URL = 'https://github.com/n4f1316/dxscore-tools';

  const IMG = {
    cols: 5, rows: 10, pad: 32, gap: 12,
    cellW: 240, jacket: 224, cellH: 320, headH: 204, footH: 110,
    font: '"M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", "Hiragino Sans", "Yu Gothic", sans-serif',
    ink: '#2B2350', sub: '#6E6892', line: '#E4DFF3', bg: '#F6F4FC', pink: '#E0348C',
  };
  const DIFF_COLOR = { BASIC: '#2E9E5B', ADVANCED: '#D98E04', EXPERT: '#E0434B', MASTER: '#8E44D6', 'Re:MASTER': '#8E44D6' };
  const TROPHY_COLOR = {
    Normal: ['#F1F1F4', '#4A4A57'], Bronze: ['#F4E3D3', '#7A4A1E'], Silver: ['#ECEFF3', '#4B5563'],
    Gold: ['#FFF1C7', '#7A5600'], Rainbow: [null, '#2B2350'],
  };
  const RAINBOW = ['#FF5E7E', '#FFB347', '#FFE66D', '#7EE081', '#5CC8FF', '#A78BFA'];

  // 画像を読み込む（失敗や時間切れなら null）。maimai DX NET 上で実行しているので同じサイトの画像は描ける
  function loadImage(src, ms = 8000) {
    return new Promise((resolve) => {
      if (!src) return resolve(null);
      const img = new Image();
      const t = setTimeout(() => resolve(null), ms);
      img.onload = () => { clearTimeout(t); resolve(img); };
      img.onerror = () => { clearTimeout(t); resolve(null); };
      img.src = src;
    });
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function rainbow(ctx, x, w) {
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    RAINBOW.forEach((c, i) => g.addColorStop(i / (RAINBOW.length - 1), c));
    return g;
  }

  // 文字がはみ出すときは末尾を「…」にする
  function fitText(ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    let t = text;
    while (t.length && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
    return t + '…';
  }

  // 角丸のラベル（塗り＋文字）。幅を返す
  function pill(ctx, x, y, text, { bg, fg, h = 24, size = 13, padX = 9, border = null, align = 'left' }) {
    ctx.font = `800 ${size}px ${IMG.font}`;
    const w = Math.ceil(ctx.measureText(text).width) + padX * 2;
    const left = align === 'right' ? x - w : x;
    roundRect(ctx, left, y, w, h, h / 2 > 8 ? 8 : h / 2);
    ctx.fillStyle = typeof bg === 'function' ? bg(left, w) : bg;
    ctx.fill();
    if (border) { ctx.lineWidth = 2; ctx.strokeStyle = border; ctx.stroke(); }
    ctx.fillStyle = fg;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(text, left + padX, y + h / 2 + 1);
    return w;
  }

  function starPillColor(stars) {
    if (stars >= 7) return (x, w) => null;
    if (stars >= 5) return '#FFE066';
    if (stars >= 3) return '#FF8C2E';
    if (stars >= 1) return '#B5E05A';
    return '#EFECF9';
  }

  async function buildShareImage(profile, result, jackets) {
    const { cols, rows, pad, gap, cellW, jacket: J, cellH, headH, footH } = IMG;
    const W = pad * 2 + cols * cellW + (cols - 1) * gap;
    const H = pad * 2 + headH + rows * cellH + (rows - 1) * gap + footH;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // 丸ゴシックの読み込みを待つ（読めなければ端末のフォントで描く）
    try {
      await Promise.all([
        document.fonts.load(`800 20px "M PLUS Rounded 1c"`),
        document.fonts.load(`700 20px "M PLUS Rounded 1c"`),
      ]);
    } catch { /* そのまま */ }

    // 画像をまとめて読み込む
    const top = result.top.slice(0, cols * rows);
    const files = top.map((s) => resolveSong(jackets, s.name, s.kind, s.diff, s.level, s.max)?.img);
    const [iconImg, ...jacketImgs] = await Promise.all([
      loadImage(profile.icon),
      ...files.map((f) => loadImage(f ? JACKET_BASE + f : null)),
    ]);

    // 背景
    ctx.fillStyle = IMG.bg;
    ctx.fillRect(0, 0, W, H);

    // ---- 上部：アイコン・称号・名前・レート ----
    const hx = pad, hy = pad;
    roundRect(ctx, hx, hy, W - pad * 2, headH - 20, 22);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = IMG.line;
    ctx.stroke();

    const iconSize = 136;
    const ix = hx + 18, iy = hy + (headH - 20 - iconSize) / 2;
    ctx.save();
    roundRect(ctx, ix, iy, iconSize, iconSize, 18);
    ctx.clip();
    if (iconImg) ctx.drawImage(iconImg, ix, iy, iconSize, iconSize);
    else { ctx.fillStyle = '#EFECF9'; ctx.fillRect(ix, iy, iconSize, iconSize); }
    ctx.restore();

    const tx = ix + iconSize + 20;
    const rateW = 400;
    const textMax = W - pad * 2 - (tx - hx) - rateW - 20;
    if (profile.trophy) {
      ctx.font = `800 21px ${IMG.font}`;
      const [tbg, tfg] = TROPHY_COLOR[profile.trophyRank] ?? TROPHY_COLOR.Normal;
      pill(ctx, tx, iy + 8, fitText(ctx, profile.trophy, textMax - 36), {
        bg: tbg ?? ((x, w) => rainbow(ctx, x, w)), fg: tfg, h: 40, size: 21, padX: 18,
      });
    }
    ctx.font = `800 50px ${IMG.font}`;
    ctx.fillStyle = IMG.ink;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillText(fitText(ctx, profile.name || 'プレイヤー', textMax), tx, iy + 114);

    const rx = W - pad - 24;
    ctx.textAlign = 'right';
    ctx.fillStyle = IMG.sub;
    ctx.font = `800 23px ${IMG.font}`;
    ctx.fillText(`2fRATE（${result.mode.label}）`, rx, iy + 36);
    ctx.fillStyle = IMG.pink;
    ctx.font = `800 80px ${IMG.font}`;
    ctx.fillText(result.rating.toFixed(3), rx, iy + 120);

    // ---- 譜面の一覧（5列×10行） ----
    const gy = pad + headH;
    top.forEach((s, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const x = pad + col * (cellW + gap);
      const y = gy + row * (cellH + gap);

      roundRect(ctx, x, y, cellW, cellH, 16);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = IMG.line;
      ctx.stroke();

      // ジャケット
      const jx = x + 8, jy = y + 8;
      ctx.save();
      roundRect(ctx, jx, jy, J, J, 12);
      ctx.clip();
      if (jacketImgs[i]) ctx.drawImage(jacketImgs[i], jx, jy, J, J);
      else { ctx.fillStyle = '#EFECF9'; ctx.fillRect(jx, jy, J, J); }
      ctx.restore();

      // 順位（ジャケット左上）
      pill(ctx, jx + 6, jy + 6, `#${i + 1}`, { bg: 'rgba(43,35,80,.88)', fg: '#FFFFFF', h: 32, size: 18, padX: 11 });

      // ジャケット下部：DX/ST・難易度（左）、譜面定数（右）
      // 文字が絵柄に埋もれないよう、下側を暗くしてからラベルを置く
      ctx.save();
      roundRect(ctx, jx, jy, J, J, 12);
      ctx.clip();
      const shade = ctx.createLinearGradient(0, jy + J - 68, 0, jy + J);
      shade.addColorStop(0, 'rgba(20,16,40,0)');
      shade.addColorStop(1, 'rgba(20,16,40,.72)');
      ctx.fillStyle = shade;
      ctx.fillRect(jx, jy + J - 68, J, 68);
      ctx.restore();

      const r1 = jy + J - 36;
      let px = jx + 6;
      px += pill(ctx, px, r1, s.kind, {
        bg: s.kind === 'ST' ? '#3B82C4' : (lx, w) => {
          const g = ctx.createLinearGradient(lx, 0, lx + w, 0);
          g.addColorStop(0, '#E0348C'); g.addColorStop(1, '#F29A2E');
          return g;
        },
        fg: '#FFFFFF', h: 30, size: 15, padX: 8,
      }) + 4;
      const isRe = s.diff === 'Re:MASTER';
      pill(ctx, px, r1, s.diff, {
        bg: isRe ? '#FFFFFF' : DIFF_COLOR[s.diff] ?? '#999', fg: isRe ? '#8E44D6' : '#FFFFFF',
        border: isRe ? '#B68BE0' : null, h: 30, size: 15, padX: 8,
      });
      pill(ctx, jx + J - 6, r1, `${s.c.toFixed(1)}${s.estimated ? '*' : ''}`, {
        bg: 'rgba(255,255,255,.95)', fg: IMG.ink, h: 30, size: 18, padX: 9, align: 'right',
      });

      // 1段目：楽曲名（長い場合は末尾を「…」で省略）
      const r0 = jy + J + 8;
      ctx.font = `700 20px ${IMG.font}`;
      ctx.fillStyle = IMG.ink;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(fitText(ctx, s.name, J), jx, r0 + 14);

      // 2段目：☆（左）、単曲レート値（右）
      const r2 = r0 + 36;
      const sc = starPillColor(s.stars);
      pill(ctx, jx, r2, `☆${starDisplay(s.cur, s.max)}`, {
        bg: s.stars >= 7 ? (lx, w) => rainbow(ctx, lx, w) : sc, fg: IMG.ink, h: 34, size: 19, padX: 12,
      });
      ctx.font = `800 29px ${IMG.font}`;
      ctx.fillStyle = IMG.ink;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(s.values[result.mode.id].toFixed(3), jx + J, r2 + 18);
    });

    // ---- 下部：注意書き ----
    const d = new Date();
    const p2 = (v) => String(v).padStart(2, '0');
    const fy = H - pad - footH + 34;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = IMG.ink;
    ctx.font = `800 20px ${IMG.font}`;
    ctx.fillText(`Generated by 2fRATE（${TOOL_URL}）`, pad, fy);
    ctx.fillStyle = IMG.sub;
    ctx.font = `700 17px ${IMG.font}`;
    ctx.fillText('楽曲のジャケット画像の著作権は、各権利者に帰属します。', pad, fy + 32);
    ctx.fillText('2fRATE は非公式のファンメイドツールであり、株式会社セガおよび関連会社とは一切関係ありません。', pad, fy + 60);
    ctx.textAlign = 'right';
    ctx.fillText(`作成日時 ${d.getFullYear()}/${p2(d.getMonth() + 1)}/${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`,
      W - pad, fy);

    return canvas;
  }

  // 別タブに画像を表示する（スマホは長押しで保存、PCはダウンロードボタン）
  async function openShareImage(profile, result, jackets, button) {
    // ポップアップがブロックされないよう、押した瞬間に先にタブを開いておく
    const win = window.open('', '_blank');
    if (win) {
      win.document.title = '2fRATE 画像を作成中…';
      win.document.body.style.cssText = 'font-family:sans-serif;padding:20px;color:#2B2350;';
      win.document.body.textContent = '画像を作成しています…';
    }
    const label = button.textContent;
    button.disabled = true;
    button.textContent = '画像を作成中…';
    try {
      const canvas = await buildShareImage(profile, result, jackets);
      const url = canvas.toDataURL('image/png');
      const d = new Date();
      const p2 = (v) => String(v).padStart(2, '0');
      const fileName = `2fRATE_${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}.png`;
      if (win && !win.closed) {
        const doc = win.document;
        doc.title = '2fRATE レート対象曲';
        doc.head.innerHTML = '<meta name="viewport" content="width=device-width, initial-scale=1">';
        doc.body.style.cssText = 'margin:0;padding:12px;background:#F6F4FC;color:#2B2350;font-family:sans-serif;text-align:center;';
        doc.body.textContent = '';
        const msg = doc.createElement('p');
        msg.style.cssText = 'margin:4px 0 10px;font-size:14px;';
        msg.textContent = 'スマホは画像を長押しして「写真に保存」、PCは下のボタンから保存できます。';
        const a = doc.createElement('a');
        a.href = url;
        a.download = fileName;
        a.textContent = '画像をダウンロード';
        a.style.cssText = 'display:inline-block;margin-bottom:12px;padding:8px 18px;border-radius:999px;background:#E0348C;color:#fff;font-weight:bold;text-decoration:none;';
        const img = doc.createElement('img');
        img.src = url;
        img.alt = '2fRATE レート対象曲';
        img.style.cssText = 'max-width:100%;height:auto;border-radius:12px;box-shadow:0 4px 20px rgba(43,35,80,.15);';
        doc.body.append(msg, a, doc.createElement('br'), img);
      } else {
        // 別タブが開けなかった場合は、その場でダウンロード
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    } catch (e) {
      console.error(e);
      if (win && !win.closed) win.document.body.textContent = '画像の作成に失敗しました：' + e.message;
    } finally {
      button.disabled = false;
      button.textContent = label;
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
      const officialCss = profile.trophyEl ? extractOfficialCss(profile.trophyEl) : '';
      if (officialCss) {
        // 公式の称号をそのまま複製し、取り出した公式CSSで表示する
        const style = el('style');
        style.textContent = officialCss;
        ui.body.getRootNode().appendChild(style);
        const clone = document.importNode(profile.trophyEl, true);
        [clone, ...clone.querySelectorAll('[id]')].forEach((e) => e.removeAttribute('id'));
        const holder = el('div', 'dxr-trophy-official');
        holder.appendChild(clone);
        text.appendChild(holder);
      } else {
        // 公式CSSが読めない場合は、色だけ合わせた簡易表示
        const trophy = el('div', `dxr-trophy${profile.trophyRank ? ' t-' + profile.trophyRank : ''}`, profile.trophy);
        trophy.title = profile.trophy;
        text.appendChild(trophy);
      }
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
    let selected = 0;
    const shareBtn = el('button', 'dxr-share', '');
    shareBtn.type = 'button';
    function select(i) {
      selected = i;
      lists.forEach((l, j) => { l.style.display = i === j ? '' : 'none'; });
      buttons.forEach((b, j) => b.setAttribute('aria-pressed', String(i === j)));
      shareBtn.textContent = `「${results[i].mode.label}」の上位${TOP_N}を画像にする`;
    }
    select(0);
    shareBtn.onclick = () => openShareImage(profile, results[selected], jackets, shareBtn);

    const hasEst = results.some(({ top }) => top.some((s) => s.estimated));
    const note = el('p', 'dxr-note',
      `${info}。` +
      (hasEst ? '定数の * は定数表にない譜面で、レベル表示からの概算値（下限）です。' : '') +
      '☆の小数は次の☆までの進み具合で、計算には整数部分のみ使います。' +
      '「☆6まで」は☆7を☆6として、「☆5まで」は☆6以上を☆5として計算しています。' +
      (jackets ? '' : 'ジャケット画像の対応表を読み込めなかったため、画像は表示していません。'));

    ui.body.append(player, plates, shareBtn, ...lists, note);
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
