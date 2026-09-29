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
  const RESULTS_URL = 'https://n4f1316.github.io/dxscore-tools/dxscore_ranking.json';
  const RESULTS_FILE = 'dxscore_ranking.json'; // ダウンロード時のファイル名（そのままアップロードできる名前）
  const LEGACY_KEY = 'dxr-ranking-progress';   // 以前の版がブラウザ内に保存していた記録

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

  async function fetchDoc(url) {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
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
    .r { display: grid; grid-template-columns: 30px 1fr 64px 44px 44px; gap: 8px; align-items: center;
      padding: 8px 12px; border-top: 1px solid #E4DFF3; font-variant-numeric: tabular-nums; }
    .r:nth-child(even) { background: #FBFAFE; }
    .r.head { border-top: 0; background: #2B2350 !important; color: #fff; font-size: 11px; font-weight: 700; padding-top: 7px; padding-bottom: 7px; }
    .c-rank { text-align: center; font-weight: 800; color: #6E6892; }
    .c-num { text-align: right; }
    .r.head .c-num { text-align: center; }
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
    .pct { font-weight: 800; }
    .empty { padding: 20px; text-align: center; color: #6E6892; }
    @media (max-width: 520px) {
      .r { grid-template-columns: 22px 1fr 58px 36px 36px; gap: 6px; padding: 8px 10px; }
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
      '平均取得率(%)', '平均☆', 'MAX人数'];
    const keys = ['date', 'name', 'kind', 'diff', 'level', 'const', 'max', 'count',
      'top1', 'row50', 'rank50', 'row100', 'rank100', 'avgPct', 'avgStar', 'maxCount'];
    const esc = (v) => {
      const t = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    return '\uFEFF' + [head.join(','), ...rows.map((r) => keys.map((k) => esc(r[k])).join(','))].join('\n');
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
  const keyOfRow = (r) => `${r.name}|${r.kind}|${r.diff}|${r.level}`;
  let results = {};
  let loadedCount = 0;
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
    el('div', 'note', '集計結果はブラウザに保存しません。終わったら「JSONをダウンロード」で保存し、GitHubの dxscore_ranking.json を置き換えてください。プレーヤー名は保存しません。')
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
  try {
    const res = await fetch(RESULTS_URL + '?' + Date.now());
    if (res.ok) {
      const list = await res.json();
      (Array.isArray(list) ? list : Object.values(list)).forEach((r) => { results[keyOfRow(r)] = r; });
    }
  } catch { /* 読めなければ空のまま */ }
  loadedCount = rows().length;
  // 以前の版のブラウザ内の記録を合流（GitHubにない譜面だけ）
  let legacyAdded = 0;
  legacyRows.forEach((r) => {
    if (!results[keyOfRow(r)]) { results[keyOfRow(r)] = r; legacyAdded++; }
  });
  loadInfo.textContent =
    `GitHubの集計結果：${loadedCount} 譜面` +
    (legacyAdded ? `（ブラウザ内の以前の記録から ${legacyAdded} 譜面を追加）` : '') +
    (loadedCount ? '' : '（ファイルがないか、まだ空です）');
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
    const csvBtn = el('button', 'primary', 'CSVをダウンロード');
    const jsonBtn = el('button', '', 'JSONをダウンロード');
    csvBtn.onclick = () => download(`dxscore_ranking_${stamp()}.csv`, toCsv(all.sort(byAvgDesc)), 'text/csv');
    jsonBtn.onclick = () => download(RESULTS_FILE, JSON.stringify(all.sort(byAvgDesc), null, 1), 'application/json');
    dl.append(csvBtn, jsonBtn);

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

    function select(key) {
      buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(tabDefs[i].key === key)));
      const list = el('div', 'list');
      const head = el('div', 'r head');
      head.append(el('div', 'c-rank', '#'), el('div', '', '曲名'), el('div', 'c-num', '平均取得率'),
        el('div', 'c-num', '平均☆'), el('div', 'c-num', 'MAX'));
      list.appendChild(head);
      const items = all.filter((r) => key === '*' || r.level === key).sort(byAvgDesc);
      items.forEach((r, i) => {
        const row = el('div', 'r');
        const main = el('div');
        main.appendChild(el('div', 'name', r.name));
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
        [`1位 ${r.top1 ?? '-'}`, `50位 ${r.row50 ?? '-'}`, `100位 ${r.row100 ?? '-'}`, `MAX ${r.max ?? '-'}`]
          .forEach((t, i) => {
            if (i) meta.appendChild(document.createTextNode(i === 3 ? '　' : ' / '));
            meta.appendChild(el('span', 'nw', t));
          });
        main.appendChild(meta);
        row.append(
          el('div', 'c-rank', String(i + 1)),
          main,
          el('div', 'c-num pct', r.avgPct === null ? '-' : `${r.avgPct.toFixed(2)}%`),
          el('div', 'c-num', r.avgStar === null ? '-' : r.avgStar.toFixed(1)),
          el('div', 'c-num', r.maxCount ?? '-')
        );
        list.appendChild(row);
      });
      listBox.replaceChildren(list);
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
      const keyOf = (c) => `${c.name}|${c.kind}|${DIFF_NAMES[c.diff]}|${c.level}`;
      // 集計済みの譜面は飛ばす（全件取得にチェックがあれば、すべて取り直す）
      const todo = refetchCb.checked ? charts : charts.filter((c) => !results[keyOf(c)]);
      const done0 = charts.length - todo.length;
      let newCount = 0;
      for (const [i, c] of todo.entries()) {
        if (stopped) break;
        setStatus(`集計中… ${done0 + i + 1}/${charts.length}　${c.name}（${c.kind} ${DIFF_NAMES[c.diff]}）`);
        setProgress((done0 + i) / Math.max(charts.length, 1));
        try {
          const detail = parseDetail(await fetchDoc(DETAIL_URL(c.idx, c.diff)));
          results[keyOf(c)] = summarize(c, detail, consts);
          newCount++;
        } catch (e) {
          console.warn('取得に失敗した譜面', c.name, e);
        }
        await sleep(WAIT_MS);
      }

      const doneNow = charts.filter((c) => results[keyOf(c)]).length;
      setProgress(doneNow / Math.max(charts.length, 1));
      setStatus((stopped
        ? `中止しました（選んだ範囲の ${doneNow}/${charts.length} 譜面が集計済み、今回 ${newCount} 譜面を取得）。`
        : `完了しました（今回 ${newCount} 譜面を取得）。`) +
        (newCount ? '「JSONをダウンロード」で保存し、GitHubのファイルを置き換えてください。' : ''));
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
