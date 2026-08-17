import type { NetworkId } from '../../../core/types/network';

export interface SolanaNetworkConfig {
  id: NetworkId;
  label: string;
  /** キャッシュ/ストレージキーのnamespace prefix */
  namespace: string;
  rpc: string;
  explorer: string;
}

/**
 * RPCをコードへ直接ハードコードしすぎないよう、この設定オブジェクトに集約する。
 * 本番運用では mainnet.rpc を専用RPCプロバイダのURLに差し替えることを強く推奨する
 * (public RPCはレート制限が厳しく、実用には不向き)。
 * 差し替え可能にするため、Vite の環境変数からも上書きできるようにしている。
 */
export const SOLANA_NETWORKS: Record<NetworkId, SolanaNetworkConfig> = {
  mainnet: {
    id: 'mainnet',
    label: 'Mainnet',
    namespace: 'solana:mainnet',
    rpc: import.meta.env.VITE_SOLANA_MAINNET_RPC || 'https://api.mainnet-beta.solana.com',
    explorer: 'https://explorer.solana.com',
  },
  testnet: {
    id: 'testnet',
    label: 'Testnet',
    namespace: 'solana:testnet',
    rpc: import.meta.env.VITE_SOLANA_TESTNET_RPC || 'https://api.testnet.solana.com',
    explorer: 'https://explorer.solana.com/?cluster=testnet',
  },
};

export function getNetworkConfig(network: NetworkId): SolanaNetworkConfig {
  return SOLANA_NETWORKS[network];
}

/** Mainnet/Testnetでキャッシュ・ストレージキーを完全分離するためのヘルパー */
export function namespacedKey(network: NetworkId, key: string): string {
  return `${SOLANA_NETWORKS[network].namespace}:${key}`;
}
