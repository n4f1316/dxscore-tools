(async () => {
  'use strict';

  // ============================================================
  //  ジャケット画像の対応表作成スクリプト
  //  maimai 公式サイト（maimai.sega.jp）上で実行し、公式の楽曲リストから
  //  「曲名 → ジャケット画像のファイル名」の対応表(JSON)を作ってダウンロードする。
  //  同じ曲名で画像が違う曲（同名の別曲）は、ジャンルと各譜面のレベルつきの候補一覧にする。
  // ============================================================

  const SONGS_JSON_PATH = '/data/maimai_songs.json';
  const FILE_NAME = 'maimai_jackets.json';

  if (location.hostname !== 'maimai.sega.jp') {
    alert('maimai公式サイト（https://maimai.sega.jp/）を開いた状態で実行してください。');
    return;
  }

  // 2fRATE と共通の配色（直線的な枠・光彩なし）。表示（ダーク／ライト）は 2fRATE と同じ保存先を見る（なければライト）
  const DARK = (() => { try { return localStorage.getItem('2frate-theme') === 'dark'; } catch { return false; } })();
  const T = DARK
    ? { bg: '#0E0B1F', panel: '#16122E', line: '#2E2858', ink: '#F2F0FF', sub: '#A9A3D6', accent: '#4DE1FF', onAccent: '#0E0B1F' }
    : { bg: '#F4F5F7', panel: '#E6E7EC', line: '#D5D6DE', ink: '#12101F', sub: '#55516E', accent: '#007A99', onAccent: '#F4F5F7' };
  const FONT = '"Noto Sans JP", "Hiragino Sans", "Yu Gothic", sans-serif';

  document.getElementById('dxj-panel')?.remove();
  const panel = document.createElement('div');
  panel.id = 'dxj-panel';
  panel.style.cssText =
    'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:99999;' +
    `max-width:92vw;background:${T.bg};color:${T.ink};border:1px solid ${T.line};border-top:3px solid ${T.accent};border-radius:0;` +
    `padding:14px 18px;font:14px/1.6 ${FONT};`;
  const msg = document.createElement('div');
  msg.textContent = '楽曲リストを読み込み中…';
  const close = document.createElement('button');
  close.textContent = '閉じる';
  close.style.cssText = `margin-top:10px;padding:5px 14px;font:inherit;font-weight:700;border-radius:0;border:1px solid ${T.line};background:${T.bg};color:${T.ink};cursor:pointer;`;
  close.onclick = () => panel.remove();
  panel.append(msg);
  document.body.appendChild(panel);

  try {
    const res = await fetch(SONGS_JSON_PATH + '?' + Date.now());
    if (!res.ok) throw new Error(`楽曲リストの取得に失敗しました (HTTP ${res.status})`);
    const list = await res.json();

    // 曲名 → 画像ファイル名。同じ曲名で画像が違う曲（同名の別曲）は、
    // 見分けるための情報（ジャンルと各譜面のレベル）つきの候補の配列にする
    const LV = (song, prefix) =>
      ['bas', 'adv', 'exp', 'mas', 'remas'].map((d) => song[`${prefix}lev_${d}`] ?? '');
    const byTitle = new Map();
    for (const song of list) {
      if (!song.title || !song.image_url || song.catcode === '宴会場') continue;
      if (!byTitle.has(song.title)) byTitle.set(song.title, []);
      byTitle.get(song.title).push({
        img: song.image_url,
        genre: song.catcode ?? '',
        st: LV(song, ''),
        dx: LV(song, 'dx_'),
      });
    }
    const map = {};
    let ambiguous = 0;
    for (const [title, songs] of byTitle) {
      const imgs = new Set(songs.map((x) => x.img));
      if (imgs.size === 1) {
        map[title] = songs[0].img; // 通常の曲
      } else {
        map[title] = songs; // 同名の別曲
        ambiguous++;
      }
    }
    const count = Object.values(map).filter((v) => typeof v === 'string').length;
    const blob = new Blob([JSON.stringify(map, null, 1)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = FILE_NAME;
    link.textContent = `${FILE_NAME} をダウンロード`;
    link.style.cssText = `display:inline-block;margin-top:8px;padding:6px 14px;font-weight:bold;text-decoration:none;background:${T.accent};color:${T.onAccent};`;

    msg.textContent = `${count} 曲の対応表を作成しました（同名の別曲 ${ambiguous} 組は、ジャンルとレベルで見分ける情報つき）。`;
    panel.append(document.createElement('br'), link, document.createElement('br'), close);
  } catch (e) {
    msg.textContent = 'エラー: ' + e.message;
    panel.append(document.createElement('br'), close);
    console.error(e);
  }
})();
