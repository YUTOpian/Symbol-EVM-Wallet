import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata';
import type { Umi } from '@metaplex-foundation/umi';
import type { NetworkId } from '../../../core/types/network';
import { getNetworkConfig } from '../network/networkConfig';

/**
 * NetworkごとにUmiインスタンスをキャッシュする。
 * connectionFactory.ts のConnection分離と同じ方針で、Mainnet/Testnetを混在させない。
 */
const umiInstances = new Map<NetworkId, Umi>();

export function getUmi(network: NetworkId): Umi {
  const cached = umiInstances.get(network);
  if (cached) return cached;

  const config = getNetworkConfig(network);
  const umi = createUmi(config.rpc).use(mplTokenMetadata());
  umiInstances.set(network, umi);
  return umi;
}
