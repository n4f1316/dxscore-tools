# 譜面定数表（consts/）

2fRATE の計算に使う譜面定数表を、バージョンごとに置くフォルダーです。

| ファイル | 内容 | 使っているところ |
|---|---|---|
| `maimai_consts_magical.json` | maimaiでらっくす MAGiCAL（日本版の現行） | 正式版・β版・α版のブックマークレット（日本版）、単曲レート計算、ランキング集計 |
| `maimai_consts_circleplus.json` | maimaiでらっくす CiRCLE PLUS | α版のブックマークレット（International版の現行） |

- 形式：`{ "曲名|DX または ST|難易度": 譜面定数 }`。同じ名前の別曲は、キーの最後に `|でらっくスコアの最大値` を付けて区別する。
- ファイル名の `maimai_consts_` と `.json` の間（例：`magical`）が、ランキングに記録される「定数表のバージョン」になる。
- 新しいバージョンの表は `collect_consts.js` で作り、`maimai_consts_<バージョン名>.json` の名前でここに置く。手順は `ADMIN_README.md` を参照。
- 古いバージョンの表は消さずに残す。International版は日本版より古いバージョンの定数で計算するため。

## CiRCLE PLUS の表について
Lv12 以上の譜面（MASTER・Re:MASTER と EXPERT 12 以上）は、@mailv_chihooooo 氏の「[mDX14.0]CiRCLE PLUS譜面定数表」の値を使っています（使用自由と明記されているもの）。Lv12 未満は MAGiCAL の値をもとに、MAGiCAL で定数が変わった譜面だけ CiRCLE PLUS の値に戻しています。
