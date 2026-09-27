# OpenMarch

[English](README.md) | **日本語**

![GitHub Downloads (all assets, all releases)](https://img.shields.io/github/downloads/OpenMarch/OpenMarch/total)
![GitHub commit activity](https://img.shields.io/github/commit-activity/m/OpenMarch/OpenMarch)
![GitHub License](https://img.shields.io/github/license/OpenMarch/OpenMarch)

![Banner](/.github/assets/githubbanner.png)

OpenMarch は、マーチングアーツ（マーチングバンド、ドラム & ビューグル・コー、室内ドラムライン、カラーガード等）向けの、無料・オープンソースで高速かつ直感的なドリル作成アプリです。このリポジトリには OpenMarch のコードベース全体が含まれています。

> [!NOTE]
> この文書は [英語版 README](README.md) の日本語訳に、日本語ユーザー向けの補足を加えたものです。内容に差異がある場合は英語版を正とします。

## 私たちの目標

マーチングバンド、室内プログラム、その他の演技団体のために、無料で簡単に使えるドリル作成ソリューションを提供することです。OpenMarch は、一般的なデザイン要件を持つ団体の 90% にとって「これで十分」と言えるアプリを目指しています。ドリル作成を、誰にとっても手軽なものにしたいと考えています。

## ユーザー・ドリルデザイナーの方へ

- 最新版は [公式サイト](https://openmarch.com/download/) からダウンロードできます。このページ右側の GitHub Releases からも入手できます。
- 最新情報はアップデート動画やブログ記事を [こちら](https://openmarch.com/blog/) でご覧ください。
- [Discord](https://discord.gg/eTsQ98uZzq) に参加すると、コミュニティとの交流やサポートが受けられます（主なやり取りは英語です）。
- [機能一覧](https://openmarch.com/about/features/) と [入門ガイド](https://openmarch.com/guides/getting-started/) もあわせてご覧ください。

最新の **_不安定な_** 機能を試したい場合は、GitHub の [Releases](https://github.com/OpenMarch/OpenMarch/releases) タブから `Pre-release` と表示されている最新版をダウンロードしてください。フィードバックやバグ報告は GitHub Issues または Discord へお寄せください。

> OpenMarch はまだ開発途中です。バグや不具合、足りない機能に出会うこともあると思います。コントリビュートや寄付で、プロジェクトの成長を支えていただけると幸いです。

<div align="center"><img width="700" src="https://github.com/user-attachments/assets/7a744b9e-a3ea-4bb1-a120-6067288c2280" alt="OpenMarch アプリ画面" /></div>

### アプリを日本語で使う

デスクトップアプリは日本語 UI に対応しています。起動画面（ランチページ）の設定画面にある **言語（Language）** の項目で「日本語」を選択してください。

翻訳は [Tolgee](https://tolgee.io/) で管理されており、訳文は `apps/desktop/i18n/ja.json` に保存されています。訳語の誤りや未翻訳の箇所を見つけた場合は、Issue や Pull Request、または Discord でお知らせください。翻訳への参加方法は [翻訳ガイド（英語）](https://openmarch.com/developers/translating/) を参照してください。

### 用語集

アプリや英語ドキュメントで使われる主な用語と、日本の吹奏楽・マーチング界隈での一般的な呼び方の対応です。

| 英語                  | 日本語での呼び方              | 説明                                                                   |
| --------------------- | ----------------------------- | ---------------------------------------------------------------------- |
| Drill                 | ドリル                        | 隊形とその移動を記した演技の設計図                                     |
| Marcher               | マーチャー / 演奏者           | フィールド上で動く一人ひとり                                           |
| Page / Set            | ページ / セット               | ある時点での全員の立ち位置（隊形）。次のページまで移動する             |
| Count / Beat          | カウント / 拍                 | ページ間の移動に使う拍数                                               |
| Measure               | 小節                          | 楽譜上の小節。ページと音楽を対応付けるのに使う                         |
| Dot / Coordinate      | ドット / コーディネート       | マーチャーの位置。ドットシート（コーディネートシート）として書き出せる |
| Step (8 to 5 など)    | ステップ（8 歩 5 ヤード）     | 1 歩の歩幅。8 to 5 は 5 ヤードを 8 歩で進む歩幅                        |
| Yard line             | ヤードライン                  | フィールドを 5 ヤードごとに区切る線                                    |
| Hash                  | ハッシュ                      | フィールドを前後方向に区切る目印の線                                   |
| Front / Back sideline | フロント / バックサイドライン | 観客席側 / 反対側の境界線                                              |
| Section               | セクション / パート           | 楽器ごとのグループ（トランペット、スネアなど）                         |
| Pathway / Midset      | 経路 / ミッドセット           | ページ間の移動経路と、その途中に置く中継点                             |

## 開発

<!---
重要な変更を加える場合は、Web サイトの開発者向けドキュメントも更新してください
apps/website/src/content/docs/developers
-->

Turbo によるモノレポ構成で、pnpm 10.11.0 と Node.js 24 を使用します。主なコマンドは次のとおりです。

```bash
# パッケージのインストール
pnpm install

# Electron と Vite（デスクトップアプリ）を起動
pnpm desktop dev

# Web サイト（Astro）の開発サーバーを起動
pnpm site dev

# デザインシステムのプレイグラウンドを起動
pnpm ui dev

# 自動修正
pnpm fix
# 個別に実行する場合:
pnpm format
pnpm lint
pnpm spellcheck

# 特定のパッケージのタスクも実行できます
pnpm desktop lint
```

> [!NOTE]
> 開発サーバーの起動時やインストール時にデスクトップアプリのデータベースで問題が起きる場合は、[こちらの手順](https://github.com/Automattic/node-canvas?tab=readme-ov-file#compiling) に従ってから、クリーンな状態で `pnpm install` をやり直してください。

すべてのコマンドは各プロジェクトの `package.json` を参照してください。

コントリビューターとの交流やサポートには [Discord](https://discord.gg/eTsQ98uZzq) をご利用ください。

### 日本語環境での補足

- **Node.js のバージョン**: `.nvmrc` とルートの `package.json` の `engines` が正です。`nvm`、`fnm`、`Volta` などで Node 24 に揃えてください。
- **pnpm**: `corepack enable` を実行すると、`package.json` で固定された pnpm 10.11.0 が自動的に使われます。
- **パスに日本語や空白を含めない**: ネイティブモジュール（`canvas` や SQLite 関連）のビルドが失敗することがあるため、`C:\Users\ユーザー名\ドキュメント\...` のようなパスは避け、`C:\dev\OpenMarch` などの ASCII のみのパスにクローンすることをおすすめします。
- **Windows**: ネイティブモジュールのビルドに Visual Studio Build Tools（「C++ によるデスクトップ開発」ワークロード）と Python が必要です。詳細は上記 node-canvas の手順を参照してください。
- **macOS**: `xcode-select --install` でコマンドラインツールを入れたうえで、node-canvas の手順にある Homebrew パッケージをインストールしてください。
- **コミットメッセージや PR**: 英語で書くことを推奨します。レビュアーの多くは英語話者です。

### 技術スタック

- **アプリフレームワーク** - Electron
- **フロントエンド** - React
- **状態管理** - Zustand
- **スタイリング / UI** - Radix & Tailwind
- **テスト** - Vitest & Playwright

### 設計ドキュメント

- [3D ビュー 設計書](docs/design/3d-view.ja.md) - three.js / React Three Fiber による 3D 表示・再生・動画書き出しの詳細設計

## ライセンス

OpenMarch は [AGPL-3.0 ライセンス](LICENSE) のもとで公開されています。
このプロジェクトのために書かれたコードは、これからもずっとオープンで誰でもアクセスできるものであり続けます。

ライセンスの法的な効力を持つのは英語の原文のみです。本訳は参考情報です。
