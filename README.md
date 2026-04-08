# Spotify ランダムアラーム

GitHub Pages で動くフロントエンドのみの Spotify アラームアプリです。  
データは `LocalStorage` に保存されます。

## 機能（MVP + α）

- 複数アラームの作成/編集/削除
- 曜日指定・ON/OFF
- スヌーズ（分指定）
- Spotify 認証（Implicit Grant）
- 保存済みアルバムの取得・複数選択
- 時刻一致でランダム曲を Spotify で開く

## セットアップ

1. Spotify Developer Dashboard でアプリを作成
2. Redirect URI にデプロイURLを追加（例: `https://<username>.github.io/<repo>/`）
3. このリポジトリを GitHub Pages で公開
4. アプリ画面で Client ID を入力して接続

## ローカル確認

静的ファイルなので任意のHTTPサーバーで起動できます。

```bash
python3 -m http.server 8080
```

## 注意点

- ブラウザ制限により自動再生は失敗することがあります。
- タブが閉じている / スリープ中の発火保証はできません。
- 本実装は MVP 重視のため、PKCE ではなく Implicit Grant を使っています。
