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

  document.getElementById('dxj-panel')?.remove();
  const panel = document.createElement('div');
  panel.id = 'dxj-panel';
  panel.style.cssText =
    'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:99999;' +
    'max-width:92vw;background:#fff;color:#2B2350;border:2px solid #E0348C;border-radius:14px;' +
    'padding:14px 18px;font:14px/1.6 sans-serif;box-shadow:0 6px 24px rgba(43,35,80,.2);';
  const msg = document.createElement('div');
  msg.textContent = '楽曲リストを読み込み中…';
  const close = document.createElement('button');
  close.textContent = '閉じる';
  close.style.cssText = 'margin-top:10px;padding:4px 14px;font:inherit;border-radius:999px;border:1.5px solid #ccc;background:#fff;cursor:pointer;';
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
    link.style.cssText = 'display:inline-block;margin-top:6px;font-weight:bold;color:#E0348C;';

    msg.textContent = `${count} 曲の対応表を作成しました（同名の別曲 ${ambiguous} 組は、ジャンルとレベルで見分ける情報つき）。`;
    panel.append(document.createElement('br'), link, document.createElement('br'), close);
  } catch (e) {
    msg.textContent = 'エラー: ' + e.message;
    panel.append(document.createElement('br'), close);
    console.error(e);
  }
})();
