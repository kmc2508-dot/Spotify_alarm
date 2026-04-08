# Spotify Random Alarm (GitHub Pages 対応)

Spotifyの保存済みアルバムからランダムに曲を選んで鳴らす、フロントエンドのみのアラームアプリです（Spotify OAuth2 / PKCE対応）。

## できること
- LocalStorageで設定とアラームを保存
- トップ画面でSpotify連携情報（Client ID / Redirect URI）入力
- 複数アラーム作成、曜日指定、ON/OFF、編集、削除
- スヌーズ（5分）
- Spotify保存済みアルバムの取得・複数選択
- OAuth2トークンの自動更新（refresh token）

## 使い方
1. GitHub Pagesでこのリポジトリを公開。
2. Spotify Developer Dashboardでアプリ作成し、Redirect URIに公開URLを登録。
3. トップ設定画面に `Client ID` と `Redirect URI` を入力して保存。
4. `Spotify OAuth2で接続` を押して認証。
5. `Spotifyから取得` で保存済みアルバムを読み込み、アラームに設定。

## 注意事項
- ブラウザが開いていない状態やスリープ中の確実な発火はできません。
- 自動再生はブラウザ制限で失敗する場合があります（その場合は「タップして再生」）。
- Spotify Web APIの利用にはユーザー認証が必要です。
