import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import type { NetworkId } from '../../../core/types/network';
import type { Asset } from '../../../core/types/asset';
import { getConnection } from '../network/connectionFactory';

/** ネイティブSOL残高を取得し、Asset型(type: 'native')として返す */
export async function getNativeAsset(address: string, network: NetworkId): Promise<Asset> {
  const connection = getConnection(network);
  const lamports = await connection.getBalance(new PublicKey(address));
  const sol = lamports / LAMPORTS_PER_SOL;

  return {
    id: `${network}:native`,
    type: 'native',
    network,
    symbol: 'SOL',
    name: 'Solana',
    decimals: 9,
    balance: sol.toString(),
  };
}
