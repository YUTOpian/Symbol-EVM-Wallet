import { PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { fetchDigitalAsset } from '@metaplex-foundation/mpl-token-metadata';
import { publicKey as umiPublicKey } from '@metaplex-foundation/umi';
import type { NetworkId } from '../../../core/types/network';
import type { Asset } from '../../../core/types/asset';
import { getConnection } from '../network/connectionFactory';
import { getUmi } from '../metaplex/umiClient';

interface ParsedTokenAccountInfo {
  mint: string;
  amount: string; // 生の(decimals適用前の)文字列
  decimals: number;
  uiAmountString: string;
}

async function fetchParsedTokenAccounts(
  ownerAddress: string,
  network: NetworkId,
  programId: typeof TOKEN_PROGRAM_ID,
): Promise<ParsedTokenAccountInfo[]> {
  const connection = getConnection(network);
  const owner = new PublicKey(ownerAddress);

  const resp = await connection.getParsedTokenAccountsByOwner(owner, { programId });

  return resp.value
    .map((accountInfo) => {
      const parsed = accountInfo.account.data.parsed?.info;
      if (!parsed) return null;
      const tokenAmount = parsed.tokenAmount;
      return {
        mint: parsed.mint as string,
        amount: tokenAmount.amount as string,
        decimals: tokenAmount.decimals as number,
        uiAmountString: tokenAmount.uiAmountString as string,
      };
    })
    .filter((v): v is ParsedTokenAccountInfo => v !== null)
    // 残高0のToken Accountは表示しない(closeされていないダストアカウント対策)
    .filter((v) => v.amount !== '0');
}

/**
 * decimals === 0 かつ供給量が実質1(amount===1)のトークンはNFTとして扱う。
 * これはSolanaでの一般的なNFT判定の目安であり、完全に正確な判定ではない
 * (真の判定にはMint Supply全体の確認が必要だが、MVPではこの簡易判定を採用する)。
 */
function looksLikeNft(info: ParsedTokenAccountInfo): boolean {
  return info.decimals === 0 && info.amount === '1';
}

async function toFungibleAsset(
  info: ParsedTokenAccountInfo,
  network: NetworkId,
  tokenProgram: 'spl-token' | 'token-2022',
): Promise<Asset> {
  return {
    id: `${network}:${info.mint}`,
    type: 'fungible',
    network,
    mint: info.mint,
    // オンチェーンのSymbol/Nameはmint metadataの取得が必要なため、MVPではmintアドレスを暫定表示する。
    // 次のステップでMetaplex/Token-2022 Metadata Extensionから解決する。
    symbol: shortenMint(info.mint),
    name: shortenMint(info.mint),
    decimals: info.decimals,
    balance: info.uiAmountString,
    tokenProgram,
  };
}

async function toNftAsset(
  info: ParsedTokenAccountInfo,
  network: NetworkId,
  tokenProgram: 'spl-token' | 'token-2022',
): Promise<Asset> {
  const base: Asset = {
    id: `${network}:${info.mint}`,
    type: 'nft',
    network,
    mint: info.mint,
    symbol: 'NFT',
    name: shortenMint(info.mint),
    decimals: 0,
    balance: '1',
    tokenProgram,
  };

  try {
    const umi = getUmi(network);
    const asset = await fetchDigitalAsset(umi, umiPublicKey(info.mint));
    return {
      ...base,
      name: asset.metadata.name?.trim() || base.name,
      symbol: asset.metadata.symbol?.trim() || base.symbol,
      collection: asset.metadata.collection?.__option === 'Some'
        ? asset.metadata.collection.value.key.toString()
        : undefined,
    };
  } catch {
    // オンチェーンMetadataが存在しない/取得失敗した場合はベース情報のまま返す
    return base;
  }
}

function shortenMint(mint: string): string {
  return `${mint.slice(0, 4)}…${mint.slice(-4)}`;
}

/**
 * SPL Token(旧プログラム)とToken-2022の両方から、
 * Fungible / NFT を分類したAsset配列を取得する。
 */
export async function getTokenAssets(ownerAddress: string, network: NetworkId): Promise<Asset[]> {
  const [splAccounts, token2022Accounts] = await Promise.all([
    fetchParsedTokenAccounts(ownerAddress, network, TOKEN_PROGRAM_ID),
    fetchParsedTokenAccounts(ownerAddress, network, TOKEN_2022_PROGRAM_ID),
  ]);

  const withProgram: Array<[ParsedTokenAccountInfo, 'spl-token' | 'token-2022']> = [
    ...splAccounts.map((a): [ParsedTokenAccountInfo, 'spl-token'] => [a, 'spl-token']),
    ...token2022Accounts.map((a): [ParsedTokenAccountInfo, 'token-2022'] => [a, 'token-2022']),
  ];

  const assets = await Promise.all(
    withProgram.map(([info, program]) =>
      looksLikeNft(info) ? toNftAsset(info, network, program) : toFungibleAsset(info, network, program),
    ),
  );

  return assets;
}
