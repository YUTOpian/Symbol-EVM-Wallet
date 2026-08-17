import type { NetworkId } from './network';

/**
 * SymbolのNamespace(@name → Address解決)に近いUXを提供するための型。
 * Solanaでは Solana Name Service 等の既存の名前解決サービスに
 * provider経由でマッピングする(Symbolと同一の仕組みではないことに注意)。
 */
export interface NamespaceRecord {
  name: string; // 例: "yuto" ( "@" は UI 表示上のみ付与)
  resolvedAddress: string;
  provider: 'sns' | 'custom-pda';
  network: NetworkId;
}
