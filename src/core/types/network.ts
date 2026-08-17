/**
 * Wallet Core が知っている「ネットワーク」の概念。
 * どのチェーンでも mainnet / testnet 相当が存在する前提で共通化する。
 */
export type NetworkId = 'mainnet' | 'testnet';

export interface NetworkDescriptor {
  id: NetworkId;
  label: string;
  /** キャッシュキーの prefix として使う。例: "solana:mainnet" */
  namespace: string;
}
