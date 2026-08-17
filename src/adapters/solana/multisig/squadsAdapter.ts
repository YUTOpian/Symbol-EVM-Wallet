import { PublicKey, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import * as multisig from '@sqds/multisig';
import type { NetworkId } from '../../../core/types/network';
import type { WalletProvider } from '../../../core/adapters/ChainAdapter';
import { getConnection } from '../network/connectionFactory';

/**
 * SymbolのMultisig概念を、Solana上で広く使われている監査済みのMultisig実装である
 * Squads Protocol(@sqds/multisig)で再現する。独自Multisigプログラムは実装しない
 * (秘密鍵を扱う以上に危険度が高いため、監査済みの既存実装を利用する方針)。
 */

export interface MultisigMember {
  key: string;
}

export interface MultisigInfo {
  address: string;
  members: MultisigMember[];
  threshold: number;
  transactionIndex: number;
  staleTransactionIndex: number;
}

export interface PendingProposal {
  transactionIndex: number;
  proposalAddress: string;
  status: string;
  approvedCount: number;
  rejectedCount: number;
  threshold: number;
  /** 接続中のAccountが既に承認済みかどうか */
  alreadyApprovedByMe: boolean;
}

export async function getMultisigInfo(
  multisigAddress: string,
  network: NetworkId,
): Promise<MultisigInfo> {
  const connection = getConnection(network);
  const address = new PublicKey(multisigAddress);
  const account = await multisig.accounts.Multisig.fromAccountAddress(connection, address);

  return {
    address: multisigAddress,
    members: account.members.map((m) => ({ key: m.key.toBase58() })),
    threshold: account.threshold,
    transactionIndex: Number(account.transactionIndex),
    staleTransactionIndex: Number(account.staleTransactionIndex),
  };
}

/**
 * staleTransactionIndex以降でActive状態のProposalのみを「対応が必要な保留中Transaction」として返す。
 * 存在しないTransaction index(まだ提案されていない、等)はスキップする。
 */
export async function listPendingProposals(
  info: MultisigInfo,
  network: NetworkId,
  currentAccountAddress: string | null,
): Promise<PendingProposal[]> {
  const connection = getConnection(network);
  const multisigPda = new PublicKey(info.address);

  const start = Math.max(1, info.staleTransactionIndex);
  const end = info.transactionIndex;
  const results: PendingProposal[] = [];

  for (let i = start; i <= end; i++) {
    const transactionIndex = BigInt(i);
    const [proposalPda] = multisig.getProposalPda({ multisigPda, transactionIndex });

    try {
      const proposal = await multisig.accounts.Proposal.fromAccountAddress(connection, proposalPda);
      if (!multisig.types.isProposalStatusActive(proposal.status)) continue;

      results.push({
        transactionIndex: i,
        proposalAddress: proposalPda.toBase58(),
        status: proposal.status.__kind,
        approvedCount: proposal.approved.length,
        rejectedCount: proposal.rejected.length,
        threshold: info.threshold,
        alreadyApprovedByMe: currentAccountAddress
          ? proposal.approved.some((p) => p.toBase58() === currentAccountAddress)
          : false,
      });
    } catch {
      // Proposalアカウントが存在しない index はスキップする
      continue;
    }
  }

  return results;
}

export async function approveProposal(
  multisigAddress: string,
  transactionIndex: number,
  memberAddress: string,
  network: NetworkId,
  provider: WalletProvider,
): Promise<string> {
  const connection = getConnection(network);
  const multisigPda = new PublicKey(multisigAddress);
  const member = new PublicKey(memberAddress);

  const instruction = multisig.instructions.proposalApprove({
    multisigPda,
    transactionIndex: BigInt(transactionIndex),
    member,
  });

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  const message = new TransactionMessage({
    payerKey: member,
    recentBlockhash: blockhash,
    instructions: [instruction],
  }).compileToV0Message();

  const tx = new VersionedTransaction(message);
  const signed = await provider.signTransaction(tx.serialize());
  const signature = await connection.sendRawTransaction(signed, { skipPreflight: false });
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
  return signature;
}
