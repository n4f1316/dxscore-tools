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
    { id: 'cap6', label: '☆6まで', capStars: 6 },
    { id: 'cap5', label: '☆5まで', capStars: 5 },
  ];

  // ランク（今は「☆7まで」のレートだけに適用）。min 以上でそのランク。上から順に判定する
  //   LEGEND は 12.000 以上、それより下は 0.500 刻み（RAINBOW PLUS 11.500、RAINBOW 11.000 …、WAKABA は 7.000 未満）
  //   colors: 文字色のグラデーション（1色なら単色）。glow: 文字のまわりの光（PLUS のランクと LEGEND）
  const RANK_MODES = ['full'];
  const RANKS = [
    { name: 'LEGEND',       min: 12, colors: ['#6A1BD8', '#D6246E', '#F2A007'], glow: 'rgba(242,160,7,.55)' },
    { name: 'RAINBOW PLUS', min: 11.5, colors: ['#FF3B6B', '#FF8A00', '#E8B400', '#1FB88E', '#2F7BFF', '#8A3FFC'], glow: 'rgba(255,196,0,.6)' },
    { name: 'RAINBOW',      min: 11, colors: ['#FF3B6B', '#FF8A00', '#E8B400', '#1FB88E', '#2F7BFF', '#8A3FFC'] },
    { name: 'PLATINUM PLUS', min: 10.5, colors: ['#4F8AA6', '#8FBED4', '#4F8AA6'], glow: 'rgba(120,190,225,.65)' },
    { name: 'PLATINUM',      min: 10,   colors: ['#4F8AA6', '#8FBED4', '#4F8AA6'] },
    { name: 'GOLD PLUS',     min: 9.5, colors: ['#B8860B', '#E0B32E', '#B8860B'], glow: 'rgba(240,190,40,.6)' },
    { name: 'GOLD',          min: 9,   colors: ['#B8860B', '#E0B32E', '#B8860B'] },
    { name: 'SILVER PLUS',   min: 8.5, colors: ['#6F7C8B', '#A7B2BE', '#6F7C8B'], glow: 'rgba(150,165,185,.7)' },
    { name: 'SILVER',        min: 8,   colors: ['#6F7C8B', '#A7B2BE', '#6F7C8B'] },
    { name: 'BRONZE PLUS',   min: 7.5, colors: ['#8E4E22', '#C07A45', '#8E4E22'], glow: 'rgba(205,125,65,.55)' },
    { name: 'BRONZE',        min: 7,   colors: ['#8E4E22', '#C07A45', '#8E4E22'] },
    { name: 'WAKABA',       min: -Infinity, colors: ['#3E9B3A', '#7CBF3F'] },
  ];
  // 表示している値（小数第3位で四捨五入）でランクを決める（表示と判定をそろえるため）
  const rankOf = (rating) => {
    const v = Math.round(rating * 1000) / 1000;
    return RANKS.find((r) => v >= r.min);
  };
  const rankCss = (rank) =>
    `background-image: linear-gradient(90deg, ${rank.colors.join(', ')});` +
    (rank.glow ? ` filter: drop-shadow(0 0 3px ${rank.glow});` : '');

  // ランクのアイコン（SVG）。デフォルメ調：太めの角丸の線、ベタ塗り（ツヤなし）
  function rankIconSvg(rankName) {
    const plus = rankName.endsWith(' PLUS');
    const base = rankName.replace(' PLUS', '');
    // ✧ の形（4方向にとがった星。辺は内側にくぼませる）
    const sparkle = (cx, cy, r) => {
      const q = r * 0.18;
      return `M${cx} ${cy - r} Q${cx + q} ${cy - q} ${cx + r} ${cy} Q${cx + q} ${cy + q} ${cx} ${cy + r}` +
        ` Q${cx - q} ${cy + q} ${cx - r} ${cy} Q${cx - q} ${cy - q} ${cx} ${cy - r} Z`;
    };
    const MEDAL = {            // [中央の✧, 本体, 縁取り]
      BRONZE:   ['#F6D2B3', '#C9844F', '#8E4E22'],
      SILVER:   ['#FFFFFF', '#BAC4CF', '#6F7C8B'],
      GOLD:     ['#FFF2A8', '#F2C531', '#B07D0A'],
      PLATINUM: ['#F4FCFF', '#A6D6EC', '#4F8AA6'],
    };
    let body = '';
    let edge = '#2B2350'; // 「+」の縁取りの色（ランクの色）
    if (base === 'WAKABA') {
      // 初心者マーク（若葉マーク）
      body = `
        <path d="M14 10 L32 22 L32 57 L14 42 Z" fill="#FFD43B" stroke="#D99A00" stroke-width="4" stroke-linejoin="round"/>
        <path d="M50 10 L32 22 L32 57 L50 42 Z" fill="#4CBB4F" stroke="#2E8B3A" stroke-width="4" stroke-linejoin="round"/>`;
      edge = '#2E8B3A';
    } else if (MEDAL[base]) {
      // 丸いメダル（色違い）。中央に ✧
      const [light, mid, dark] = MEDAL[base];
      body = `
        <circle cx="32" cy="34" r="24" fill="${mid}" stroke="${dark}" stroke-width="4"/>
        <path d="${sparkle(32, 34, 13)}" fill="${light}" stroke="${dark}" stroke-width="2.5" stroke-linejoin="round"/>`;
      edge = dark;
    } else if (base === 'RAINBOW') {
      // 虹（四分円の形。6色の帯をすき間なく重ね、端はまっすぐ切る）
      const bands = ['#F0384A', '#FF7A1A', '#FFC93C', '#2CC24A', '#1F6BFF', '#7D55B8'];
      const cx = 51, cy = 51, R = 38, w = (R - 8) / bands.length; // 外側の半径38、内側の穴の半径8（全体が中央に来る位置）
      body = bands.map((c, i) => {
        const r = R - w / 2 - i * w;
        return `<path d="M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx} ${cy - r}" fill="none" stroke="${c}" stroke-width="${(w + 0.4).toFixed(2)}" stroke-linecap="butt"/>`;
      }).join('');
      // 外側の縁取り（虹全体の輪郭）
      const ri = R - w * bands.length; // 内側の穴の半径
      const line = '#4A3B7A';
      body += `<path d="M${cx - R} ${cy} A${R} ${R} 0 0 1 ${cx} ${cy - R} L${cx} ${cy - ri} A${ri} ${ri} 0 0 0 ${cx - ri} ${cy} Z"` +
        ` fill="none" stroke="${line}" stroke-width="3.5" stroke-linejoin="round"/>`;
      edge = line;
    } else if (base === 'LEGEND') {
      // 王冠
      body = `
        <path d="M10 25 L21 37 L32 18 L43 37 L54 25 L50 50 L14 50 Z" fill="#F2C531" stroke="#B07D0A" stroke-width="4" stroke-linejoin="round"/>
        <rect x="13" y="45" width="38" height="9" rx="4.5" fill="#F2C531" stroke="#B07D0A" stroke-width="4"/>
        <circle cx="10" cy="22" r="4.5" fill="#F2C531" stroke="#B07D0A" stroke-width="3"/>
        <circle cx="32" cy="14" r="4.5" fill="#F2C531" stroke="#B07D0A" stroke-width="3"/>
        <circle cx="54" cy="22" r="4.5" fill="#F2C531" stroke="#B07D0A" stroke-width="3"/>
        <circle cx="32" cy="36" r="4.2" fill="#E0348C" stroke="#9C1D5E" stroke-width="2"/>`;
      edge = '#B07D0A';
    }
    // PLUS は右上に「+」（白い + をランクの色で縁取り）
    const badge = plus ? `
        <path d="M50 6 V20 M43 13 H57" stroke="${edge}" stroke-width="10" stroke-linecap="round"/>
        <path d="M50 6 V20 M43 13 H57" stroke="#FFFFFF" stroke-width="4.5" stroke-linecap="round"/>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">${body}${badge}</svg>`;
  }





  // 単曲レート値 =（定数 × 定数 × ☆の整数部分 ＋ 定数 × 定数 × ☆の小数部分 × 0.5）÷ RATE_DIVISOR
  //   ☆は小数第一位まで。最大は 15.0 × 15.0 × 7 ÷ 100 = 15.75
  const RATE_DIVISOR = 100;
  const FRACTION_WEIGHT = 0.5; // ☆の小数部分にかける係数
  const MAX_BONUS = 0.1;       // ☆7（理論値）の譜面だけに加える値

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

  // ランキング（Google Apps Script の受け取り口と、ランキングのページ）
  const RANKING_API = 'https://script.google.com/macros/s/AKfycbwqrv0xH7D4dhWA9M-76pGmjyT3I3SADQ-yAguIQXHJgCyBm5aGGjI33HWiUcYAVYpb/exec';
  const RANKING_PAGE = 'https://n4f1316.github.io/dxscore-tools/ranking.html';
  const FORMULA_VERSION = 'v1'; // 計算式の版（計算式を変えたら上げる）
  const USER_KEY = 'dxr-ranking-user'; // このブラウザで最後に使ったユーザー名（PINは保存しない）

  // おすすめ楽曲：ランキング集計のデータ（譜面ごとの取りやすさ）の置き場所
  const RANKING_STATS_DIR = 'https://n4f1316.github.io/dxscore-tools/ranking/';
  const SHOW_RECOMMEND = true; // おすすめ楽曲のボタンを出すか（検証中の機能。β版・正式版では false）
  const RECOMMEND_COUNT = 30; // 表示するおすすめ楽曲の数
  const RECOMMEND_MAX_FROM = 11.5; // ☆7まで のレートがこれ以上の人にだけ、理論値（☆7）を目標にした譜面もおすすめする
  const RECOMMEND_LOW_BELOW = 10.0; // ☆7まで のレートがこれ未満の人は「初中級向け」のおすすめにする
  const RECOMMEND_LOW_DIFFS = ['MASTER', 'Re:MASTER']; // 初中級向けで対象にする難易度
  const RECOMMEND_LOW_RANGE = 1.0;  // 初中級向け：☆5を目指す譜面は「レート対象曲の定数の中央値 ＋ この値」まで

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
  const upperBound = (n, capStars) =>
    (levelInfo(n).max ** 2 * capStars) / RATE_DIVISOR + (capStars >= 7 ? MAX_BONUS : 0);

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
      const t = Math.min(tenths, m.capStars * 10); // ☆×10 の整数（6.4 → 64）
      const whole = Math.floor(t / 10);             // ☆の整数部分（6）
      const frac = (t % 10) / 10;                   // ☆の小数部分（0.4）
      values[m.id] = (c * c * whole + c * c * frac * FRACTION_WEIGHT) / RATE_DIVISOR
        + (t >= 70 ? MAX_BONUS : 0); // ☆7として計算される譜面だけ +0.1
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
    /* ランクの色（グラデーションの文字）。選択中のピンクより優先する */
    .dxr-plate-value.dxr-ranked, .dxr-plate[aria-pressed="true"] .dxr-plate-value.dxr-ranked {
      color: transparent; -webkit-background-clip: text; background-clip: text; display: inline-block;
    }
    .dxr-plate-rate { display: flex; align-items: center; gap: 6px; }
    .dxr-rank-icon { display: inline-flex; flex: none; width: 38px; height: 38px; }
    .dxr-rank-icon svg { width: 100%; height: 100%; }
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
    .dxr-share-opt {
      display: flex; align-items: center; justify-content: center; gap: 6px;
      margin: -8px 0 16px; font-size: 13px; font-weight: 700; color: var(--sub); cursor: pointer;
    }
    .dxr-share-opt input { width: 16px; height: 16px; accent-color: var(--pink); }
    .dxr-rank-open {
      display: block; width: 100%; margin: -6px 0 16px; padding: 9px 16px; border-radius: 999px;
      font: inherit; font-weight: 800; color: var(--ink); background: var(--card); border: 2px solid var(--pink); cursor: pointer;
    }
    /* おすすめ楽曲 */
    .dxr-rec { margin: -6px 0 18px; }
    .dxr-rec-head { margin: 0 2px 8px; }
    .dxr-rec-title { font-weight: 800; font-size: 16px; }
    .dxr-rec-desc { font-size: 12px; color: var(--sub); }
    .dxr-rec-row { display: grid; grid-template-columns: 30px 44px 1fr auto; gap: 10px; align-items: center;
      padding: 9px 14px; border-top: 1px solid var(--line); }
    .dxr-rec-row:first-child { border-top: 0; }
    .dxr-rec-row:nth-child(even) { background: #FBFAFE; }
    .dxr-rec-goal { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin-top: 4px; }
    .dxr-rec-goal .dxr-star-pill { min-width: 0; }
    .dxr-rec-arrow { color: var(--sub); font-weight: 800; }
    .dxr-rec-rest { font-size: 12px; font-weight: 700; color: var(--ink); margin-left: 4px; }
    .dxr-rec-ease { font-size: 11px; color: var(--sub); margin-top: 2px; }
    .dxr-rec-gain { text-align: right; }
    .dxr-rec-plus { font-weight: 800; font-size: 17px; color: var(--pink); font-variant-numeric: tabular-nums; }
    .dxr-rec-sub { font-size: 11px; color: var(--sub); font-variant-numeric: tabular-nums; }
    .dxr-rec-empty { padding: 20px; text-align: center; color: var(--sub); }
    @media (max-width: 520px) {
      .dxr-rec-row { grid-template-columns: 22px 40px 1fr auto; gap: 7px; padding: 9px 10px; }
      .dxr-rec-plus { font-size: 15px; }
    }
    /* ランキング登録の画面 */
    .dxr-modal { position: fixed; inset: 0; background: rgba(43,35,80,.45); display: flex; align-items: flex-start;
      font: 14px/1.6 "M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", "Hiragino Sans", "Yu Gothic", sans-serif; color: var(--ink);
      justify-content: center; padding: 24px 12px; overflow: auto; z-index: 2; }
    .dxr-dialog { width: min(100%, 460px); background: var(--card); border-radius: 20px; padding: 18px; }
    .dxr-dialog h3 { margin: 0 0 4px; font-size: 18px; }
    .dxr-dialog p { margin: 4px 0 12px; font-size: 12px; color: var(--sub); }
    .dxr-field { display: block; margin: 10px 0; font-weight: 700; font-size: 13px; }
    .dxr-field input[type="text"], .dxr-field input[type="password"] {
      display: block; width: 100%; margin-top: 4px; font: inherit; font-size: 16px; padding: 8px 12px;
      border-radius: 10px; border: 1.5px solid var(--line); color: var(--ink); background: #fff;
    }
    .dxr-field small { display: block; font-weight: 500; color: var(--sub); font-size: 11px; margin-top: 2px; }
    .dxr-check { display: flex; align-items: center; gap: 8px; margin: 8px 0; font-weight: 700; font-size: 13px; }
    .dxr-check input { width: 18px; height: 18px; accent-color: var(--pink); }
    .dxr-check.off { opacity: .45; }
    .dxr-preview { display: flex; align-items: center; gap: 12px; padding: 12px; margin: 12px 0; background: var(--bg); border-radius: 14px; }
    .dxr-preview img, .dxr-preview .ph { width: 52px; height: 52px; border-radius: 10px; object-fit: cover; background: #EFECF9; flex: none; }
    .dxr-preview .nm { font-weight: 800; font-size: 16px; word-break: break-all; }
    .dxr-preview .rt { font-size: 12px; color: var(--sub); }
    .dxr-err { color: #E0434B; font-weight: 700; font-size: 13px; min-height: 1.4em; }
    .dxr-ok { color: #2E8B3A; font-weight: 700; font-size: 14px; }
    .dxr-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; flex-wrap: wrap; }
    .dxr-actions button { font: inherit; font-weight: 800; padding: 8px 16px; border-radius: 999px; cursor: pointer;
      border: 1.5px solid var(--line); background: #fff; color: var(--ink); }
    .dxr-actions button.primary { background: var(--pink); border-color: var(--pink); color: #fff; }
    .dxr-actions button:disabled { opacity: .5; cursor: default; }
    .dxr-actions a { font-weight: 800; color: var(--pink); align-self: center; }
    .dxr-note { margin-top: 14px; font-size: 12px; color: var(--sub); line-height: 1.7; }

    /* スマホ幅：MAX差を曲名の下へ回す */
    @media (max-width: 520px) {
      .dxr-plates { gap: 6px; }
      .dxr-plate { padding: 10px 10px; border-radius: 14px; }
      .dxr-plate-value { font-size: 22px; }
      .dxr-rank-icon { width: 24px; height: 24px; }
      .dxr-plate-rate { gap: 3px; }
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

  // ログインの確認を兼ねてプレイヤー情報を取得する
  //   今のページにプレイヤー情報があればそれを使い、なければホーム画面を取得する。
  //   ログインしていないと、ホーム画面の代わりにログイン画面やエラー画面に転送される。
  async function getPlayerProfile() {
    const here = readProfile(document);
    if (here.name) return here;
    const res = await fetch(PLAYER_URL, { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`maimai DX NET に接続できませんでした（HTTP ${res.status}）。`);
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const got = readProfile(doc);
    if ((res.redirected && !res.url.includes('/home')) || !got.name) {
      throw new Error('maimai DX NET にログインしていないようです。ログインしてから、もう一度実行してください。');
    }
    return got;
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

  // options.hideProfile が true なら、プレイヤー名と称号を載せない（アイコンとレートは載せる）
  const rankIconUrl = (name) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(rankIconSvg(name));

  async function buildShareImage(profile, result, jackets, options = {}) {
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
    const ranked = RANK_MODES.includes(result.mode.id);
    const rankImg = ranked ? await loadImage(rankIconUrl(rankOf(result.rating).name)) : null;
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
    if (options.hideProfile) {
      // 名前と称号の代わりに、何の画像かがわかる見出しを入れる
      ctx.font = `800 40px ${IMG.font}`;
      ctx.fillStyle = IMG.ink;
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
      ctx.fillText(fitText(ctx, 'レート対象曲', textMax), tx, iy + 84);
    } else {
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
    }

    const rx = W - pad - 24;
    ctx.textAlign = 'right';
    ctx.fillStyle = IMG.sub;
    ctx.font = `800 23px ${IMG.font}`;
    ctx.fillText(`2fRATE（${result.mode.label}）`, rx, iy + 36);
    ctx.font = `800 80px ${IMG.font}`;
    const rateText = result.rating.toFixed(3);
    if (RANK_MODES.includes(result.mode.id)) {
      // ランクの色で描く（グラデーション・光）
      const rank = rankOf(result.rating);
      const tw = ctx.measureText(rateText).width;
      const g = ctx.createLinearGradient(rx - tw, 0, rx, 0);
      rank.colors.forEach((c, i) => g.addColorStop(rank.colors.length > 1 ? i / (rank.colors.length - 1) : 0, c));
      ctx.save();
      if (rank.glow) { ctx.shadowColor = rank.glow; ctx.shadowBlur = 14; }
      ctx.fillStyle = g;
      ctx.fillText(rateText, rx, iy + 120);
      ctx.restore();
      // ランクのアイコン（レート値の左）
      if (rankImg) {
        const size = 78;
        ctx.drawImage(rankImg, rx - tw - 12 - size, iy + 120 - 66, size, size);
      }
    } else {
      ctx.fillStyle = IMG.pink;
      ctx.fillText(rateText, rx, iy + 120);
    }

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
  async function openShareImage(profile, result, jackets, button, options = {}) {
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
      const canvas = await buildShareImage(profile, result, jackets, options);
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

  // ============================================================
  //  ランキング登録
  // ============================================================

  // ランキングのサーバーに送る。混み合っている（busy）・応答が読めない場合は、数秒おいて1回だけ自動で送り直す
  //   onRetry：送り直すときに呼ぶ（画面に「送り直しています…」を出すため）
  async function callRanking(body, onRetry) {
    const send = async () => {
      // text/plain で送ると、ブラウザの事前確認（CORS のプリフライト）なしで送れる
      const res = await fetch(RANKING_API, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body),
      });
      if (!res.ok) return { ok: false, busy: true, error: `HTTP ${res.status}` };
      try {
        return await res.json();
      } catch {
        // サーバー側のエラーで JSON 以外が返ってきた（混雑時など）
        return { ok: false, busy: true, error: 'サーバーの応答を読み取れませんでした。' };
      }
    };
    let r = await send();
    if (!r.ok && r.busy) {
      if (onRetry) onRetry();
      await sleep(4000);
      r = await send();
      if (!r.ok && r.busy) r.error = '混み合っています。少し時間をおいて、もう一度お試しください。';
    }
    return r;
  }

  function openRankingDialog(root, profile, results) {
    const full = results.find((r) => r.mode.id === 'full');
    const cap6 = results.find((r) => r.mode.id === 'cap6');
    const cap5 = results.find((r) => r.mode.id === 'cap5');
    const round3 = (v) => Math.round(v * 1000) / 1000;
    const iconFile = (String(profile.icon || '').match(/\/Icon\/([0-9a-f]{16}\.png)/) || [])[1] || '';
    const constVersion = (CONST_URL.match(/maimai_consts_([^/]+)\.json/) || [])[1] || '';
    const rankName = rankOf(full.rating).name;

    const modal = el('div', 'dxr-modal');
    const dlg = el('div', 'dxr-dialog');
    dlg.setAttribute('role', 'dialog');
    dlg.setAttribute('aria-modal', 'true');
    modal.appendChild(dlg);
    root.appendChild(modal);
    const close = () => modal.remove();
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

    let savedUser = '';
    try { savedUser = localStorage.getItem(USER_KEY) || ''; } catch { /* なし */ }

    // ---- 入力画面 ----
    function inputView(prev = {}) {
      dlg.replaceChildren();
      dlg.append(el('h3', '', 'ランキングに登録'),
        el('p', '', '初めての人は、ユーザー名とPINを決めて登録します。2回目以降は同じユーザー名とPINで記録が更新されます。'));

      const field = (label, type, value, note, attrs = {}) => {
        const lab = el('label', 'dxr-field', label);
        const input = el('input');
        input.type = type;
        input.value = value;
        Object.entries(attrs).forEach(([k, v]) => input.setAttribute(k, v));
        lab.appendChild(input);
        if (note) lab.appendChild(el('small', '', note));
        dlg.appendChild(lab);
        return input;
      };
      const user = field('ユーザー名', 'text', prev.username ?? savedUser,
        '英数字とアンダーバーで3〜16文字（公開されません）', { autocomplete: 'username', autocapitalize: 'off', spellcheck: 'false' });
      const pin = field('PIN', 'password', prev.pin ?? '',
        '数字4〜8桁（公開されません。忘れると更新できなくなります）', { inputmode: 'numeric', autocomplete: 'current-password' });
      const name = field('表示名', 'text', prev.displayName ?? (profile.name || ''),
        'ランキングに表示する名前（20文字まで）', { maxlength: '20' });

      const check = (label, checked) => {
        const lab = el('label', 'dxr-check');
        const cb = el('input');
        cb.type = 'checkbox';
        cb.checked = checked;
        lab.append(cb, document.createTextNode(label));
        dlg.appendChild(lab);
        return { lab, cb };
      };
      const anon = check('匿名で掲載する（表示名の代わりに「匿名#記号」で表示）', prev.anonymous ?? false);
      const pub = check('ベスト枠（☆7までのレート対象曲50譜面）をランキングで公開する', prev.publicTop50 ?? false);
      const sync = () => { name.disabled = anon.cb.checked; };
      anon.cb.onchange = sync;
      sync();

      const err = el('div', 'dxr-err');
      const actions = el('div', 'dxr-actions');
      const cancel = el('button', '', 'やめる');
      const next = el('button', 'primary', '内容を確認');
      cancel.type = next.type = 'button';
      cancel.onclick = close;
      actions.append(cancel, next);
      dlg.append(err, actions);

      next.onclick = async () => {
        const form = {
          username: user.value.trim().toLowerCase(),
          pin: pin.value.trim(),
          displayName: name.value.trim(),
          anonymous: anon.cb.checked,
          showIcon: !!iconFile, // アイコンは匿名かどうかに関わらず必ず表示する
          publicTop50: pub.cb.checked,
        };
        if (!/^[a-z0-9_]{3,16}$/.test(form.username)) { err.textContent = 'ユーザー名は英数字とアンダーバーで3〜16文字にしてください。'; return; }
        if (!/^\d{4,8}$/.test(form.pin)) { err.textContent = 'PINは数字4〜8桁にしてください。'; return; }
        if (!form.anonymous && !form.displayName) { err.textContent = '表示名を入力するか、匿名で掲載を選んでください。'; return; }
        next.disabled = true;
        err.textContent = '確認中…';
        try {
          const r = await callRanking({ action: 'check', username: form.username, pin: form.pin },
            () => { err.textContent = '混み合っているため、送り直しています…'; });
          if (!r.ok) { err.textContent = r.error || '確認できませんでした。'; next.disabled = false; return; }
          confirmView(form, r);
        } catch (e) {
          err.textContent = '通信に失敗しました。時間をおいてもう一度お試しください。';
          next.disabled = false;
        }
      };
    }

    // ---- 確認画面 ----
    function confirmView(form, check) {
      dlg.replaceChildren();
      dlg.append(el('h3', '', check.exists ? '記録を更新します' : '新しく登録します'),
        el('p', '', form.publicTop50
          ? 'ランキングには次の内容と、ベスト枠（☆7までのレート対象曲50譜面）が公開されます（アイコンは匿名でも表示されます）。ユーザー名とPINは公開されません。'
          : 'ランキングには次の内容が公開されます（アイコンは匿名でも表示されます）。ベスト枠は管理者の確認用に送信されますが、公開はされません。ユーザー名とPINは公開されません。'));

      const pv = el('div', 'dxr-preview');
      if (form.showIcon && profile.icon) {
        const img = el('img');
        img.src = profile.icon;
        img.alt = '';
        pv.appendChild(img);
      } else {
        pv.appendChild(el('div', 'ph'));
      }
      const tx = el('div');
      tx.append(
        el('div', 'nm', form.anonymous ? `匿名#${check.anonCode}` : form.displayName),
        el('div', 'rt', `☆7まで ${full.rating.toFixed(3)}（${rankName}）／☆6まで ${cap6.rating.toFixed(3)}／☆5まで ${cap5.rating.toFixed(3)}`)
      );
      pv.appendChild(tx);
      dlg.appendChild(pv);
      if (form.anonymous) dlg.appendChild(el('p', '', `あなたの匿名表記は「匿名#${check.anonCode}」です。ランキングで自分の記録を探すときの目印になります。`));

      const err = el('div', 'dxr-err');
      const actions = el('div', 'dxr-actions');
      const back = el('button', '', '戻る');
      const send = el('button', 'primary', check.exists ? '更新する' : '登録する');
      back.type = send.type = 'button';
      back.onclick = () => inputView(form);
      actions.append(back, send);
      dlg.append(err, actions);

      send.onclick = async () => {
        send.disabled = true;
        back.disabled = true;
        err.textContent = '送信中…';
        try {
          const r = await callRanking({
            action: 'submit',
            username: form.username,
            pin: form.pin,
            displayName: form.displayName,
            anonymous: form.anonymous,
            showIcon: form.showIcon,
            publicTop50: form.publicTop50,
            icon: form.showIcon ? iconFile : '',
            rateFull: round3(full.rating),
            rateCap6: round3(cap6.rating),
            rateCap5: round3(cap5.rating),
            rank: rankName,
            constVersion,
            formulaVersion: FORMULA_VERSION,
            // ☆7までのレート対象曲（上位50譜面）
            top50: full.top.map((t) => ({
              name: t.name,
              kind: t.kind,
              diff: t.diff,
              level: t.level,
              const: t.c,
              estimated: !!t.estimated,
              score: t.cur,
              max: t.max,
              star: Math.round(starTenths(t.cur, t.max)) / 10,
              value: round3(t.values.full),
            })),
          }, () => { err.textContent = '混み合っているため、送り直しています…'; });
          if (!r.ok) {
            err.textContent = r.error || '登録できませんでした。';
            send.disabled = false;
            back.disabled = false;
            return;
          }
          try { localStorage.setItem(USER_KEY, form.username); } catch { /* 無視 */ }
          doneView(r, form);
        } catch (e) {
          err.textContent = '通信に失敗しました。時間をおいてもう一度お試しください。';
          send.disabled = false;
          back.disabled = false;
        }
      };
    }

    // ---- 完了画面 ----
    function doneView(r, form) {
      dlg.replaceChildren();
      dlg.append(el('h3', '', r.created ? '登録しました' : '更新しました'),
        el('div', 'dxr-ok', form.anonymous ? `「匿名#${r.anonCode}」としてランキングに掲載されます。` : `「${form.displayName}」としてランキングに掲載されます。`),
        el('p', '', 'ランキングへの反映には少し時間がかかることがあります。'));
      const actions = el('div', 'dxr-actions');
      const link = el('a', '', 'ランキングを見る ›');
      link.href = RANKING_PAGE;
      link.target = '_blank';
      link.rel = 'noopener';
      const ok = el('button', 'primary', '閉じる');
      ok.type = 'button';
      ok.onclick = close;
      actions.append(link, ok);
      dlg.appendChild(actions);
    }

    inputView();
  }

  // ============================================================
  //  おすすめ楽曲（☆7まで）
  //   目標：☆6未満の譜面は ☆6.0。☆6台の譜面の ☆7（理論値）は、レートが RECOMMEND_MAX_FROM 以上の人にだけ出す
  //   初中級向け（レートが RECOMMEND_LOW_BELOW 未満）：MASTER 以上の譜面だけを対象にし、
  //     レート対象曲の定数の中央値以下の譜面（低難度）は ☆6.0、
  //     それより上の譜面（そこそこの難易度。中央値＋RECOMMEND_LOW_RANGE まで）は ☆5.0 を目標にする
  //   並び順：取りやすさ（上位100人のうち目標の☆に届いている人の割合）の高い順
  //           → 同じなら定数の低い順 → 伸びしろ（レートの上がり幅）の大きい順
  //   目標を達成してもレートが上がらない譜面は出さない
  // ============================================================

  async function loadRankingStats(fromLevel, toLevel) {
    const map = new Map(); // 「曲名|種別|難易度|最大値」→ 集計結果
    const files = [];
    for (let n = fromLevel; n >= toLevel; n--) files.push(`lv${levelInfo(n).label.replace('+', 'p')}.json`);
    const lists = await Promise.all(files.map((f) =>
      fetch(RANKING_STATS_DIR + f + '?' + Date.now()).then((r) => (r.ok ? r.json() : [])).catch(() => [])));
    lists.flat().forEach((r) => {
      if (r && r.name && r.max) map.set(`${r.name}|${r.kind}|${r.diff}|${r.max}`, r);
    });
    return map;
  }

  // 上位100人のうち、目標の☆に届いている人の割合（0〜1）。わからなければ null
  function easeOf(st, targetTenths) {
    if (!st || !st.max || !st.count) return null;
    const need = (pct) => Math.ceil((st.max * pct) / 100);
    const full = st.count >= 100;
    if (targetTenths >= 70) return Math.min(1, (st.maxCount ?? 0) / st.count);
    if (targetTenths >= 60) {
      if (full && st.row100 >= need(99)) return 1; // 100人目まで☆6以上
      if (st.star6Count === undefined || st.star6Count === null) return null;
      return Math.min(1, ((st.star6Count ?? 0) + (st.maxCount ?? 0)) / st.count);
    }
    // ☆5以下：50位・100位のスコアから大まかに判断する
    const pct = STAR_THRESHOLDS.find((t) => t.stars === targetTenths / 10)?.pct;
    if (!pct) return null;
    if (full && st.row100 >= need(pct)) return 1;
    if (st.row50 >= need(pct)) return 0.6;
    if (st.top1 >= need(pct)) return 0.25;
    return 0;
  }

  function buildRecommendations(all, top, stats, rating) {
    const value50 = top.length >= TOP_N ? top[TOP_N - 1].values.full : 0; // 今のレート対象曲の50位
    const inTop = new Set(top);
    const allowMax = rating >= RECOMMEND_MAX_FROM;
    const low = rating < RECOMMEND_LOW_BELOW;
    // レート対象曲の定数の中央値（その人にとっての「ふだんの難易度」）
    const consts = top.map((t) => t.c).sort((a, b) => a - b);
    const median = consts.length ? consts[Math.floor((consts.length - 1) / 2)] : 0;
    const list = [];
    for (const s of all) {
      const now = starTenths(s.cur, s.max);
      if (now >= 70) continue; // すでに理論値
      let targetStars;
      if (low) {
        // 初中級向け：MASTER 以上だけ。低難度は ☆6、そこそこの難易度は ☆5
        if (!RECOMMEND_LOW_DIFFS.includes(s.diff)) continue;
        if (s.c <= median) {
          if (now >= 60) continue;
          targetStars = 6;
        } else if (s.c <= median + RECOMMEND_LOW_RANGE) {
          if (now >= 50) continue;
          targetStars = 5;
        } else {
          continue; // 難しすぎる譜面は出さない
        }
      } else if (now < 60) {
        targetStars = 6;                 // ☆6未満 → ☆6.0 を目標にする
      } else if (allowMax) {
        targetStars = 7;                 // ☆6台 → 理論値（LEGEND に近い人だけ）
      } else {
        continue;
      }
      const targetTenths = targetStars * 10;
      const pct = STAR_THRESHOLDS.find((t) => t.stars === targetStars).pct;
      const needScore = targetStars >= 7 ? s.max : Math.ceil((s.max * pct) / 100);
      const newValue = (s.c * s.c * targetStars) / RATE_DIVISOR + (targetTenths >= 70 ? MAX_BONUS : 0);
      const gain = inTop.has(s) ? (newValue - s.values.full) / TOP_N : Math.max(0, newValue - value50) / TOP_N;
      if (gain <= 0) continue;
      const st = stats.get(`${s.name}|${s.kind}|${s.diff}|${s.max}`);
      list.push({
        s, inTop: inTop.has(s), now, targetTenths, needScore, rest: needScore - s.cur,
        newValue, gain, ease: easeOf(st, targetTenths),
      });
    }
    // 取りやすさの高い順（データなしは最後）→ 定数の低い順 → 伸びしろの大きい順
    return list.sort((a, b) =>
      (b.ease ?? -1) - (a.ease ?? -1) || a.s.c - b.s.c || b.gain - a.gain);
  }


  function recommendEl(all, top, stats, jackets, rating) {
    const recs = buildRecommendations(all, top, stats, rating);
    const box = el('div', 'dxr-rec');
    const head = el('div', 'dxr-rec-head');
    head.append(el('div', 'dxr-rec-title', 'おすすめ楽曲（☆7まで）'),
      el('div', 'dxr-rec-desc', rating >= RECOMMEND_MAX_FROM
        ? '☆6（理論値を目指せる人は☆7）に到達するとレートが伸びる譜面を、上位100人の達成率（取りやすさ）が高い順に並べています。'
        : rating < RECOMMEND_LOW_BELOW
          ? 'MASTER以上の譜面から、ふだんの難易度以下は☆6、少し上の難易度は☆5を目標に、レートが伸びる譜面を取りやすい順に並べています。'
          : '☆6に到達するとレートが伸びる譜面を、上位100人の達成率（取りやすさ）が高い順・定数の低い順に並べています。'));
    box.appendChild(head);

    const listBox = el('div');
    box.appendChild(listBox);

    function render() {
      const shown = recs.slice(0, RECOMMEND_COUNT);
      const list = el('div', 'dxr-list');
      if (!shown.length) list.appendChild(el('div', 'dxr-rec-empty', 'おすすめできる譜面が見つかりませんでした。'));
      shown.forEach((r, i) => {
        const s = r.s;
        const row = el('div', 'dxr-rec-row');
        const song = resolveSong(jackets, s.name, s.kind, s.diff, s.level, s.max);
        let jacket;
        if (song?.img) {
          jacket = el('img', 'dxr-jacket');
          jacket.src = JACKET_BASE + song.img;
          jacket.alt = '';
          jacket.loading = 'lazy';
          jacket.onerror = () => jacket.removeAttribute('src');
        } else {
          jacket = el('div', 'dxr-jacket');
        }
        const main = el('div');
        const nm = el('div', 'dxr-name', s.name);
        if (song?.genre) nm.appendChild(el('span', 'dxr-genre', `（${song.genre}）`));
        const meta = el('div', 'dxr-meta');
        meta.append(
          el('span', `dxr-chip dxr-kind-${s.kind === '?' ? 'unknown' : s.kind}`, s.kind),
          el('span', `dxr-chip dxr-diff-${s.diff.replace(':', '').toUpperCase()}`, s.diff),
          el('span', `dxr-chip dxr-const${s.estimated ? ' is-est' : ''}`, `${s.c.toFixed(1)}${s.estimated ? '*' : ''}`)
        );
        const goal = el('div', 'dxr-rec-goal');
        const nowPill = el('span', `dxr-star-pill ${starClass(Math.floor(r.now / 10))}`, `☆${starDisplay(s.cur, s.max)}`);
        const tgtPill = el('span', `dxr-star-pill ${starClass(r.targetTenths / 10)}`, `☆${(r.targetTenths / 10).toFixed(1)}`);
        goal.append(nowPill, el('span', 'dxr-rec-arrow', '→'), tgtPill,
          el('span', 'dxr-rec-rest', r.targetTenths >= 70 ? `理論値まであと ${r.rest}` : `あと ${r.rest}（MAX-${s.max - r.needScore} 以内）`));
        const easeText = r.ease === null ? '取りやすさ：データなし' : `上位100人の ${Math.round(r.ease * 100)}% が達成`;
        main.append(nm, meta, goal, el('div', 'dxr-rec-ease', (r.inTop ? 'レート対象曲　' : '対象外（入れ替わり）　') + easeText));
        const right = el('div', 'dxr-rec-gain');
        right.append(el('div', 'dxr-rec-plus', `+${r.gain.toFixed(3)}`), el('div', 'dxr-rec-sub', `単曲 ${r.newValue.toFixed(3)}`));
        row.append(el('div', 'dxr-rank', String(i + 1)), jacket, main, right);
        list.appendChild(row);
      });
      listBox.replaceChildren(list);
    }
    render();
    return box;
  }

  // results: [{ mode, rating, top }, ...]
  function renderResult(ui, profile, results, info, jackets, extras = {}) {
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

    // レートの札（押すとそのレートのレート対象曲に切り替わる）
    const plates = el('div', 'dxr-plates');
    const lists = results.map(({ mode, top }) => buildList(top, mode, jackets));
    const buttons = results.map(({ mode, rating }, i) => {
      const b = el('button', 'dxr-plate');
      b.type = 'button';
      b.append(
        el('span', 'dxr-plate-label', mode.label),
        (() => {
          // [ランクのアイコン（後で実装）][レート値]
          const rate = el('span', 'dxr-plate-rate');
          const value = el('span', 'dxr-plate-value', rating.toFixed(3));
          if (RANK_MODES.includes(mode.id)) {
            const rank = rankOf(rating);
            value.classList.add('dxr-ranked');
            value.style.cssText = rankCss(rank);
            value.title = rank.name;
            const icon = el('span', 'dxr-rank-icon');
            icon.dataset.rank = rank.name;
            icon.innerHTML = rankIconSvg(rank.name); // ツール内で作った固定のSVGのみ
            rate.appendChild(icon);
          }
          rate.appendChild(value);
          return rate;
        })(),
        el('span', 'dxr-plate-hint', '押すとレート対象曲を表示')
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
      shareBtn.textContent = `「${results[i].mode.label}」のレート対象曲を画像にする`;
    }
    select(0);
    // 画像にプレイヤー名と称号を載せるかの切り替え（両方表示 / 両方非表示）
    const showLabel = el('label', 'dxr-share-opt');
    const showCb = el('input');
    showCb.type = 'checkbox';
    showCb.checked = true;
    showLabel.append(showCb, document.createTextNode('画像にプレイヤー名と称号を載せる'));
    shareBtn.onclick = () =>
      openShareImage(profile, results[selected], jackets, shareBtn, { hideProfile: !showCb.checked });

    const hasEst = results.some(({ top }) => top.some((s) => s.estimated));
    const note = el('p', 'dxr-note',
      `${info}。` +
      (hasEst ? '定数の * は定数表にない譜面で、レベル表示からの概算値（下限）です。' : '') +
      '☆の小数は次の☆までの進み具合で、計算には整数部分のみ使います。' +
      '「☆6まで」は☆7を☆6として、「☆5まで」は☆6以上を☆5として計算しています。' +
      (jackets ? '' : 'ジャケット画像の対応表を読み込めなかったため、画像は表示していません。'));

    // ランキングに登録（☆7まで・☆6まで・☆5まで の3つのレートを送る）
    const rankBtn = el('button', 'dxr-rank-open', 'ランキングに登録・更新する');
    rankBtn.type = 'button';
    rankBtn.onclick = () => openRankingDialog(ui.body.getRootNode(), profile, results);

    // おすすめ楽曲（☆7まで）：ボタンで開閉
    const recBtn = el('button', 'dxr-rank-open', 'おすすめ楽曲を見る');
    recBtn.type = 'button';
    let recBox = null;
    recBtn.onclick = () => {
      if (recBox) { recBox.remove(); recBox = null; recBtn.textContent = 'おすすめ楽曲を見る'; return; }
      const full = results.find((r) => r.mode.id === 'full');
      recBox = recommendEl(extras.all || [], full.top, extras.stats || new Map(), jackets, full.rating);
      recBtn.after(recBox);
      recBtn.textContent = 'おすすめ楽曲を閉じる';
    };

    ui.body.append(player, plates, shareBtn, showLabel, rankBtn, ...(SHOW_RECOMMEND ? [recBtn] : []), ...lists, note);
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
    // まずログインできているかを確認（プレイヤー情報の取得を兼ねる）
    ui.status('ログイン状態を確認中…');
    const profile = await getPlayerProfile();

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
    // おすすめ楽曲用に、取得したレベルのランキング集計（取りやすさ）を読み込む（GitHubから。失敗しても続行）
    ui.status('おすすめ楽曲のデータを確認中…');
    const stats = await loadRankingStats(LEVEL_MAX, lastLevel);
    ui.status('');
    renderResult(
      ui,
      profile,
      results,
      `Lv15〜Lv${levelInfo(lastLevel).label} の ${fetched} ページを取得し、${scored.length} 譜面から計算`,
      jackets,
      { all: scored, stats }
    );
  } catch (e) {
    ui.status('エラー: ' + e.message, true);
    console.error(e);
  }
})();
