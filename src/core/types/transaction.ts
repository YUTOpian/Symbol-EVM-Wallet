import type { NetworkId } from './network';

export type TransactionCategory =
  | 'send'
  | 'receive'
  | 'token_transfer'
  | 'nft_transfer'
  | 'swap'
  | 'stake'
  | 'program_interaction'
  | 'memo'
  | 'unknown';

export type TransactionStatus = 'success' | 'failed' | 'pending';

export interface WalletTransaction {
  /** Solana では signature がこれに相当する */
  id: string;
  network: NetworkId;
  category: TransactionCategory;
  status: TransactionStatus;
  slot: number | null;
  blockTime: number | null; // unix seconds
  fee: number; // lamports 換算前の chain 最小単位のまま保持し、UI 側で整形する
  /** Send画面などで確認用に使う概要(例: "100 USDC → Alice") */
  summary?: string;
  /** UI表示用の符号付き数量(例: "+100", "-0.5")。SOL/Token/NFTの増減が分かる場合のみ設定する */
  displayAmount?: string;
  /** displayAmountに対応するSymbol(例: "USDC", "SOL")。NFTの場合は "NFT" 等 */
  displaySymbol?: string;
}
