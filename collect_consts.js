(async () => {
  'use strict';

  // ============================================================
  //  譜面定数収集スクリプト
  //  レベル別ページの並び順（定数の低い順 → 同じ定数内はジャンル順）を利用して、
  //  ジャンルの並びが「後戻り」した地点を定数の段の境目とみなし、定数を割り当てる。
  // ============================================================

  // ===== 設定 =====
  const LEVEL_FROM = 23;     // 取得を始めるレベル番号（23 = Lv15）
  const LEVEL_TO = 7;        // 取得を終えるレベル番号（7 = Lv7。1〜6 は定数の範囲が不明確なので対象外）
  const WAIT_MS = 1500;      // ページ取得の間隔（サーバー負荷対策）
  const DIFF_COUNT = 5;      // BASIC〜Re:MASTER

  const GENRE_URL = (d) => `/maimai-mobile/record/musicGenre/search/?genre=99&diff=${d}`;
  const LEVEL_URL = (n) => `/maimai-mobile/record/musicLevel/search/?level=${n}`;

  const SEL = {
    block: 'div[class*="_score_back"]', // 1譜面分の枠
    name:  '.music_name_block',         // 曲名
    score: '.music_score_block',        // 達成率・でらっくスコア
    genre: 'div.screw_block',           // ジャンル見出し（全ジャンルページ）
  };
  const KIND_ICON = 'img[src*="music_dx.png"], img[src*="music_standard.png"]';

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
  const round1 = (x) => Math.round(x * 10) / 10;

  // level パラメータ → 表示ラベルと定数の範囲、段数
  function levelInfo(n) {
    let info;
    if (n <= 6) {
      info = { label: String(n), min: n, max: n + 0.9 };
    } else {
      const base = 7 + Math.floor((n - 7) / 2);
      const plus = (n - 7) % 2 === 1;
      info = plus
        ? { label: `${base}+`, min: base + 0.6, max: base + 0.9 }
        : { label: String(base), min: base, max: base + 0.5 };
      if (base === 15 && !plus) info.max = 15.0; // Lv15 は 15.0 のみ
    }
    info.steps = Math.round((info.max - info.min) * 10) + 1;
    return info;
  }

  // 各枠の直後にある最初のDX/STアイコンをその譜面の種別とする
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

  // ページ内の譜面を上から順に読み取る（全ジャンルページではジャンル見出しも読む）
  function parseCharts(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const kindMap = buildKindMap(doc);
    const charts = [];
    let genre = null;

    doc.querySelectorAll(`${SEL.genre}, ${SEL.block}`).forEach((el) => {
      if (el.matches(SEL.genre)) {
        genre = el.textContent.trim();
        return;
      }
      const m = el.className.match(/music_(\w+?)_score_back/);
      const diff = DIFF_BY_CLASS[m?.[1]];
      if (!diff) return; // 宴など

      const name = el.querySelector(SEL.name)?.textContent.trim();
      if (!name) return;

      // でらっくスコアの最大値（未プレーだと表示がないので null）
      let max = null;
      el.querySelectorAll(SEL.score).forEach((s) => {
        const t = s.textContent.replace(/,/g, '').match(/(\d+)\s*\/\s*(\d+)/);
        if (t && Number(t[2]) > 0) max = Number(t[2]);
      });

      const kind = kindMap.get(el) ?? '?';
      const key = `${name}|${kind}|${diff}`;
      charts.push({ name, kind, diff, max, genre, key, keyMax: max ? `${key}|${max}` : null });
    });

    return charts;
  }

  async function fetchPage(url, label) {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`${label} の取得に失敗しました (HTTP ${res.status})`);
    return res.text();
  }

  function createPanel() {
    document.getElementById('dxc-panel')?.remove();
    const panel = document.createElement('div');
    panel.id = 'dxc-panel';
    panel.style.cssText =
      'position:fixed;inset:0;z-index:99999;overflow:auto;' +
      'background:#fdfdfd;color:#222;font:14px/1.5 sans-serif;padding:12px;';
    const close = document.createElement('button');
    close.textContent = '閉じる';
    close.style.cssText = 'float:right;font-size:16px;padding:4px 14px;';
    close.onclick = () => panel.remove();
    const status = document.createElement('p');
    const body = document.createElement('div');
    panel.append(close, status, body);
    document.body.appendChild(panel);
    return { body, status: (t) => { status.textContent = t; } };
  }

  function makeTable(head, rows) {
    const table = document.createElement('table');
    table.style.cssText = 'border-collapse:collapse;font-size:13px;margin-bottom:12px;';
    const tr0 = table.insertRow();
    head.forEach((t) => {
      const th = document.createElement('th');
      th.textContent = t;
      th.style.cssText = 'border-bottom:2px solid #888;padding:3px 8px;text-align:left;';
      tr0.appendChild(th);
    });
    rows.forEach((r) => {
      const tr = table.insertRow();
      r.forEach((v) => {
        const td = tr.insertCell();
        td.textContent = v;
        td.style.cssText = 'border-bottom:1px solid #ddd;padding:3px 8px;';
      });
    });
    return table;
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
    // ---- 1. 全ジャンルページから「譜面 → ジャンル」の対応表を作る ----
    const genreOrder = [];               // ジャンルの並び順（最初に出てきた順）
    const genreByKey = new Map();        // キー → ジャンル名の集合
    const addGenre = (k, g) => {
      if (!k || !g) return;
      if (!genreByKey.has(k)) genreByKey.set(k, new Set());
      genreByKey.get(k).add(g);
    };

    for (let d = 0; d < DIFF_COUNT; d++) {
      ui.status(`ジャンル情報を取得中…（${d + 1}/${DIFF_COUNT}）`);
      const charts = parseCharts(await fetchPage(GENRE_URL(d), `ジャンルページ(diff=${d})`));
      for (const c of charts) {
        if (c.genre && !genreOrder.includes(c.genre)) genreOrder.push(c.genre);
        addGenre(c.key, c.genre);
        addGenre(c.keyMax, c.genre);
      }
      await sleep(WAIT_MS);
    }
    if (genreOrder.length === 0) throw new Error('ジャンル見出しを読み取れませんでした。');

    // 最大値つきのキーを優先し、ジャンルが1つに決まる場合だけ返す
    function lookupGenreIdx(c) {
      for (const k of [c.keyMax, c.key]) {
        const s = k && genreByKey.get(k);
        if (s && s.size === 1) return genreOrder.indexOf([...s][0]);
      }
      return null;
    }

    // ---- 2. レベル別ページを読み、段の境目を検出して定数を割り当てる ----
    const levelReports = [];
    const results = [];

    for (let n = LEVEL_FROM; n >= LEVEL_TO; n--) {
      const info = levelInfo(n);
      ui.status(`Lv${info.label} を解析中…`);
      const charts = parseCharts(await fetchPage(LEVEL_URL(n), `Lv${info.label}`));

      // 上から見て、ジャンルの順番が後戻りしたら次の段
      let group = 0;
      let prev = -1;
      const items = charts.map((c) => {
        const gi = lookupGenreIdx(c);
        if (gi === null) return { c, group: null }; // ジャンル不明（後で前後から判断）
        if (gi < prev) group++;
        prev = gi;
        return { c, group };
      });
      const groups = charts.length ? group + 1 : 0;

      // ジャンル不明の譜面：前後の譜面が同じ段ならその段に確定、違えば要確認
      items.forEach((it, i) => {
        if (it.group !== null) return;
        const before = items.slice(0, i).reverse().find((x) => x.group !== null)?.group ?? 0;
        const after = items.slice(i + 1).find((x) => x.group !== null)?.group ?? before;
        it.group = before;
        it.groupHi = after;
        it.unsure = before !== after;
      });

      let state;
      if (groups === info.steps) state = '確定';
      else if (groups < info.steps) state = '一部未確定';
      else state = 'エラー（段数が多すぎる）';
      levelReports.push([`Lv${info.label}`, charts.length, `${groups} / ${info.steps}`, state]);

      for (const it of items) {
        const gLo = it.group;
        const gHi = it.groupHi ?? it.group;
        let lo, hi;
        if (state === '確定') {
          lo = round1(info.min + gLo * 0.1);
          hi = round1(info.min + gHi * 0.1);
        } else if (groups < info.steps) {
          // 段を見落とした可能性がある場合でも、取りうる範囲は絞れる
          lo = round1(info.min + gLo * 0.1);
          hi = round1(info.max - (groups - 1 - gHi) * 0.1);
        } else {
          lo = info.min;
          hi = info.max;
        }
        results.push({ ...it.c, level: info.label, lo, hi, fixed: lo === hi });
      }

      if (n > LEVEL_TO) await sleep(WAIT_MS);
    }

    // ---- 3. 定数表(JSON)を作る ----
    // 同じキーの譜面が複数ある（同名の別曲）場合は、最大値つきのキーで書き出す
    const keyCount = new Map();
    results.forEach((r) => keyCount.set(r.key, (keyCount.get(r.key) ?? 0) + 1));

    const consts = {};
    const unresolved = [];
    for (const r of results) {
      if (!r.fixed || r.kind === '?') {
        unresolved.push(r);
        continue;
      }
      if (keyCount.get(r.key) > 1) {
        if (r.keyMax) consts[r.keyMax] = r.lo;
        else unresolved.push({ ...r, note: '同名曲で最大値なし' });
      } else {
        consts[r.key] = r.lo;
      }
    }

    // ---- 4. 結果表示 ----
    ui.status('解析完了');

    const summary = document.createElement('p');
    summary.style.cssText = 'font-size:16px;font-weight:bold;';
    summary.textContent =
      `${results.length} 譜面を解析：定数確定 ${Object.keys(consts).length} 譜面 / 未確定 ${unresolved.length} 譜面`;

    const genreLine = document.createElement('p');
    genreLine.style.cssText = 'color:#666;font-size:12px;';
    genreLine.textContent = `ジャンル順：${genreOrder.join(' → ')}`;

    const blob = new Blob([JSON.stringify(consts, null, 1)], { type: 'application/json' });
    const dl = document.createElement('a');
    dl.href = URL.createObjectURL(blob);
    dl.download = 'maimai_consts.json';
    dl.textContent = '定数表（maimai_consts.json）をダウンロード';
    dl.style.cssText = 'display:inline-block;margin:4px 0 16px;font-size:16px;';

    const h1 = document.createElement('h3');
    h1.textContent = 'レベルごとの結果';
    const levelTable = makeTable(['レベル', '譜面数', '検出段数 / 理論段数', '状態'], levelReports);

    const h2 = document.createElement('h3');
    h2.textContent = '定数が確定しなかった譜面';
    const unresolvedTable = makeTable(
      ['レベル', '曲名', '譜面', '定数の範囲', '備考'],
      unresolved.map((r) => [
        r.level,
        r.name,
        `${r.kind} ${r.diff}`,
        r.lo === r.hi ? r.lo.toFixed(1) : `${r.lo.toFixed(1)}〜${r.hi.toFixed(1)}`,
        r.note ?? (r.kind === '?' ? '種別不明' : ''),
      ])
    );

    ui.body.append(summary, genreLine, dl, h1, levelTable, h2, unresolvedTable);
    console.log('定数表', consts);
    console.log('未確定の譜面', unresolved);
  } catch (e) {
    ui.status('エラー: ' + e.message);
    console.error(e);
  }
})();
