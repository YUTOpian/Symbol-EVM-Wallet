import {
  PublicKey,
  BPF_LOADER_PROGRAM_ID,
  SystemProgram,
  type ParsedTransactionWithMeta,
  type VersionedBlockResponse,
} from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, getMint } from '@solana/spl-token';
import type { NetworkId } from '../../../core/types/network';
import { getConnection } from '../network/connectionFactory';

/**
 * SymbolのExplorer機能を、Solanaの検索対象(Address / Transaction Signature /
 * Token Mint / NFT / Program / Slot)に合わせて実装する簡易Explorer。
 * 入力文字列だけでは種別を判定しきれないため、まず形式で絞り込み、
 * 最終的にはネットワークへ問い合わせて実際の種別を確定する。
 */

const BPF_LOADER_UPGRADEABLE_ID = 'BPFLoaderUpgradeab1e11111111111111111111111';

export type ExplorerResult =
  | { kind: 'transaction'; signature: string; tx: ParsedTransactionWithMeta | null }
  | { kind: 'slot'; slot: number; block: VersionedBlockResponse | null }
  | {
      kind: 'account';
      address: string;
      accountType: 'wallet' | 'token-mint' | 'nft-mint' | 'program' | 'unknown';
      lamports: number;
      owner: string;
      mintInfo?: { decimals: number; supply: string; tokenProgram: 'spl-token' | 'token-2022' };
    }
  | { kind: 'not_found'; query: string };

function isNumeric(input: string): boolean {
  return /^\d+$/.test(input.trim());
}

/** Base58の長さで Address(32byte≈43-44文字) と Signature(64byte≈87-88文字) を大まかに見分ける */
function looksLikeSignature(input: string): boolean {
  return input.trim().length >= 80;
}

export async function explore(query: string, network: NetworkId): Promise<ExplorerResult> {
  const trimmed = query.trim();
  const connection = getConnection(network);

  if (isNumeric(trimmed)) {
    const slot = Number(trimmed);
    try {
      const block = await connection.getBlock(slot, { maxSupportedTransactionVersion: 0 });
      return { kind: 'slot', slot, block: block ?? null };
    } catch {
      return { kind: 'slot', slot, block: null };
    }
  }

  if (looksLikeSignature(trimmed)) {
    try {
      const tx = await connection.getParsedTransaction(trimmed, { maxSupportedTransactionVersion: 0 });
      if (tx) return { kind: 'transaction', signature: trimmed, tx };
    } catch {
      // signatureとして解決できなければAddress側の判定へフォールスルーする
    }
  }

  try {
    const pubkey = new PublicKey(trimmed);
    const accountInfo = await connection.getAccountInfo(pubkey);
    if (!accountInfo) return { kind: 'not_found', query: trimmed };

    const owner = accountInfo.owner.toBase58();

    if (owner === SystemProgram.programId.toBase58()) {
      return {
        kind: 'account',
        address: trimmed,
        accountType: 'wallet',
        lamports: accountInfo.lamports,
        owner,
      };
    }

    if (owner === TOKEN_PROGRAM_ID.toBase58() || owner === TOKEN_2022_PROGRAM_ID.toBase58()) {
      try {
        const programId = owner === TOKEN_2022_PROGRAM_ID.toBase58() ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
        const mint = await getMint(connection, pubkey, 'confirmed', programId);
        const isNft = mint.decimals === 0 && mint.supply === 1n;
        return {
          kind: 'account',
          address: trimmed,
          accountType: isNft ? 'nft-mint' : 'token-mint',
          lamports: accountInfo.lamports,
          owner,
          mintInfo: {
            decimals: mint.decimals,
            supply: mint.supply.toString(),
            tokenProgram: programId === TOKEN_2022_PROGRAM_ID ? 'token-2022' : 'spl-token',
          },
        };
      } catch {
        // Mintではない(Token Account等)場合はunknownとして返す
        return { kind: 'account', address: trimmed, accountType: 'unknown', lamports: accountInfo.lamports, owner };
      }
    }

    if (
      owner === BPF_LOADER_PROGRAM_ID.toBase58() ||
      owner === BPF_LOADER_UPGRADEABLE_ID ||
      accountInfo.executable
    ) {
      return { kind: 'account', address: trimmed, accountType: 'program', lamports: accountInfo.lamports, owner };
    }

    return { kind: 'account', address: trimmed, accountType: 'unknown', lamports: accountInfo.lamports, owner };
  } catch {
    return { kind: 'not_found', query: trimmed };
  }
}
