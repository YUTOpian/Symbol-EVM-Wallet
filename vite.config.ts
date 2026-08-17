import type { Plugin } from 'vite';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

// GitHub Pages ではリポジトリ名がサブパスになるため、
// VITE_BASE_PATH 環境変数(例: "/symbol-ux-wallet/")で切り替えられるようにする。
// ローカル開発時は "/" を使う。
const base = process.env.VITE_BASE_PATH || '/';

// npm run build:standalone で有効になる。
// ダブルクリックで index.html を直接開いて動かすためのモード:
//  - すべてのJS/CSSを1つのindex.htmlにインライン化する(vite-plugin-singlefile)
//  - base を相対パス './' にする(絶対パス '/...' はfile://では解決できないため)
//  - Service Worker(PWA)はfile://では登録できないため無効化する
const isStandalone = process.env.VITE_STANDALONE === 'true';

/**
 * index.html の CSP meta タグは通常ビルド(外部ファイル読み込み)前提の
 * `script-src 'self'` になっている。standalone(singlefile)ビルドでは
 * JS/CSSがすべて<script>/<style>にインライン化されるため、'self'だけでは
 * ブロックされてしまう。ビルド時にCSPをinline許可版へ差し替える。
 */
function standaloneCspPlugin(): Plugin {
  return {
    name: 'standalone-csp-rewrite',
    transformIndexHtml(html) {
      if (!isStandalone) return html;
      return html.replace(
        /content="default-src 'self'[^"]*"/,
        `content="default-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://api.mainnet-beta.solana.com https://api.testnet.solana.com https://*.solana.com; font-src 'self' data:; object-src 'none'; base-uri 'self';"`,
      );
    },
  };
}

export default defineConfig({
  base: isStandalone ? './' : base,
  plugins: [
    // Solana/暗号関連ライブラリ(bs58, borsh, tweetnacl, @bonfida/spl-name-service 等)は
    // Node.jsのグローバル(Buffer, process, global)の存在を前提にしたコードを含んでいる。
    // Viteはブラウザ向けビルドでこれらを自動polyfillしないため、未対応のままだと
    // 実行時に "process is not defined" 等で例外が発生し、Reactが一切描画されず
    // 画面が真っ白になる(ビルド自体は正常に成功するため気づきにくい)。
    // これを避けるため明示的にpolyfillする。
    nodePolyfills({
      globals: { Buffer: true, global: true, process: true },
    }),
    react(),
    standaloneCspPlugin(),
    ...(isStandalone
      ? [viteSingleFile()]
      : [
          VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.svg'],
            workbox: {
              // Solana関連ライブラリ+Node polyfillでバンドルが2MBを超えるため、
              // デフォルトのprecache上限(2MB)を明示的に緩和する。
              maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
            },
            manifest: {
              name: 'Symbol UX Wallet (Solana)',
              short_name: 'SymbolUXWallet',
              description:
                'SymbolウォレットのUX・概念をSolanaネイティブ技術で再現するウォレット',
              theme_color: '#0f172a',
              background_color: '#0f172a',
              display: 'standalone',
              icons: [
                { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
                { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
              ],
            },
          }),
        ]),
  ],
  build: {
    target: 'esnext',
    // singlefileモードでは複数チャンクへ分割せず1ファイルに収める
    ...(isStandalone ? { cssCodeSplit: false, assetsInlineLimit: 100_000_000 } : {}),
  },
});
