import { Connection } from '@solana/web3.js';
import type { NetworkId } from '../../../core/types/network';
import { getNetworkConfig } from './networkConfig';

/**
 * network毎にConnectionインスタンスをキャッシュする。
 * Mainnet/Testnetの状態を絶対に混ぜないよう、Map<NetworkId, Connection>で明示的に分離する
 * (単一のConnectionを使い回してURLだけ差し替える、という実装は禁止)。
 */
const connections = new Map<NetworkId, Connection>();

export function getConnection(network: NetworkId): Connection {
  const cached = connections.get(network);
  if (cached) return cached;

  const config = getNetworkConfig(network);
  const connection = new Connection(config.rpc, 'confirmed');
  connections.set(network, connection);
  return connection;
}
