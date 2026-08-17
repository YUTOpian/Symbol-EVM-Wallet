import type { NetworkId } from './network';

/** SymbolのMetadata(Key/Value)に相当。Solanaでは PDA に保存する想定 */
export interface AssetMetadataEntry {
  key: string;
  value: string;
  mint: string;
  network: NetworkId;
}
