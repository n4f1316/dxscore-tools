(async () => {
  'use strict';

  // ============================================================
  //  設定
  // ============================================================

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
    playerName: '.name_block',          // プレイヤー名（ホーム画面などに表示される）
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

  function createPanel() {
    document.getElementById('dxr-panel')?.remove(); // 二重起動対策

    const panel = document.createElement('div');
    panel.id = 'dxr-panel';
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

  // プレイヤー名を取得（今のページになければホーム画面から読む。失敗しても空文字で続行）
  async function getPlayerName() {
    const here = document.querySelector(SEL.playerName)?.textContent.trim();
    if (here) return here;
    try {
      const res = await fetch(PLAYER_URL, { credentials: 'same-origin' });
      if (!res.ok) return '';
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      return doc.querySelector(SEL.playerName)?.textContent.trim() ?? '';
    } catch {
      return '';
    }
  }

  function buildTable(top, mode) {
    const table = document.createElement('table');
    table.style.cssText = 'border-collapse:collapse;width:100%;font-size:13px;';

    const tr0 = table.insertRow();
    ['#', '曲名', '譜面', '定数', '☆', 'MAX差', 'レート値'].forEach((t) => {
      const th = document.createElement('th');
      th.textContent = t;
      th.style.cssText = 'border-bottom:2px solid #888;padding:4px;text-align:left;';
      tr0.appendChild(th);
    });

    top.forEach((s, i) => {
      const tr = table.insertRow();
      [
        i + 1,
        s.name,
        `${s.kind} ${s.diff} ${s.level}`,
        s.c.toFixed(1) + (s.estimated ? '*' : ''),
        starDisplay(s.cur, s.max),
        s.cur === s.max ? 'MAX' : `MAX-${(s.max - s.cur).toLocaleString()}`,
        s.values[mode.id].toFixed(3),
      ].forEach((v) => {
        const td = tr.insertCell();
        td.textContent = v;
        td.style.cssText = 'border-bottom:1px solid #ddd;padding:4px;';
      });
    });
    return table;
  }

  // results: [{ mode, rating, top }, ...]
  function renderResult(ui, playerName, results, info) {
    const who = document.createElement('div');
    who.textContent = playerName || '（プレイヤー名を取得できませんでした）';
    who.style.cssText = 'font-size:18px;font-weight:bold;margin-top:4px;';

    // 各レートの数値
    const rates = document.createElement('div');
    rates.style.cssText = 'margin:4px 0 12px;';
    results.forEach(({ mode, rating }) => {
      const line = document.createElement('div');
      line.textContent = `DXスコアレート（${mode.label}）: ${rating.toFixed(3)}`;
      line.style.cssText = 'font-size:20px;font-weight:bold;';
      rates.appendChild(line);
    });

    // 表の切り替えボタンと、レートごとの表（選んだ1つだけ表示）
    const tabs = document.createElement('div');
    tabs.style.cssText = 'margin-bottom:8px;';
    const tables = results.map(({ mode, top }) => buildTable(top, mode));
    const buttons = results.map(({ mode }, i) => {
      const b = document.createElement('button');
      b.textContent = `${mode.label}の上位${TOP_N}`;
      b.style.cssText = 'font-size:14px;padding:4px 10px;margin-right:6px;';
      b.onclick = () => select(i);
      tabs.appendChild(b);
      return b;
    });
    function select(i) {
      tables.forEach((t, j) => { t.style.display = i === j ? '' : 'none'; });
      buttons.forEach((b, j) => { b.style.fontWeight = i === j ? 'bold' : 'normal'; });
    }
    select(0);

    const note = document.createElement('p');
    note.style.cssText = 'color:#666;font-size:12px;';
    note.textContent =
      `${info}。定数の * は表示レベルからの概算値（下限）です。` +
      '☆欄は実際の☆を表示し、「☆5まで」の値は☆6以上を☆5として計算しています。';

    ui.body.append(who, rates, tabs, ...tables, note);
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
        constTable = await (await fetch(CONST_URL + '?' + Date.now())).json();
      } catch {
        ui.status('譜面定数表を読み込めませんでした。概算値で計算します。');
        await sleep(1000);
      }
    }

    // プレイヤー名
    ui.status('プレイヤー情報を取得中…');
    const playerName = await getPlayerName();

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

    ui.status('計算完了');
    renderResult(
      ui,
      playerName,
      results,
      `Lv15〜Lv${levelInfo(lastLevel).label} の ${fetched} ページを取得し、${scored.length} 譜面から計算`
    );
  } catch (e) {
    ui.status('エラー: ' + e.message);
    console.error(e);
  }
})();
