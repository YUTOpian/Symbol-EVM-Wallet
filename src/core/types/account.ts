import type { NetworkId } from './network';

/** Wallet の接続元。自前鍵か、外部 Wallet Standard 経由か */
export type AccountSource = 'local' | 'wallet-standard';

/**
 * Symbol ウォレットの Account 概念を chain 非依存に表現したもの。
 * 実アドレス形式(base58等)は Adapter 側の責務で、Core は string として扱う。
 */
export interface Account {
  id: string; // `${network}:${address}` を想定した一意キー
  name: string;
  address: string;
  publicKey: string;
  network: NetworkId;
  source: AccountSource;
  /** wallet-standard の場合、どの Wallet か(例: "Phantom", "Solflare") */
  providerName?: string;
}
