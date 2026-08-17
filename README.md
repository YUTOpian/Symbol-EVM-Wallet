# Symbol UX Wallet (Solana)

SymbolウォレットのUX・概念を、Solanaネイティブ技術で再現するウォレットアプリ。
Symbolプロトコルの移植ではなく、「Symbolで提供されている機能を、Solanaではどの技術・仕組みで実現できるか」という設計方針。

## 現在の状態(Phase 1・Phase 2・Phase 3 完了)

- [x] プロジェクト基盤(Vite / TypeScript / PWA)
- [x] Wallet Core の型定義(Account / Asset / Transaction / Metadata / Namespace)
- [x] ChainAdapter / WalletProvider インターフェース定義
- [x] Mainnet / Testnet の設定分離(networkConfig / connectionFactory)
- [x] crypto層(mnemonic生成・BIP44鍵導出・Web CryptoによるSeed Phrase暗号化保存)
- [x] ローカルWallet実装(LocalWalletProvider)
- [x] Wallet Standard経由のPhantom/Solflare接続(WalletStandardProvider)
- [x] Onboarding UI(Wallet作成/復元/接続画面)
- [x] SOL残高取得
- [x] Asset一覧表示(Native / SPL Token・Token-2022 Fungible / NFTを統一Assetとして表示。NFTはMetaplexオンチェーンMetadataからname/symbolを解決)
- [x] HTMLから直接起動できるstandaloneビルド(`npm run build:standalone`)
- [x] SOL/Token送信(Send画面: 内容確認 → 送信 → Explorerリンク)
- [x] Transaction履歴(取得・分類・日付グループ表示)
- [x] Batch Transaction(複数送金を可能な限り1Transactionにまとめ、上限超過時は自動分割)
- [x] Metadata(Token-2022 Metadata ExtensionによるPDA相当のKey/Value管理。閲覧は誰でも可、編集はUpdate Authorityのみ)
- [x] Namespace / Address Alias(Solana Name Serviceによる@name / name.sol解決。Send画面のTo欄で利用可能)
- [x] Multisig(Squads Protocolを利用したMembers/Threshold表示、Pending Transaction一覧、Approve)
- [x] Restriction(Token-2022の Freeze Authority / Permanent Delegate / Transfer Hook / Non-Transferable / Default Account State を閲覧。Freeze/ThawはFreeze Authority保有時のみ操作可能)
- [x] Explorer(Address / Transaction Signature / Token Mint / Program / Slot の単一検索窓での判別・詳細表示)

## 重要な修正(2026-08-17): 画面が真っ白になる不具合の修正

これまでのビルド確認は `tsc -b` と `vite build` が正常終了することしか見ておらず、**実際にブラウザで開いて描画されるかを確認していませんでした**。実機(Chromiumヘッドレス)で開いたところ、`process is not defined` という実行時エラーで画面が真っ白になる不具合がありました。

**原因**: `@solana/web3.js` をはじめとする一部のライブラリ(bs58, borsh, tweetnacl, `@bonfida/spl-name-service` 等)は、Node.jsのグローバル(`Buffer` / `process` / `global`)が存在する前提のコードを含んでいます。Viteはブラウザ向けビルドでこれらを自動でpolyfillしないため、未対応のままだと初期化時に例外が発生し、Reactが一切描画されませんでした。ビルド自体は正常終了するため、実際にブラウザで開くまで気づけない種類の不具合でした。

**修正**: `vite-plugin-node-polyfills` を追加し、`Buffer` / `process` / `global` をpolyfillするようにしました。あわせて、polyfillでバンドルサイズが2MBを超えたためPWAのprecache上限(`workbox.maximumFileSizeToCacheInBytes`)を引き上げ、favicon参照を外部ファイルではなく自己完結のdata URIに変更しました(standaloneビルドで外部ファイル参照が1つでも残っていると、真の意味で「1ファイルで完結」にならないため)。

修正後、通常ビルド・standaloneビルドの両方をヘッドレスブラウザで実際に開き、Wallet作成 → Dashboard到達までの操作を自動テストして描画されることを確認済みです。

**追加で判明した制約**: `file://` で直接開いた場合、ブラウザは `Origin: null` としてリクエストするため、Solanaの公開RPC(`api.mainnet-beta.solana.com`等)は CORS で `null` Originからのリクエストを拒否します。そのため standalone ビルドでは**画面自体は正しく表示されアプリは操作できますが、残高やAsset・Transaction履歴などRPCが必要な情報の取得は失敗します**(エラー表示にとどまり、画面が壊れることはありません)。この制約はSolanaの公開RPC側のCORSポリシーによるものでこちら側では変更できないため、standaloneビルドで実データを扱いたい場合は、CORSで`null` Originを許可しているRPCプロバイダ(有料のRPCサービス等)に`VITE_SOLANA_MAINNET_RPC`/`VITE_SOLANA_TESTNET_RPC`で差し替えることを推奨します。GitHub Pages等のHTTPホスティング経由(通常ビルド)であれば、Originが `null` にならないためこの制約はありません。

## 既知の課題 / 次の最適化候補

- Metaplex/Umi導入によりバンドルサイズが大きくなっている(gzip後 約400KB)。将来的に `dynamic import()` でNFT関連コードを遅延ロードするなどの最適化を検討する
- Fungible TokenのSymbol/Nameは現状mintアドレスの短縮表示。Token-2022 Metadata Extensionや既知トークンリストからの解決は未実装
- NFTの画像・説明文(オフチェーンJSON)はまだ取得していない(オンチェーンのname/symbolのみ)。取得する場合はCSPの`connect-src`拡張が必要になるため要検討
- Send画面はSOL / Fungible Token(SPL Token・Token-2022)のみ対応。NFTの送信、Batch Transaction(複数送金のAggregate的UX)は未実装
- 送金先のAssociated Token Accountが存在しない場合は自動作成する(作成コストは送信者が負担する設計)
- Transaction分類のSwap判定は既知プログラムID(現状Jupiter Aggregator v6のみ)の一致でのみ行っており、それ以外のDEX/Swapは`program_interaction`として表示される(無理な推測はしない設計方針のため)
- Batch Sendは複数Transactionに分割された場合、SymbolのAggregate Transactionと異なり**グループ間の原子性は保証されない**(先のグループが確定済みで後のグループが失敗する可能性がある)。UI上で警告を表示している
- Batch Sendのグループ分けは1Transactionのサイズ上限(1232 byte)のみで判定しており、Compute Unit上限は現状考慮していない
- MetadataはToken-2022のMetadata Extensionのみ対応(SPL Token旧プログラムのmintには実装不可能なため非対応)。Extension自体が未初期化のmintでは何も表示されない
- Namespace解決はSolana Name Service(SNS)を利用しており、SymbolのNamespaceと同一の仕組みではない(階層・委任・有効期限の扱いが異なる)。SNSは主にMainnetで運用されているため、Testnetでは解決に失敗する場合がある
- SNS SDK導入によりバンドルサイズがさらに増加(gzip後 約425KB)。Node.js組み込みモジュール(http/stream等)の externalize 警告がビルド時に出るが、ブラウザではネイティブfetchにフォールバックするため動作に影響しない
- Multisigは独自実装ではなく、監査済みのSquads Protocol(@sqds/multisig)をそのまま利用している(秘密鍵相当の重要度を持つ機能を自前実装するリスクを避けるため)。Multisig Accountの新規作成機能は未実装で、既存のSquads Multisigアドレスを閲覧・承認するのみ
- Pending Transactionの中身(送金先・金額などの詳細)のデコード表示は未対応。承認前にExplorerで内容を確認することを前提にしている
- バンドルサイズはSquads SDK・Node polyfill追加でさらに増加(gzip後 約708KB)。今後の最適化候補としてすでに記載した`dynamic import()`分割が一層重要になる
- RestrictionはToken-2022のExtensionのうち、Mint作成後でも操作可能な**Freeze Authorityによる個別Account凍結/解除のみ**編集対応。Permanent Delegate・Transfer Hook・Non-Transferable・Default Account StateはMint作成時にのみ設定可能な仕組みのため閲覧のみ(有効化・変更するUIはこのアプリには存在しない)
- ExplorerのNFT判定は専用ロジックを持たず、Token Mint検索結果としてdecimals/supplyから間接的に判別する形になっている(spec上「NFT」は独立した検索対象だが、実体はMintのため統合している)
- Explorerで表示できるInstruction名は既知のProgram ID一覧に一致した場合のみ(System/Token/Token-2022/Associated Token/Memo/Stake/Compute Budget/Vote)。それ以外は"Unknown Program"と表示し、無理な推測はしない

## セットアップ

```bash
npm install
npm run dev
```

## ビルド方法(2種類)

### 1. GitHub Pages用ビルド(通常)

```bash
VITE_BASE_PATH=/<リポジトリ名>/ npm run build
```

複数ファイルに分割され、PWA(Service Worker)が有効になります。Webサーバー(GitHub Pages等)での配信が前提です。

### 2. HTMLを直接ダブルクリックで起動するビルド(standalone)

```bash
npm run build:standalone
```

`dist/index.html` 1ファイルにJS/CSSがすべてインライン化され、`file://` で直接ブラウザに開いても動作します。
サーバーを一切必要としないため、配布(メール添付、USB経由など)や動作確認に便利です。
PWA(Service Worker)は `file://` では登録できないため、このモードでは無効化されます。

## GitHub Pagesへのデプロイ

GitHub ActionsのSecretsに秘密鍵・Seed Phraseは絶対に置かないこと。
RPCを専用プロバイダに変更する場合は `VITE_SOLANA_MAINNET_RPC` / `VITE_SOLANA_TESTNET_RPC` を設定する。

## アーキテクチャ

```
src/core/       … chain非依存のドメイン層(型・状態管理・ChainAdapterインターフェース)
src/adapters/   … Solana固有の実装(将来 symbol/ や ethereum/ を追加できる構造)
src/crypto/     … 秘密鍵・Seed Phraseの生成/導出/暗号化保存(ネットワークアクセスなし)
src/ui/         … 画面(pages)とコンポーネント
```

## セキュリティ方針

- 秘密鍵・Seed Phraseは外部サーバーへ一切送信しない(`src/crypto/`はネットワークアクセスを行わない)
- Seed PhraseはWeb Crypto API(AES-GCM)でパスワード由来鍵により暗号化してから保存する
- Phantom/Solflareからは公開鍵と署名結果のみ受け取り、秘密鍵には触れない(Wallet Standard経由)
- 送信前に必ず内容確認画面を挟む(Send / Batch Sendで実装済み)
- Mainnet/Testnetはキャッシュ・RPC・状態を含め完全分離する

## Explorerの判定方針

検索窓に入力された文字列をbase58デコードしたバイト長で機械的に判定する(推測に頼らない):

- 64byte → Transaction Signature
- 32byte → Address(さらに Owner Program を見て Wallet / Token Mint / Token Account / Program に分類)
- 数字のみ → Slot
- 上記いずれにも一致しない → 「認識できませんでした」と表示し、無理に推測しない

NFTは「Token Mint」として検出された上で、decimals/supplyから見分けられる(専用の分類は行わず、Mint検索の結果として表示する)。

## 実装対象外(今回のバージョン)

QR機能 / QR Login・Session / On-chain Analytics は実装しない(将来追加できる構造は維持)。
