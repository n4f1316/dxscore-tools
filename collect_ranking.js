(async () => {
  'use strict';

  // ============================================================
  //  でらっくスコア全国ランキング 集計スクリプト
  //  楽曲別ランキング（でらっくスコア・全国）から、譜面ごとに
  //  1位 / 50行目 / 100行目のスコア、平均取得率、MAX人数を集計する。
  //  プレーヤー名は読み取っても保存しない（集計値のみ記録）。
  // ============================================================

  // ===== 設定 =====
  // 実行時に画面で選ぶ。ここは初期値（レベル番号：20=13+ 21=14 22=14+ 23=15）
  const DEFAULT_LEVEL_FROM = 20;
  const DEFAULT_LEVEL_TO = 23;
  const DEFAULT_DIFFS = [2, 3, 4]; // 0=BASIC 1=ADVANCED 2=EXPERT 3=MASTER 4=Re:MASTER
  const LEVEL_MIN = 7;             // 選べる最低レベル（7 = Lv7）
  const LEVEL_MAX = 23;            // 選べる最高レベル（23 = Lv15）
  const WAIT_MS = 2000;            // ページ取得の間隔（サーバー負荷対策）
  const SCORE_TYPE = 1;            // 1 = でらっくスコア
  const RANKING_TYPE = 99;         // 99 = 全国
  const CONST_URL = 'https://n4f1316.github.io/dxscore-tools/maimai_consts_magical.json';
  // 集計結果の保存先：GitHub に置いた JSON を読み込み、取得済みの譜面は飛ばす
  // レベルごとに1ファイル：ranking/lv13p.json（13+）、ranking/lv14.json（14）… の形でGitHubに置く
  const RESULTS_DIR = 'https://n4f1316.github.io/dxscore-tools/ranking/';
  const fileOfLevel = (label) => `lv${String(label).replace('+', 'p')}.json`;
  // 以前の1ファイル方式のJSON（残っていれば読み込んでレベルごとに振り分ける）
  const OLD_RESULTS_URL = 'https://n4f1316.github.io/dxscore-tools/dxscore_ranking.json';
  const LEGACY_KEY = 'dxr-ranking-progress';   // 以前の版がブラウザ内に保存していた記録

  // ジャケット画像（2fRATE と同じ対応表を使う）
  const JACKETS_URL = 'https://n4f1316.github.io/dxscore-tools/maimai_jackets.json';
  const JACKET_BASE = 'https://maimaidx.jp/maimai-mobile/img/Music/';

  const LIST_URL = (lv, d) =>
    `/maimai-mobile/ranking/search/?search=L-${lv}&scoreType=${SCORE_TYPE}&rankingType=${RANKING_TYPE}&diff=${d}`;
  const DETAIL_URL = (idx, d) =>
    `/maimai-mobile/ranking/musicRankingDetail/?scoreType=${SCORE_TYPE}&rankingType=${RANKING_TYPE}&diff=${d}&idx=${encodeURIComponent(idx)}`;

  const DIFF_NAMES = ['BASIC', 'ADVANCED', 'EXPERT', 'MASTER', 'Re:MASTER'];
  const DIFF_BY_CLASS = { basic: 0, advanced: 1, expert: 2, master: 3, remaster: 4 };

  // ☆の条件（2fRATE と同じ）
  const STAR_THRESHOLDS = [
    { stars: 7, pct: 100 }, { stars: 6, pct: 99 }, { stars: 5, pct: 97 }, { stars: 4, pct: 95 },
    { stars: 3, pct: 93 }, { stars: 2, pct: 90 }, { stars: 1, pct: 85 },
  ];

  // ============================================================
  //  補助関数
  // ============================================================

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const num = (t) => Number(String(t).replace(/[,，\s]/g, ''));

  function levelLabel(n) {
    if (n <= 6) return String(n);
    const base = 7 + Math.floor((n - 7) / 2);
    return (n - 7) % 2 === 1 ? `${base}+` : String(base);
  }

  // 取得率(%) → 小数つき☆（例: 99.48% → 6.4）
  function starOfPct(pct) {
    const t = STAR_THRESHOLDS.find((x) => pct >= x.pct);
    if (!t) return Math.floor((pct / 85) * 10) / 10;
    const next = STAR_THRESHOLDS.find((x) => x.stars === t.stars + 1);
    if (!next) return t.stars;
    return t.stars + Math.floor(((pct - t.pct) * 10) / (next.pct - t.pct)) / 10;
  }

  // スコアと最大値 → 小数つき☆（2fRATE と同じ計算。整数で比べるので境界の誤差がない）
  function starOfScore(cur, max) {
    if (!max || cur === null || cur === undefined) return null;
    let s = 0;
    for (const t of STAR_THRESHOLDS) {
      if (cur * 100 >= max * t.pct) { s = t.stars; break; }
    }
    const lo = STAR_THRESHOLDS.find((t) => t.stars === s)?.pct ?? 0;
    const hi = STAR_THRESHOLDS.find((t) => t.stars === s + 1)?.pct;
    if (hi === undefined) return s.toFixed(1);
    const tenths = Math.floor(((cur * 100 - max * lo) * 10) / (max * (hi - lo)));
    return (s + tenths / 10).toFixed(1);
  }

  // ジャケット対応表から曲を特定する
  //   通常の曲：値は画像ファイル名（文字列）
  //   同名の別曲：値は候補の配列 [{ img, genre, st: [BAS..ReMAS のレベル], dx: [...] }]
  //   → 種別・難易度・レベルが一致する候補が1つだけなら、その曲と判断する
  function resolveSong(map, name, kind, diffIdx, level) {
    const v = map?.get(name);
    if (!v) return null;
    if (typeof v === 'string') return { img: v, genre: null };
    if (!Array.isArray(v)) return null;
    const k = kind === 'ST' ? 'st' : 'dx';
    const hits = v.filter((c) => c[k]?.[diffIdx] === level);
    return hits.length === 1 ? { img: hits[0].img, genre: hits[0].genre } : null;
  }

  async function fetchDoc(url) {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    // ログイン切れやメンテナンス中は、エラーページやトップページに転送される
    if (res.redirected && !res.url.includes('/ranking/')) {
      throw new Error('ランキングのページを開けませんでした（ログインが切れているか、メンテナンス中の可能性があります）');
    }
    return new DOMParser().parseFromString(await res.text(), 'text/html');
  }

  // 一覧ページ：各譜面の曲名・種別・難易度・idx を読む
  function parseList(doc) {
    const out = [];
    doc.querySelectorAll('div[class*="_score_back"]').forEach((block) => {
      const m = block.className.match(/music_(\w+?)_score_back/);
      const d = DIFF_BY_CLASS[m?.[1]];
      if (d === undefined) return;
      const name = block.querySelector('.music_name_block')?.textContent.trim();
      const idx = block.querySelector('input[name="idx"]')?.value;
      if (!name || !idx) return;
      const src = block.querySelector('img.music_kind_icon')?.getAttribute('src') ?? '';
      const kind = src.includes('music_standard') ? 'ST' : src.includes('music_dx') ? 'DX' : '?';
      out.push({ name, kind, diff: d, idx });
    });
    return out;
  }

  // ランキングページ：最大値と、上から順の各スコアを読む（名前は読まない）
  function parseDetail(doc) {
    let max = null;
    for (const el of doc.querySelectorAll('.basic_block')) {
      if (!el.textContent.includes('あなたのスコア')) continue;
      const m = el.textContent.match(/[／/]\s*([\d,，]+)/);
      if (m) max = num(m[1]);
      break;
    }
    const scores = [];
    doc.querySelectorAll('.ranking_top_block, .ranking_block').forEach((row) => {
      for (const el of row.querySelectorAll('div')) {
        if (el.children.length) continue;
        const t = el.textContent.trim();
        if (/^\d{1,3}(,\d{3})*$|^\d+$/.test(t) && !el.className.includes('ranking_music_date')) {
          scores.push(num(t));
          break;
        }
      }
    });
    return { max, scores };
  }

  // 上から i 行目（1始まり）の表示上の順位（同率を考慮：自分より高いスコアの人数 + 1）
  const rankAt = (scores, i) => scores.findIndex((s) => s === scores[i - 1]) + 1;

  function summarize(chart, detail, consts) {
    const { max, scores } = detail;
    const n = scores.length;
    const at = (i) => (n >= i ? scores[i - 1] : null);
    const avgPct = max && n ? (scores.reduce((a, s) => a + s, 0) / n / max) * 100 : null;
    const key = `${chart.name}|${chart.kind}|${DIFF_NAMES[chart.diff]}`;
    const c = consts[`${key}|${max}`] ?? consts[key] ?? null;
    return {
      date: new Date().toLocaleString('ja-JP', { hour12: false }), // 例: 2026/9/30 1:16:31
      name: chart.name,
      kind: chart.kind,
      diff: DIFF_NAMES[chart.diff],
      level: chart.level,
      const: c,
      max,
      count: n,
      top1: at(1),
      row50: at(50),
      rank50: n >= 50 ? rankAt(scores, 50) : null,
      row100: at(100),
      rank100: n >= 100 ? rankAt(scores, 100) : null,
      avgPct: avgPct === null ? null : Math.round(avgPct * 1000) / 1000,
      avgStar: avgPct === null ? null : starOfPct(avgPct),
      maxCount: max ? scores.filter((s) => s === max).length : null,
      // ☆6 の人数（99%以上・理論値未満）
      star6Count: max ? scores.filter((s) => s < max && s * 100 >= max * 99).length : null,
    };
  }

  // ============================================================
  //  表示
  // ============================================================

  const STYLE = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .overlay { position: fixed; inset: 0; overflow: auto; background: #F6F4FC; color: #2B2350;
      font: 14px/1.6 "M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", "Hiragino Sans", "Yu Gothic", sans-serif; }
    .wrap { max-width: 820px; margin: 0 auto; padding: 16px 14px 40px; }
    .top { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
    .title { font-weight: 800; font-size: 16px; }
    .card { background: #fff; border: 1.5px solid #E4DFF3; border-radius: 16px; padding: 14px 16px; margin-top: 14px; }
    .label { font-size: 12px; font-weight: 700; color: #6E6892; margin-bottom: 6px; }
    .row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 12px; }
    select { font: inherit; padding: 5px 8px; border-radius: 10px; border: 1.5px solid #E4DFF3; background: #fff; color: #2B2350; }
    .chk { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 999px;
      border: 1.5px solid #E4DFF3; cursor: pointer; user-select: none; }
    .chk input { accent-color: #E0348C; }
    button { font: inherit; font-weight: 700; padding: 6px 14px; border-radius: 999px; cursor: pointer;
      border: 1.5px solid #E4DFF3; background: #fff; color: #2B2350; }
    button.primary { background: #E0348C; border-color: #E0348C; color: #fff; }
    button:disabled { opacity: .45; cursor: default; }
    button:focus-visible, select:focus-visible { outline: 3px solid #1FA9C9; outline-offset: 2px; }
    .status { margin-top: 10px; min-height: 1.6em; }
    .bar { height: 8px; background: #EFECF9; border-radius: 99px; overflow: hidden; margin: 8px 0; }
    .bar > div { height: 100%; width: 0; background: #E0348C; transition: width .2s; }
    .note { font-size: 12px; color: #6E6892; margin-top: 8px; }
    .hidden { display: none !important; }

    /* 結果 */
    .tabs { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0; }
    .tabs button[aria-pressed="true"] { background: #2B2350; border-color: #2B2350; color: #fff; }
    .list { background: #fff; border: 1.5px solid #E4DFF3; border-radius: 16px; overflow: hidden; }
    .r { display: grid; grid-template-columns: 30px 44px 1fr 70px 40px 40px; gap: 8px; align-items: center;
      padding: 8px 12px; border-top: 1px solid #E4DFF3; font-variant-numeric: tabular-nums; }
    .r:nth-child(even) { background: #FBFAFE; }
    .r.head { border-top: 0; background: #2B2350 !important; color: #fff; font-size: 11px; font-weight: 700; padding-top: 7px; padding-bottom: 7px; }
    .c-rank { text-align: center; font-weight: 800; color: #6E6892; }
    .c-num { text-align: right; }
    .r.head .c-num { text-align: center; }
    .r.head button.sort { all: unset; cursor: pointer; text-align: center; color: rgba(255,255,255,.75);
      font-size: 11px; font-weight: 700; white-space: nowrap; border-radius: 6px; padding: 2px 0; }
    .r.head button.sort.on { color: #fff; }
    .r.head button.sort:focus-visible { outline: 2px solid #1FA9C9; outline-offset: 1px; }
    .jacket { width: 44px; height: 44px; border-radius: 8px; object-fit: cover; display: block;
      background: #EFECF9; box-shadow: 0 0 0 1px #E4DFF3; }
    .name { font-weight: 700; line-height: 1.35; word-break: break-word; }
    .meta { font-size: 11px; color: #6E6892; margin-top: 3px; }
    .chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
    .chip { display: inline-block; font-size: 11px; font-weight: 700; line-height: 1; padding: 4px 7px;
      border-radius: 6px; color: #fff; white-space: nowrap; }
    .kind-DX { background: linear-gradient(90deg, #E0348C, #F29A2E); }
    .kind-ST { background: #3B82C4; }
    .kind-unknown { background: #999; }
    .diff-BASIC { background: #2E9E5B; }
    .diff-ADVANCED { background: #D98E04; }
    .diff-EXPERT { background: #E0434B; }
    .diff-MASTER { background: #8E44D6; }
    .diff-REMASTER { background: #fff; color: #8E44D6; box-shadow: inset 0 0 0 1.5px #B68BE0; }
    .const { background: #EFECF9; color: #2B2350; }
    .lv { background: transparent; color: #6E6892; padding-left: 2px; }
    .nw { white-space: nowrap; }
    .date { font-size: 11px; color: #9A94B8; margin-top: 1px; }
    .daterange { font-size: 12px; font-weight: 700; color: #6E6892; margin: 0 2px 6px; }
    .genre { font-size: 11px; font-weight: 700; color: #6E6892; margin-left: 2px; }
    .pct { font-weight: 800; }
    .avgstar { font-size: 12px; font-weight: 700; color: #6E6892; }
    .r .c-num { text-align: right; }
    .r.head .c-num { text-align: center; }
    /* 難易度の切り替えボタン（選択中は難易度の色で塗る） */
    .diffs button { padding: 4px 12px; font-size: 13px; }
    .diffs button.dbtn[aria-pressed="true"] { color: #fff; border-color: transparent; }
    .diffs button.db-BASIC[aria-pressed="true"] { background: #2E9E5B; }
    .diffs button.db-ADVANCED[aria-pressed="true"] { background: #D98E04; }
    .diffs button.db-EXPERT[aria-pressed="true"] { background: #E0434B; }
    .diffs button.db-MASTER[aria-pressed="true"] { background: #8E44D6; }
    .diffs button.db-REMASTER[aria-pressed="true"] { background: #F1E6FD; color: #8E44D6; box-shadow: inset 0 0 0 2px #B68BE0; }
    .diffs button:not(.dbtn)[aria-pressed="true"] { background: #2B2350; border-color: #2B2350; color: #fff; }
    .empty { padding: 20px; text-align: center; color: #6E6892; }
    @media (max-width: 520px) {
      .r { grid-template-columns: 22px 40px 1fr 58px 30px 30px; gap: 6px; padding: 8px 10px; }
      .jacket { width: 40px; height: 40px; }
    }
  `;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function createPanel() {
    document.getElementById('dxr-rank-panel')?.remove();
    const host = el('div');
    host.id = 'dxr-rank-panel';
    host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:99999;display:block;';
    const root = host.attachShadow({ mode: 'open' });
    const style = el('style');
    style.textContent = STYLE;
    const overlay = el('div', 'overlay');
    root.append(style, overlay);
    document.body.appendChild(host);
    return { host, overlay };
  }

  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function toCsv(rows) {
    const head = ['取得日時', '曲名', '種別', '難易度', 'レベル', '公式定数', '最大値', '掲載人数',
      '1位スコア', '50位スコア', '50位の同率順位', '100位スコア', '100位の同率順位',
      '平均取得率(%)', '平均☆', '☆7人数(MAX)', '☆6人数'];
    const keys = ['date', 'name', 'kind', 'diff', 'level', 'const', 'max', 'count',
      'top1', 'row50', 'rank50', 'row100', 'rank100', 'avgPct', 'avgStar', 'maxCount', 'star6Count'];
    const esc = (v) => {
      const t = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    return '\uFEFF' + [head.join(','), ...rows.map((r) => keys.map((k) => esc(r[k])).join(','))].join('\n');
  }

  // 取得日時 → 「2026/09/30」形式の年月日（古い版の ISO 形式「2026-09-29T16:16:31Z」にも対応）
  function dateOf(v) {
    if (!v) return null;
    const p = (x) => String(x).padStart(2, '0');
    const m = String(v).match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
    if (m) return `${m[1]}/${p(m[2])}/${p(m[3])}`;
    const d = new Date(v);
    return isNaN(d) ? null : `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}`;
  }

  // 平均取得率の高い順（取れなかった譜面は最後）
  const byAvgDesc = (a, b) => (b.avgPct ?? -1) - (a.avgPct ?? -1);

  // レベル表記 → 並べ替え用の数値（15 > 14+ > 14 …）
  const levelOrder = (label) => parseInt(label, 10) + (String(label).endsWith('+') ? 0.5 : 0);

  // ============================================================
  //  メイン処理
  // ============================================================

  if (location.hostname !== 'maimaidx.jp') {
    alert('maimai DX NET にログインした状態で実行してください。');
    return;
  }

  // 集計結果は「譜面 → 1行」の表で持つ（キー：曲名|種別|難易度|レベル）
  // 同名の別曲（Link など）を区別するため、でらっくスコアの最大値もキーに含める
  // （ランキングページの「あなたのスコア」には未プレーでも最大値が出るので必ず取れる）
  const baseOfRow = (r) => `${r.name}|${r.kind}|${r.diff}|${r.level}`;
  const keyOfRow = (r) => `${baseOfRow(r)}|${r.max}`;
  // 読み込んだデータが集計結果の形をしているか（壊れたファイルや別のJSONを読み込まないため）
  const isRow = (r) => r && typeof r === 'object' && typeof r.name === 'string' && typeof r.level === 'string';
  const rowsOfBase = (base) => Object.values(results).filter((r) => baseOfRow(r) === base);
  let results = {};
  let loadedCount = 0;
  let jackets = null; // 曲名 → ジャケット画像のファイル名（同名の別曲は候補の一覧）
  const changedLevels = new Set(); // 今回の実行で内容が変わったレベル（ダウンロード対象）
  const rows = () => Object.values(results);

  // 以前の版がブラウザ内に保存していた記録があれば、結果に合流させる（消さずに引き継ぐ）
  let legacyRows = [];
  try {
    legacyRows = Object.values(JSON.parse(localStorage.getItem(LEGACY_KEY))?.results ?? {});
  } catch { /* なし */ }

  const stamp = () => {
    const d = new Date();
    const p = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
  };

  const { host, overlay } = createPanel();
  const wrap = el('div', 'wrap');
  overlay.appendChild(wrap);

  const top = el('div', 'top');
  const closeBtn = el('button', '', '閉じる');
  top.append(el('div', 'title', 'でらっくスコア ランキング集計'), closeBtn);
  wrap.appendChild(top);

  // ---- 設定カード ----
  const setup = el('div', 'card');
  const levelRow = el('div', 'row');
  const fromSel = el('select');
  const toSel = el('select');
  for (let n = LEVEL_MAX; n >= LEVEL_MIN; n--) {
    fromSel.appendChild(new Option(`Lv${levelLabel(n)}`, n, false, n === DEFAULT_LEVEL_FROM));
    toSel.appendChild(new Option(`Lv${levelLabel(n)}`, n, false, n === DEFAULT_LEVEL_TO));
  }
  levelRow.append(fromSel, el('span', '', '〜'), toSel);

  const diffRow = el('div', 'row');
  const diffChecks = DIFF_NAMES.map((name, d) => {
    const lab = el('label', 'chk');
    const cb = el('input');
    cb.type = 'checkbox';
    cb.checked = DEFAULT_DIFFS.includes(d);
    lab.append(cb, document.createTextNode(name));
    diffRow.appendChild(lab);
    return cb;
  });

  const actRow = el('div', 'row');
  const startBtn = el('button', 'primary', '集計を開始');
  const viewBtn = el('button', '', '集計済みの結果を見る');
  const legacyBtn = el('button', '', 'ブラウザ内の古い記録を消去');
  actRow.append(startBtn, viewBtn, legacyBtn);

  // 全件取り直しの切り替え
  const refetchLabel = el('label', 'chk');
  const refetchCb = el('input');
  refetchCb.type = 'checkbox';
  refetchLabel.append(refetchCb, document.createTextNode('集計済みの譜面も取り直す（全件取得）'));
  const refetchRow = el('div', 'row');
  refetchRow.appendChild(refetchLabel);
  const loadInfo = el('div', 'note', 'GitHubの集計結果を読み込み中…');

  setup.append(
    el('div', 'label', 'レベルの範囲'), levelRow,
    el('div', 'label', '難易度'), diffRow,
    el('div', 'label', '取得のしかた'), refetchRow,
    actRow,
    loadInfo,
    el('div', 'note', '集計結果はブラウザに保存しません。終わったら「更新したレベルのJSONをダウンロード」で保存し、GitHubの ranking フォルダに同じ名前でアップロードしてください（例：Lv13+ は lv13p.json）。プレーヤー名は保存しません。')
  );
  wrap.appendChild(setup);

  // ---- 進行状況カード ----
  const runCard = el('div', 'card hidden');
  const status = el('div', 'status');
  const bar = el('div', 'bar');
  const barFill = el('div');
  bar.appendChild(barFill);
  const stopBtn = el('button', '', '中止');
  runCard.append(status, bar, stopBtn);
  wrap.appendChild(runCard);

  // ---- 結果カード ----
  const resultCard = el('div', 'hidden');
  wrap.appendChild(resultCard);

  const setStatus = (t) => { status.textContent = t; };
  const setProgress = (r) => { barFill.style.width = `${Math.round(r * 100)}%`; };

  let stopped = false;
  let running = false;
  closeBtn.onclick = () => { stopped = true; host.remove(); };
  stopBtn.onclick = () => { stopped = true; stopBtn.disabled = true; setStatus('中止しています…（取得中のページが終わりしだい止まります）'); };

  legacyBtn.classList.toggle('hidden', legacyRows.length === 0);
  legacyBtn.onclick = () => {
    if (!confirm('ブラウザ内に残っている以前の版の記録を消去しますか？（今の結果一覧には残ります）')) return;
    try { localStorage.removeItem(LEGACY_KEY); } catch { /* 無視 */ }
    legacyBtn.classList.add('hidden');
  };
  viewBtn.disabled = true;
  viewBtn.onclick = () => renderResults();

  // GitHub の集計結果を読み込む（なければ空から始める）
  startBtn.disabled = true;
  // ジャケットの対応表は並行して読み込む（読めなくても集計は動く）
  const jacketsPromise = fetch(JACKETS_URL + '?' + Date.now())
    .then((res) => (res.ok ? res.json() : null))
    .then((obj) => (obj ? new Map(Object.entries(obj)) : null))
    .catch(() => null);
  // 各レベルのファイルを並行して読み込む（GitHubへのアクセスなので公式サイトの負荷にはならない）
  const fetchJson = (url) =>
    fetch(url + '?' + Date.now()).then((res) => (res.ok ? res.json() : null)).catch(() => null);
  const labels = [];
  for (let n = LEVEL_MAX; n >= LEVEL_MIN; n--) labels.push(levelLabel(n));
  const perLevel = await Promise.all(labels.map((lb) => fetchJson(RESULTS_DIR + fileOfLevel(lb))));
  const loadedLevels = [];
  perLevel.forEach((list, i) => {
    if (!list) return;
    const arr = Array.isArray(list) ? list : Object.values(list);
    arr.filter(isRow).forEach((r) => { results[keyOfRow(r)] = r; });
    loadedLevels.push(`Lv${labels[i]}（${arr.length}）`);
  });
  loadedCount = rows().length;
  jackets = await jacketsPromise;

  // 以前の1ファイル方式のJSON・ブラウザ内の記録は、レベルごとのファイルにない譜面だけ合流させる
  // （合流した譜面のレベルは「更新あり」にして、次のダウンロードでレベルごとのファイルに書き出す）
  let migrated = 0;
  const merge = (arr) => arr.forEach((r) => {
    if (!isRow(r) || results[keyOfRow(r)]) return;
    results[keyOfRow(r)] = r;
    changedLevels.add(r.level);
    migrated++;
  });
  const oldList = await fetchJson(OLD_RESULTS_URL);
  if (oldList) merge(Array.isArray(oldList) ? oldList : Object.values(oldList));
  merge(legacyRows);

  loadInfo.textContent =
    (loadedLevels.length
      ? `GitHubの集計結果：${loadedLevels.join('、')}`
      : 'GitHubの集計結果：まだありません') +
    (migrated ? `。以前の形式の記録から ${migrated} 譜面を引き継ぎました（ダウンロードしてレベルごとのファイルに移してください）` : '');
  startBtn.disabled = false;
  viewBtn.disabled = rows().length === 0;

  // ---- 結果表示：レベルごとのタブ、平均取得率の高い順 ----
  function renderResults(prefer) {
    resultCard.replaceChildren();
    resultCard.classList.remove('hidden');
    const all = rows();
    if (!all.length) {
      resultCard.appendChild(el('div', 'card empty', 'まだ集計結果がありません。'));
      return;
    }

    const dl = el('div', 'row');
    dl.style.marginTop = '14px';
    // レベルごとのJSONを書き出す（ブラウザが「複数ファイルのダウンロード」の許可を求めることがあります）
    const downloadLevels = async (lvList) => {
      for (const lv of lvList) {
        const arr = all.filter((r) => r.level === lv).sort(byAvgDesc);
        download(fileOfLevel(lv), JSON.stringify(arr, null, 1), 'application/json');
        await sleep(400);
      }
    };
    const changed = [...changedLevels].sort((a, b) => levelOrder(b) - levelOrder(a));
    const jsonBtn = el('button', 'primary',
      changed.length ? `更新したレベルのJSONをダウンロード（${changed.map((l) => 'Lv' + l).join('・')}）` : '更新したレベルはありません');
    jsonBtn.disabled = !changed.length;
    jsonBtn.onclick = () => downloadLevels(changed);
    const csvBtn = el('button', '', 'CSVをダウンロード（全レベル）');
    csvBtn.onclick = () => download(`dxscore_ranking_${stamp()}.csv`, toCsv(all.sort(byAvgDesc)), 'text/csv');
    dl.append(jsonBtn, csvBtn);

    const levels = [...new Set(all.map((r) => r.level))].sort((a, b) => levelOrder(b) - levelOrder(a));
    const tabs = el('div', 'tabs');
    const listBox = el('div');
    const tabDefs = [...levels.map((lv) => ({ key: lv, label: `Lv${lv}` })), { key: '*', label: 'すべて' }];
    const buttons = tabDefs.map((t) => {
      const b = el('button', '', t.label);
      b.type = 'button';
      b.onclick = () => select(t.key);
      tabs.appendChild(b);
      return b;
    });

    // 並び替えの状態（見出しを押すと切り替わる。同じ見出しをもう一度押すと昇順/降順が逆になる）
    const SORTS = { avgPct: '平均', maxCount: '☆7', star6Count: '☆6' };
    let sortKey = 'avgPct';
    let sortDir = -1; // -1 = 高い順, 1 = 低い順
    let currentTab = null;
    let currentDiffs = null; // 表示する難易度の集合（null = すべて）。複数選べる
    const sortFn = (a, b) => {
      const va = a[sortKey] ?? -Infinity;
      const vb = b[sortKey] ?? -Infinity;
      if (va !== vb) return (va - vb) * sortDir;
      return byAvgDesc(a, b); // 同じ値なら平均取得率の高い順
    };

    function select(key) {
      currentTab = key;
      buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(tabDefs[i].key === key)));
      const list = el('div', 'list');
      const head = el('div', 'r head');
      const sortHead = (k) => {
        const b = el('button', 'c-num sort' + (sortKey === k ? ' on' : ''),
          SORTS[k] + (sortKey === k ? (sortDir < 0 ? '▼' : '▲') : ''));
        b.type = 'button';
        b.title = '押すと並び替え';
        b.onclick = () => {
          if (sortKey === k) sortDir = -sortDir;
          else { sortKey = k; sortDir = -1; }
          select(currentTab);
        };
        return b;
      };
      head.append(el('div', 'c-rank', '#'), el('div'), el('div', '', '曲名'),
        sortHead('avgPct'), sortHead('maxCount'), sortHead('star6Count'));
      list.appendChild(head);
      const items = all
        .filter((r) => (key === '*' || r.level === key) && (currentDiffs === null || currentDiffs.has(r.diff)))
        .sort(sortFn);
      items.forEach((r, i) => {
        const row = el('div', 'r');
        const main = el('div');
        const song = resolveSong(jackets, r.name, r.kind, DIFF_NAMES.indexOf(r.diff), r.level);
        const nameEl = el('div', 'name', r.name);
        // 同名の別曲は、判別できたときにジャンルを添える
        if (song?.genre) nameEl.appendChild(el('span', 'genre', `（${song.genre}）`));
        main.appendChild(nameEl);
        // 2fRATE と同じ表記：DX/ST、難易度、定数のラベル
        const chips = el('div', 'chips');
        chips.append(
          el('span', `chip kind-${r.kind === '?' ? 'unknown' : r.kind}`, r.kind),
          el('span', `chip diff-${String(r.diff).replace(':', '').toUpperCase()}`, r.diff)
        );
        if (r.const !== null && r.const !== undefined) chips.appendChild(el('span', 'chip const', Number(r.const).toFixed(1)));
        if (key === '*') chips.appendChild(el('span', 'chip lv', `Lv${r.level}`));
        main.appendChild(chips);
        // 「1位 1711」などの区切りの途中で改行されないよう、項目ごとにまとめる
        const meta = el('div', 'meta');
        const withStar = (v) => {
          if (v === null || v === undefined) return '-';
          const st = starOfScore(v, r.max);
          return st === null ? String(v) : `${v}(☆${st})`;
        };
        [`1位 ${withStar(r.top1)}`, `50位 ${withStar(r.row50)}`, `100位 ${withStar(r.row100)}`, `MAX ${r.max ?? '-'}`]
          .forEach((t, i) => {
            if (i) meta.appendChild(document.createTextNode(i === 3 ? '　' : ' / '));
            meta.appendChild(el('span', 'nw', t));
          });
        main.appendChild(meta);
        // 取得した年月日
        const got = dateOf(r.date);
        if (got) main.appendChild(el('div', 'date', `取得日 ${got}`));
        // ジャケット画像（見つからない・読み込めない場合は空の枠）
        let jacket;
        const file = song?.img;
        if (file) {
          jacket = el('img', 'jacket');
          jacket.src = JACKET_BASE + file;
          jacket.alt = '';
          jacket.loading = 'lazy';
          jacket.decoding = 'async';
          jacket.onerror = () => jacket.removeAttribute('src');
        } else {
          jacket = el('div', 'jacket');
        }
        row.append(
          el('div', 'c-rank', String(i + 1)),
          jacket,
          main,
          (() => {
            // 平均取得率と平均☆を1つの列に（98.71% の下に ☆5.8）
            const cell = el('div', 'c-num');
            cell.append(
              el('div', 'pct', r.avgPct === null ? '-' : `${r.avgPct.toFixed(2)}%`),
              el('div', 'avgstar', r.avgStar === null || r.avgStar === undefined ? '' : `☆${Number(r.avgStar).toFixed(1)}`)
            );
            return cell;
          })(),
          el('div', 'c-num', r.maxCount ?? '-'),
          el('div', 'c-num', r.star6Count ?? '-')
        );
        list.appendChild(row);
      });
      if (!items.length) list.appendChild(el('div', 'empty', 'この条件の譜面はありません。'));
      // 表示中の譜面の取得日の範囲
      const dates = items.map((r) => dateOf(r.date)).filter(Boolean).sort();
      const range = dates.length
        ? (dates[0] === dates[dates.length - 1] ? `取得日：${dates[0]}` : `取得日：${dates[0]} 〜 ${dates[dates.length - 1]}`)
        : '';
      const tools = el('div', 'row');
      tools.style.margin = '0 0 8px';
      // 難易度の切り替え（集計済みの難易度だけ表示）
      const diffsHere = DIFF_NAMES.filter((d) => all.some((r) => r.diff === d));
      const diffBox = el('div', 'tabs diffs');
      diffBox.style.margin = '0';
      [['*', 'すべての難易度'], ...diffsHere.map((d) => [d, d])].forEach(([d, label]) => {
        const b = el('button', d === '*' ? '' : `dbtn db-${d.replace(':', '').toUpperCase()}`, label);
        b.type = 'button';
        b.setAttribute('aria-pressed', String(d === '*' ? currentDiffs === null : !!currentDiffs?.has(d)));
        b.onclick = () => {
          if (d === '*') {
            currentDiffs = null; // すべて表示に戻す
          } else if (currentDiffs === null) {
            currentDiffs = new Set([d]); // 「すべて」から1つ選んだら、その難易度だけにする
          } else if (currentDiffs.has(d)) {
            currentDiffs.delete(d); // 選択中をもう一度押すと外す
            if (!currentDiffs.size) currentDiffs = null; // 全部外したら「すべて」に戻す
          } else {
            currentDiffs.add(d); // 追加で押すと、その難易度も一緒に表示
          }
          select(currentTab);
        };
        diffBox.appendChild(b);
      });
      tools.appendChild(diffBox);
      if (key !== '*') {
        const one = el('button', '', `Lv${key} のJSONをダウンロード`);
        one.onclick = () => downloadLevels([key]);
        tools.appendChild(one);
      }
      listBox.replaceChildren(tools, ...(range ? [el('div', 'daterange', `${range}（${items.length} 譜面）`)] : []), list);
    }

    resultCard.append(dl, tabs, listBox);
    select(prefer && levels.includes(prefer) ? prefer : levels[0]);
  }

  // ---- 集計の実行 ----
  startBtn.onclick = async () => {
    if (running) return;
    let from = Number(fromSel.value);
    let to = Number(toSel.value);
    if (from > to) [from, to] = [to, from];
    const diffs = diffChecks.map((cb, d) => (cb.checked ? d : null)).filter((d) => d !== null);
    if (!diffs.length) {
      alert('難易度を1つ以上選んでください。');
      return;
    }

    running = true;
    stopped = false;
    startBtn.disabled = true;
    viewBtn.disabled = true;
    legacyBtn.disabled = true;
    stopBtn.disabled = false;
    runCard.classList.remove('hidden');
    resultCard.classList.add('hidden');
    setProgress(0);

    try {
      // 定数表（公式定数の列に使う。読めなくても集計は続ける）
      let consts = {};
      try {
        consts = await (await fetch(CONST_URL + '?' + Date.now())).json();
      } catch { /* 空のまま */ }

      // 1. 一覧ページから対象譜面を集める（idx は毎回変わるので必ず取り直す）
      const levelsSel = [];
      for (let n = to; n >= from; n--) levelsSel.push(n);
      const lists = levelsSel.flatMap((lv) => diffs.map((d) => ({ lv, d })));
      const charts = [];
      for (const [i, { lv, d }] of lists.entries()) {
        if (stopped) break;
        setStatus(`譜面一覧を取得中… Lv${levelLabel(lv)} ${DIFF_NAMES[d]}（${i + 1}/${lists.length}）`);
        parseList(await fetchDoc(LIST_URL(lv, d))).forEach((c) => charts.push({ ...c, level: levelLabel(lv) }));
        await sleep(WAIT_MS);
      }

      // 2. まだ集計していない譜面のランキングを順に取得
      // 集計済みの譜面は飛ばす（全件取得にチェックがあれば、すべて取り直す）
      // 一覧ページには最大値が出ないので、まず「曲名|種別|難易度|レベル」で数え、
      // 同じ組み合わせが複数ある譜面（同名の別曲）は、その数だけ結果がそろっていなければ取り直す
      const baseOf = (c) => `${c.name}|${c.kind}|${DIFF_NAMES[c.diff]}|${c.level}`;
      const dupCount = {};
      charts.forEach((c) => { dupCount[baseOf(c)] = (dupCount[baseOf(c)] ?? 0) + 1; });
      const todo = refetchCb.checked
        ? charts
        : charts.filter((c) => rowsOfBase(baseOf(c)).length < dupCount[baseOf(c)]);
      if (!charts.length && !stopped) {
        throw new Error('一覧ページから譜面を1つも読み取れませんでした。ログイン状態を確認し、メンテナンス時間外に実行してください。');
      }
      const done0 = charts.length - todo.length;
      let failCount = 0;
      let newCount = 0;
      for (const [i, c] of todo.entries()) {
        if (stopped) break;
        setStatus(`集計中… ${done0 + i + 1}/${charts.length}　${c.name}（${c.kind} ${DIFF_NAMES[c.diff]}）`);
        setProgress((done0 + i) / Math.max(charts.length, 1));
        try {
          const detail = parseDetail(await fetchDoc(DETAIL_URL(c.idx, c.diff)));
          const row = summarize(c, detail, consts);
          // 同名の別曲でなければ、古い記録（最大値が変わった場合なども含む）を消してから入れる
          if (dupCount[baseOf(c)] === 1) {
            rowsOfBase(baseOf(c)).forEach((r) => delete results[keyOfRow(r)]);
          }
          results[keyOfRow(row)] = row;
          newCount++;
          changedLevels.add(c.level);
        } catch (e) {
          failCount++;
          console.warn('取得に失敗した譜面', c.name, e);
          // 最初の数件が続けて失敗したら、ログイン切れなどとみなして止める
          if (failCount >= 3 && newCount === 0) throw e;
        }
        await sleep(WAIT_MS);
      }

      const doneNow = charts.filter((c) => rowsOfBase(baseOf(c)).length >= 1).length;
      setProgress(doneNow / Math.max(charts.length, 1));
      setStatus((stopped
        ? `中止しました（選んだ範囲の ${doneNow}/${charts.length} 譜面が集計済み、今回 ${newCount} 譜面を取得）。`
        : `完了しました（対象 ${charts.length} 譜面のうち、今回 ${newCount} 譜面を取得${failCount ? `、${failCount} 譜面は取得に失敗` : ''}）。`) +
        (changedLevels.size ? '「更新したレベルのJSONをダウンロード」で保存し、GitHubの ranking フォルダのファイルを置き換えてください。' : ''));
      renderResults(levelLabel(to));
    } catch (e) {
      setStatus('エラー: ' + e.message);
      console.error(e);
    } finally {
      running = false;
      startBtn.disabled = false;
      legacyBtn.disabled = false;
      viewBtn.disabled = rows().length === 0;
      stopBtn.disabled = true;
    }
  };
})();
