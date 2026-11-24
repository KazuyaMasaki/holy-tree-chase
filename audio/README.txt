BGM音声ファイルの追加方法
========================

1. この audio/ フォルダに BGM 音声ファイル（.mp3 / .ogg / .wav / .m4a）を配置します。
   例: audio/christmas_jingle.mp3

2. 同じフォルダの bgm.json の tracks に次のような項目を追加します。
   label がプルダウンの曲名になります。初期曲は defaultTrack で指定します。

{
  "id": "jingle",
  "label": "Jingle Swing",
  "file": "christmas_jingle.mp3",
  "volume": 0.15
}

3. GitHub Pagesやローカルサーバーでは再読み込みで曲目が反映されます。
   index.html を直接開く場合は、曲目の変更後に npm run build を実行してください。
   BGMはページ表示の約1.5秒後にループ再生します。自動再生が制限された場合は
   「BGMを再生」で開始できます。「BGM ON」を押すとOFFになり、次回も設定を引き継ぎます。
