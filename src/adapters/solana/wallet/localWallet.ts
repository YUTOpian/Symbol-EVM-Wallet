import { Keypair, VersionedTransaction } from '@solana/web3.js';
import nacl from 'tweetnacl';
import type { WalletProvider } from '../../../core/adapters/ChainAdapter';
import { generateMnemonic, isValidMnemonic, mnemonicToSeed } from '../../../crypto/mnemonic';
import { deriveKeypairFromSeed } from '../../../crypto/keyDerivation';
import { encryptSecret, decryptSecret, type EncryptedPayload } from '../../../crypto/secureStorage';

const STORAGE_KEY = 'symbol-ux-wallet:local-wallet:v1';

/** 新規Wallet作成: Seed Phraseを生成して返す(まだ保存はしない = 表示して確認させる) */
export function createNewWallet(): { mnemonic: string; keypair: Keypair } {
  const mnemonic = generateMnemonic();
  return { mnemonic, keypair: undefined as unknown as Keypair }; // keypairは確認後にderiveする想定
}

export async function deriveWalletFromMnemonic(mnemonic: string): Promise<Keypair> {
  if (!isValidMnemonic(mnemonic)) {
    throw new Error('Seed Phraseが正しくありません');
  }
  const seed = await mnemonicToSeed(mnemonic);
  return deriveKeypairFromSeed(seed);
}

/** Unlock用パスワードで暗号化してブラウザ内に保存する(Seed Phraseは外部送信しない) */
export async function persistWallet(mnemonic: string, password: string): Promise<void> {
  const payload = await encryptSecret(mnemonic, password);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function hasStoredWallet(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== null;
}

async function loadMnemonic(password: string): Promise<string> {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) throw new Error('保存されたWalletがありません');
  const payload: EncryptedPayload = JSON.parse(raw);
  return decryptSecret(payload, password);
}

/**
 * ローカル鍵によるWalletProvider実装。
 * Phantom/SolflareのWalletProviderと同じインターフェースを満たすことで、
 * UI/Wallet Core側は「自前Wallet」か「外部Wallet」かを意識しなくてよくなる。
 */
export class LocalWalletProvider implements WalletProvider {
  readonly name = 'Local Wallet';
  private keypair: Keypair | null = null;

  async unlock(password: string): Promise<void> {
    const mnemonic = await loadMnemonic(password);
    this.keypair = await deriveWalletFromMnemonic(mnemonic);
  }

  lock(): void {
    this.keypair = null;
  }

  async connect(): Promise<string> {
    if (!this.keypair) throw new Error('Walletがロックされています。先にunlock()してください');
    return this.keypair.publicKey.toBase58();
  }

  async disconnect(): Promise<void> {
    this.lock();
  }

  getPublicKey(): string | null {
    return this.keypair?.publicKey.toBase58() ?? null;
  }

  async signTransaction(serializedTx: Uint8Array): Promise<Uint8Array> {
    if (!this.keypair) throw new Error('Walletがロックされています');
    const tx = VersionedTransaction.deserialize(serializedTx);
    tx.sign([this.keypair]);
    return tx.serialize();
  }

  async signAllTransactions(serializedTxs: Uint8Array[]): Promise<Uint8Array[]> {
    return Promise.all(serializedTxs.map((tx) => this.signTransaction(tx)));
  }

  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    if (!this.keypair) throw new Error('Walletがロックされています');
    return nacl.sign.detached(message, this.keypair.secretKey);
  }
}
