import { PublicKey, LAMPORTS_PER_SOL, type ParsedTransactionWithMeta } from '@solana/web3.js';
import type { NetworkId } from '../../../core/types/network';
import type { WalletTransaction, TransactionCategory } from '../../../core/types/transaction';
import { getConnection } from '../network/connectionFactory';

const SYSTEM_PROGRAM_ID = '11111111111111111111111111111111111111';
const MEMO_PROGRAM_IDS = new Set([
  'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr',
  'Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo',
]);
const STAKE_PROGRAM_ID = 'Stake11111111111111111111111111111111111';
const TOKEN_PROGRAM_IDS = new Set([
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // spl-token
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', // Token-2022
]);
// 判定できるSwapプログラムはごく限定的な既知一覧のみ。ここに無いものは無理に推測せず program_interaction とする。
const KNOWN_SWAP_PROGRAM_IDS = new Set([
  'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4', // Jupiter Aggregator v6
]);

interface Classification {
  category: TransactionCategory;
  displayAmount?: string;
  displaySymbol?: string;
}

function classify(tx: ParsedTransactionWithMeta, ownerAddress: string): Classification {
  const accountKeys = tx.transaction.message.accountKeys.map((k) => k.pubkey.toBase58());
  const ownerIndex = accountKeys.indexOf(ownerAddress);
  const programIds = new Set(
    tx.transaction.message.instructions.map((ix) => ix.programId.toBase58()),
  );

  // --- token残高の増減(オーナー所有分)を集計 ---
  const preTokenBalances = tx.meta?.preTokenBalances ?? [];
  const postTokenBalances = tx.meta?.postTokenBalances ?? [];
  const tokenDelta = new Map<string, { delta: number; decimals: number }>();

  for (const post of postTokenBalances) {
    if (post.owner !== ownerAddress) continue;
    const pre = preTokenBalances.find(
      (p) => p.accountIndex === post.accountIndex && p.owner === ownerAddress,
    );
    const preAmount = pre ? Number(pre.uiTokenAmount.uiAmountString ?? '0') : 0;
    const postAmount = Number(post.uiTokenAmount.uiAmountString ?? '0');
    const delta = postAmount - preAmount;
    if (delta !== 0) {
      tokenDelta.set(post.mint, { delta, decimals: post.uiTokenAmount.decimals });
    }
  }
  // owner保有だったが post側で無くなった(全額送信してATAが閉じた)ケースもpreから拾う
  for (const pre of preTokenBalances) {
    if (pre.owner !== ownerAddress) continue;
    if (tokenDelta.has(pre.mint)) continue;
    const stillExists = postTokenBalances.some(
      (p) => p.accountIndex === pre.accountIndex && p.owner === ownerAddress,
    );
    if (!stillExists) {
      const preAmount = Number(pre.uiTokenAmount.uiAmountString ?? '0');
      if (preAmount !== 0) {
        tokenDelta.set(pre.mint, { delta: -preAmount, decimals: pre.uiTokenAmount.decimals });
      }
    }
  }

  if (tokenDelta.size > 0) {
    const [, info] = [...tokenDelta.entries()][0];
    const isNft = info.decimals === 0 && Math.abs(info.delta) === 1;
    const sign = info.delta > 0 ? '+' : '-';
    return {
      category: isNft ? 'nft_transfer' : 'token_transfer',
      displayAmount: `${sign}${Math.abs(info.delta)}`,
      displaySymbol: isNft ? 'NFT' : undefined,
    };
  }

  // --- SOLのネット増減 ---
  if (ownerIndex >= 0 && tx.meta) {
    const pre = tx.meta.preBalances[ownerIndex];
    const post = tx.meta.postBalances[ownerIndex];
    let delta = post - pre;
    // ownerが手数料支払者(index 0)の場合はfee分を除いた「純粋な送受金額」に補正する
    if (ownerIndex === 0) delta += tx.meta.fee;

    if (delta !== 0) {
      const sol = delta / LAMPORTS_PER_SOL;
      const sign = sol > 0 ? '+' : '-';
      return {
        category: sol > 0 ? 'receive' : 'send',
        displayAmount: `${sign}${Math.abs(sol)}`,
        displaySymbol: 'SOL',
      };
    }
  }

  for (const p of programIds) {
    if (KNOWN_SWAP_PROGRAM_IDS.has(p)) return { category: 'swap' };
  }
  if (programIds.has(STAKE_PROGRAM_ID)) return { category: 'stake' };
  if ([...programIds].every((p) => MEMO_PROGRAM_IDS.has(p) || p === SYSTEM_PROGRAM_ID)) {
    if ([...programIds].some((p) => MEMO_PROGRAM_IDS.has(p))) return { category: 'memo' };
  }
  const hasOnlyKnownNoOpPrograms = [...programIds].every(
    (p) => p === SYSTEM_PROGRAM_ID || TOKEN_PROGRAM_IDS.has(p) || MEMO_PROGRAM_IDS.has(p),
  );
  if (!hasOnlyKnownNoOpPrograms) return { category: 'program_interaction' };

  return { category: 'unknown' };
}

export async function getTransactionHistory(
  ownerAddress: string,
  network: NetworkId,
  limit = 20,
): Promise<WalletTransaction[]> {
  const connection = getConnection(network);
  const owner = new PublicKey(ownerAddress);

  const signatures = await connection.getSignaturesForAddress(owner, { limit });
  if (signatures.length === 0) return [];

  const parsedTxs = await connection.getParsedTransactions(
    signatures.map((s) => s.signature),
    { maxSupportedTransactionVersion: 0 },
  );

  const results: WalletTransaction[] = [];
  for (let i = 0; i < signatures.length; i++) {
    const sigInfo = signatures[i];
    const tx = parsedTxs[i];

    if (!tx) {
      results.push({
        id: sigInfo.signature,
        network,
        category: 'unknown',
        status: sigInfo.err ? 'failed' : 'success',
        slot: sigInfo.slot,
        blockTime: sigInfo.blockTime ?? null,
        fee: 0,
      });
      continue;
    }

    const classification = classify(tx, ownerAddress);
    results.push({
      id: sigInfo.signature,
      network,
      category: classification.category,
      status: tx.meta?.err ? 'failed' : 'success',
      slot: tx.slot,
      blockTime: tx.blockTime ?? null,
      fee: tx.meta?.fee ?? 0,
      displayAmount: classification.displayAmount,
      displaySymbol: classification.displaySymbol,
    });
  }

  return results;
}
