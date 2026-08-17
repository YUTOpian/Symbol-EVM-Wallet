import { getWallets } from '@wallet-standard/app';
import type { Wallet } from '@wallet-standard/core';
import type { WalletProvider } from '../../../core/adapters/ChainAdapter';

const SOLANA_CHAIN_MAINNET = 'solana:mainnet';
const SOLANA_CHAIN_TESTNET = 'solana:testnet';

/**
 * ブラウザにインストールされている Wallet Standard 対応ウォレット
 * (Phantom / Solflare 等)を検出する。特定ウォレットのSDKには依存しない。
 */
export function listAvailableWallets(): Wallet[] {
  const { get } = getWallets();
  return get().filter((wallet) =>
    wallet.chains.some((c) => c === SOLANA_CHAIN_MAINNET || c === SOLANA_CHAIN_TESTNET),
  );
}

/**
 * Wallet Standardの1ウォレットをラップし、共通WalletProviderインターフェースを実装する。
 * 秘密鍵・Seed Phraseは一切取得しない。署名はウォレット拡張機能側のUIで承認される。
 */
export class WalletStandardProvider implements WalletProvider {
  readonly name: string;
  private wallet: Wallet;
  private connectedAccount: { publicKey: Uint8Array; address: string } | null = null;

  constructor(wallet: Wallet) {
    this.wallet = wallet;
    this.name = wallet.name;
  }

  async connect(): Promise<string> {
    const connectFeature = this.wallet.features['standard:connect'] as
      | { connect: () => Promise<{ accounts: readonly { address: string; publicKey: Uint8Array }[] }> }
      | undefined;
    if (!connectFeature) throw new Error(`${this.name} は standard:connect に対応していません`);

    const { accounts } = await connectFeature.connect();
    const account = accounts[0];
    if (!account) throw new Error('アカウントが選択されませんでした');

    this.connectedAccount = { publicKey: account.publicKey, address: account.address };
    return account.address;
  }

  async disconnect(): Promise<void> {
    const disconnectFeature = this.wallet.features['standard:disconnect'] as
      | { disconnect: () => Promise<void> }
      | undefined;
    if (disconnectFeature) await disconnectFeature.disconnect();
    this.connectedAccount = null;
  }

  getPublicKey(): string | null {
    return this.connectedAccount?.address ?? null;
  }

  async signTransaction(serializedTx: Uint8Array): Promise<Uint8Array> {
    const feature = this.wallet.features['solana:signTransaction'] as
      | {
          signTransaction: (input: {
            transaction: Uint8Array;
            account: { address: string; publicKey: Uint8Array };
          }) => Promise<{ signedTransaction: Uint8Array }[]>;
        }
      | undefined;
    if (!feature || !this.connectedAccount) {
      throw new Error(`${this.name} で署名できません(未接続、または未対応)`);
    }
    const [result] = await feature.signTransaction({
      transaction: serializedTx,
      account: this.connectedAccount,
    });
    return result.signedTransaction;
  }

  async signAllTransactions(serializedTxs: Uint8Array[]): Promise<Uint8Array[]> {
    return Promise.all(serializedTxs.map((tx) => this.signTransaction(tx)));
  }

  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    const feature = this.wallet.features['solana:signMessage'] as
      | {
          signMessage: (input: {
            message: Uint8Array;
            account: { address: string; publicKey: Uint8Array };
          }) => Promise<{ signature: Uint8Array }[]>;
        }
      | undefined;
    if (!feature || !this.connectedAccount) {
      throw new Error(`${this.name} はメッセージ署名に対応していません`);
    }
    const [result] = await feature.signMessage({
      message,
      account: this.connectedAccount,
    });
    return result.signature;
  }
}
