(async () => {
  'use strict';

  // ============================================================
  //  設定
  // ============================================================

  // 版の表示（β版では 'β版'、正式版では空にする）
  const EDITION = 'α版';

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
  //   rankShift: ランクの区切りを「☆7まで」からどれだけ下げるか（☆6まで は LEGEND 11.500、☆5まで は LEGEND 10.500）
  const RATE_MODES = [
    { id: 'full', label: '☆7まで', capStars: MAX_STARS, rankShift: 0 },
    { id: 'cap6', label: '☆6まで', capStars: 6, rankShift: 0.5 },
    { id: 'cap5', label: '☆5まで', capStars: 5, rankShift: 1.5 },
  ];

  // ランク（3種類のレートすべてに適用）。min 以上でそのランク。上から順に判定する
  //   min は「☆7まで」の区切り：LEGEND は 12.000 以上、それより下は 0.500 刻み（RAINBOW PLUS 11.500 …、WAKABA は 7.000 未満）
  //   「☆6まで」「☆5まで」は、RATE_MODES の rankShift だけ区切りを下げて判定する
  //   colors: 文字色のグラデーション（ライト表示）。dark: ダーク表示のときのグラデーション（明るめの同系色）
  const RANK_MODES = RATE_MODES.map((m) => m.id);

  // オマケ：対象の譜面を絞って計算するレート（計算式は同じ。ランク・ランキング登録・おすすめ楽曲はなし）
  //   filter: 対象にする譜面。label: 画面や画像に添える短い名前
  const BONUS_COUNT_MARGIN = 1; // 達成譜面数を数えるとき、定数表にある最低レベルより何段階下まで読むか（定数表にない譜面への備え）
  const BONUS_MODES = [
    { id: 'expert', label: 'EXPERT', title: 'EXPERTのみレート', desc: 'EXPERT の譜面だけで計算します', filter: (s) => s.diff === 'EXPERT',
      countDiff: 'EXPERT',
      accent: { light: '#D0343D', dark: '#FF6B76' } }, // accent: 画像のアクセント色（EXPERT は赤。通常のレートの画像と見分けるため） // countDiff: ☆5・☆6・☆7達成譜面数も数える（その難易度の譜面があるレベルをすべて読み込む）
    { id: 'st', label: 'ST', title: 'STのみレート', desc: 'スタンダード譜面だけで計算します（全難易度）', filter: (s) => s.kind === 'ST' },
    { id: 'dx', label: 'DX', title: 'DXのみレート', desc: 'でらっくす譜面だけで計算します（全難易度）', filter: (s) => s.kind === 'DX' },
  ];
  const RANKS = [
    { name: 'LEGEND',       min: 12, colors: ['#6A1BD8', '#D6246E', '#F2A007'], dark: ['#B98CFF', '#FF6FA8', '#FFC247'] },
    { name: 'RAINBOW PLUS', min: 11.5, colors: ['#FF3B6B', '#FF8A00', '#E8B400', '#1FB88E', '#2F7BFF', '#8A3FFC'], dark: ['#FF6B8E', '#FFA640', '#F2CE3A', '#4FD9B0', '#6FA4FF', '#B58CFF'] },
    { name: 'RAINBOW',      min: 11, colors: ['#FF3B6B', '#FF8A00', '#E8B400', '#1FB88E', '#2F7BFF', '#8A3FFC'], dark: ['#FF6B8E', '#FFA640', '#F2CE3A', '#4FD9B0', '#6FA4FF', '#B58CFF'] },
    { name: 'PLATINUM PLUS', min: 10.5, colors: ['#4F8AA6', '#8FBED4', '#4F8AA6'], dark: ['#8FC4DC', '#D5EEF8', '#8FC4DC'] },
    { name: 'PLATINUM',      min: 10,   colors: ['#4F8AA6', '#8FBED4', '#4F8AA6'], dark: ['#8FC4DC', '#D5EEF8', '#8FC4DC'] },
    { name: 'GOLD PLUS',     min: 9.5, colors: ['#B8860B', '#E0B32E', '#B8860B'], dark: ['#E0B32E', '#FFE58A', '#E0B32E'] },
    { name: 'GOLD',          min: 9,   colors: ['#B8860B', '#E0B32E', '#B8860B'], dark: ['#E0B32E', '#FFE58A', '#E0B32E'] },
    { name: 'SILVER PLUS',   min: 8.5, colors: ['#6F7C8B', '#A7B2BE', '#6F7C8B'], dark: ['#A7B2BE', '#E3E8EE', '#A7B2BE'] },
    { name: 'SILVER',        min: 8,   colors: ['#6F7C8B', '#A7B2BE', '#6F7C8B'], dark: ['#A7B2BE', '#E3E8EE', '#A7B2BE'] },
    { name: 'BRONZE PLUS',   min: 7.5, colors: ['#8E4E22', '#C07A45', '#8E4E22'], dark: ['#C98A58', '#F0BE98', '#C98A58'] },
    { name: 'BRONZE',        min: 7,   colors: ['#8E4E22', '#C07A45', '#8E4E22'], dark: ['#C98A58', '#F0BE98', '#C98A58'] },
    { name: 'WAKABA',       min: -Infinity, colors: ['#3E9B3A', '#7CBF3F'], dark: ['#6FCB6A', '#B4E36C'] },
  ];
  // 表示している値（小数第3位で四捨五入）でランクを決める（表示と判定をそろえるため）
  //   modeId: 'full' / 'cap6' / 'cap5'（省略時は「☆7まで」）
  const rankOf = (rating, modeId = 'full') => {
    const v = Math.round(rating * 1000) / 1000;
    const shift = RATE_MODES.find((m) => m.id === modeId)?.rankShift ?? 0;
    return RANKS.find((r) => v >= r.min - shift);
  };
  // 数字を1文字ずつ同じ幅の枠に入れる（使っている書体は数字ごとに幅が違うため、桁の位置をそろえる）
  const tnum = (node) => {
    const text = node.textContent;
    node.textContent = '';
    node.setAttribute('aria-label', text); // 読み上げでは元の数値として読む
    for (const ch of text) {
      const sp = document.createElement('span');
      if (/[0-9]/.test(ch)) sp.className = 'dg';
      else if (ch === '.') sp.className = 'dg dg-dot';
      sp.setAttribute('aria-hidden', 'true');
      sp.textContent = ch;
      node.appendChild(sp);
    }
    return node;
  };

  // ランクの色は CSS 変数で渡す（--g：ライト用、--gd：ダーク用。どちらを使うかはスタイル側で決める）
  const rankCss = (rank) =>
    `--g: linear-gradient(90deg, ${rank.colors.join(', ')});` +
    ` --gd: linear-gradient(90deg, ${(rank.dark || rank.colors).join(', ')});`;

  // 表示（ダーク／ライト）。選んだ表示はブラウザに保存する（まだ選んでいないときはライト）
  const THEME_KEY = '2frate-theme';
  const THEME_COLORS = {
    light: { bg: '#F4F5F7', panel: '#E6E7EC', line: '#D5D6DE', ink: '#12101F', sub: '#55516E',
      accent: '#007A99', onAccent: '#F4F5F7', ph: '#D5D6DE', ring: '#DCDDE4' },
    dark: { bg: '#0E0B1F', panel: '#16122E', line: '#2E2858', ink: '#F2F0FF', sub: '#A9A3D6',
      accent: '#4DE1FF', onAccent: '#0E0B1F', ph: '#2A2550', ring: '#2A2550' },
  };
  const loadTheme = () => {
    let saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch { /* 読めない環境ではライトにする */ }
    return saved === 'dark' ? 'dark' : 'light';
  };
  let theme = loadTheme();
  const themeColors = () => THEME_COLORS[theme];

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
  const MAX_BONUS = 0.1;       // ☆がそのレートの上限（☆7まで は☆7、☆6まで は☆6、☆5まで は☆5）に達した譜面に加える値
  // 希少ボーナス：全国ランキング（上位100人）で☆6以上の達成者が少ない譜面を☆6以上で達成していると加算する
  //   人数は ranking/lv○○.json の star6Count（☆6）＋ maxCount（☆7）。集計データがない譜面は加算しない
  //   「☆7まで」「☆6まで」のレートだけに適用（☆5まで には加算しない）
  const RARE_BONUS = [
    { maxPeople: 3, add: 0.15 },
    { maxPeople: 10, add: 0.10 },
    { maxPeople: 20, add: 0.05 },
  ];
  const RARE_BONUS_MAX = 0.15;
  const RARE_MODES = ['full', 'cap6'];

  const TOP_N = 50;          // 平均を取る曲数
  const WAIT_MS = 1500;      // ページ取得の間隔（サーバー負荷対策）
  const LEVEL_MAX = 23;      // level=23 が Lv15
  // ☆5・☆6・☆7達成譜面数の集計（MASTER・Re:MASTER のみ）。MASTER の最低難易度が 10+ なので、
  // レート対象曲が決まっていても、少なくともこのレベルまでは取得する（level=14 が 10+）
  const COUNT_DIFFS = ['MASTER', 'Re:MASTER'];
  const COUNT_MIN_LEVEL = 14;
  const PLAYER_URL = '/maimai-mobile/home/';

  // ジャケット画像：「曲名 → 画像ファイル名」の対応表（collect_jackets.js で作成）を読み、
  // maimaiでらっくすNET 上の画像をそのまま表示する（画像そのものはコピーしない）
  const JACKETS_URL = 'https://n4f1316.github.io/dxscore-tools/maimai_jackets.json';
  const OVERRIDES_URL = 'https://n4f1316.github.io/dxscore-tools/jacket_overrides.json'; // 同名曲の手動対応表
  let jacketOverrides = {};
  const JACKET_BASE = 'https://maimaidx.jp/maimai-mobile/img/Music/';
  const LEVEL_URL = (n) => `/maimai-mobile/record/musicLevel/search/?level=${n}`;

  // 譜面定数表（JSON）のURL。空なら表示レベルからの概算値（下限）を使う
  // 形式: { "曲名|DX|MASTER": 14.8, "曲名|ST|EXPERT": 12.3, ... }
  const CONST_URL = 'https://n4f1316.github.io/dxscore-tools/maimai_consts_magical.json';

  // ランキング（Google Apps Script の受け取り口と、ランキングのページ）
  const RANKING_API = 'https://2frate.want131611.workers.dev/';
  const RANKING_PAGE = 'https://n4f1316.github.io/dxscore-tools/ranking.html';
  const FORMULA_VERSION = 'v3'; // 計算式の版（計算式を変えたら上げる）。v2：☆6まで・☆5まで でも上限到達で +0.1、v3：希少ボーナス
  const USER_KEY = 'dxr-ranking-user'; // このブラウザで最後に使ったユーザー名（PINは保存しない）
  const FORM_KEY = 'dxr-ranking-form'; // このブラウザで最後に登録したときの表示名・匿名・ベスト枠公開の選択

  // おすすめ楽曲：ランキング集計のデータ（譜面ごとの取りやすさ）の置き場所
  const RANKING_STATS_DIR = 'https://n4f1316.github.io/dxscore-tools/ranking/';
  const SHOW_RECOMMEND = true; // おすすめ楽曲のボタンを出すか
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

  // そのレベルの譜面が取りうる値の上限（☆上限・定数最大のとき。上限に達しているので +0.1 も含む。☆6以上のレートは希少ボーナスの最大も含む）
  const upperBound = (n, capStars) =>
    (levelInfo(n).max ** 2 * capStars) / RATE_DIVISOR + MAX_BONUS + (capStars >= 6 ? RARE_BONUS_MAX : 0);

  // 全国ランキングの集計（1譜面分）から、☆6以上の達成者数と希少ボーナスを出す（わからなければ人数 null・加算 0）
  function rareOf(st) {
    if (!st || st.star6Count === null || st.star6Count === undefined || st.maxCount === null || st.maxCount === undefined) {
      return { people: null, add: 0 };
    }
    const people = st.star6Count + st.maxCount;
    const hit = RARE_BONUS.find((b) => people <= b.maxPeople);
    return { people, add: hit ? hit.add : 0 };
  }

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

  function score(s, constTable, stats) {
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
    // 希少ボーナス：自分が☆6以上を達成している譜面だけ
    const rare = rareOf(stats?.get(`${s.name}|${s.kind}|${s.diff}|${s.max}`));
    const rareAdd = stars >= 6 ? rare.add : 0;
    for (const m of RATE_MODES) {
      const t = Math.min(tenths, m.capStars * 10); // ☆×10 の整数（6.4 → 64）
      const whole = Math.floor(t / 10);             // ☆の整数部分（6）
      const frac = (t % 10) / 10;                   // ☆の小数部分（0.4）
      values[m.id] = (c * c * whole + c * c * frac * FRACTION_WEIGHT) / RATE_DIVISOR
        + (t >= m.capStars * 10 ? MAX_BONUS : 0) // ☆がそのレートの上限に達した譜面は +0.1
        + (RARE_MODES.includes(m.id) ? rareAdd : 0); // 希少ボーナス（☆7まで・☆6まで のみ）
    }
    return { ...s, c, estimated: !inTable, stars, values, rareAdd, rarePeople: rare.people };
  }

  // ☆7・☆6・☆5 を達成した MASTER / Re:MASTER の譜面数（☆6達成は☆7を、☆5達成は☆6・☆7を含む）
  function countStars(scored) {
    const c = { star7Mas: 0, star7Remas: 0, star6Mas: 0, star6Remas: 0, star5Mas: 0, star5Remas: 0 };
    for (const s of scored) {
      if (!COUNT_DIFFS.includes(s.diff)) continue;
      const re = s.diff === 'Re:MASTER';
      for (const n of [7, 6, 5]) {
        if (s.stars >= n) c[`star${n}${re ? 'Remas' : 'Mas'}`]++;
      }
    }
    return c;
  }

  // ============================================================
  //  表示（見た目）
  // ============================================================

  const STYLE = `
    /* ---- デザイン：直線的な枠（角丸・光彩なし）、罫線の表、ダーク／ライト（Web のページと共通の色） ---- */
    :host {
      all: initial; display: block;
      --bg: #F4F5F7; --panel: #E6E7EC; --line: #D5D6DE; --ink: #12101F; --sub: #55516E;
      --accent: #007A99; --on-accent: #F4F5F7; --ph: #D5D6DE;
      --gold: #8A5A00; --err: #C0303A; --ok: #1E7A3C; --dx: #B8460B; --st: #1565B0; --remas: #6B2FB3;
      --basic: #23804A; --advanced: #A86B00; --expert: #D0343D; --master: #8A3FD1;
      --card: var(--bg); --cyan: var(--accent);
      --num: "Chakra Petch", "Noto Sans JP", "Hiragino Sans", "Yu Gothic", sans-serif;
      --jp: "Noto Sans JP", "Hiragino Sans", "Yu Gothic", sans-serif;
      --rings: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400' fill='none' stroke='%23DCDDE4'%3E%3Ccircle cx='400' cy='0' r='60'/%3E%3Ccircle cx='400' cy='0' r='100'/%3E%3Ccircle cx='400' cy='0' r='140'/%3E%3Ccircle cx='400' cy='0' r='180' stroke='%23007A99' stroke-opacity='.6'/%3E%3Ccircle cx='400' cy='0' r='220'/%3E%3Ccircle cx='400' cy='0' r='260'/%3E%3Ccircle cx='400' cy='0' r='300'/%3E%3Ccircle cx='400' cy='0' r='340'/%3E%3Ccircle cx='400' cy='0' r='380'/%3E%3C/svg%3E");
      --rings2: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='260' height='260' fill='none' stroke='%23DCDDE4'%3E%3Ccircle cx='0' cy='260' r='70'/%3E%3Ccircle cx='0' cy='260' r='110'/%3E%3Ccircle cx='0' cy='260' r='150'/%3E%3Ccircle cx='0' cy='260' r='190'/%3E%3Ccircle cx='0' cy='260' r='230'/%3E%3C/svg%3E");
      position: fixed; inset: 0; z-index: 99999; overflow: auto;
      background: var(--bg); color: var(--ink);
      font: 14px/1.6 var(--jp);
      -webkit-text-size-adjust: 100%;
    }
    :host([data-theme="dark"]) {
      --bg: #0E0B1F; --panel: #16122E; --line: #2E2858; --ink: #F2F0FF; --sub: #A9A3D6;
      --accent: #4DE1FF; --on-accent: #0E0B1F; --ph: #2A2550;
      --gold: #FFD86B; --err: #FF7A85; --ok: #6FD98C; --dx: #FFB37A; --st: #7CC4FF; --remas: #D9B8FF;
      --rings: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400' fill='none' stroke='%232A2550'%3E%3Ccircle cx='400' cy='0' r='60'/%3E%3Ccircle cx='400' cy='0' r='100'/%3E%3Ccircle cx='400' cy='0' r='140'/%3E%3Ccircle cx='400' cy='0' r='180' stroke='%234DE1FF' stroke-opacity='.6'/%3E%3Ccircle cx='400' cy='0' r='220'/%3E%3Ccircle cx='400' cy='0' r='260'/%3E%3Ccircle cx='400' cy='0' r='300'/%3E%3Ccircle cx='400' cy='0' r='340'/%3E%3Ccircle cx='400' cy='0' r='380'/%3E%3C/svg%3E");
      --rings2: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='260' height='260' fill='none' stroke='%232A2550'%3E%3Ccircle cx='0' cy='260' r='70'/%3E%3Ccircle cx='0' cy='260' r='110'/%3E%3Ccircle cx='0' cy='260' r='150'/%3E%3Ccircle cx='0' cy='260' r='190'/%3E%3Ccircle cx='0' cy='260' r='230'/%3E%3C/svg%3E");
    }
    * { box-sizing: border-box; border-radius: 0; }
    /* 数字の幅をそろえる（tnum で1文字ずつ分けたもの。書体の数字は幅がまちまちなため） */
    .dg { display: inline-flex; justify-content: center; width: .6em; }
    .dg-dot { width: .28em; }
    /* 背景のリング（枠の背面に見える軽いアクセント） */
    .dxr-bg { position: fixed; inset: 0; z-index: -1; pointer-events: none;
      background: var(--rings) top right no-repeat, var(--rings2) bottom left no-repeat; }
    .dxr-wrap {
      max-width: 760px; margin: 0 auto; padding: 16px 14px 40px;
      font: 14px/1.6 var(--jp);
      color: var(--ink); text-align: left;
    }
    .dxr-top { display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding-bottom: 10px; border-bottom: 2px solid var(--ink); }
    .dxr-title { font: 700 15px/1.2 var(--num); letter-spacing: .08em; color: var(--ink); }
    .dxr-close {
      font: inherit; font-size: 12px; font-weight: 700; color: var(--ink); background: var(--bg);
      border: 1px solid var(--line); padding: 6px 12px; cursor: pointer;
    }
    .dxr-theme { color: var(--sub); }
    button:focus-visible, select:focus-visible, input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    .dxr-status { margin: 10px 0 0; color: var(--sub); font-size: 13px; }
    .dxr-status.is-error { color: var(--err); font-weight: 700; }
    a { color: var(--accent); }

    /* プレイヤー情報（アイコン・称号・名前） */
    .dxr-profile { display: flex; align-items: center; gap: 14px; margin: 18px 0 14px; }
    .dxr-icon {
      width: 64px; height: 64px; flex: none; object-fit: cover;
      background: var(--ph); border: 1px solid var(--line);
    }
    .dxr-profile-text { min-width: 0; }
    .dxr-profile-caption { margin: 0 0 2px; font-weight: 700; }
    .dxr-trophy {
      display: inline-block; max-width: 100%; font-size: 12px; font-weight: 700; line-height: 1.4;
      padding: 3px 12px; margin-bottom: 4px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      background: #F1F1F4; color: #4A4A57; border: 1px solid #D9D9E2;
    }
    .dxr-trophy.t-Bronze { background: #F4E3D3; color: #7A4A1E; border-color: #D9AC82; }
    .dxr-trophy.t-Silver { background: #ECEFF3; color: #4B5563; border-color: #B8C0CC; }
    .dxr-trophy.t-Gold { background: #FFF1C7; color: #7A5600; border-color: #E3B63A; }
    .dxr-trophy.t-Rainbow {
      color: #12101F; border-color: transparent;
      background: linear-gradient(90deg, #FFD1DC, #FFE9B8, #D6F5C9, #C9EBFF, #E3D4FF);
    }
    .dxr-trophy-official { max-width: 100%; margin-bottom: 4px; }
    .dxr-trophy-official > * { max-width: 100%; margin-left: 0 !important; }
    .dxr-player { font-size: 22px; font-weight: 800; letter-spacing: .02em; line-height: 1.3; word-break: break-all; }

    /* レート表示：押すと表が切り替わる（3つをつなげた枠） */
    .dxr-plates { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0; margin-bottom: 18px; }
    .dxr-plate {
      font: inherit; text-align: left; cursor: pointer; color: var(--ink); position: relative;
      background: var(--bg); border: 1px solid var(--line); margin-left: -1px; padding: 12px 16px;
    }
    .dxr-plate:first-child { margin-left: 0; }
    .dxr-plate[aria-pressed="true"] { border-color: var(--accent); z-index: 1; box-shadow: inset 0 3px 0 var(--accent); }
    .dxr-plate-label { display: block; font: 700 12px/1.4 var(--num); letter-spacing: .04em; color: var(--sub); }
    .dxr-plate[aria-pressed="true"] .dxr-plate-label { color: var(--accent); }
    .dxr-plate-value { display: block; font: 700 34px/1.2 var(--num); font-variant-numeric: tabular-nums; }
    .dxr-plate[aria-pressed="true"] .dxr-plate-value { color: var(--accent); }
    /* ランクの色（グラデーションの文字）。--g がライト用、--gd がダーク用 */
    .dxr-plate-value.dxr-ranked, .dxr-plate[aria-pressed="true"] .dxr-plate-value.dxr-ranked {
      color: transparent; -webkit-background-clip: text; background-clip: text; display: inline-block;
      background-image: var(--g);
    }
    :host([data-theme="dark"]) .dxr-plate-value.dxr-ranked { background-image: var(--gd); }
    .dxr-plate-rate { display: flex; align-items: center; gap: 6px; }
    .dxr-rank-icon { display: inline-flex; flex: none; width: 38px; height: 38px; }
    .dxr-rank-icon svg { width: 100%; height: 100%; }
    .dxr-plate-hint { display: block; font-size: 11px; font-weight: 700; color: var(--sub); }
    .dxr-plate[aria-pressed="true"] { background: var(--panel); }
    .dxr-plate[aria-pressed="true"] .dxr-plate-hint { color: var(--accent); }
    .dxr-plates-caption { margin: 0 0 6px; font-size: 12px; font-weight: 700; color: var(--sub); }
    .dxr-list-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 12px; margin: 4px 0 8px; }
    .dxr-list-title { font-weight: 800; font-size: 15px; }
    .dxr-list-head .dxr-tabs { margin: 0; }

    /* ☆6・☆7達成譜面数 */
    .dxr-counts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0; margin: -6px 0 18px; }
    .dxr-count { background: var(--bg); border: 1px solid var(--line); margin-left: -1px; padding: 10px 16px; }
    .dxr-count:first-child { margin-left: 0; }
    .dxr-count-head { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; color: var(--sub); }
    .dxr-count-head .dxr-star-pill { min-width: 0; }
    .dxr-count-num { font: 700 28px/1.2 var(--num); font-variant-numeric: tabular-nums; }
    .dxr-count-num small { font: 700 13px/1 var(--jp); color: var(--sub); margin-left: 4px; }
    .dxr-count-sub { font-size: 12px; font-weight: 700; color: var(--sub); font-variant-numeric: tabular-nums; }

    /* 譜面の一覧（罫線の表） */
    .dxr-list { background: var(--bg); border: 1px solid var(--line); overflow: hidden; }
    .dxr-row {
      display: grid; grid-template-columns: 30px 44px 1fr 66px 72px 72px; align-items: center; gap: 10px;
      padding: 9px 14px; border-top: 1px solid var(--line);
    }
    .dxr-head { border-top: 0; background: var(--panel); color: var(--sub); font: 700 11px/1.6 var(--num); letter-spacing: .04em;
      padding-top: 7px; padding-bottom: 7px; }
    .dxr-rank { font: 700 14px/1.2 var(--num); color: var(--sub); text-align: center; font-variant-numeric: tabular-nums; }
    .dxr-name { font-weight: 700; line-height: 1.35; word-break: break-word; }
    .dxr-genre { font-size: 11px; font-weight: 700; color: var(--sub); margin-left: 2px; }
    .dxr-meta { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
    .dxr-chip {
      display: inline-block; font: 700 11px/1 var(--num); padding: 3px 6px;
      border: 1px solid transparent; color: #fff; white-space: nowrap;
    }
    .dxr-rare { background: transparent; color: var(--gold); border-color: var(--gold); }
    .dxr-kind-DX { background: transparent; color: var(--dx); border-color: var(--dx); }
    .dxr-kind-ST { background: transparent; color: var(--st); border-color: var(--st); }
    .dxr-kind-unknown { background: transparent; color: var(--sub); border-color: var(--line); }
    .dxr-diff-BASIC { background: var(--basic); border-color: var(--basic); }
    .dxr-diff-ADVANCED { background: var(--advanced); border-color: var(--advanced); }
    .dxr-diff-EXPERT { background: var(--expert); border-color: var(--expert); }
    .dxr-diff-MASTER { background: var(--master); border-color: var(--master); }
    .dxr-diff-REMASTER { background: transparent; color: var(--remas); border-color: var(--remas); }
    .dxr-const { background: transparent; color: var(--ink); border-color: var(--line); }
    .dxr-const.is-est { color: var(--sub); }
    .dxr-diffmax { text-align: right; font-variant-numeric: tabular-nums; }
    .dxr-val { text-align: right; font-variant-numeric: tabular-nums; }
    .dxr-head .dxr-val { text-align: center; }
    .dxr-star { text-align: center; font-variant-numeric: tabular-nums; }
    /* ☆の色分け：☆1・2 黄緑 / ☆3・4 オレンジ / ☆5・6 黄色 / ☆7 虹色（ダーク・ライト共通） */
    .dxr-star-pill {
      display: inline-block; min-width: 3.6em; padding: 3px 7px; text-align: center;
      font: 700 13px/1.3 var(--num); color: #0E0B1F; background: var(--panel);
    }
    .dxr-star-pill.g12 { background: #B5E05A; }
    .dxr-star-pill.g34 { background: #FF9A4A; }
    .dxr-star-pill.g56 { background: #FFD86B; }
    .dxr-star-pill.g7 { background: linear-gradient(90deg, #FF7A93, #FFB347, #FFE66D, #7EE081, #7CC8FF, #B79BFA); }
    .dxr-star-pill.g0 { color: var(--sub); }
    .dxr-diffmax { font: 500 12px/1.4 var(--num); color: var(--sub); }
    .dxr-diffmax.is-max { color: var(--gold); font-weight: 700; }
    .dxr-val { font: 700 15px/1.4 var(--num); }
    .dxr-head .dxr-star, .dxr-head .dxr-diffmax, .dxr-head .dxr-val { color: var(--sub); font-size: 11px; }

    .dxr-jacket {
      width: 44px; height: 44px; object-fit: cover; display: block;
      background: var(--ph); border: 1px solid var(--line);
    }
    .dxr-share {
      display: block; width: 100%; margin: -6px 0 16px; padding: 10px 16px;
      font: inherit; font-weight: 800; color: var(--on-accent); background: var(--accent); border: 1px solid var(--accent); cursor: pointer;
    }
    .dxr-share:disabled { opacity: .6; cursor: default; }
    .dxr-share-opt {
      display: flex; align-items: center; justify-content: center; gap: 6px;
      margin: -8px 0 16px; font-size: 13px; font-weight: 700; color: var(--sub); cursor: pointer;
    }
    .dxr-share-opt input { width: 16px; height: 16px; accent-color: var(--accent); }
    /* 画像の形を選ぶカード（構成図つき）。「画像にする」ボタンの上に置く */
    .dxr-share-layout { margin: -6px 0 8px; }
    .dxr-share-layout-label { font-size: 12px; font-weight: 700; color: var(--sub); margin: 0 0 4px; }
    .dxr-lcards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .dxr-lcard { display: flex; align-items: center; gap: 10px; min-width: 0; padding: 8px 10px; cursor: pointer;
      font: inherit; color: var(--ink); text-align: left; background: var(--bg); border: 1px solid var(--line); }
    .dxr-lcard[aria-pressed="true"] { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
    .dxr-lcard-fig { display: flex; align-items: center; justify-content: center; flex: none; width: 96px; height: 60px; }
    .dxr-lcard-fig svg { display: block; }
    .dxr-lcard-text { display: flex; flex-direction: column; min-width: 0; }
    .dxr-lcard-name { font-size: 14px; font-weight: 800; line-height: 1.3; }
    .dxr-lcard[aria-pressed="true"] .dxr-lcard-name { color: var(--accent); }
    .dxr-lcard-desc { font-size: 11px; font-weight: 700; color: var(--sub); line-height: 1.4; }
    .dxr-share-layout + .dxr-share { margin-top: 0; }
    .dxr-name-style { margin: 8px 0 0; }
    .dxr-name-style[hidden] { display: none; }
    .dxr-off-rate + .dxr-share-layout { margin-top: 12px; }
    @media (max-width: 520px) {
      .dxr-lcard { flex-direction: column; gap: 4px; padding: 8px 6px; text-align: center; }
      .dxr-lcard-text { align-items: center; }
    }
    .dxr-rank-open {
      display: block; width: 100%; margin: -6px 0 16px; padding: 9px 16px;
      font: inherit; font-weight: 800; color: var(--accent); background: var(--bg); border: 1px solid var(--accent); cursor: pointer;
    }
    /* おすすめ楽曲 */
    .dxr-rec { margin: -6px 0 18px; }
    .dxr-rec-head { margin: 0 2px 8px; }
    .dxr-rec-title { font-weight: 800; font-size: 16px; }
    .dxr-rec-desc { font-size: 12px; color: var(--sub); }
    .dxr-rec-row { display: grid; grid-template-columns: 30px 44px 1fr auto; gap: 10px; align-items: center;
      padding: 9px 14px; border-top: 1px solid var(--line); }
    .dxr-rec-row:first-child { border-top: 0; }
    .dxr-rec-goal { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin-top: 4px; }
    .dxr-rec-goal .dxr-star-pill { min-width: 0; }
    .dxr-rec-arrow { color: var(--sub); font-weight: 800; }
    .dxr-rec-rest { font-size: 12px; font-weight: 700; color: var(--ink); margin-left: 4px; }
    .dxr-rec-ease { font-size: 11px; color: var(--sub); margin-top: 2px; }
    .dxr-rec-gain { text-align: right; }
    .dxr-rec-plus { font: 700 17px/1.3 var(--num); color: var(--accent); font-variant-numeric: tabular-nums; }
    .dxr-rec-sub { font: 500 11px/1.4 var(--num); color: var(--sub); font-variant-numeric: tabular-nums; }
    .dxr-rec-empty { padding: 20px; text-align: center; color: var(--sub); }
    @media (max-width: 520px) {
      .dxr-rec-row { grid-template-columns: 22px 40px 1fr auto; gap: 7px; padding: 9px 10px; }
      .dxr-rec-plus { font-size: 15px; }
    }
    /* ランキング登録の画面 */
    .dxr-modal { position: fixed; inset: 0; background: rgba(14,11,31,.6); display: flex; align-items: flex-start;
      font: 14px/1.6 var(--jp); color: var(--ink);
      justify-content: center; padding: 24px 12px; overflow: auto; z-index: 2; }
    .dxr-dialog { width: min(100%, 460px); background: var(--bg); border: 1px solid var(--line); border-top: 3px solid var(--accent); padding: 18px; }
    .dxr-dialog h3 { margin: 0 0 4px; font-size: 18px; }
    .dxr-dialog p { margin: 4px 0 12px; font-size: 12px; color: var(--sub); }
    .dxr-field { display: block; margin: 10px 0; font-weight: 700; font-size: 13px; }
    .dxr-field input[type="text"], .dxr-field input[type="password"] {
      display: block; width: 100%; margin-top: 4px; font: inherit; font-size: 16px; padding: 8px 12px;
      border: 1px solid var(--line); color: var(--ink); background: var(--bg);
    }
    .dxr-field small { display: block; font-weight: 500; color: var(--sub); font-size: 11px; margin-top: 2px; }
    .dxr-check { display: flex; align-items: center; gap: 8px; margin: 8px 0; font-weight: 700; font-size: 13px; }
    .dxr-check input { width: 18px; height: 18px; accent-color: var(--accent); }
    .dxr-check.off { opacity: .45; }
    .dxr-preview { display: flex; align-items: center; gap: 12px; padding: 12px; margin: 12px 0; background: var(--panel); border: 1px solid var(--line); }
    .dxr-preview img, .dxr-preview .ph { width: 52px; height: 52px; object-fit: cover; background: var(--ph); flex: none; }
    .dxr-preview .nm { font-weight: 800; font-size: 16px; word-break: break-all; }
    .dxr-preview .rt { font-size: 12px; color: var(--sub); }
    .dxr-err { color: var(--err); font-weight: 700; font-size: 13px; min-height: 1.4em; }
    .dxr-ok { color: var(--ok); font-weight: 700; font-size: 14px; }
    .dxr-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; flex-wrap: wrap; }
    .dxr-actions button { font: inherit; font-weight: 800; padding: 8px 16px; cursor: pointer;
      border: 1px solid var(--line); background: var(--bg); color: var(--ink); }
    .dxr-actions button.primary { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
    .dxr-actions button:disabled { opacity: .5; cursor: default; }
    .dxr-actions a { font-weight: 800; color: var(--accent); align-self: center; }
    .dxr-note { margin-top: 14px; font-size: 12px; color: var(--sub); line-height: 1.7; }

    /* スマホ幅：MAX差を曲名の下へ回す */
    @media (max-width: 520px) {
      .dxr-count { padding: 8px 10px; }
      .dxr-count-num { font-size: 22px; }
      .dxr-count-sub { font-size: 11px; }
      .dxr-plate { padding: 10px 10px; }
      .dxr-plate-value { font-size: 22px; }
      .dxr-rank-icon { width: 24px; height: 24px; }
      .dxr-plate-rate { gap: 3px; }
      .dxr-plate-hint { font-size: 10px; }
      .dxr-icon { width: 56px; height: 56px; }
      .dxr-player { font-size: 20px; }
      .dxr-star-pill { min-width: 0; padding: 3px 5px; font-size: 12px; }
      .dxr-row { grid-template-columns: 22px 40px 1fr 54px 60px; gap: 7px; padding: 9px 10px; }
      .dxr-jacket { width: 40px; height: 40px; }
      .dxr-row > .dxr-diffmax { display: none; }
      .dxr-meta .dxr-diffmax-inline { display: inline-block; }
      .dxr-close { padding: 6px 8px; }
    }
    /* 起動時のメニュー・マイページ */
    .dxr-top-btns { display: flex; gap: 6px; }
    .dxr-close[hidden] { display: none; }
    .dxr-menu { display: grid; gap: 12px; }
    .dxr-bonus { margin-top: 24px; }
    .dxr-bonus-toggle { display: flex; align-items: center; justify-content: space-between; width: 100%; cursor: pointer;
      font: 700 14px/1.4 var(--num); letter-spacing: .08em; color: var(--sub); text-align: left;
      background: var(--panel); border: 1px solid var(--line); padding: 10px 16px; }
    .dxr-bonus-toggle[aria-expanded="true"] { color: var(--ink); }
    .dxr-bonus-mark { font-size: 16px; line-height: 1; }
    .dxr-bonus-body { padding-top: 10px; }
    .dxr-bonus-body[hidden] { display: none; }
    .dxr-bonus .dxr-menu { gap: 0; }
    .dxr-bonus .dxr-menu-item { padding: 12px 16px; margin-top: -1px; border-left-width: 1px; }
    .dxr-bonus .dxr-menu-title { font-size: 15px; }
    .dxr-menu-item {
      display: block; width: 100%; text-align: left; font: inherit; color: var(--ink); cursor: pointer;
      background: var(--bg); border: 1px solid var(--line); border-left: 4px solid var(--line); padding: 16px 18px;
    }
    .dxr-menu-item.is-primary { border-color: var(--accent); }
    .dxr-menu-title { display: block; font-size: 18px; font-weight: 800; }
    .dxr-menu-item.is-primary .dxr-menu-title { color: var(--accent); }
    .dxr-menu-desc { display: block; font-size: 12px; font-weight: 700; color: var(--sub); margin-top: 2px; }
    .dxr-card { background: var(--bg); border: 1px solid var(--line); padding: 16px; margin-bottom: 16px; }
    .dxr-card h3 { margin: 0 0 4px; font-size: 17px; }
    .dxr-card h4 { margin: 0 0 4px; font-size: 15px; }
    .dxr-card-desc { margin: 2px 0 8px; font-size: 12px; color: var(--sub); }
    .dxr-card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .dxr-card .dxr-list { margin-top: 4px; }
    .dxr-sub { border-top: 1px solid var(--line); margin-top: 14px; padding-top: 12px; }
    .dxr-mini { font: inherit; font-size: 12px; font-weight: 700; color: var(--sub); background: var(--bg);
      border: 1px solid var(--line); padding: 4px 12px; cursor: pointer; }
    /* タブ：つなげたセル。選択中はアクセント色で塗る */
    .dxr-tabs { display: flex; gap: 0; margin: 12px 0 4px; }
    .dxr-tab { font: inherit; font-weight: 800; padding: 6px 16px; cursor: pointer; margin: 0 -1px -1px 0; position: relative;
      border: 1px solid var(--line); background: var(--bg); color: var(--ink); }
    .dxr-tab[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: var(--on-accent); z-index: 1; }
    .dxr-fav-now { display: flex; align-items: center; gap: 10px; background: var(--panel); border: 1px solid var(--line); padding: 10px 12px; margin: 6px 0 8px; }
    .dxr-picker { margin-top: 10px; }
    .dxr-auto { margin: 4px 0 12px; padding: 10px 14px; background: var(--panel); border-left: 3px solid var(--ok); color: var(--ok); font-weight: 700; font-size: 13px; }
    .dxr-auto.is-error { border-left-color: var(--err); color: var(--err); }
    .dxr-auto a { color: inherit; }
    .dxr-auto-set { margin-top: 12px; padding: 10px 12px; background: var(--panel); border: 1px solid var(--line); }
    .dxr-crange { align-items: center; }
    .dxr-crange-label { font-size: 12px; font-weight: 800; color: var(--sub); margin-right: 6px; }
    .dxr-crange-sep { font-weight: 800; color: var(--sub); margin: 0 6px; }
    .dxr-crange select { font: 700 15px/1.4 var(--num); padding: 4px 8px;
      border: 1px solid var(--line); background: var(--bg); color: var(--ink); }
    .dxr-order { margin-top: 6px; }
    .dxr-card .dxr-crange { margin: 8px 0 4px; }
    .dxr-tab-sm { font-size: 12px; padding: 4px 12px; }
    .dxr-ptabs { display: flex; flex-wrap: wrap; gap: 0; margin: 8px 0 0; }
    .dxr-ptab { font: inherit; font-size: 12px; font-weight: 800; padding: 4px 11px; cursor: pointer; margin: 0 -1px -1px 0; position: relative;
      border: 1px solid var(--line); background: var(--bg); color: var(--ink); }
    .dxr-ptab[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: var(--on-accent); z-index: 1; }
    .dxr-ptab.pd-BASIC[aria-pressed="true"] { background: var(--basic); border-color: var(--basic); color: #fff; }
    .dxr-ptab.pd-ADVANCED[aria-pressed="true"] { background: var(--advanced); border-color: var(--advanced); color: #fff; }
    .dxr-ptab.pd-EXPERT[aria-pressed="true"] { background: var(--expert); border-color: var(--expert); color: #fff; }
    .dxr-ptab.pd-MASTER[aria-pressed="true"] { background: var(--master); border-color: var(--master); color: #fff; }
    .dxr-ptab.pd-REMASTER[aria-pressed="true"] { background: var(--bg); color: var(--remas); border-color: var(--remas); }
    .dxr-psearch { display: block; width: 100%; margin-top: 10px; font: inherit; font-size: 16px; padding: 8px 14px;
      border: 1px solid var(--line); background: var(--bg); color: var(--ink); }
    .dxr-prow { display: grid; grid-template-columns: 44px minmax(0, 1fr); gap: 10px; align-items: center; width: 100%;
      text-align: left; font: inherit; color: var(--ink); background: var(--bg); border: 0; border-top: 1px solid var(--line);
      padding: 8px 12px; cursor: pointer; }
    .dxr-prow:first-child { border-top: 0; }
    .dxr-prow.is-on { background: var(--panel) !important; box-shadow: inset 3px 0 0 var(--accent); }
    .dxr-pconfirm { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; padding: 8px 12px 12px; background: var(--panel);
      box-shadow: inset 3px 0 0 var(--accent); }
    .dxr-pconfirm button { font: inherit; font-weight: 800; padding: 7px 14px; cursor: pointer;
      border: 1px solid var(--line); background: var(--bg); color: var(--ink); }
    .dxr-pconfirm button.primary { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
    .dxr-pager { display: flex; flex-wrap: wrap; justify-content: center; gap: 0; margin: 8px 0; }
    .dxr-pager button { font: 700 12px/1.6 var(--num); min-width: 32px; padding: 4px 9px; margin: 0 -1px -1px 0; position: relative;
      border: 1px solid var(--line); background: var(--bg); color: var(--ink); cursor: pointer; }
    .dxr-pager button.is-on { background: var(--accent); border-color: var(--accent); color: var(--on-accent); opacity: 1; z-index: 1; }
    .dxr-pager button:disabled:not(.is-on) { opacity: .4; cursor: default; }
    .dxr-pager .gap { align-self: center; color: var(--sub); padding: 0 6px; }
    .dxr-card .dxr-field input[type="text"], .dxr-card .dxr-field input[type="password"] {
      display: block; width: 100%; margin-top: 4px; font: inherit; font-size: 16px; padding: 8px 12px;
      border: 1px solid var(--line); color: var(--ink); background: var(--bg);
    }
    .dxr-card .dxr-actions button.primary { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
    /* 保存済みのデータから表示（検証用） */
    .dxr-off-select { display: block; width: 100%; margin-top: 4px; font: inherit; font-size: 16px; padding: 8px 10px;
      border: 1px solid var(--line); background: var(--bg); color: var(--ink); }
    .dxr-off-rate { display: flex; align-items: center; gap: 8px; margin: 12px 0 0; }
    .dxr-off-rate .dxr-plate-value { font-size: 30px; }
    .dxr-off-rate .dxr-plate-label { margin-right: auto; }
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
      font.href = 'https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;600;700&family=Noto+Sans+JP:wght@400;500;700;800&display=swap';
      document.head.appendChild(font);
    }

    // 公式サイトのCSSの影響を受けないよう、シャドウDOMの中に画面を作る
    const host = el('div');
    host.id = 'dxr-panel';
    // 外枠だけはページ側のCSSに上書きされないよう直接指定する
    const hostCss = () => {
      const c = themeColors();
      host.dataset.theme = theme;
      host.style.cssText =
        'all:initial;position:fixed;inset:0;z-index:99999;display:block;' +
        `overflow:auto;background:${c.bg};color:${c.ink};font-size:14px;line-height:1.6;`;
    };
    hostCss();
    const root = host.attachShadow({ mode: 'open' });
    const style = el('style');
    style.textContent = STYLE;

    const wrap = el('div', 'dxr-wrap');
    const top = el('div', 'dxr-top');
    const title = el('div', 'dxr-title', EDITION ? `2fRATE ${EDITION}` : '2fRATE');
    const close = el('button', 'dxr-close', '閉じる');
    close.type = 'button';
    close.onclick = () => host.remove();
    // メニューに戻るボタン（メニュー以外の画面で表示）
    const back = el('button', 'dxr-close', '← メニュー');
    back.type = 'button';
    back.hidden = true;
    // 表示（ダーク／ライト）の切り替え
    const themeBtn = el('button', 'dxr-close dxr-theme');
    themeBtn.type = 'button';
    const paintTheme = () => {
      const label = theme === 'dark' ? '表示：ダーク' : '表示：ライト';
      themeBtn.textContent = label;
      themeBtn.setAttribute('aria-label', `${label}（押すと切り替え）`);
    };
    themeBtn.onclick = () => {
      theme = theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(THEME_KEY, theme); } catch { /* 保存できない環境では、この画面の間だけ切り替える */ }
      hostCss();
      paintTheme();
    };
    paintTheme();
    const btns = el('div', 'dxr-top-btns');
    btns.append(back, themeBtn, close);
    top.append(title, btns);

    const status = el('p', 'dxr-status');
    const body = el('div');
    wrap.append(top, status, body);
    root.append(style, el('div', 'dxr-bg'), wrap);
    document.body.appendChild(host);

    return {
      body,
      setBack: (fn) => {
        back.hidden = !fn;
        back.onclick = fn;
      },
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
      if (s.rareAdd > 0 && RARE_MODES.includes(mode.id)) {
        const rare = el('span', 'dxr-chip dxr-rare', `希少 +${s.rareAdd.toFixed(2)}`);
        if (s.rarePeople !== undefined) rare.title = `全国ランキング上位100人のうち☆6以上は ${s.rarePeople} 人`;
        meta.appendChild(rare);
      }
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
        tnum(el('div', 'dxr-val', s.values[mode.id].toFixed(3)))
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
    if (!res.ok) throw new Error(`maimaiでらっくすNET に接続できませんでした（HTTP ${res.status}）。`);
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const got = readProfile(doc);
    if ((res.redirected && !res.url.includes('/home')) || !got.name) {
      throw new Error('maimaiでらっくすNET にログインしていないようです。ログインしてから、もう一度実行してください。');
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
  const COPYRIGHT = '© 2026 なふ（2fRATE）';

  const IMG = {
    cols: 5, rows: 10, pad: 32, gap: 12,
    cellW: 240, jacket: 224, cellH: 320, headH: 204, footH: 110,
    font: '"Noto Sans JP", "Hiragino Sans", "Yu Gothic", sans-serif',
    num: '"Chakra Petch", "Noto Sans JP", "Hiragino Sans", "Yu Gothic", sans-serif', // 数字・英字ラベル用
    // 色は表示（ダーク／ライト）に合わせる
    get ink() { return themeColors().ink; }, get sub() { return themeColors().sub; }, get line() { return themeColors().line; },
    get bg() { return themeColors().bg; }, get panel() { return themeColors().panel; }, 
    get accent() { return themeColors().accent; }, get ph() { return themeColors().ph; }, get ring() { return themeColors().ring; },
  };
  const DARK_INK = '#0E0B1F'; // 色つきラベルの上の文字（ダーク・ライト共通）
  const DIFF_COLOR = { BASIC: '#23804A', ADVANCED: '#A86B00', EXPERT: '#D0343D', MASTER: '#8A3FD1', 'Re:MASTER': '#8A3FD1' };
  const TROPHY_COLOR = {
    Normal: ['#F1F1F4', '#4A4A57'], Bronze: ['#F4E3D3', '#7A4A1E'], Silver: ['#ECEFF3', '#4B5563'],
    Gold: ['#FFF1C7', '#7A5600'], Rainbow: [null, '#12101F'],
  };
  const RAINBOW = ['#FF7A93', '#FFB347', '#FFE66D', '#7EE081', '#7CC8FF', '#B79BFA'];

  // 画像を読み込む（失敗や時間切れなら null）。maimaiでらっくすNET 上で実行しているので同じサイトの画像は描ける
  //   cors が true のときは、別サイトからでも書き出せる形（CORS）での読み込みを試す（検証ページ用）
  function loadImage(src, ms = 8000, cors = false) {
    return new Promise((resolve) => {
      if (!src) return resolve(null);
      const img = new Image();
      if (cors) img.crossOrigin = 'anonymous';
      const t = setTimeout(() => resolve(null), ms);
      img.onload = () => { clearTimeout(t); resolve(img); };
      img.onerror = () => { clearTimeout(t); resolve(null); };
      img.src = src;
    });
  }

  // 枠はすべて直角（角丸なし）
  function roundRect(ctx, x, y, w, h) {
    ctx.beginPath();
    ctx.rect(x, y, w, h);
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

  // 色（#RRGGBB）を白に近づける（t：0〜1。ダーク表示の難易度の色を淡くするのに使う）
  const mixWhite = (hex, t) => {
    const n = parseInt(hex.slice(1), 16);
    const ch = (v) => Math.round(v + (255 - v) * t).toString(16).padStart(2, '0');
    return `#${ch(n >> 16)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
  };

  // 数字を1文字ずつ同じ幅で、右端 xRight にそろえて描く（画面の tnum と同じ幅）。全体の幅を返す
  const digitsWidth = (text, size) => [...text].reduce((w, ch) => w + (ch === '.' ? 0.28 : 0.6) * size, 0);
  function fillDigits(ctx, text, xRight, y, size) {
    const total = digitsWidth(text, size);
    const align = ctx.textAlign;
    ctx.textAlign = 'center';
    let x = xRight - total;
    for (const ch of text) {
      const w = (ch === '.' ? 0.28 : 0.6) * size;
      ctx.fillText(ch, x + w / 2, y);
      x += w;
    }
    ctx.textAlign = align;
    return total;
  }

  // 四角のラベル（塗り＋文字）。幅を返す
  function pill(ctx, x, y, text, { bg, fg, h = 24, size = 13, padX = 9, border = null, align = 'left', font = IMG.num }) {
    ctx.font = `700 ${size}px ${font}`;
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
    if (stars >= 5) return '#FFD86B';
    if (stars >= 3) return '#FF9A4A';
    if (stars >= 1) return '#B5E05A';
    return IMG.panel;
  }

  // options.hideProfile が true なら、プレイヤー名と称号を載せない（アイコンとレートは載せる）
  const rankIconUrl = (name) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(rankIconSvg(name));

  // 画像の形。standard：今までの形（ジャケット大）、compact：ジャケットを小さくして文字を右と下に置く形
  //   どちらも 5列×10行。compact は縦が短く、横は少し広い
  const IMAGE_LAYOUTS = {
    standard: { label: '通常', desc: 'ジャケット大・縦長', cellW: 240, jacket: 224, cellH: 320 },
    compact: { label: 'コンパクト', desc: 'ジャケット小・短め', cellW: 264, jacket: 136, cellH: 184 }, // 横幅は通常より少し広い（1432px）
  };
  const LAYOUT_KEY = 'dxr-image-layout'; // 最後に選んだ形（この端末のブラウザに保存）
  const loadLayout = () => {
    try { const v = localStorage.getItem(LAYOUT_KEY); if (IMAGE_LAYOUTS[v]) return v; } catch { /* 読めない環境では通常 */ }
    return 'standard';
  };
  // 難易度の短い書き方（コンパクトの形で使う）
  const SHORT_DIFF = { BASIC: 'BAS', ADVANCED: 'ADV', EXPERT: 'EXP', MASTER: 'MAS', 'Re:MASTER': 'Re:MAS' };
  // MAX-xx の表記（でらっくスコアが満点なら MAX）
  const maxLabelOf = (s) => (s.cur >= s.max ? 'MAX' : `MAX-${(s.max - s.cur).toLocaleString('en-US')}`);

  // options.layout：画像の形（'standard' / 'compact'。省略時は standard）
  async function buildShareImage(profile, result, jackets, options = {}) {
    const layout = IMAGE_LAYOUTS[options.layout] ? options.layout : 'standard';
    const compact = layout === 'compact';
    // options.compactStyle：配色（省略時は 1）。0：色なし（以前の配色）、1：難易度の色（標準）。
    //   2〜5 は検証ページ用でコンパクトの形だけ（2：ジャケットの色をぼかして背景に、3：右の列を水色・楽曲名を濃い帯に、
    //   4：画像全体の背景を水色に、5：☆の色の枠）。通常の形は 0 か 1 だけ
    const styleNo = Number(options.compactStyle ?? 1);
    const cstyle = compact ? (Number.isInteger(styleNo) && styleNo >= 0 && styleNo <= 5 ? styleNo : 1) : (styleNo === 0 ? 0 : 1);
    // options.nameStyle：コンパクトの形での楽曲名の区切り（検証用。配色 1 のとき）
    //   0：難易度の色の線（2px）、1：淡い1pxの線、2：短いアクセント線、3：下の段を少し濃く、4：点線、
    //   5：楽曲名の左に縦のアクセント、6：楽曲名を枠の外に（縦のアクセントつき）、7：楽曲名を枠の外に（アクセントなし）
    const nameNo = Number(options.nameStyle ?? 5); // 標準は 5（E：楽曲名の左に縦のアクセント）
    const nstyle = compact && cstyle === 1 && Number.isInteger(nameNo) && nameNo >= 0 && nameNo <= 7 ? nameNo : 0;
    const { cols, rows, pad, gap, headH, footH } = IMG;
    const { cellW, jacket: J, cellH } = IMAGE_LAYOUTS[layout];
    const W = pad * 2 + cols * cellW + (cols - 1) * gap;
    const H = pad * 2 + headH + rows * cellH + (rows - 1) * gap + footH;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // フォントの読み込みを待つ（読めなければ端末のフォントで描く）
    try {
      await Promise.all([
        document.fonts.load(`800 20px "Noto Sans JP"`, 'あ'),
        document.fonts.load(`700 20px "Noto Sans JP"`, 'あ'),
        document.fonts.load(`700 20px "Chakra Petch"`, '2fRATE 0123'),
      ]);
    } catch { /* そのまま */ }

    // 画像をまとめて読み込む
    const top = result.top.slice(0, cols * rows);
    const files = top.map((s) => resolveSong(jackets, s.name, s.kind, s.diff, s.level, s.max)?.img);
    const accent = result.bonus?.accent?.[theme] ?? IMG.accent; // オマケで色の指定があればその色（EXPERT は赤）
    const ranked = RANK_MODES.includes(result.mode.id) && !result.bonus; // オマケのレートにはランクを付けない
    const rankImg = ranked ? await loadImage(rankIconUrl(rankOf(result.rating, result.mode.id).name)) : null;
    // 検証ページ用：options.noImages なら画像を読み込まない（灰色の枠）。
    //   options.cors なら書き出せる形での読み込みを試し、だめなら通常の読み込み（表示のみ）にする
    const load = async (src) => {
      if (options.noImages) return null;
      if (!options.cors) return loadImage(src);
      return (await loadImage(src, 8000, true)) ?? loadImage(src);
    };
    const [iconImg, ...jacketImgs] = await Promise.all([
      load(profile.icon),
      ...files.map((f) => load(f ? JACKET_BASE + f : null)),
    ]);

    // 背景
    ctx.fillStyle = (cstyle === 4) ? (theme === 'dark' ? '#0A2236' : '#CDEBF3') : IMG.bg;
    ctx.fillRect(0, 0, W, H);
    // 背景のリング（右上と左下。枠の背面に見える軽いアクセント）
    ctx.save();
    ctx.lineWidth = 2;
    for (let r = 120, k = 0; r <= 760; r += 80, k++) {
      ctx.strokeStyle = k === 3 ? accent : IMG.ring;
      ctx.globalAlpha = k === 3 ? 0.6 : 1;
      ctx.beginPath(); ctx.arc(W, 0, r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = IMG.ring;
    for (let r = 140; r <= 460; r += 80) { ctx.beginPath(); ctx.arc(0, H, r, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();

    // ---- 上部：アイコン・称号・名前・レート ----
    const hx = pad, hy = pad;
    roundRect(ctx, hx, hy, W - pad * 2, headH - 20);
    ctx.fillStyle = IMG.bg;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = IMG.line;
    ctx.stroke();
    ctx.fillStyle = accent; // 上辺のアクセント線
    ctx.fillRect(hx, hy, W - pad * 2, 5);

    const iconSize = 136;
    const ix = hx + 18, iy = hy + (headH - 20 - iconSize) / 2;
    ctx.save();
    roundRect(ctx, ix, iy, iconSize, iconSize, 18);
    ctx.clip();
    if (iconImg) ctx.drawImage(iconImg, ix, iy, iconSize, iconSize);
    else { ctx.fillStyle = IMG.ph; ctx.fillRect(ix, iy, iconSize, iconSize); }
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
          bg: tbg ?? ((x, w) => rainbow(ctx, x, w)), fg: tfg, h: 40, size: 21, padX: 18, font: IMG.font,
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
    ctx.font = `700 23px ${IMG.num}`;
    // 例：2fRATE☆7（オマケのレートは「2fRATE☆7 EXPERTのみ」。色の指定があるオマケはその色で書く）
    if (result.bonus?.accent) ctx.fillStyle = accent;
    ctx.fillText(`2fRATE${result.mode.label.replace("まで", "")}${result.bonus ? ` ${result.bonus.label}のみ` : ''}`, rx, iy + 36);
    ctx.font = `700 80px ${IMG.num}`;
    const rateText = result.rating.toFixed(3);
    if (ranked) {
      // ランクの色で描く（グラデーション。ダーク表示では明るめの同系色）
      const rank = rankOf(result.rating, result.mode.id);
      const tw = digitsWidth(rateText, 80);
      const g = ctx.createLinearGradient(rx - tw, 0, rx, 0);
      const rc = theme === 'dark' ? (rank.dark || rank.colors) : rank.colors;
      rc.forEach((c, i) => g.addColorStop(rc.length > 1 ? i / (rc.length - 1) : 0, c));
      ctx.save();
      ctx.fillStyle = g;
      fillDigits(ctx, rateText, rx, iy + 120, 80);
      ctx.restore();
      // ランクのアイコン（レート値の左）
      if (rankImg) {
        const size = 78;
        ctx.drawImage(rankImg, rx - tw - 12 - size, iy + 120 - 66, size, size);
      }
    } else {
      ctx.fillStyle = accent;
      fillDigits(ctx, rateText, rx, iy + 120, 80);
    }

    // ---- 譜面の一覧（5列×10行。形は layout による） ----
    const gy = pad + headH;
    top.forEach((s, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const x = pad + col * (cellW + gap);
      const y = gy + row * (cellH + gap);

      const OUT = compact && (nstyle === 6 || nstyle === 7); // 楽曲名だけを枠の外に出す（区切り 6・7）
      const boxH = OUT ? J + 16 : cellH;
      roundRect(ctx, x, y, cellW, boxH);
      ctx.fillStyle = IMG.bg;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = IMG.line;
      ctx.stroke();

      // 難易度の色（配色 1）：枠の背景を難易度の色で薄く塗る
      //   Re:MASTER は MASTER と同じ紫にせず、白地（ダークは薄い藤色）に藤色の枠で見分ける（Re:MASTER のラベルと同じ考え方）
      const isReM = s.diff === 'Re:MASTER';
      const DIFF_TINT = DIFF_COLOR[s.diff] ?? '#8A3FD1';
      const RE_LINE = '#B98CF0'; // Re:MASTER の枠と線（白地なので、ダークでもライトと同じ藤色）
      // 枠の中の文字の色。Re:MASTER の枠は白地なので、ダークでもライトの文字色にする
      const P = isReM
        ? { ink: '#12101F', sub: '#55516E', panel: '#E6E7EC', gold: '#8A5A00' }
        : { ink: IMG.ink, sub: IMG.sub, panel: IMG.panel, gold: theme === 'dark' ? '#FFD86B' : '#8A5A00' };
      if (cstyle === 1) {
        if (isReM) {
          ctx.fillStyle = '#FFFFFF'; ctx.fillRect(x + 1, y + 1, cellW - 2, boxH - 2); // ダークでも白地
          ctx.save(); ctx.lineWidth = 2; ctx.strokeStyle = RE_LINE; ctx.strokeRect(x + 1, y + 1, cellW - 2, boxH - 2); ctx.restore();
        } else {
          ctx.save(); ctx.globalAlpha = theme === 'dark' ? 0.32 : 0.14; ctx.fillStyle = theme === 'dark' ? mixWhite(DIFF_TINT, 0.45) : DIFF_TINT; ctx.fillRect(x + 1, y + 1, cellW - 2, boxH - 2); ctx.restore();
        }
        // 通常の形は上端に難易度の色の線（コンパクトの形は、楽曲名との区切りの線を難易度の色にする）
        if (!compact) { ctx.fillStyle = isReM ? RE_LINE : DIFF_TINT; ctx.fillRect(x, y, cellW, 5); }
      }

      // ---- コンパクトの形：ジャケット（左上。種別・難易度を重ねる）、右に 定数・☆・MAX-xx・単曲レート値、下に楽曲名 ----
      if (compact) {
        const jx = x + 8, jy = y + 8;
        const V = cstyle; // コンパクトの配色（検証用。0 が今の配色）
        if (V === 2 && jacketImgs[i]) { // ジャケットの色をぼかして背景に
          const t = document.createElement('canvas'); t.width = 6; t.height = 6; t.getContext('2d').drawImage(jacketImgs[i], 0, 0, 6, 6);
          ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(t, x + 1, y + 1, cellW - 2, cellH - 2);
          ctx.globalAlpha = theme === 'dark' ? 0.5 : 0.55; ctx.fillStyle = IMG.bg; ctx.fillRect(x + 1, y + 1, cellW - 2, cellH - 2); ctx.restore();
        }
        if (V === 3) { // 右の列を水色、楽曲名を濃い帯に
          ctx.fillStyle = theme === 'dark' ? '#123049' : '#D7EEF5'; ctx.fillRect(jx + J + 3, y + 1, x + cellW - 1 - (jx + J + 3), J + 11);
          ctx.fillStyle = theme === 'dark' ? '#2A2550' : '#12101F'; ctx.fillRect(x + 1, jy + J + 4, cellW - 2, y + cellH - 1 - (jy + J + 4));
        }
        if (V === 5) { // ☆の色の枠
          ctx.save(); ctx.lineWidth = 4;
          ctx.strokeStyle = s.stars >= 7 ? rainbow(ctx, x, cellW) : (s.stars >= 1 ? starPillColor(s.stars) : IMG.line);
          ctx.strokeRect(x + 2, y + 2, cellW - 4, cellH - 4); ctx.restore();
        }
        ctx.save();
        roundRect(ctx, jx, jy, J, J);
        ctx.clip();
        if (jacketImgs[i]) ctx.drawImage(jacketImgs[i], jx, jy, J, J);
        else { ctx.fillStyle = IMG.ph; ctx.fillRect(jx, jy, J, J); }
        ctx.restore();
        // ジャケットの上：順位（左上）、下部に DX/ST・難易度（左）
        pill(ctx, jx + 4, jy + 4, `#${i + 1}`, { bg: 'rgba(14,11,31,.9)', fg: '#FFFFFF', h: 22, size: 13, padX: 6 });
        ctx.save();
        roundRect(ctx, jx, jy, J, J);
        ctx.clip();
        const shade = ctx.createLinearGradient(0, jy + J - 48, 0, jy + J);
        shade.addColorStop(0, 'rgba(14,11,31,0)');
        shade.addColorStop(1, 'rgba(14,11,31,.75)');
        ctx.fillStyle = shade;
        ctx.fillRect(jx, jy + J - 48, J, 48);
        ctx.restore();
        const r1 = jy + J - 26;
        if (s.rareAdd > 0 && RARE_MODES.includes(result.mode.id)) {
          pill(ctx, jx + 3, r1 - 24, `希少 +${s.rareAdd.toFixed(2)}`, {
            bg: DARK_INK, fg: '#FFD86B', border: '#FFD86B', h: 21, size: 12, padX: 5, font: IMG.font,
          });
        }
        const isRe = s.diff === 'Re:MASTER';
        let px = jx + 3;
        px += pill(ctx, px, r1, s.kind, { bg: s.kind === 'ST' ? '#1565B0' : '#B8460B', fg: '#FFFFFF', h: 23, size: 13, padX: 5 }) + 2;
        px += pill(ctx, px, r1, SHORT_DIFF[s.diff] ?? s.diff, {
          bg: isRe ? '#FFFFFF' : DIFF_COLOR[s.diff] ?? '#999', fg: isRe ? '#6B2FB3' : '#FFFFFF',
          border: isRe ? '#6B2FB3' : null, h: 23, size: 13, padX: 5,
        });

        // 右の列：1段目 譜面定数と☆、2段目 MAX-xx（どちらも右寄せ）、3段目 単曲レート値（中央）
        const cx0 = jx + J + 8, cx1 = x + cellW - 8;
        const sc = starPillColor(s.stars);
        //   定数と☆は、同じ文字の大きさ・同じ幅の枠にして、文字を枠の中央に置く（どの譜面でも位置がそろう）
        const starText = `☆${starDisplay(s.cur, s.max)}`;
        const constText = `${s.c.toFixed(1)}${s.estimated ? '*' : ''}`;
        ctx.font = `700 14px ${IMG.num}`;
        const boxW = Math.ceil(Math.max(
          ctx.measureText('☆0.0').width, ctx.measureText('00.0').width,
          ctx.measureText(starText).width, ctx.measureText(constText).width)) + 10;
        const box = (xLeft, text, bg, fg) => {
          roundRect(ctx, xLeft, jy + 6, boxW, 24);
          ctx.fillStyle = typeof bg === 'function' ? bg(xLeft, boxW) : bg;
          ctx.fill();
          ctx.font = `700 14px ${IMG.num}`;
          ctx.fillStyle = fg;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(text, xLeft + boxW / 2, jy + 6 + 13);
        };
        box(cx1 - boxW, starText, s.stars >= 7 ? (lx, w) => rainbow(ctx, lx, w) : sc, s.stars >= 1 ? DARK_INK : P.sub);
        box(cx1 - boxW * 2 - 3, constText, (cstyle === 3) ? IMG.bg : P.panel, P.ink);
        ctx.font = `700 17px ${IMG.num}`;
        ctx.fillStyle = s.cur >= s.max ? P.gold : P.sub;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(maxLabelOf(s), cx1, jy + 50);
        const vText = s.values[result.mode.id].toFixed(3);
        ctx.font = `700 28px ${IMG.num}`;
        ctx.fillStyle = P.ink;
        fillDigits(ctx, vText, (cx0 + cx1) / 2 + digitsWidth(vText, 28) / 2, jy + (J + 54) / 2 + 4, 28);
        // ジャケットの下：楽曲名（枠の幅いっぱい。長い場合は末尾を「…」で省略）
        //   上の情報と区切るため、配色 1 では難易度の色の線（2px）、それ以外（3 を除く）は灰色の細い線を引く
        const bandY = jy + J + 4, bandH = y + cellH - 1 - bandY;
        let nameColor = P.ink;
        let nameX = jx;
        let accent = null; // 楽曲名の左の縦のアクセント（区切り 5・6）
        if (cstyle === 1) {
          const lc = isReM ? RE_LINE : DIFF_TINT;
          const L = nstyle;
          if (L === 1) { // A：淡い1pxの線
            ctx.save(); ctx.globalAlpha = 0.45; ctx.fillStyle = lc; ctx.fillRect(x + 8, bandY, cellW - 16, 1); ctx.restore();
          } else if (L === 2) { // B：短いアクセント線
            ctx.fillStyle = lc; ctx.fillRect(x + 8, bandY, 28, 2);
          } else if (L === 3) { // C：下の段だけ少し濃く（2トーン）
            ctx.save(); ctx.globalAlpha = isReM ? (theme === 'dark' ? 0.14 : 0.18) : (theme === 'dark' ? 0.22 : 0.12); ctx.fillStyle = isReM ? RE_LINE : DIFF_TINT;
            ctx.fillRect(x + 1, bandY, cellW - 2, bandH); ctx.restore();
          } else if (L === 4) { // D：点線
            ctx.save(); ctx.globalAlpha = 0.7; ctx.fillStyle = lc;
            for (let dx = x + 8; dx < x + cellW - 8; dx += 6) ctx.fillRect(dx, bandY, 2, 1);
            ctx.restore();
          } else if (L === 6 || L === 7) { // 楽曲名だけを枠の外（下）に出す。6 は縦のアクセントつき
            if (L === 6) { accent = { x, color: lc }; nameX = x + 9; } else nameX = x + 2;
          } else if (L === 5) { // E：楽曲名の左に縦のアクセント
            accent = { x: jx, color: lc }; nameX = jx + 9;
          } else {
            ctx.fillStyle = lc; ctx.fillRect(x + 8, bandY, cellW - 16, 2);
          }
        } else if (cstyle === 3) {
          nameColor = '#FFFFFF';
        } else {
          ctx.fillStyle = IMG.line;
          ctx.fillRect(x + 1, bandY, cellW - 2, 1);
        }
        ctx.font = `700 17px ${IMG.font}`;
        ctx.fillStyle = nameColor;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const nameY = OUT ? y + boxH + (cellH - boxH) / 2 + 1 : bandY + bandH / 2 + 1;
        if (accent) {
          // 縦のアクセントは、楽曲名の文字（漢字の高さ）の上端から下端に合わせる。書体によって文字の上下の位置が違うので、実際に測る
          const m = ctx.measureText('楽');
          const top = nameY - (m.actualBoundingBoxAscent || 8);
          const h = (m.actualBoundingBoxAscent || 8) + (m.actualBoundingBoxDescent || 8);
          ctx.fillStyle = accent.color;
          ctx.fillRect(accent.x, Math.round(top), 3, Math.round(h));
          ctx.fillStyle = nameColor;
        }
        ctx.fillText(fitText(ctx, s.name, cellW - 16 - (nameX - jx)), nameX, nameY);
        return;
      }

      // ---- 通常の形 ----
      // ジャケット
      const jx = x + 8, jy = y + 8;
      ctx.save();
      roundRect(ctx, jx, jy, J, J, 12);
      ctx.clip();
      if (jacketImgs[i]) ctx.drawImage(jacketImgs[i], jx, jy, J, J);
      else { ctx.fillStyle = IMG.ph; ctx.fillRect(jx, jy, J, J); }
      ctx.restore();

      // 順位（ジャケット左上）と MAX-xx（ジャケット右上。満点は金色の MAX）
      pill(ctx, jx + 6, jy + 6, `#${i + 1}`, { bg: 'rgba(14,11,31,.9)', fg: '#FFFFFF', h: 32, size: 18, padX: 11 });
      pill(ctx, jx + J - 6, jy + 6, maxLabelOf(s), {
        bg: 'rgba(14,11,31,.9)', fg: s.cur >= s.max ? '#FFD86B' : '#FFFFFF', h: 32, size: 17, padX: 10, align: 'right',
      });

      // ジャケット下部：DX/ST・難易度（左）、譜面定数（右）
      // 文字が絵柄に埋もれないよう、下側を暗くしてからラベルを置く
      ctx.save();
      roundRect(ctx, jx, jy, J, J, 12);
      ctx.clip();
      const shade = ctx.createLinearGradient(0, jy + J - 68, 0, jy + J);
      shade.addColorStop(0, 'rgba(14,11,31,0)');
      shade.addColorStop(1, 'rgba(14,11,31,.75)');
      ctx.fillStyle = shade;
      ctx.fillRect(jx, jy + J - 68, J, 68);
      ctx.restore();

      const r1 = jy + J - 36;
      // DX/ST・難易度の1つ上の行（左詰め）：希少ボーナス（☆7まで・☆6まで のときだけ）
      if (s.rareAdd > 0 && RARE_MODES.includes(result.mode.id)) {
        pill(ctx, jx + 6, r1 - 32, `希少 +${s.rareAdd.toFixed(2)}`, {
          bg: DARK_INK, fg: '#FFD86B', border: '#FFD86B', h: 28, size: 15, padX: 9, font: IMG.font,
        });
      }
      let px = jx + 6;
      px += pill(ctx, px, r1, s.kind, {
        bg: s.kind === 'ST' ? '#1565B0' : '#B8460B',
        fg: '#FFFFFF', h: 30, size: 15, padX: 8,
      }) + 4;
      const isRe = s.diff === 'Re:MASTER';
      pill(ctx, px, r1, s.diff, {
        bg: isRe ? '#FFFFFF' : DIFF_COLOR[s.diff] ?? '#999', fg: isRe ? '#6B2FB3' : '#FFFFFF',
        border: isRe ? '#6B2FB3' : null, h: 30, size: 15, padX: 8,
      });
      pill(ctx, jx + J - 6, r1, `${s.c.toFixed(1)}${s.estimated ? '*' : ''}`, {
        bg: '#FFFFFF', fg: DARK_INK, h: 30, size: 18, padX: 9, align: 'right',
      });

      // 1段目：楽曲名（長い場合は末尾を「…」で省略）
      const r0 = jy + J + 8;
      ctx.font = `700 20px ${IMG.font}`;
      ctx.fillStyle = P.ink;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(fitText(ctx, s.name, J), jx, r0 + 14);

      // 2段目：☆（左）、単曲レート値（右）
      const r2 = r0 + 36;
      const sc = starPillColor(s.stars);
      pill(ctx, jx, r2, `☆${starDisplay(s.cur, s.max)}`, {
        bg: s.stars >= 7 ? (lx, w) => rainbow(ctx, lx, w) : sc, fg: s.stars >= 1 ? DARK_INK : P.sub, h: 34, size: 19, padX: 12,
      });
      ctx.font = `700 29px ${IMG.num}`;
      ctx.fillStyle = P.ink;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      fillDigits(ctx, s.values[result.mode.id].toFixed(3), jx + J, r2 + 18, 29);
    });

    // ---- 下部：注意書き ----
    const d = new Date();
    const p2 = (v) => String(v).padStart(2, '0');
    const fy = H - pad - footH + 34;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = IMG.ink;
    ctx.font = `700 20px ${IMG.num}`;
    ctx.fillText(`Generated by 2fRATE（${TOOL_URL}）`, pad, fy);
    ctx.fillStyle = IMG.sub;
    ctx.font = `700 17px ${IMG.font}`;
    ctx.fillText('楽曲・ジャケット画像・アイコン画像の著作権は、株式会社セガおよび各権利者に帰属します。', pad, fy + 32);
    ctx.fillText('2fRATE は非公式のファンメイドツールであり、株式会社セガおよび関連会社とは一切関係ありません。', pad, fy + 60);
    ctx.textAlign = 'right';
    ctx.fillText(`作成日時 ${d.getFullYear()}/${p2(d.getMonth() + 1)}/${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`,
      W - pad, fy);
    ctx.fillText(COPYRIGHT, W - pad, fy + 32);

    return canvas;
  }

  // 別タブに画像を表示する（スマホは長押しで保存、PCはダウンロードボタン）
  // 画像の形を選ぶカード用の、1曲ぶんの構成図（文字は省き、色の付いた札と線で位置だけを表す）
  //   色は実際の画像と同じ（DX：橙、MAS：紫、☆：黄）。枠・ジャケット・文字の線は表示（ダーク／ライト）に合わせる
  const LAYOUT_DIAGRAMS = {
    standard: '<svg viewBox="0 0 120 152" width="47" height="60" aria-hidden="true">' +
      '<rect x="0.5" y="0.5" width="119" height="151" style="fill:var(--bg);stroke:var(--line)"/>' +
      '<rect x="6" y="6" width="108" height="108" style="fill:var(--ph)"/>' +
      '<rect x="9" y="9" width="18" height="12" fill="#0E0B1F"/>' +
      '<rect x="79" y="9" width="32" height="12" fill="#0E0B1F"/><rect x="83" y="13.5" width="24" height="3" fill="#FFFFFF"/>' +
      '<rect x="9" y="99" width="14" height="12" fill="#B8460B"/><rect x="25" y="99" width="22" height="12" fill="#8A3FD1"/>' +
      '<rect x="91" y="99" width="20" height="12" fill="#FFFFFF" stroke="#0E0B1F" stroke-width="0.8"/>' +
      '<rect x="7" y="121" width="60" height="6" style="fill:var(--sub)"/>' +
      '<rect x="6" y="134" width="28" height="13" fill="#FFD86B"/>' +
      '<rect x="70" y="134" width="44" height="13" style="fill:var(--ink)"/></svg>',
    compact: '<svg viewBox="0 0 160 100" width="96" height="60" aria-hidden="true">' +
      '<rect x="0.5" y="0.5" width="159" height="99" style="fill:var(--bg);stroke:var(--line)"/>' +
      '<rect x="6" y="6" width="72" height="72" style="fill:var(--ph)"/>' +
      '<rect x="9" y="9" width="16" height="11" fill="#0E0B1F"/>' +
      '<rect x="9" y="64" width="13" height="11" fill="#B8460B"/><rect x="24" y="64" width="20" height="11" fill="#8A3FD1"/>' +
      '<rect x="96" y="8" width="28" height="13" style="fill:var(--panel);stroke:var(--line)"/><rect x="126" y="8" width="28" height="13" fill="#FFD86B"/>' +
      '<rect x="126" y="28" width="28" height="7" style="fill:var(--sub)"/>' +
      '<rect x="95" y="46" width="48" height="14" style="fill:var(--ink)"/>' +
      '<rect x="7" y="86" width="60" height="6" style="fill:var(--sub)"/></svg>',
  };

  // 画像の形を選ぶカード（通常／コンパクト）。get() で選んでいる形を返す
  function layoutPicker() {
    let current = loadLayout();
    const box = el('div', 'dxr-share-layout');
    box.appendChild(el('div', 'dxr-share-layout-label', '画像の形（1曲ぶんの構成）'));
    const cards = el('div', 'dxr-lcards');
    Object.entries(IMAGE_LAYOUTS).forEach(([id, l]) => {
      const b = el('button', 'dxr-lcard');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(id === current));
      b.setAttribute('aria-label', `画像の形：${l.label}（${l.desc}）`);
      const fig = el('span', 'dxr-lcard-fig');
      fig.innerHTML = LAYOUT_DIAGRAMS[id]; // ツール内で作った固定のSVGのみ
      const text = el('span', 'dxr-lcard-text');
      text.append(el('span', 'dxr-lcard-name', l.label), el('span', 'dxr-lcard-desc', l.desc));
      b.append(fig, text);
      b.onclick = () => {
        current = id;
        try { localStorage.setItem(LAYOUT_KEY, id); } catch { /* 保存できない環境では、この画面の間だけ */ }
        cards.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      };
      cards.appendChild(b);
    });
    box.appendChild(cards);
    // α版の検証用：コンパクトの形での楽曲名の区切りを選ぶ（コンパクトを選んでいるときだけ表示）
    const NAME_STYLES = ['難易度の色の線（2px）', '淡い1pxの線', '短いアクセント線', '下の段を少し濃く', '点線',
      '楽曲名の左に縦のアクセント', '楽曲名を枠の外に（縦のアクセントつき）', '楽曲名を枠の外に（アクセントなし）'];
    const nameLab = el('label', 'dxr-field dxr-name-style', '楽曲名の区切り（α版の検証用）');
    const nameSel = el('select', 'dxr-off-select');
    NAME_STYLES.forEach((t, k) => { const o = el('option', '', t); o.value = String(k); nameSel.appendChild(o); });
    nameSel.value = '5'; // 標準は E
    try { const v = localStorage.getItem('dxr-name-style'); if (v && Number(v) >= 0 && Number(v) < NAME_STYLES.length) nameSel.value = v; } catch { /* なし */ }
    nameSel.onchange = () => { try { localStorage.setItem('dxr-name-style', nameSel.value); } catch { /* 保存できなくても続ける */ } };
    nameLab.appendChild(nameSel);
    box.appendChild(nameLab);
    const syncName = () => { nameLab.hidden = current !== 'compact'; };
    cards.querySelectorAll('button').forEach((b) => b.addEventListener('click', syncName));
    syncName();
    return { el: box, get: () => current, opts: () => ({ layout: current, nameStyle: Number(nameSel.value) }) };
  }

  async function openShareImage(profile, result, jackets, button, options = {}) {
    // ポップアップがブロックされないよう、押した瞬間に先にタブを開いておく
    const win = window.open('', '_blank');
    if (win) {
      win.document.title = '2fRATE 画像を作成中…';
      win.document.body.style.cssText = `font-family:sans-serif;padding:20px;background:${themeColors().bg};color:${themeColors().ink};`;
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
        doc.body.style.cssText = `margin:0;padding:12px;background:${themeColors().bg};color:${themeColors().ink};font-family:sans-serif;text-align:center;`;
        doc.body.textContent = '';
        const msg = doc.createElement('p');
        msg.style.cssText = 'margin:4px 0 10px;font-size:14px;';
        msg.textContent = 'スマホは画像を長押しして「写真に保存」、PCは下のボタンから保存できます。';
        const a = doc.createElement('a');
        a.href = url;
        a.download = fileName;
        a.textContent = '画像をダウンロード';
        a.style.cssText = `display:inline-block;margin-bottom:12px;padding:8px 18px;background:${themeColors().accent};color:${themeColors().onAccent};font-weight:bold;text-decoration:none;`;
        const img = doc.createElement('img');
        img.src = url;
        img.alt = '2fRATE レート対象曲';
        img.style.cssText = `max-width:100%;height:auto;border:1px solid ${themeColors().line};`;
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

  // ランキングに送る内容（ユーザー名・PIN／鍵 以外）。登録画面と自動登録の両方で使う
  //   form: { displayName, anonymous, publicTop50, publicAchv }、scored：読み込んだ全譜面（☆6・☆7達成譜面を作るのに使う）
  const iconFileOf = (profile) => (String(profile.icon || '').match(/\/Icon\/([0-9a-f]{16}\.png)/) || [])[1] || '';
  // 送るアイコン：匿名なら空、通常のアイコンはファイル名、カメラで撮影したアイコン（通常のアイコンURLでないもの）は 'camera'
  const iconValueOf = (profile, anonymous) => (anonymous ? '' : (iconFileOf(profile) || 'camera'));
  // ☆6・☆7を達成した MASTER・Re:MASTER の譜面（☆7と☆6は ☆×10 の値で見分ける：70 が☆7、60〜69 が☆6）
  //   1譜面 = [曲名, DX/ST, 3（MASTER）/4（Re:MASTER）, 譜面定数, スコア, 最大値, ☆×10, 定数が概算なら1]
  function achvOf(scored) {
    const list = (scored || [])
      .filter((s) => COUNT_DIFFS.includes(s.diff) && s.stars >= 6)
      .map((s) => [s.name, s.kind === 'ST' ? 'ST' : 'DX', s.diff === 'Re:MASTER' ? 4 : 3, Math.round(s.c * 10) / 10,
        s.cur, s.max, starTenths(s.cur, s.max), s.estimated ? 1 : 0]);
    return { v: 2, list };
  }

  function buildSubmitBody(profile, results, counts, form, scored) {
    const full = results.find((r) => r.mode.id === 'full');
    const cap6 = results.find((r) => r.mode.id === 'cap6');
    const cap5 = results.find((r) => r.mode.id === 'cap5');
    const round3 = (v) => Math.round(v * 1000) / 1000;
    // レート対象曲（上位50譜面）を送る形にする。value はそのレートでの単曲レート値
    const frameOf = (res) => res.top.map((t) => ({
      name: t.name,
      kind: t.kind,
      diff: t.diff,
      level: t.level,
      const: t.c,
      estimated: !!t.estimated,
      score: t.cur,
      max: t.max,
      star: Math.round(starTenths(t.cur, t.max)) / 10,
      value: round3(t.values[res.mode.id]),
      rare: RARE_MODES.includes(res.mode.id) ? t.rareAdd || 0 : 0, // 希少ボーナス（value に含まれている）
    }));
    return {
      action: 'submit',
      displayName: form.displayName,
      anonymous: !!form.anonymous,
      showIcon: !form.anonymous,
      publicTop50: !!form.publicTop50,
      publicAchv: form.publicAchv !== false,
      icon: iconValueOf(profile, form.anonymous),
      rateFull: round3(full.rating),
      rateCap6: round3(cap6.rating),
      rateCap5: round3(cap5.rating),
      rank: rankOf(full.rating, 'full').name,
      constVersion: (CONST_URL.match(/maimai_consts_([^/]+)\.json/) || [])[1] || '',
      formulaVersion: FORMULA_VERSION,
      rankCap6: rankOf(cap6.rating, 'cap6').name,
      rankCap5: rankOf(cap5.rating, 'cap5').name,
      // ☆7・☆6・☆5 を達成した MASTER / Re:MASTER の譜面数
      counts: counts || null,
      // レート対象曲（上位50譜面）：top50 は☆7まで、top50Cap6・top50Cap5 は☆6まで・☆5まで
      top50: frameOf(full),
      top50Cap6: frameOf(cap6),
      top50Cap5: frameOf(cap5),
      // ☆6・☆7達成譜面（公開するかは publicAchv）
      achievements: achvOf(scored),
    };
  }

  // このブラウザに保存する設定（maimaiでらっくすNET のサイト内だけ。サーバーには送らない）
  //   FORM_KEY：表示名・匿名・ベスト枠の公開、AUTO_KEY：自動登録 { username, token }（PINは保存しない）
  const AUTO_KEY = 'dxr-auto-upload';
  const loadJson = (key) => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
  const saveJson = (key, v) => { try { if (v === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(v)); } catch { /* 保存できない環境 */ } };

  function openRankingDialog(root, profile, results, counts, scored) {
    const full = results.find((r) => r.mode.id === 'full');
    const cap6 = results.find((r) => r.mode.id === 'cap6');
    const cap5 = results.find((r) => r.mode.id === 'cap5');
    const iconFile = iconFileOf(profile);
    const rankName = rankOf(full.rating, 'full').name;
    const rankCap6 = rankOf(cap6.rating, 'cap6').name;
    const rankCap5 = rankOf(cap5.rating, 'cap5').name;

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
    // 前回の登録で入力した表示名など（このブラウザの中だけに保存。サーバーには送らない）
    let savedForm = {};
    try { savedForm = JSON.parse(localStorage.getItem(FORM_KEY) || '{}') || {}; } catch { savedForm = {}; }

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
      const name = field('表示名', 'text', prev.displayName ?? (typeof savedForm.displayName === 'string' && savedForm.displayName ? savedForm.displayName : (profile.name || '')),
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
      const anon = check('匿名で掲載する（表示名の代わりに「匿名#記号」で表示し、アイコンも初期アイコンにします）', prev.anonymous ?? (savedForm.anonymous === true));
      const pub = check('ベスト枠（3種類のレートそれぞれのレート対象曲50譜面）をランキングで公開する', prev.publicTop50 ?? (typeof savedForm.publicTop50 === 'boolean' ? savedForm.publicTop50 : true));
      const pubAchv = check('☆6・☆7達成譜面（MASTER・Re:MASTER のスコアと☆）をランキングで公開する', prev.publicAchv ?? (typeof savedForm.publicAchv === 'boolean' ? savedForm.publicAchv : true));
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

      // ユーザー名とPINが入力し終わった時点で、裏側で先に確認を始めておく（「内容を確認」を押したときの待ち時間を減らす）
      let pre = null; // { key, promise }
      const prefetch = () => {
        const u = user.value.trim().toLowerCase();
        const p = pin.value.trim();
        if (!/^[a-z0-9_]{3,16}$/.test(u) || !/^\d{4,8}$/.test(p)) return;
        const key = u + '\n' + p;
        if (pre && pre.key === key) return;
        pre = { key, promise: callRanking({ action: 'check', username: u, pin: p }).catch(() => null) };
      };
      let preTimer = null;
      [user, pin].forEach((input) => {
        input.addEventListener('input', () => { clearTimeout(preTimer); preTimer = setTimeout(prefetch, 600); });
        input.addEventListener('change', prefetch);
      });
      prefetch(); // 前回のユーザー名が入っていて、PINも入っている場合など

      next.onclick = async () => {
        const form = {
          username: user.value.trim().toLowerCase(),
          pin: pin.value.trim(),
          displayName: name.value.trim(),
          anonymous: anon.cb.checked,
          showIcon: !anon.cb.checked, // 匿名のときはアイコンも送らない（初期アイコンで表示）
          publicTop50: pub.cb.checked,
          publicAchv: pubAchv.cb.checked,
        };
        if (!/^[a-z0-9_]{3,16}$/.test(form.username)) { err.textContent = 'ユーザー名は英数字とアンダーバーで3〜16文字にしてください。'; return; }
        if (!/^\d{4,8}$/.test(form.pin)) { err.textContent = 'PINは数字4〜8桁にしてください。'; return; }
        if (!form.anonymous && !form.displayName) { err.textContent = '表示名を入力するか、匿名で掲載を選んでください。'; return; }
        next.disabled = true;
        err.textContent = '確認中…';
        try {
          // 先に始めておいた確認が使えればそれを使い、なければここで確認する
          const key = form.username + '\n' + form.pin;
          let r = pre && pre.key === key ? await pre.promise : null;
          if (!r || (!r.ok && r.busy)) {
            r = await callRanking({ action: 'check', username: form.username, pin: form.pin },
              () => { err.textContent = '混み合っているため、送り直しています…'; });
          }
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
          ? 'ランキングには次の内容と、ベスト枠（☆7まで・☆6まで・☆5まで それぞれのレート対象曲50譜面）が公開されます（匿名の場合、アイコンは初期アイコンで表示されます）。ユーザー名とPINは公開されません。'
          : 'ランキングには次の内容が公開されます（匿名の場合、アイコンは初期アイコンで表示されます）。ベスト枠は管理者の確認用に送信されますが、公開はされません。ユーザー名とPINは公開されません。'),
        el('p', '', form.publicAchv
          ? '☆6・☆7を達成した MASTER・Re:MASTER の譜面（スコアと☆）も公開されます。'
          : '☆6・☆7達成譜面は送信されますが、公開はされません（マイページの設定でいつでも公開に切り替えられます）。'));

      const pv = el('div', 'dxr-preview');
      if (form.showIcon && iconFile) {
        const img = el('img');
        img.src = profile.icon;
        img.alt = '';
        pv.appendChild(img);
      } else if (form.showIcon) {
        // カメラで撮影したアイコンはランキングではカメラマークで表示する（写真そのものは送らない）
        const ph = el('div', 'ph');
        ph.innerHTML = '<svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true">' +
          '<rect width="64" height="64" style="fill:var(--ph)"/>' +
          '<path d="M24 19l3-5h10l3 5h7a5 5 0 0 1 5 5v19a5 5 0 0 1-5 5H17a5 5 0 0 1-5-5V24a5 5 0 0 1 5-5z" style="fill:var(--sub)"/>' +
          '<circle cx="32" cy="33" r="9" style="fill:var(--ph)"/><circle cx="32" cy="33" r="5.5" style="fill:var(--sub)"/></svg>';
        ph.style.overflow = 'hidden';
        pv.appendChild(ph);
      } else {
        pv.appendChild(el('div', 'ph'));
      }
      const tx = el('div');
      tx.append(
        el('div', 'nm', form.anonymous ? `匿名#${check.anonCode}` : form.displayName),
        el('div', 'rt', `☆7まで ${full.rating.toFixed(3)}（${rankName}）／☆6まで ${cap6.rating.toFixed(3)}（${rankCap6}）／☆5まで ${cap5.rating.toFixed(3)}（${rankCap5}）`)
      );
      if (counts) {
        tx.appendChild(el('div', 'rt',
          [7, 6, 5].map((n) => {
            const mas = counts[`star${n}Mas`], re = counts[`star${n}Remas`];
            return `☆${n}達成 ${mas + re}譜面（MAS ${mas}／Re:MAS ${re}）`;
          }).join('・')));
      }
      pv.appendChild(tx);
      dlg.appendChild(pv);
      if (form.showIcon && !iconFile) dlg.appendChild(el('p', '', 'カメラで撮影した写真をアイコンにしている場合、ランキングではカメラマークで表示されます（写真は送信されません）。'));
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
            ...buildSubmitBody(profile, results, counts, form, scored),
            username: form.username,
            pin: form.pin,
          }, () => { err.textContent = '混み合っているため、送り直しています…'; });
          if (!r.ok) {
            err.textContent = r.error || '登録できませんでした。';
            send.disabled = false;
            back.disabled = false;
            return;
          }
          try {
            localStorage.setItem(USER_KEY, form.username);
            localStorage.setItem(FORM_KEY, JSON.stringify({
              displayName: form.displayName, anonymous: form.anonymous, publicTop50: form.publicTop50, publicAchv: form.publicAchv,
            }));
          } catch { /* 保存できない環境では何もしない */ }
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
      const st = stats.get(`${s.name}|${s.kind}|${s.diff}|${s.max}`);
      const newValue = (s.c * s.c * targetStars) / RATE_DIVISOR + (targetTenths >= 70 ? MAX_BONUS : 0)
        + (targetTenths >= 60 ? rareOf(st).add : 0); // ☆6以上で希少ボーナス
      const gain = inTop.has(s) ? (newValue - s.values.full) / TOP_N : Math.max(0, newValue - value50) / TOP_N;
      if (gain <= 0) continue;
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
    return recommendListEl(buildRecommendations(all, top, stats, rating).slice(0, RECOMMEND_COUNT), jackets, rating);
  }

  // 前回のおすすめ楽曲をこのブラウザに保存しておく（次に起動したとき、計算する前にマイページで見られるように）
  //   保存するのは表示に使う項目だけ（上位 RECOMMEND_COUNT 件）。プレイヤー名も残し、別のプレイヤーの結果は出さない
  const LAST_REC_KEY = 'dxr-last-recommend';
  function saveLastRecommend(profile, run) {
    const full = run.results.find((r) => r.mode.id === 'full');
    const recs = buildRecommendations(run.scored, full.top, run.stats, full.rating).slice(0, RECOMMEND_COUNT);
    const d = new Date();
    const p2 = (v) => String(v).padStart(2, '0');
    saveJson(LAST_REC_KEY, {
      player: profile.name || '',
      date: `${d.getFullYear()}/${p2(d.getMonth() + 1)}/${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`,
      rating: full.rating,
      recs: recs.map((r) => ({
        s: { name: r.s.name, kind: r.s.kind, diff: r.s.diff, level: r.s.level, max: r.s.max, cur: r.s.cur, c: r.s.c, estimated: !!r.s.estimated },
        inTop: r.inTop, now: r.now, targetTenths: r.targetTenths, needScore: r.needScore, rest: r.rest,
        newValue: r.newValue, gain: r.gain, ease: r.ease,
      })),
    });
  }

  function recommendListEl(recs, jackets, rating) {
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
      const shown = recs;
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
        right.append(tnum(el('div', 'dxr-rec-plus', `+${r.gain.toFixed(3)}`)), tnum(el('div', 'dxr-rec-sub', `単曲 ${r.newValue.toFixed(3)}`)));
        row.append(el('div', 'dxr-rank', String(i + 1)), jacket, main, right);
        list.appendChild(row);
      });
      listBox.replaceChildren(list);
    }
    render();
    return box;
  }

  // results: [{ mode, rating, top }, ...]
  // プレイヤー情報（maimaiでらっくすNET のアイコン・称号・プレイヤー名）。caption は名前の上の小さな見出し（省略可）
  function profileEl(ui, profile, caption) {
    const player = el('div', 'dxr-profile');
    if (profile.icon) {
      const icon = el('img', 'dxr-icon');
      icon.src = profile.icon;
      icon.alt = '';
      icon.onerror = () => icon.remove();
      player.appendChild(icon);
    }
    const text = el('div', 'dxr-profile-text');
    if (caption) text.appendChild(el('div', 'dxr-card-desc dxr-profile-caption', caption));
    if (profile.trophy) {
      const root = ui.body.getRootNode();
      const officialCss = profile.trophyEl ? extractOfficialCss(profile.trophyEl) : '';
      if (officialCss) {
        // 公式の称号をそのまま複製し、取り出した公式CSSで表示する（CSSは画面に1回だけ入れる）
        if (!root.getElementById?.('dxr-trophy-css')) {
          const style = el('style');
          style.id = 'dxr-trophy-css';
          style.textContent = officialCss;
          root.appendChild(style);
        }
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
    return player;
  }

  function renderResult(ui, profile, results, info, jackets, extras = {}) {
    // プレイヤー情報：アイコン / 称号 / 名前
    const bonus = extras.bonus || null; // オマケのレート（対象を絞った計算）のとき
    const bc = extras.bonusCounts || null; // オマケの達成譜面数
    const player = profileEl(ui, profile, bonus ? `オマケ：${bonus.title}` : undefined);

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
          const value = tnum(el('span', 'dxr-plate-value', rating.toFixed(3)));
          if (RANK_MODES.includes(mode.id) && !bonus) {
            const rank = rankOf(rating, mode.id);
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
        el('span', 'dxr-plate-hint', '')
      );
      b.onclick = () => select(i);
      plates.appendChild(b);
      return b;
    });
    let selected = 0;
    const shareBtn = el('button', 'dxr-share', '');
    shareBtn.type = 'button';
    // 一覧の上にも同じ切り替えを置く（どのレートの表を見ているか、すぐ分かるように）
    const listHead = el('div', 'dxr-list-head');
    const listTitle = el('span', 'dxr-list-title', '');
    const listTabs = el('div', 'dxr-tabs');
    const listTabBtns = results.map(({ mode }, i) => {
      const t = el('button', 'dxr-tab dxr-tab-sm', mode.label);
      t.type = 'button';
      t.onclick = () => select(i);
      listTabs.appendChild(t);
      return t;
    });
    listHead.append(listTitle, listTabs);
    function select(i) {
      selected = i;
      lists.forEach((l, j) => { l.style.display = i === j ? '' : 'none'; });
      buttons.forEach((b, j) => {
        b.setAttribute('aria-pressed', String(i === j));
        b.querySelector('.dxr-plate-hint').textContent = i === j ? '▼ 表示中' : '押して切り替え';
      });
      listTabBtns.forEach((t, j) => t.setAttribute('aria-pressed', String(i === j)));
      listTitle.textContent = `「${results[i].mode.label}」のレート対象曲`;
      shareBtn.textContent = `「${results[i].mode.label}」のレート対象曲を画像にする`;
    }
    select(0);
    // 画像にプレイヤー名と称号を載せるかの切り替え（両方表示 / 両方非表示）
    const showLabel = el('label', 'dxr-share-opt');
    const showCb = el('input');
    showCb.type = 'checkbox';
    showCb.checked = true;
    showLabel.append(showCb, document.createTextNode('画像にプレイヤー名と称号を載せる'));
    const layoutSel = layoutPicker();
    shareBtn.onclick = () =>
      openShareImage(profile, results[selected], jackets, shareBtn, { hideProfile: !showCb.checked, ...layoutSel.opts() });

    const hasEst = results.some(({ top }) => top.some((s) => s.estimated));
    const note = el('p', 'dxr-note',
      `${info}。` +
      (bonus ? `オマケのレートです（${bonus.desc}）。計算式は通常のレートと同じで、ランクの表示・ランキング登録・おすすめ楽曲はありません。` : '') +
      (bc ? `達成譜面数は、プレイ済みの ${bonus.countDiff} 譜面（${bc.total} 譜面）から数えています（☆6達成は☆7を、☆5達成は☆6・☆7を含みます）。` : '') +
      (hasEst ? '定数の * は定数表にない譜面で、レベル表示からの概算値（下限）です。' : '') +
      '☆の小数は次の☆までの進み具合で、計算には0.5倍の重みで反映します。' +
      '「☆6まで」は☆7を☆6として、「☆5まで」は☆6以上を☆5として計算しています。' +
      'どのレートも、☆が上限（☆7・☆6・☆5）に達した譜面には +0.1 されます。' +
      '「☆7まで」「☆6まで」では、全国ランキング上位100人のうち☆6以上が20人以下の譜面を☆6以上で達成すると、希少ボーナス（20人以下 +0.05、10人以下 +0.10、3人以下 +0.15）が加わります。' +
      (jackets ? '' : 'ジャケット画像の対応表を読み込めなかったため、画像は表示していません。') +
      `${COPYRIGHT}。2fRATE のプログラム・デザイン・ロゴの無断転載・無断使用を禁じます。`);

    // ランキングに登録（☆7まで・☆6まで・☆5まで の3つのレートを送る）
    const rankBtn = el('button', 'dxr-rank-open', 'ランキングに登録・更新する');
    rankBtn.type = 'button';
    rankBtn.onclick = () => openRankingDialog(ui.body.getRootNode(), profile, results, extras.counts, extras.all);

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

    // ☆7・☆6・☆5達成譜面数（MASTER・Re:MASTER の合計と内訳）
    const counts = extras.counts;
    const countBox = el('div', 'dxr-counts');
    if (counts) {
      [
        { stars: 7, label: '達成', mas: counts.star7Mas, re: counts.star7Remas },
        { stars: 6, label: '達成', mas: counts.star6Mas, re: counts.star6Remas },
        { stars: 5, label: '達成', mas: counts.star5Mas, re: counts.star5Remas },
      ].forEach((c) => {
        const card = el('div', 'dxr-count');
        const head = el('div', 'dxr-count-head');
        head.append(el('span', `dxr-star-pill ${starClass(c.stars)}`, `☆${c.stars}`), document.createTextNode(c.label));
        const num = el('div', 'dxr-count-num', String(c.mas + c.re));
        num.appendChild(el('small', '', '譜面'));
        const sub = el('div', 'dxr-count-sub');
        sub.append(el('span', '', `MAS ${c.mas}`), document.createTextNode(' ／ '), el('span', '', `Re:MAS ${c.re}`));
        card.append(head, num, sub);
        countBox.appendChild(card);
      });
    }

    // オマケの達成譜面数（対象の難易度の全譜面から数えたもの）
    if (bc) {
      [[7, bc.star7], [6, bc.star6], [5, bc.star5]].forEach(([stars, n]) => {
        const card = el('div', 'dxr-count');
        const head = el('div', 'dxr-count-head');
        head.append(el('span', `dxr-star-pill ${starClass(stars)}`, `☆${stars}`), document.createTextNode('達成'));
        const num = el('div', 'dxr-count-num', String(n));
        num.appendChild(el('small', '', '譜面'));
        card.append(head, num, el('div', 'dxr-count-sub', `${bonus.countDiff} ${bc.total} 譜面中`));
        countBox.appendChild(card);
      });
    }

    const platesCaption = el('p', 'dxr-plates-caption', '3種類のレートを計算しました。押すと、下の表と画像化するレートが切り替わります。');
    ui.body.append(player, platesCaption, plates, ...(counts || bc ? [countBox] : []), layoutSel.el, shareBtn, showLabel,
      ...(bonus ? [] : [rankBtn, ...(SHOW_RECOMMEND ? [recBtn] : [])]), listHead, ...lists, note);
  }

  // ============================================================
  //  マイページ
  // ============================================================

  const GENRE_URL = (d) => `/maimai-mobile/record/musicGenre/search/?genre=99&diff=${d}`; // 全ジャンル（d：3=MASTER, 4=Re:MASTER）
  const RARE_PAGE_SIZE = 20; // 達成人数の一覧を何件ずつ表示するか
  const FAV_DIFFS = ['BASIC', 'ADVANCED', 'EXPERT', 'MASTER', 'Re:MASTER'];

  // ランキングは上位100人までしか載らないので、100人目まで埋まっている譜面は「100人以上」の可能性がある（譜面データビューアと同じ扱い）
  const statFull = (r) => r.count >= 100 && r.max && r.row100 !== null && r.row100 !== undefined;
  const PEOPLE_METRICS = [
    {
      id: 'max', label: '☆7', need: 7,
      desc: '自分が☆7（理論値）を達成した譜面と、全国ランキング上位100人で☆7を達成している人数',
      people: (r) => (r.maxCount === null || r.maxCount === undefined ? null : r.maxCount),
      plus: (r) => statFull(r) && r.row100 === r.max,
    },
    {
      id: 'star6', label: '☆6以上', need: 6,
      desc: '自分が☆6以上を達成した譜面と、全国ランキング上位100人で☆6以上（☆7を含む）を達成している人数',
      people: (r) => (r.star6Count === null || r.star6Count === undefined || r.maxCount === null || r.maxCount === undefined
        ? null : r.star6Count + r.maxCount),
      plus: (r) => statFull(r) && r.row100 * 100 >= r.max * 99,
    },
  ];

  // 自分の MASTER・Re:MASTER の全譜面を読み込み、指標ごとに達成人数の少ない譜面を選ぶ
  async function findRareCharts(onStatus) {
    const statsPromise = loadRankingStats(LEVEL_MAX, COUNT_MIN_LEVEL); // 全国ランキングの集計（Lv10+〜Lv15）
    const jacketPromise = loadJacketMap();
    const mine = [];
    for (const [i, d] of [[0, 3], [1, 4]]) {
      onStatus(`${d === 3 ? 'MASTER' : 'Re:MASTER'} の全楽曲を取得中…（${i + 1} / 2ページ目）`);
      if (i > 0) await sleep(WAIT_MS);
      const res = await fetch(GENRE_URL(d), { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`${d === 3 ? 'MASTER' : 'Re:MASTER'} の取得に失敗しました (HTTP ${res.status})`);
      mine.push(...parsePage(await res.text(), 0).filter((s) => COUNT_DIFFS.includes(s.diff)));
    }
    onStatus('全国ランキングの集計と照らし合わせています…');
    const [stats, jackets] = await Promise.all([statsPromise, jacketPromise]);
    const lists = {};
    for (const m of PEOPLE_METRICS) {
      const rows = [];
      for (const s of mine) {
        const stars = starsOf(s.cur, s.max);
        if (stars < m.need) continue;
        const st = stats.get(`${s.name}|${s.kind}|${s.diff}|${s.max}`);
        if (!st) continue;
        const people = m.people(st);
        if (people === null) continue;
        const plus = m.plus(st);
        const lv = st.level || s.level;
        // 定数（集計にないときはレベル表記の下限。14+ なら 14.6）
        const cf = st.const ?? (parseInt(lv, 10) + (String(lv).endsWith('+') ? 0.6 : 0));
        rows.push({ ...s, level: lv, c: st.const ?? null, cf, stars, people, plus, sort: people + (plus ? 0.5 : 0) });
      }
      // 人数の少ない順。同じ人数なら定数の高い順
      rows.sort((a, b) => a.sort - b.sort || (b.c ?? 0) - (a.c ?? 0) || a.name.localeCompare(b.name, 'ja'));
      lists[m.id] = rows; // 達成した譜面すべて（表示は20件ずつ）
    }
    return { lists, jackets, scanned: mine.length };
  }

  function rareListEl(rows, metric, jackets, start = 0) {
    const list = el('div', 'dxr-list');
    if (!rows.length) {
      list.appendChild(el('div', 'dxr-rec-empty', `${metric.label}を達成した譜面のうち、全国ランキングの集計がある譜面（Lv10+以上）はまだありません。`));
      return list;
    }
    rows.forEach((s, i) => {
      const row = el('div', 'dxr-rec-row');
      const song = resolveSong(jackets, s.name, s.kind, s.diff, s.level, s.max);
      let jacket;
      if (song?.img) {
        jacket = el('img', 'dxr-jacket');
        jacket.src = JACKET_BASE + song.img;
        jacket.alt = '';
        jacket.loading = 'lazy';
        jacket.onerror = () => { jacket.removeAttribute('src'); };
      } else {
        jacket = el('div', 'dxr-jacket');
      }
      const main = el('div');
      const nameEl = el('div', 'dxr-name', s.name);
      if (song?.genre) nameEl.appendChild(el('span', 'dxr-genre', `（${song.genre}）`));
      const meta = el('div', 'dxr-meta');
      meta.append(
        el('span', `dxr-chip dxr-kind-${s.kind === '?' ? 'unknown' : s.kind}`, s.kind),
        el('span', `dxr-chip dxr-diff-${s.diff.replace(':', '').toUpperCase()}`, s.diff),
        el('span', 'dxr-chip dxr-const', s.c ? s.c.toFixed(1) : `Lv${s.level}`)
      );
      const pill = el('span', `dxr-star-pill ${starClass(s.stars)}`, `☆${starDisplay(s.cur, s.max)}`);
      pill.style.marginLeft = '2px';
      meta.appendChild(pill);
      main.append(nameEl, meta);
      const gain = el('div', 'dxr-rec-gain');
      gain.append(el('div', 'dxr-rec-plus', `${s.people}${s.plus ? '+' : ''}人`), el('div', 'dxr-rec-sub', `上位100人中の${metric.label}`));
      row.append(el('div', 'dxr-rank', String(start + i + 1)), jacket, main, gain);
      list.appendChild(row);
    });
    return list;
  }

  // ページ切り替え：« 前へ  1 … 4 5 [6] 7 8 … 20  次へ »（onGo にページ番号を渡す）
  function pagerEl(page, total, onGo) {
    const nav = el('div', 'dxr-pager');
    if (total <= 1) return nav;
    const btn = (label, n, opts = {}) => {
      const b = el('button', opts.current ? 'is-on' : '', label);
      b.type = 'button';
      if (opts.disabled || opts.current) b.disabled = true;
      else b.onclick = () => onGo(n);
      return b;
    };
    nav.appendChild(btn('« 前へ', page - 1, { disabled: page === 1 }));
    const nums = new Set([1, total]);
    for (let n = page - 2; n <= page + 2; n++) if (n >= 1 && n <= total) nums.add(n);
    let prev = 0;
    [...nums].sort((a, b) => a - b).forEach((n) => {
      if (n - prev > 1) nav.appendChild(el('span', 'gap', '…'));
      nav.appendChild(btn(String(n), n, { current: n === page }));
      prev = n;
    });
    nav.appendChild(btn('次へ »', page + 1, { disabled: page === total }));
    return nav;
  }

  // 達成人数の一覧のカード（達成した譜面すべてを、人数の少ない順／多い順で20件ずつ）
  function rareCard() {
    const card = el('section', 'dxr-card');
    card.append(el('h3', '', '達成人数で見る自分の達成譜面'),
      el('p', 'dxr-card-desc', '自分が達成した譜面を、全国ランキング上位100人で同じく達成している人数の順に表示します。MASTER・Re:MASTER の全楽曲（2ページ）を読み込みます。人数は譜面データビューアと同じ集計（Lv10+以上）を使います。'));
    const btn = el('button', 'dxr-rank-open', '集計する');
    btn.type = 'button';
    btn.style.margin = '4px 0 0';
    const msg = el('p', 'dxr-status');
    const out = el('div');
    card.append(btn, msg, out);
    btn.onclick = async () => {
      btn.disabled = true;
      out.replaceChildren();
      msg.classList.remove('is-error');
      try {
        const { lists, jackets, scanned } = await findRareCharts((t) => { msg.textContent = t; });
        msg.textContent = `${scanned} 譜面から集計しました。`;
        const tabs = el('div', 'dxr-tabs');
        const order = el('div', 'dxr-tabs dxr-order');
        const kindTabs = el('div', 'dxr-tabs dxr-order');
        const crange = el('div', 'dxr-ptabs dxr-crange');
        let kind = '*'; // '*'：すべて / 'DX' / 'ST'
        let cMin = null;
        let cMax = null;
        const allRows = [...lists.max, ...lists.star6].map((r) => r.cf).filter(Number.isFinite);
        const cLo = allRows.length ? Math.min(...allRows) : 10;
        const cHi = allRows.length ? Math.max(...allRows) : 15;
        const cOpts = [];
        for (let v = Math.round(cLo * 10); v <= Math.round(cHi * 10); v++) cOpts.push(v / 10);
        const renderRange = () => {
          const mk = (value, label, onChange) => {
            const sel = el('select');
            sel.setAttribute('aria-label', label);
            cOpts.forEach((v) => { const o = el('option', '', v.toFixed(1)); o.value = String(v); sel.appendChild(o); });
            sel.value = String(value);
            sel.onchange = () => { onChange(Number(sel.value)); page = 1; show(); };
            return sel;
          };
          const reset = el('button', 'dxr-ptab', '指定なし');
          reset.type = 'button';
          reset.setAttribute('aria-pressed', String(cMin === null && cMax === null));
          reset.onclick = () => { cMin = null; cMax = null; page = 1; show(); };
          crange.replaceChildren(el('span', 'dxr-crange-label', '譜面定数'),
            mk(cMin ?? cLo, '譜面定数の下限', (v) => { cMin = v; if (cMax !== null && cMax < v) cMax = v; }),
            el('span', 'dxr-crange-sep', '〜'),
            mk(cMax ?? cHi, '譜面定数の上限', (v) => { cMax = v; if (cMin !== null && cMin > v) cMin = v; }),
            reset);
        };
        const desc = el('p', 'dxr-card-desc');
        const holder = el('div');
        let metric = PEOPLE_METRICS[0];
        let asc = true; // true：少ない順、false：多い順
        let page = 1;
        const show = () => {
          [...tabs.children].forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === metric.id)));
          [...order.children].forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.asc === '1') === asc)));
          [...kindTabs.children].forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.kind === kind)));
          renderRange();
          // DX/ST と譜面定数の範囲で絞り込む
          const base = lists[metric.id].filter((r) => (kind === '*' || r.kind === kind)
            && (cMin === null || r.cf >= cMin - 1e-9) && (cMax === null || r.cf <= cMax + 1e-9));
          // 多い順でも、同じ人数なら定数の高い順にする
          const all = asc ? base
            : [...base].sort((x, y) => y.sort - x.sort || (y.c ?? 0) - (x.c ?? 0) || x.name.localeCompare(y.name, 'ja'));
          const total = Math.max(1, Math.ceil(all.length / RARE_PAGE_SIZE));
          page = Math.min(Math.max(page, 1), total);
          const start = (page - 1) * RARE_PAGE_SIZE;
          const shown = all.slice(start, start + RARE_PAGE_SIZE);
          desc.textContent = `${metric.desc}（${all.length} 譜面${all.length > RARE_PAGE_SIZE ? `中 ${start + 1}〜${start + shown.length} 件目` : ''}）`;
          const go = (n) => { page = n; show(); desc.scrollIntoView({ block: 'start' }); };
          holder.replaceChildren(pagerEl(page, total, go), rareListEl(shown, metric, jackets, start), pagerEl(page, total, go));
        };
        PEOPLE_METRICS.forEach((m) => {
          const b = el('button', 'dxr-tab', m.label);
          b.type = 'button';
          b.dataset.id = m.id;
          b.onclick = () => { metric = m; page = 1; show(); };
          tabs.appendChild(b);
        });
        [['1', '少ない順'], ['0', '多い順']].forEach(([v, label]) => {
          const b = el('button', 'dxr-tab dxr-tab-sm', label);
          b.type = 'button';
          b.dataset.asc = v;
          b.onclick = () => { asc = v === '1'; page = 1; show(); };
          order.appendChild(b);
        });
        [['*', 'DX・ST'], ['DX', 'DXのみ'], ['ST', 'STのみ']].forEach(([v, label]) => {
          const b = el('button', 'dxr-tab dxr-tab-sm', label);
          b.type = 'button';
          b.dataset.kind = v;
          b.onclick = () => { kind = v; page = 1; show(); };
          kindTabs.appendChild(b);
        });
        out.append(tabs, order, kindTabs, crange, desc, holder);
        show();
        btn.textContent = 'もう一度集計する';
      } catch (e) {
        msg.textContent = 'エラー: ' + e.message;
        msg.classList.add('is-error');
        console.error(e);
      } finally {
        btn.disabled = false;
      }
    };
    return card;
  }

  // お気に入り譜面の候補：定数表に載っている譜面（＝実在する譜面の組み合わせ）を一覧にする
  //   定数からレベル表記（14 / 14+ など）を出す。同名の別曲は「|最大値」つきのキーで別々に入っている
  const FAV_PAGE_SIZE = 50;
  const levelLabelOf = (c) => {
    const base = Math.floor(c + 1e-9);
    return base >= 7 && c - base >= 0.6 - 1e-9 ? `${base}+` : String(base);
  };
  let favChartsPromise = null;
  function loadFavCharts() {
    if (!favChartsPromise) {
      favChartsPromise = Promise.all([
        fetch(CONST_URL + '?' + Date.now()).then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
        loadJacketMap(),
      ]).then(([table, jackets]) => {
        const charts = [];
        Object.entries(table).forEach(([k, c]) => {
          const [name, kind, diff, max] = k.split('|');
          if (!name || !FAV_DIFFS.includes(diff) || typeof c !== 'number') return;
          const level = levelLabelOf(c);
          const mx = max ? Number(max) : null;
          const song = resolveSong(jackets, name, kind === 'ST' ? 'ST' : 'DX', diff, level, mx);
          charts.push({ name, kind: kind === 'ST' ? 'ST' : 'DX', diff, c, level, max: mx, img: song?.img || '', genre: song?.genre || '' });
        });
        // 同名の別曲で、最大値つきのキーと最大値なしのキーが両方ある場合は、最大値つきだけを残す
        const withMax = new Set(charts.filter((x) => x.max).map((x) => `${x.name}|${x.kind}|${x.diff}`));
        const list = charts.filter((x) => x.max || !withMax.has(`${x.name}|${x.kind}|${x.diff}`));
        list.sort((a, b) => b.c - a.c || a.name.localeCompare(b.name, 'ja'));
        return { list, jackets };
      });
    }
    return favChartsPromise;
  }

  // ジャケット画像（見つからなければ空の枠）
  function jacketBox(file) {
    if (!file) return el('div', 'dxr-jacket');
    const img = el('img', 'dxr-jacket');
    img.src = JACKET_BASE + file;
    img.alt = '';
    img.loading = 'lazy';
    img.onerror = () => { img.removeAttribute('src'); };
    return img;
  }

  // 譜面データビューアと同じ形の選択画面（レベル・難易度・曲名で絞り込み、50件ずつ表示）
  function favPicker(onPick) {
    const box = el('div', 'dxr-picker');
    const status = el('p', 'dxr-card-desc', '譜面の一覧を読み込み中…');
    box.appendChild(status);
    loadFavCharts().then(({ list }) => {
      if (!list.length) { status.textContent = '譜面の一覧を読み込めませんでした。時間をおいてお試しください。'; return; }
      status.remove();
      // 譜面定数の範囲（下限・上限。0.1刻み）。null は制限なし
      let cMin = null;
      let cMax = null;
      let diffs = null; // null = すべて
      let kindF = '*';  // '*'：すべて / 'DX' / 'ST'
      let query = '';
      let page = 1;
      let selected = null;
      const levelTabs = el('div', 'dxr-ptabs dxr-crange');
      const diffTabs = el('div', 'dxr-ptabs');
      const kindTabsP = el('div', 'dxr-ptabs');
      const search = el('input', 'dxr-psearch');
      search.type = 'search';
      search.placeholder = '曲名で絞り込み';
      search.setAttribute('aria-label', '曲名で絞り込み');
      const info = el('p', 'dxr-card-desc');
      const listBox = el('div');
      box.append(levelTabs, diffTabs, kindTabsP, search, info, listBox);

      const lo = Math.min(...list.map((x) => x.c));
      const hi = Math.max(...list.map((x) => x.c));
      const cOpts = [];
      for (let v = Math.round(lo * 10); v <= Math.round(hi * 10); v++) cOpts.push(v / 10);
      const diffsHere = FAV_DIFFS.filter((d) => list.some((x) => x.diff === d));
      const tab = (label, on, cls, onClick) => {
        const b = el('button', 'dxr-ptab' + (cls ? ' ' + cls : ''), label);
        b.type = 'button';
        b.setAttribute('aria-pressed', String(on));
        b.onclick = onClick;
        return b;
      };
      const renderTabs = () => {
        const mkSel = (value, label, onChange) => {
          const sel = el('select');
          sel.setAttribute('aria-label', label);
          cOpts.forEach((v) => {
            const o = el('option', '', v.toFixed(1));
            o.value = String(v);
            sel.appendChild(o);
          });
          sel.value = String(value);
          sel.onchange = () => { onChange(Number(sel.value)); page = 1; renderTabs(); renderList(); };
          return sel;
        };
        levelTabs.replaceChildren(el('span', 'dxr-crange-label', '譜面定数'),
          mkSel(cMin ?? lo, '譜面定数の下限', (v) => { cMin = v; if (cMax !== null && cMax < v) cMax = v; }),
          el('span', 'dxr-crange-sep', '〜'),
          mkSel(cMax ?? hi, '譜面定数の上限', (v) => { cMax = v; if (cMin !== null && cMin > v) cMin = v; }),
          tab('すべて', cMin === null && cMax === null, '', () => { cMin = null; cMax = null; page = 1; renderTabs(); renderList(); }));
        diffTabs.replaceChildren(tab('すべての難易度', diffs === null, '', () => { diffs = null; page = 1; renderTabs(); renderList(); }),
          ...diffsHere.map((d) => tab(d, !!diffs?.has(d), `pd-${d.replace(':', '').toUpperCase()}`, () => {
            if (diffs === null) diffs = new Set([d]);
            else if (diffs.has(d)) { diffs.delete(d); if (!diffs.size) diffs = null; } else diffs.add(d);
            page = 1; renderTabs(); renderList();
          })));
        kindTabsP.replaceChildren(...[['*', 'DX・ST'], ['DX', 'DXのみ'], ['ST', 'STのみ']].map(([v, label]) =>
          tab(label, kindF === v, '', () => { kindF = v; page = 1; renderTabs(); renderList(); })));
      };
      const pager = (total) => pagerEl(page, total, (n) => { page = n; renderList(); info.scrollIntoView({ block: 'start' }); });
      const renderList = () => {
        const q = query.trim().toLowerCase();
        const items = list.filter((x) => (cMin === null || x.c >= cMin - 1e-9) && (cMax === null || x.c <= cMax + 1e-9)
          && (diffs === null || diffs.has(x.diff)) && (kindF === '*' || x.kind === kindF) && (!q || x.name.toLowerCase().includes(q)));
        const total = Math.max(1, Math.ceil(items.length / FAV_PAGE_SIZE));
        page = Math.min(Math.max(page, 1), total);
        const shown = items.slice((page - 1) * FAV_PAGE_SIZE, page * FAV_PAGE_SIZE);
        info.textContent = `${items.length} 譜面（押して選ぶ）`;
        const ul = el('div', 'dxr-list');
        if (!shown.length) ul.appendChild(el('div', 'dxr-rec-empty', '見つかりませんでした。'));
        shown.forEach((x) => {
          const row = el('button', 'dxr-prow' + (selected === x ? ' is-on' : ''));
          row.type = 'button';
          const main = el('div');
          const nm = el('div', 'dxr-name', x.name);
          if (x.genre) nm.appendChild(el('span', 'dxr-genre', `（${x.genre}）`));
          const meta = el('div', 'dxr-meta');
          meta.append(
            el('span', `dxr-chip dxr-kind-${x.kind}`, x.kind),
            el('span', `dxr-chip dxr-diff-${x.diff.replace(':', '').toUpperCase()}`, x.diff),
            el('span', 'dxr-chip dxr-const', `Lv${x.level}（${x.c.toFixed(1)}）`)
          );
          main.append(nm, meta);
          row.append(jacketBox(x.img), main);
          row.onclick = () => { selected = x; renderList(); };
          ul.appendChild(row);
          // 選んだ譜面のすぐ下に、登録ボタンを出す
          if (selected === x) {
            const bar = el('div', 'dxr-pconfirm');
            const ok = el('button', 'primary', 'この譜面をお気に入りに登録');
            ok.type = 'button';
            ok.onclick = () => onPick(x, ok);
            const cancel = el('button', '', 'やめる');
            cancel.type = 'button';
            cancel.onclick = () => { selected = null; renderList(); };
            bar.append(cancel, ok);
            ul.appendChild(bar);
          }
        });
        listBox.replaceChildren(pager(total), ul, pager(total));
      };
      let timer = null;
      search.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => { query = search.value; page = 1; renderList(); }, 250);
      });
      renderTabs();
      renderList();
    });
    return box;
  }

  const favChips = (fav) => {
    const meta = el('div', 'dxr-meta');
    meta.append(
      el('span', `dxr-chip dxr-kind-${fav.kind}`, fav.kind),
      el('span', `dxr-chip dxr-diff-${fav.diff.replace(':', '').toUpperCase()}`, fav.diff)
    );
    return meta;
  };

  // ランキング登録者向けのカード（ログイン → お気に入り譜面・PINの変更）
  function memberCard(profile) {
    const card = el('section', 'dxr-card');
    let savedUser = '';
    try { savedUser = localStorage.getItem(USER_KEY) || ''; } catch { /* なし */ }

    const field = (parent, label, type, value, note, attrs = {}) => {
      const lab = el('label', 'dxr-field', label);
      const input = el('input');
      input.type = type;
      input.value = value;
      Object.entries(attrs).forEach(([k, v]) => input.setAttribute(k, v));
      lab.appendChild(input);
      if (note) lab.appendChild(el('small', '', note));
      parent.appendChild(lab);
      return input;
    };

    function loginView() {
      card.replaceChildren(el('h3', '', '保存した記録・ランキングの設定・お気に入り譜面・PINの変更'),
        el('p', 'dxr-card-desc', 'ランキングに登録したユーザー名とPINで入ります。最後に保存した記録の確認、ランキングに載せる名前や自動登録の設定、お気に入り譜面（ランキングページに表示）、PINの変更ができます。'));
      const user = field(card, 'ユーザー名', 'text', savedUser, '', { autocomplete: 'username', autocapitalize: 'off', spellcheck: 'false' });
      const pin = field(card, 'PIN', 'password', '', '', { inputmode: 'numeric', autocomplete: 'current-password' });
      const err = el('div', 'dxr-err');
      const actions = el('div', 'dxr-actions');
      const go = el('button', 'primary', '入る');
      go.type = 'button';
      actions.appendChild(go);
      card.append(err, actions);
      const submit = async () => {
        const username = user.value.trim().toLowerCase();
        const p = pin.value.trim();
        if (!/^[a-z0-9_]{3,16}$/.test(username)) { err.textContent = 'ユーザー名は英数字とアンダーバーで3〜16文字です。'; return; }
        if (!/^\d{4,8}$/.test(p)) { err.textContent = 'PINは数字4〜8桁です。'; return; }
        go.disabled = true;
        err.textContent = '確認中…';
        const r = await callRanking({ action: 'mypage', username, pin: p }, () => { err.textContent = '混み合っています。送り直しています…'; })
          .catch(() => ({ ok: false, error: '通信できませんでした。' }));
        go.disabled = false;
        if (!r.ok) { err.textContent = r.error || '確認できませんでした。'; return; }
        try { localStorage.setItem(USER_KEY, username); } catch { /* 保存できなくても続ける */ }
        savedUser = username;
        memberView({ username, pin: p, info: r });
      };
      go.onclick = submit;
      pin.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    }

    function memberView(auth) {
      const { info } = auth;
      card.replaceChildren();
      const head = el('div', 'dxr-card-head');
      head.append(el('h3', '', info.anonymous ? `匿名#${info.anonCode}` : (info.displayName || auth.username)));
      const out = el('button', 'dxr-mini', 'ログアウト');
      out.type = 'button';
      out.onclick = loginView;
      head.appendChild(out);
      card.appendChild(head);
      card.appendChild(el('p', 'dxr-card-desc', `ユーザー名：${auth.username}`));

      // ---- 最後に保存した記録（押したときに読み込む） ----
      const recBox = el('div', 'dxr-sub');
      card.appendChild(recBox);
      recBox.append(el('h4', '', '最後に保存した記録'),
        el('p', 'dxr-card-desc', 'ランキングに最後に登録・更新したときのレートとレート対象曲です（ベスト枠を公開していなくても、自分は見られます）。'));
      const recBtn = el('button', 'dxr-rank-open', '保存した記録を見る');
      recBtn.type = 'button';
      recBtn.style.margin = '4px 0 0';
      const recOut = el('div');
      recBox.append(recBtn, recOut);
      recBtn.onclick = async () => {
        recBtn.disabled = true;
        recOut.replaceChildren(el('p', 'dxr-card-desc', '読み込み中…'));
        try {
          const [rec, jackets] = await Promise.all([
            callRanking({ action: 'myRecord', username: auth.username, pin: auth.pin }, () => {
              recOut.replaceChildren(el('p', 'dxr-card-desc', '混み合っています。送り直しています…'));
            }),
            loadJacketMap(),
          ]);
          if (!rec.ok) throw new Error(rec.error || '記録を読み込めませんでした。');
          recBtn.remove();
          recOut.replaceChildren(savedRecordView(rec, profile, jackets));
        } catch (e) {
          recBtn.disabled = false;
          recOut.replaceChildren(el('p', 'dxr-err', 'エラー: ' + e.message));
        }
      };

      // ---- ランキングの設定（表示名・匿名・ベスト枠の公開・自動登録） ----
      const setBox = el('div', 'dxr-sub');
      card.appendChild(setBox);
      setBox.appendChild(el('h4', '', 'ランキングの設定'));
      setBox.appendChild(el('p', 'dxr-card-desc', 'ランキングに載せる内容です。保存するとすぐにランキングに反映され、次からの登録（自動登録を含む）でもこの内容を使います。'));
      const local = loadJson(FORM_KEY) || {};
      const dnInput = field(setBox, '表示名', 'text', info.displayName || local.displayName || profile.name || '', 'ランキングに表示する名前（20文字まで）', { maxlength: '20' });
      const chk = (label, checked) => {
        const lab = el('label', 'dxr-check');
        const cb = el('input');
        cb.type = 'checkbox';
        cb.checked = checked;
        lab.append(cb, document.createTextNode(label));
        setBox.appendChild(lab);
        return cb;
      };
      const anonCb = chk('匿名で掲載する（「匿名#記号」と初期アイコンで表示）', !!info.anonymous);
      const pubCb = chk('ベスト枠をランキングで公開する', info.publicTop50 !== false);
      const achvCb = chk('☆6・☆7達成譜面（スコアと☆）をランキングで公開する', info.publicAchv !== false);
      const syncName = () => { dnInput.disabled = anonCb.checked; };
      anonCb.onchange = syncName;
      syncName();
      const setErr = el('div', 'dxr-err');
      const setActions = el('div', 'dxr-actions');
      const setBtn = el('button', 'primary', '設定を保存');
      setBtn.type = 'button';
      setActions.appendChild(setBtn);
      setBox.append(setErr, setActions);
      setBtn.onclick = async () => {
        const form = { displayName: dnInput.value.trim(), anonymous: anonCb.checked, publicTop50: pubCb.checked, publicAchv: achvCb.checked };
        if (!form.anonymous && !form.displayName) { setErr.textContent = '表示名を入力するか、匿名で掲載を選んでください。'; return; }
        setBtn.disabled = true;
        setErr.textContent = '保存中…';
        const r = await callRanking({ action: 'setProfile', username: auth.username, pin: auth.pin, ...form, icon: iconValueOf(profile, form.anonymous) },
          () => { setErr.textContent = '混み合っています。送り直しています…'; })
          .catch(() => ({ ok: false, error: '通信できませんでした。' }));
        setBtn.disabled = false;
        if (!r.ok) { setErr.textContent = r.error || '保存できませんでした。'; return; }
        saveJson(FORM_KEY, form);
        setErr.textContent = '';
        setErr.replaceChildren(el('span', 'dxr-ok', '設定を保存しました。'));
      };

      // 自動登録：このブラウザに「自動登録用の鍵」を保存し、レート計算のあとに自動で登録・更新する（PINは保存しない）
      const autoBox = el('div', 'dxr-auto-set');
      const autoLab = el('label', 'dxr-check');
      const autoCb = el('input');
      autoCb.type = 'checkbox';
      const savedAuto = loadJson(AUTO_KEY);
      autoCb.checked = !!(savedAuto && savedAuto.token && savedAuto.username === auth.username);
      autoLab.append(autoCb, document.createTextNode('レート計算のあとに、自動でランキングに登録・更新する'));
      const autoNote = el('p', 'dxr-card-desc',
        'このブラウザだけの設定です。PINは保存せず、自動登録専用の鍵を保存します（鍵でできるのはランキングの登録・更新だけです）。'
        + '別のブラウザで設定すると、こちらの設定は無効になります。');
      if (info.autoUpload && !autoCb.checked) {
        autoNote.textContent += '（現在、別のブラウザで自動登録が設定されています）';
      }
      const autoErr = el('div', 'dxr-err');
      autoBox.append(autoLab, autoNote, autoErr);
      setBox.appendChild(autoBox);
      autoCb.onchange = async () => {
        const on = autoCb.checked;
        autoCb.disabled = true;
        autoErr.textContent = on ? '設定中…' : '解除中…';
        const r = await callRanking({ action: on ? 'issueToken' : 'revokeToken', username: auth.username, pin: auth.pin })
          .catch(() => ({ ok: false, error: '通信できませんでした。' }));
        autoCb.disabled = false;
        if (!r.ok) {
          autoCb.checked = !on;
          autoErr.textContent = r.error || '設定できませんでした。';
          return;
        }
        if (on) {
          saveJson(AUTO_KEY, { username: auth.username, token: r.token });
          // 自動登録で使う表示名などが未保存なら、今の画面の内容を保存しておく
          if (!loadJson(FORM_KEY)) saveJson(FORM_KEY, { displayName: dnInput.value.trim(), anonymous: anonCb.checked, publicTop50: pubCb.checked, publicAchv: achvCb.checked });
        } else {
          saveJson(AUTO_KEY, null);
        }
        autoErr.textContent = '';
        autoErr.replaceChildren(el('span', 'dxr-ok', on ? '自動登録を設定しました。次のレート計算から自動で登録されます。' : '自動登録を解除しました。'));
      };

      // ---- お気に入り譜面 ----
      const fav = el('div', 'dxr-sub');
      card.appendChild(fav);
      let current = info.favorite || null;
      const favView = () => {
        fav.replaceChildren(el('h4', '', 'お気に入り譜面'));
        const now = el('div', 'dxr-fav-now');
        if (current) {
          const main = el('div');
          main.append(el('div', 'dxr-name', current.name), favChips(current));
          const jk = el('div', 'dxr-jacket');
          now.append(jk, main);
          // 登録済みの譜面のジャケット（ランキングページと同じ方法で探す）
          loadFavCharts().then(({ jackets }) => {
            const song = resolveSong(jackets, current.name, current.kind, current.diff, current.level || '', current.max ?? null);
            if (song?.img) jk.replaceWith(jacketBox(song.img));
          });
        } else {
          now.appendChild(el('div', 'dxr-card-desc', 'まだ登録されていません。'));
        }
        fav.appendChild(now);
        fav.appendChild(el('p', 'dxr-card-desc', '1譜面だけ登録できます。ランキングでは、ジャケット・曲名・ST/DX・難易度が表示されます。'));
        const err = el('div', 'dxr-err');
        const actions = el('div', 'dxr-actions');
        if (current) {
          const clear = el('button', '', 'お気に入りを外す');
          clear.type = 'button';
          clear.onclick = () => save(null, clear, err);
          actions.appendChild(clear);
        }
        const open = el('button', 'primary', current ? '別の譜面に変える' : '譜面を選ぶ');
        open.type = 'button';
        actions.appendChild(open);
        const holder = el('div');
        fav.append(actions, err, holder);
        open.onclick = () => {
          open.remove();
          holder.replaceChildren(favPicker((x, btn) => save({ name: x.name, kind: x.kind, diff: x.diff, level: x.level, max: x.max }, btn, err)));
        };
      };
      const save = async (value, button, err) => {
        button.disabled = true;
        err.textContent = '保存中…';
        const r = await callRanking({ action: 'setFavorite', username: auth.username, pin: auth.pin, favorite: value },
          () => { err.textContent = '混み合っています。送り直しています…'; })
          .catch(() => ({ ok: false, error: '通信できませんでした。' }));
        button.disabled = false;
        if (!r.ok) { err.textContent = r.error || '保存できませんでした。'; return; }
        current = r.favorite || null;
        favView();
        fav.appendChild(el('div', 'dxr-ok', current ? 'お気に入り譜面を登録しました。' : 'お気に入り譜面を外しました。'));
      };
      favView();

      // ---- PINの変更 ----
      const pinBox = el('div', 'dxr-sub');
      pinBox.appendChild(el('h4', '', 'PINの変更'));
      pinBox.appendChild(el('p', 'dxr-card-desc', '管理者から仮のPINを受け取った方は、ここで自分で決めたPINに変更してください。'));
      const np1 = field(pinBox, '新しいPIN', 'password', '', '数字4〜8桁', { inputmode: 'numeric', autocomplete: 'new-password' });
      const np2 = field(pinBox, '新しいPIN（確認のためもう一度）', 'password', '', '', { inputmode: 'numeric', autocomplete: 'new-password' });
      const pinErr = el('div', 'dxr-err');
      const pinActions = el('div', 'dxr-actions');
      const pinBtn = el('button', 'primary', 'PINを変更');
      pinBtn.type = 'button';
      pinActions.appendChild(pinBtn);
      pinBox.append(pinErr, pinActions);
      card.appendChild(pinBox);
      pinBtn.onclick = async () => {
        const v = np1.value.trim();
        if (!/^\d{4,8}$/.test(v)) { pinErr.textContent = '新しいPINは数字4〜8桁にしてください。'; return; }
        if (v !== np2.value.trim()) { pinErr.textContent = '新しいPINが2回とも同じになるように入力してください。'; return; }
        pinBtn.disabled = true;
        pinErr.textContent = '変更中…';
        const r = await callRanking({ action: 'changePin', username: auth.username, pin: auth.pin, newPin: v },
          () => { pinErr.textContent = '混み合っています。送り直しています…'; })
          .catch(() => ({ ok: false, error: '通信できませんでした。' }));
        pinBtn.disabled = false;
        if (!r.ok) { pinErr.textContent = r.error || '変更できませんでした。'; return; }
        auth.pin = v;
        np1.value = np2.value = '';
        // PINを変えると自動登録の鍵も無効になるので、このブラウザの設定も消す
        const sa = loadJson(AUTO_KEY);
        if (sa && sa.username === auth.username) {
          saveJson(AUTO_KEY, null);
          autoCb.checked = false;
        }
        pinErr.textContent = '';
        pinErr.replaceChildren(Object.assign(el('span', 'dxr-ok', 'PINを変更しました。次からは新しいPINを使ってください。')));
      };
    }

    loginView();
    return card;
  }

  // おすすめ楽曲のカード
  //   同じ起動の中でレート計算をしていればその結果、なければ前回のレート計算のときに保存した結果をすぐに表示する
  function recommendCard(ctx, profile) {
    const card = el('section', 'dxr-card');
    card.append(el('h3', '', 'おすすめ楽曲'),
      el('p', 'dxr-card-desc', '全国ランキングの達成率から、次に☆を伸ばすと 2fRATE（☆7まで）が上がりやすい譜面を提案します。'));
    // 最初は閉じておき、「おすすめ楽曲を表示する」を押したときに中身を作る
    const toggle = el('button', 'dxr-rank-open', 'おすすめ楽曲を表示する');
    toggle.type = 'button';
    toggle.style.margin = '4px 0 0';
    const body = el('div');
    body.hidden = true;
    const when = el('p', 'dxr-card-desc');
    const btn = el('button', 'dxr-rank-open', '最新のスコアで計算し直す');
    btn.type = 'button';
    btn.style.margin = '4px 0 0';
    const msg = el('p', 'dxr-status');
    const out = el('div');
    body.append(when, out, btn, msg);
    card.append(toggle, body);
    let opened = false;
    toggle.onclick = () => {
      body.hidden = !body.hidden;
      toggle.textContent = body.hidden ? 'おすすめ楽曲を表示する' : 'おすすめ楽曲を閉じる';
      if (!body.hidden && !opened) { opened = true; fill(); }
    };

    const showRun = (run) => {
      const full = run.results.find((r) => r.mode.id === 'full');
      when.textContent = '最新のスコアから計算した結果です。';
      out.replaceChildren(recommendEl(run.scored, full.top, run.stats, run.jackets, full.rating));
    };
    const fill = () => {
    const saved = loadJson(LAST_REC_KEY);
    if (ctx.getLastRun()) {
      showRun(ctx.getLastRun());
    } else if (saved && Array.isArray(saved.recs) && saved.player === (profile.name || '')) {
      when.textContent = `前回のレート計算（${saved.date}）のときの結果です。そのあとに更新したスコアは反映されていません。`;
      loadJacketMap().then((jackets) => out.replaceChildren(recommendListEl(saved.recs, jackets, saved.rating)));
    } else {
      when.textContent = 'まだ結果がありません。下のボタンで計算するか、レート計算を実行すると、次からはここにすぐ表示されます。';
      btn.textContent = 'おすすめ楽曲を計算する';
    }
    };
    btn.onclick = async () => {
      btn.disabled = true;
      msg.classList.remove('is-error');
      try {
        const run = await ctx.computeRating((t) => { msg.textContent = t; });
        if (!run) return;
        msg.textContent = '';
        showRun(run);
        btn.textContent = '最新のスコアで計算し直す';
      } catch (e) {
        msg.textContent = 'エラー: ' + e.message;
        msg.classList.add('is-error');
        console.error(e);
      } finally {
        btn.disabled = false;
      }
    };
    return card;
  }

  // レート計算のあと、自動登録が設定されていればランキングに登録・更新する
  async function autoUpload(ui, profile, results, counts, scored) {
    const auto = loadJson(AUTO_KEY);
    if (!auto || !auto.token || !auto.username) return;
    const form = loadJson(FORM_KEY) || {};
    const settings = {
      displayName: String(form.displayName || profile.name || '').slice(0, 20),
      anonymous: form.anonymous === true,
      publicTop50: form.publicTop50 !== false,
      publicAchv: form.publicAchv !== false,
    };
    const box = el('div', 'dxr-auto', 'ランキングに自動で登録しています…');
    ui.body.prepend(box);
    const r = await callRanking({ ...buildSubmitBody(profile, results, counts, settings, scored), username: auto.username, token: auto.token },
      () => { box.textContent = '混み合っているため、送り直しています…'; })
      .catch(() => ({ ok: false, error: '通信できませんでした。' }));
    if (r.ok) {
      box.textContent = `ランキングに自動で登録しました（${settings.anonymous ? `匿名#${r.anonCode}` : settings.displayName}）。`;
      const a = el('a', '', 'ランキングを見る ›');
      a.href = RANKING_PAGE;
      a.target = '_blank';
      a.rel = 'noopener';
      box.append(' ', a);
    } else {
      box.classList.add('is-error');
      box.textContent = `自動登録できませんでした：${r.error || '不明なエラー'}`;
      if (r.tokenInvalid) saveJson(AUTO_KEY, null);
    }
  }

  function renderMyPage(ui, profile, ctx) {
    ui.status('');
    const player = profileEl(ui, profile, 'マイページ');
    ui.body.append(player, recommendCard(ctx, profile), rareCard(), memberCard(profile));
  }

  // 起動時のメニュー（ログインを確認したあとに表示）
  function renderMenu(ui, profile, go) {
    ui.status('');
    ui.setBack(null);
    ui.body.replaceChildren();
    const player = profileEl(ui, profile, 'ログインを確認しました');
    const menu = el('div', 'dxr-menu');
    const item = (title, desc, onClick, primary) => {
      const b = el('button', 'dxr-menu-item' + (primary ? ' is-primary' : ''));
      b.type = 'button';
      b.append(el('span', 'dxr-menu-title', title), el('span', 'dxr-menu-desc', desc));
      b.onclick = onClick;
      menu.appendChild(b);
    };
    item('レート計算・ランキング登録', '2fRATE を計算して、レート対象曲の一覧・画像化・ランキング登録を行います', () => go('rating'), true);
    item('マイページ', '最後に保存した記録・達成人数で見る自分の達成譜面・おすすめ楽曲・ランキングの設定（自動登録）・お気に入り譜面・PINの変更', () => go('mypage'), false);
    // オマケ（対象の譜面を絞ったレート）は別枠にする
    const main = menu.cloneNode(false);
    main.append(...menu.childNodes);
    BONUS_MODES.forEach((b) => item(b.title, `${b.desc}。画像化もできます（ランキング登録は対象外）`, () => go('bonus:' + b.id), false));
    //   普段は「オマケ」の見出しだけを出しておき、押したときに中身を開く
    const bonusBox = el('div', 'dxr-bonus');
    const bonusToggle = el('button', 'dxr-bonus-toggle');
    bonusToggle.type = 'button';
    const bonusMark = el('span', 'dxr-bonus-mark', '＋');
    bonusMark.setAttribute('aria-hidden', 'true');
    bonusToggle.append(el('span', '', 'オマケ'), bonusMark);
    const bonusBody = el('div', 'dxr-bonus-body');
    bonusBody.append(
      el('p', 'dxr-card-desc', '対象の譜面を絞って計算するレートです。計算式は通常のレートと同じです。'),
      menu);
    const setBonusOpen = (open) => {
      bonusBody.hidden = !open;
      bonusToggle.setAttribute('aria-expanded', String(open));
      bonusMark.textContent = open ? '－' : '＋';
    };
    bonusToggle.onclick = () => setBonusOpen(bonusBody.hidden);
    setBonusOpen(false);
    bonusBox.append(bonusToggle, bonusBody);
    ui.body.append(player, main, bonusBox);
  }

  // ============================================================
  //  メイン処理
  // ============================================================

  // ============================================================
  //  保存済みのデータから表示（α版・検証用）
  //   maimaiでらっくすNET にログインできないとき（メンテナンス中など）に、ランキングに保存されている
  //   ベスト枠（公開している人のみ）からレート対象曲の一覧と画像を作る。スコアの読み込みや登録は行わない。
  //   称号はランキングに保存していないので、画面で入力した文字と色を画像に載せる。
  // ============================================================
  const ICON_BASE = 'https://maimaidx.jp/maimai-mobile/img/Icon/';
  const RATE_FIELD = { full: 'rateFull', cap6: 'rateCap6', cap5: 'rateCap5' };

  // 保存されているベスト枠の1譜面 → 一覧・画像を作る処理が使う形
  const savedSong = (t, modeId) => ({
    name: String(t.name ?? ''), kind: t.kind === 'ST' || t.kind === 'DX' ? t.kind : '?', diff: String(t.diff ?? ''), level: t.level,
    cur: Number(t.score) || 0, max: Number(t.max) || 0,
    c: Number(t.const) || 0, estimated: !!t.estimated,
    stars: Math.floor(Number(t.star) || 0),
    rareAdd: Number(t.rare) || 0,
    values: { [modeId]: Number(t.value) || 0 },
  });

  // 日時（ISO形式）を「2026/11/22 04:00」の形にする
  const fmtDate = (iso) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const p2 = (v) => String(v).padStart(2, '0');
    return `${d.getFullYear()}/${p2(d.getMonth() + 1)}/${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
  };

  // マイページ：最後にランキングへ保存した記録（レート・達成譜面数・3種類のレート対象曲）を表示する部分
  //   rec は Worker の myRecord の答え。profile は画像に載せるプレイヤー情報（maimaiでらっくすNET の今の情報）
  function savedRecordView(rec, profile, jackets) {
    const box = el('div');
    const counts = rec.counts;
    box.appendChild(el('p', 'dxr-card-desc',
      `保存した日時：${fmtDate(rec.updatedAt) || '不明'}` +
      (counts ? `　／　☆7達成 ${counts.star7Mas + counts.star7Remas}・☆6達成 ${counts.star6Mas + counts.star6Remas}` +
        (counts.star5Mas !== null && counts.star5Mas !== undefined ? `・☆5達成 ${counts.star5Mas + counts.star5Remas}` : '') + ' 譜面' : '')));
    // 以前の版で登録された記録は、☆7まで の配列だけが入っている
    const frames = Array.isArray(rec.top50) ? { full: rec.top50 } : (rec.top50 || {});
    const tabs = el('div', 'dxr-tabs');
    const out = el('div');
    let modeId = RATE_MODES[0].id;
    const show = () => {
      const mode = RATE_MODES.find((m) => m.id === modeId);
      const rating = Number(rec[RATE_FIELD[modeId]]) || 0;
      const rateRow = el('div', 'dxr-off-rate');
      const rank = rankOf(rating, modeId);
      const value = tnum(el('span', 'dxr-plate-value dxr-ranked', rating.toFixed(3)));
      value.style.cssText = rankCss(rank);
      value.title = rank.name;
      const icon = el('span', 'dxr-rank-icon');
      icon.innerHTML = rankIconSvg(rank.name); // ツール内で作った固定のSVGのみ
      rateRow.append(el('span', 'dxr-plate-label', `2fRATE${mode.label.replace('まで', '')}`), icon, value);
      const list = frames[modeId];
      if (!Array.isArray(list) || !list.length) {
        out.replaceChildren(rateRow, el('p', 'dxr-card-desc', `この記録には「${mode.label}」のレート対象曲が保存されていません（以前の版で登録した記録です）。`));
        return;
      }
      const result = { mode, rating, top: list.map((t) => savedSong(t, modeId)) };
      const share = el('button', 'dxr-share', `「${mode.label}」のレート対象曲を画像にする`);
      share.type = 'button';
      share.style.margin = '0 0 8px';
      const opt = el('label', 'dxr-share-opt');
      opt.style.margin = '0 0 12px';
      const check = el('input');
      check.type = 'checkbox';
      check.checked = true;
      opt.append(check, document.createTextNode('画像にプレイヤー名と称号を載せる'));
      const layoutSel = layoutPicker();
      share.onclick = () => openShareImage(profile, result, jackets, share, { hideProfile: !check.checked, ...layoutSel.opts() });
      out.replaceChildren(rateRow, layoutSel.el, share, opt, buildList(result.top, mode, jackets));
    };
    RATE_MODES.forEach((m) => {
      const b = el('button', 'dxr-tab', m.label);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(m.id === modeId));
      b.onclick = () => {
        modeId = m.id;
        tabs.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        show();
      };
      tabs.appendChild(b);
    });
    box.append(tabs, out);
    show();
    return box;
  }

  function renderOffline(ui) {
    const card = el('div', 'dxr-card');
    card.append(
      el('h3', '', '保存済みのデータから表示（検証用）'),
      el('p', 'dxr-card-desc', 'ランキングに保存されているベスト枠（公開している人のみ）から、レート対象曲の一覧と画像を作ります。' +
        'ログインは不要です。称号は保存していないため、画像に載せたい場合は下の欄に入力してください。'));
    const msg = el('p', 'dxr-card-desc', 'ランキングを読み込み中…');
    card.appendChild(msg);
    ui.body.replaceChildren(card);

    const toSong = savedSong;

    (async () => {
      let users, jackets;
      try {
        const [data, map] = await Promise.all([
          fetch(RANKING_API + '?t=' + Date.now()).then((r) => r.json()),
          loadJacketMap(),
        ]);
        if (!data.ok) throw new Error(data.error || 'ランキングを取得できませんでした。');
        users = (data.list || []).filter((r) => r.hasTop50).sort((a, b) => (b.rateFull || 0) - (a.rateFull || 0));
        if (!users.length) throw new Error('ベスト枠を公開している記録がありません。');
        jackets = map;
      } catch (e) {
        msg.textContent = 'エラー: ' + e.message;
        msg.className = 'dxr-err';
        console.error(e);
        return;
      }

      let modeId = RATE_MODES[0].id;
      const cache = new Map(); // 公開ID → ベスト枠
      let showId = 0;

      const tabs = el('div', 'dxr-tabs');
      const field = el('label', 'dxr-field', 'ユーザー（☆7まで のレートが高い順）');
      const select = el('select', 'dxr-off-select');
      users.forEach((u) => {
        const o = el('option', '', `${(Number(u.rateFull) || 0).toFixed(3)}　${u.name}`);
        o.value = u.id;
        select.appendChild(o);
      });
      field.appendChild(select);
      // 称号（ランキングには保存していないので、画像に載せる文字と色を自分で入れる）
      const trophyField = el('label', 'dxr-field', '画像に載せる称号（空なら称号なし）');
      const trophyInput = el('input');
      trophyInput.type = 'text';
      trophyInput.maxLength = 40;
      trophyField.appendChild(trophyInput);
      const rankField = el('label', 'dxr-field', '称号の色');
      const rankSelect = el('select', 'dxr-off-select');
      [['Normal', 'ノーマル'], ['Bronze', 'ブロンズ'], ['Silver', 'シルバー'], ['Gold', 'ゴールド'], ['Rainbow', 'レインボー']].forEach(([v, t]) => {
        const o = el('option', '', t);
        o.value = v;
        rankSelect.appendChild(o);
      });
      rankField.appendChild(rankSelect);
      const out = el('div');
      msg.textContent = '';
      card.append(tabs, field, trophyField, rankField, out);

      const show = async () => {
        const my = ++showId;
        const u = users.find((x) => x.id === select.value);
        const mode = RATE_MODES.find((m) => m.id === modeId);
        out.replaceChildren(el('p', 'dxr-card-desc', 'ベスト枠を読み込み中…'));
        try {
          let data = cache.get(u.id);
          if (!data) {
            data = await fetch(RANKING_API + '?top50=' + encodeURIComponent(u.id) + '&t=' + Date.now()).then((r) => r.json());
            if (!data.ok) throw new Error(data.error || 'ベスト枠を取得できませんでした。');
            cache.set(u.id, data);
          }
          if (my !== showId) return;
          // 以前の版で登録された記録は、☆7まで の配列だけが入っている
          const frames = Array.isArray(data.top50) ? { full: data.top50 } : (data.top50 || {});
          const list = frames[modeId];
          if (!Array.isArray(list) || !list.length) {
            out.replaceChildren(el('p', 'dxr-card-desc', `この記録には「${mode.label}」のレート対象曲がありません（以前の版で登録された記録です）。`));
            return;
          }
          const profile = {
            name: u.name, trophy: '', trophyRank: '',
            icon: /^[0-9a-f]{16}\.png$/i.test(u.icon || '') ? ICON_BASE + u.icon : '',
          };
          const result = { mode, rating: Number(u[RATE_FIELD[modeId]]) || 0, top: list.map((t) => toSong(t, modeId)) };

          // レート値（ランクの色・アイコンつき）
          const rateRow = el('div', 'dxr-off-rate');
          const rank = rankOf(result.rating, modeId);
          const value = tnum(el('span', 'dxr-plate-value dxr-ranked', result.rating.toFixed(3)));
          value.style.cssText = rankCss(rank);
          value.title = rank.name;
          const icon = el('span', 'dxr-rank-icon');
          icon.innerHTML = rankIconSvg(rank.name); // ツール内で作った固定のSVGのみ
          rateRow.append(el('span', 'dxr-plate-label', `${u.name} ／ 2fRATE${mode.label.replace('まで', '')}`), icon, value);

          const share = el('button', 'dxr-share', `「${mode.label}」のレート対象曲を画像にする`);
          share.type = 'button';
          share.style.margin = '0 0 8px';
          const opt = el('label', 'dxr-share-opt');
          opt.style.margin = '0 0 12px';
          const check = el('input');
          check.type = 'checkbox';
          check.checked = true;
          opt.append(check, document.createTextNode('画像にプレイヤー名と称号を載せる'));
          const layoutSel = layoutPicker();
          // 称号は、押した時点で入力されている文字と色を使う
          share.onclick = () => openShareImage(
            { ...profile, trophy: trophyInput.value.trim(), trophyRank: rankSelect.value },
            result, jackets, share, { hideProfile: !check.checked, ...layoutSel.opts() });

          out.replaceChildren(rateRow, layoutSel.el, share, opt, buildList(result.top, mode, jackets));
        } catch (e) {
          if (my !== showId) return;
          const err = el('p', 'dxr-err', 'エラー: ' + e.message);
          out.replaceChildren(err);
          console.error(e);
        }
      };

      RATE_MODES.forEach((m) => {
        const b = el('button', 'dxr-tab', m.label);
        b.type = 'button';
        b.setAttribute('aria-pressed', String(m.id === modeId));
        b.onclick = () => {
          modeId = m.id;
          tabs.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
          show();
        };
        tabs.appendChild(b);
      });
      select.onchange = show;
      show();
    })();
  }

  // 画像の検証用：検証ページ（image_test.html）から読み込まれたときは、画面を作らずに
  // 画像を描く関数だけを渡して終わる（スコアの読み込みや登録は行わない）
  if (typeof window.__2fRATE_PREVIEW__ === 'function') {
    window.__2fRATE_PREVIEW__({
      edition: EDITION,
      modes: RATE_MODES,
      buildShareImage,
      layouts: IMAGE_LAYOUTS,
      loadJacketMap,
      setTheme: (t) => { theme = t === 'dark' ? 'dark' : 'light'; },
    });
    return;
  }

  if (location.hostname !== 'maimaidx.jp') {
    alert('maimaiでらっくすNET にログインした状態で実行してください。');
    return;
  }

  const ui = createPanel();

  // ① まずログインできているかを確認する（できていなければ、メニューを出す前にエラーを表示して終わる）
  let profile;
  try {
    ui.status('ログイン状態を確認中…');
    profile = await getPlayerProfile();
  } catch (e) {
    ui.status('エラー: ' + e.message, true);
    console.error(e);
    renderOffline(ui); // α版：ログインできないときは、保存済みのデータからの表示（検証用）を出す
    return;
  }

  // ② レート計算・ランキング登録 か マイページ かを選ぶ
  let navId = 0; // 画面を切り替えるたびに増やす（読み込み途中でメニューに戻ったら、その読み込みの結果は表示しない）
  const go = (where) => {
    navId++;
    ui.body.replaceChildren();
    ui.status('');
    ui.setBack(() => { navId++; renderMenu(ui, profile, go); });
    if (where === 'mypage') renderMyPage(ui, profile, { getLastRun: () => lastRun, computeRating: computeForMyPage });
    else if (where.startsWith('bonus:')) runBonus(BONUS_MODES.find((b) => 'bonus:' + b.id === where));
    else runRating();
  };
  renderMenu(ui, profile, go);

  // 最後に計算した結果（同じ起動の中で、マイページのおすすめ楽曲に使い回す）
  let lastRun = null;

  // マイページから計算する（状況は onStatus に出す。途中でメニューに戻ったら null）
  async function computeForMyPage(onStatus) {
    const myNav = navId;
    const run = await computeRating(onStatus, () => myNav !== navId);
    if (run) {
      lastRun = run;
      saveLastRecommend(profile, run);
    }
    return run;
  }

  async function runRating() {
    const myNav = navId;
    const left = () => myNav !== navId; // メニューに戻った
    try {
      const run = await computeRating((t) => ui.status(t), left);
      if (!run || left()) return;
      lastRun = run;
      saveLastRecommend(profile, run);
      ui.status('');
      renderResult(ui, profile, run.results, run.info, run.jackets, { all: run.scored, stats: run.stats, counts: run.counts });
      autoUpload(ui, profile, run.results, run.counts, run.scored);
    } catch (e) {
      if (left()) return;
      ui.status('エラー: ' + e.message, true);
      console.error(e);
    }
  }

  // オマケ：対象の譜面を絞って計算する（ランキング登録・自動登録・おすすめ楽曲の保存は行わない）
  async function runBonus(bonus) {
    const myNav = navId;
    const left = () => myNav !== navId; // メニューに戻った
    try {
      const run = await computeRating((t) => ui.status(`【${bonus.title}】${t}`), left, bonus);
      if (!run || left()) return;
      ui.status('');
      renderResult(ui, profile, run.results.map((r) => ({ ...r, bonus })), run.info, run.jackets, { bonus, bonusCounts: run.bonusCounts });
    } catch (e) {
      if (left()) return;
      ui.status('エラー: ' + e.message, true);
      console.error(e);
    }
  }

  // スコアを読み込んでレートを計算する（画面は作らない）。途中で left() が true になったら null
  //   bonus を渡すと、その対象の譜面だけで計算する（オマケのレート）
  async function computeRating(status, left, bonus = null) {
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
        status(`譜面定数表を読み込めませんでした：${err.message}／URL: ${CONST_URL}　概算値で計算します。`, true);
        console.error('定数表の読み込みエラー', err);
        await sleep(4000);
      }
    }
    if (left()) return;

    const jacketPromise = loadJacketMap(); // 別サーバーなので並行して読み込む

    // 高いレベルから順に取得し、下のレベルが上位に入り得なくなったら打ち切る
    let scored = [];
    let fetched = 0;
    const stats = new Map(); // 全国ランキングの集計（希少ボーナスとおすすめ楽曲に使う）
    let lastLevel = LEVEL_MAX;
    let rateLevel = null; // レート対象曲が確定したレベル（読み込み中の表示に使う）

    // オマケで達成譜面数も数える場合：定数表から、その難易度の譜面があるレベルの範囲を出す
    //   （例：EXPERT は 13+ が最高なので、Lv14 以上のページは読まない）。定数表を読めなかったときは全レベルを読む
    let startLevel = LEVEL_MAX;
    let countMin = null; // 達成譜面数のために、ここまでは読み込む
    if (bonus?.countDiff) {
      const levelNoOf = (c) => { for (let n = LEVEL_MAX; n > 1; n--) if (c >= levelInfo(n).min) return n; return 1; };
      const cs = Object.entries(constTable)
        .filter(([k, c]) => k.split('|')[2] === bonus.countDiff && typeof c === 'number').map(([, c]) => c);
      countMin = 1;
      if (cs.length) {
        startLevel = levelNoOf(Math.max(...cs));
        countMin = Math.max(1, levelNoOf(Math.min(...cs)) - BONUS_COUNT_MARGIN);
      }
    }
    lastLevel = startLevel;

    for (let n = startLevel; n >= 1; n--) {
      if (left()) return;
      status(`Lv${levelInfo(n).label} を取得中…（${++fetched}ページ目）` +
        (rateLevel !== null && !bonus ? '　☆5・☆6・☆7達成譜面数の集計のため、Lv10+ まで読み込みます' : '') +
        (countMin !== null ? `　☆5・☆6・☆7達成譜面数の集計のため、Lv${levelInfo(countMin).label} まで読み込みます` : ''));
      // レコードのページと、そのレベルの全国ランキング集計（GitHub。なくても続行）を同時に読み込む
      const [res, lvStats] = await Promise.all([
        fetch(LEVEL_URL(n), { credentials: 'same-origin' }),
        loadRankingStats(n, n),
      ]);
      if (left()) return;
      if (!res.ok) throw new Error(`Lv${levelInfo(n).label} の取得に失敗しました (HTTP ${res.status})`);
      lvStats.forEach((v, k) => stats.set(k, v));

      const parsed = parsePage(await res.text(), n);
      scored.push(...(bonus ? parsed.filter(bonus.filter) : parsed).map((s) => score(s, constTable, stats)));
      lastLevel = n;

      // すべてのレートで「下のレベルはもう上位に入れない」状態になったら打ち切る
      const allDone = RATE_MODES.every((m) => {
        const nth = [...scored].sort((a, b) => b.values[m.id] - a.values[m.id])[TOP_N - 1];
        return nth && nth.values[m.id] >= upperBound(n - 1, m.capStars);
      });
      if (allDone && rateLevel === null) rateLevel = n;
      // レート対象曲が確定し、☆6・☆7の集計に必要なレベル（10+）まで取得したら終了
      //   オマケのレートは達成譜面数を集計しないので、レート対象曲が確定した時点で終了
      //   達成譜面数も数えるオマケは、その難易度の最低レベルまで読んで終了（それより下に対象の譜面はない）
      if (n === 1 || (countMin !== null ? n <= countMin : allDone && (bonus || n <= COUNT_MIN_LEVEL))) break;
      await sleep(WAIT_MS);
    }

    if (scored.length === 0) {
      throw new Error(bonus
        ? `対象の譜面（${bonus.label}）のスコアを1件も読み取れませんでした。`
        : 'スコアを1件も読み取れませんでした。ログイン状態を確認してください。');
    }

    // レートの種類ごとに上位 TOP_N を選んで平均
    // 50曲未満の場合も TOP_N で割る（少ない曲数で高く出ないように）
    const results = RATE_MODES.map((mode) => {
      const top = [...scored].sort((a, b) => b.values[mode.id] - a.values[mode.id]).slice(0, TOP_N);
      const rating = top.reduce((sum, s) => sum + s.values[mode.id], 0) / TOP_N;
      return { mode, rating, top };
    });

    status('ジャケット画像の対応表を確認中…');
    const jackets = await jacketPromise;
    if (left()) return null;
    return {
      results,
      scored,
      stats,
      jackets,
      counts: bonus ? null : countStars(scored),
      // オマケの達成譜面数（☆6達成は☆7を、☆5達成は☆6・☆7を含む）。total は読み込んだ対象の譜面数
      bonusCounts: bonus?.countDiff ? {
        star7: scored.filter((s) => s.stars >= 7).length,
        star6: scored.filter((s) => s.stars >= 6).length,
        star5: scored.filter((s) => s.stars >= 5).length,
        total: scored.length,
      } : null,
      info: `Lv${levelInfo(startLevel).label}〜Lv${levelInfo(lastLevel).label} の ${fetched} ページを取得し、${bonus ? `${bonus.label} の ` : ''}${scored.length} 譜面から計算`,
    };
  }
})();
