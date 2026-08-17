import type { NetworkId } from './network';

/** Symbol の「Asset」概念に合わせつつ、Solana 側の分類を保持する */
export type AssetType = 'native' | 'fungible' | 'nft';

export interface AssetAttribute {
  trait_type: string;
  value: string;
}

export interface Asset {
  /** `${network}:${mint|'native'}` を想定した一意キー。同名Tokenでも別Assetとして扱うための鍵 */
  id: string;
  type: AssetType;
  network: NetworkId;

  /** native の場合は undefined */
  mint?: string;

  symbol: string;
  name: string;
  decimals: number;

  /** 表示用の残高。精度落ちを避けるため文字列で保持する */
  balance: string;

  /** SPL Token / Token-2022 の区別 */
  tokenProgram?: 'spl-token' | 'token-2022';

  /** NFT の場合のみ */
  image?: string;
  description?: string;
  collection?: string;
  attributes?: AssetAttribute[];
}
