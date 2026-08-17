import type { NetworkId } from '../../../core/types/network';
import type { Asset } from '../../../core/types/asset';
import { getNativeAsset } from './nativeBalance';
import { getTokenAssets } from './splToken';

/**
 * Symbolの「Asset」統一概念に合わせ、Native / Fungible / NFT をまとめて1つの配列で返す。
 * 呼び出し側(UI)はtypeで表示を出し分ける。
 */
export async function getAllAssets(ownerAddress: string, network: NetworkId): Promise<Asset[]> {
  const [native, tokens] = await Promise.all([
    getNativeAsset(ownerAddress, network),
    getTokenAssets(ownerAddress, network),
  ]);

  return [native, ...tokens];
}
