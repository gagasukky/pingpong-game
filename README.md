# ⚡ PING PONG GAME

ブラウザで動くクラシックなピンポンゲームです。GitHub Pages で公開して、PC・タブレット・スマホから遊べます。

🎮 **[今すぐプレイ](https://あなたのGitHubユーザー名.github.io/pingpong-game/)**

---

## 操作方法

| 端末 | 左パドル (Player 1) | 右パドル (Player 2 / AI) |
|------|---------------------|--------------------------|
| **PC** | `W` / `S` キー | `↑` / `↓` キー |
| **タブレット** | 左半分をタッチ＆ドラッグ | 右半分をタッチ＆ドラッグ |

## ゲームルール

- 先に **11点** 取ったプレイヤーの勝利
- ボールはラリーが続くほど加速する
- AI は Easy / Normal / Hard の3段階

## ゲームモード

- 🤖 **1P vs AI** — コンピュータと対戦
- 👥 **2P 対戦** — 同じ端末で2人対戦

---

## GitHub Pages への公開手順

1. このリポジトリを GitHubで作成（例: `pingpong-game`）
2. ファイルを `main` ブランチにプッシュ
3. **Settings → Pages → Source: `main` → Save**
4. 数分後に `https://ユーザー名.github.io/pingpong-game/` へアクセス

## ローカルで動かす

```bash
# ファイルをブラウザで開くだけでOK
open index.html   # macOS
start index.html  # Windows
```

---

## 技術スタック

- HTML5 Canvas
- Vanilla JavaScript
- Vanilla CSS (グラスモーフィズム)
- Google Fonts (Orbitron)

外部ライブラリ・ビルドツール一切不要 🎉
