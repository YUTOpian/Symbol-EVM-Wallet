import {
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  PACKET_DATA_SIZE,
} from '@solana/web3.js';
import type { NetworkId } from '../../../core/types/network';
import type { Asset } from '../../../core/types/asset';
import type { WalletProvider } from '../../../core/adapters/ChainAdapter';
import { getConnection } from '../network/connectionFactory';
import { buildTransferInstructions } from './send';

export interface BatchItem {
  asset: Asset;
  toAddress: string;
  amount: string;
  memo?: string;
}

export interface BatchGroup {
  /** このグループに含まれる元のBatchItemのindex(UI表示用) */
  itemIndexes: number[];
  instructions: TransactionInstruction[];
}

/**
 * SymbolのAggregate Transactionに近いUXを、Solanaの1つの VersionedTransaction に
 * 複数Instructionをまとめることで再現する。
 * ただし1トランザクションのサイズ上限(PACKET_DATA_SIZE=1232 byte)を超える場合は、
 * 複数トランザクションに分割する(この場合、グループ間の原子性は保証されない)。
 */
export async function planBatchGroups(
  items: BatchItem[],
  fromAddress: string,
): Promise<BatchGroup[]> {
  const from = new PublicKey(fromAddress);
  const dummyBlockhash = from.toBase58(); // サイズ見積もり用。実送信時は正しいblockhashで作り直す

  const perItemInstructions = await Promise.all(
    items.map((item) =>
      buildTransferInstructions({
        asset: item.asset,
        fromAddress,
        toAddress: item.toAddress,
        amount: item.amount,
        memo: item.memo,
        network: item.asset.network,
      }),
    ),
  );

  function fitsInOneTx(instructions: TransactionInstruction[]): boolean {
    try {
      const message = new TransactionMessage({
        payerKey: from,
        recentBlockhash: dummyBlockhash,
        instructions,
      }).compileToV0Message();
      const tx = new VersionedTransaction(message);
      return tx.serialize().length <= PACKET_DATA_SIZE;
    } catch {
      return false;
    }
  }

  const groups: BatchGroup[] = [];
  let currentInstructions: TransactionInstruction[] = [];
  let currentIndexes: number[] = [];

  for (let i = 0; i < perItemInstructions.length; i++) {
    const itemInstructions = perItemInstructions[i];

    if (!fitsInOneTx(itemInstructions)) {
      throw new Error(
        `${i + 1}番目の送金だけで1トランザクションの上限サイズを超えています(Asset種別や送金先の組み合わせを見直してください)`,
      );
    }

    const tentative = [...currentInstructions, ...itemInstructions];
    if (currentInstructions.length === 0 || fitsInOneTx(tentative)) {
      currentInstructions = tentative;
      currentIndexes = [...currentIndexes, i];
    } else {
      groups.push({ itemIndexes: currentIndexes, instructions: currentInstructions });
      currentInstructions = itemInstructions;
      currentIndexes = [i];
    }
  }

  if (currentInstructions.length > 0) {
    groups.push({ itemIndexes: currentIndexes, instructions: currentInstructions });
  }

  return groups;
}

export interface BatchExecutionResult {
  groupIndex: number;
  itemIndexes: number[];
  signature: string;
}

/**
 * 計画済みのグループを順番に署名・送信する。
 * 重要: グループが複数になった場合、Symbolの Aggregate Transaction と異なり
 * 全体が1つの原子的な操作にはならない(グループ単位でのみ原子的)。
 * 途中のグループで失敗した場合、それ以前のグループは既にチェーン上で確定している。
 */
export async function executeBatch(
  groups: BatchGroup[],
  fromAddress: string,
  network: NetworkId,
  provider: WalletProvider,
  onProgress?: (completed: number, total: number) => void,
): Promise<BatchExecutionResult[]> {
  const connection = getConnection(network);
  const from = new PublicKey(fromAddress);
  const results: BatchExecutionResult[] = [];

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

    const message = new TransactionMessage({
      payerKey: from,
      recentBlockhash: blockhash,
      instructions: group.instructions,
    }).compileToV0Message();

    const tx = new VersionedTransaction(message);
    const signed = await provider.signTransaction(tx.serialize());
    const signature = await connection.sendRawTransaction(signed, { skipPreflight: false });
    await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');

    results.push({ groupIndex: i, itemIndexes: group.itemIndexes, signature });
    onProgress?.(i + 1, groups.length);
  }

  return results;
}
