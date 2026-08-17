import { derivePath } from 'ed25519-hd-key';
import { Keypair } from '@solana/web3.js';

/**
 * Solanaの標準的な導出パス(Phantom等の主要ウォレットと同じ規則)。
 * account indexで複数アカウントの導出にも対応できるようにしている。
 */
export function solanaDerivationPath(accountIndex = 0): string {
  return `m/44'/501'/${accountIndex}'/0'`;
}

export function deriveKeypairFromSeed(seed: Buffer, accountIndex = 0): Keypair {
  const path = solanaDerivationPath(accountIndex);
  const { key } = derivePath(path, seed.toString('hex'));
  return Keypair.fromSeed(key);
}
