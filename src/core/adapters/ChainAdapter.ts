import type { NetworkId } from '../types/network';
import type { Account } from '../types/account';
import type { Asset } from '../types/asset';
import type { WalletTransaction } from '../types/transaction';

/**
 * Wallet Core が依存する唯一のインターフェース。
 * 将来 SymbolAdapter / EthereumAdapter を追加する際は、
 * この interface を満たす実装を用意するだけで Core / UI 層は変更不要にする。
 */
export interface ChainAdapter {
  readonly chainId: 'solana'; // 将来 'symbol' | 'ethereum' 等を追加

  setNetwork(network: NetworkId): void;
  getNetwork(): NetworkId;

  getAssets(account: Account): Promise<Asset[]>;
  getTransactions(account: Account, limit?: number): Promise<WalletTransaction[]>;
}

/**
 * 秘密鍵を扱わない、署名者としての抽象。
 * ローカルWalletでもPhantom/Solflare(Wallet Standard)でも同じ形で扱う。
 * -> 詳細は adapters/solana/wallet/walletStandard.ts 等で実装する。
 */
export interface WalletProvider {
  readonly name: string;
  connect(): Promise<string>; // 接続して publicKey(base58等)を返す
  disconnect(): Promise<void>;
  getPublicKey(): string | null;
  signTransaction(serializedTx: Uint8Array): Promise<Uint8Array>;
  signAllTransactions(serializedTxs: Uint8Array[]): Promise<Uint8Array[]>;
  signMessage(message: Uint8Array): Promise<Uint8Array>;
}
