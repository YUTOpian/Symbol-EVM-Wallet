import {
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getMint,
  getPermanentDelegate,
  getTransferHook,
  getNonTransferable,
  getDefaultAccountState,
  getMintCloseAuthority,
  getAssociatedTokenAddressSync,
  createFreezeAccountInstruction,
  createThawAccountInstruction,
  AccountState,
} from '@solana/spl-token';
import type { NetworkId } from '../../../core/types/network';
import type { WalletProvider } from '../../../core/adapters/ChainAdapter';
import { getConnection } from '../network/connectionFactory';

/**
 * SymbolのRestriction概念を、Token-2022の各種Extensionで可能な範囲だけ再現する。
 * 独自の制限ロジックを実装するのではなく、Token-2022が標準で提供する仕組み
 * (Freeze Authority / Permanent Delegate / Transfer Hook / Non-Transferable / Default Account State)
 * を「閲覧」し、Freeze Authorityを持つ場合のみ特定Accountの凍結/解除を行えるようにする。
 *
 * 重要な制約: Permanent Delegate・Transfer Hook・Non-Transferable・Default Account State は
 * Mint作成時にしか設定できないExtensionのため、このアプリからは有効化できない(閲覧のみ)。
 * 唯一、作成後でも操作可能なのは Freeze Authority による対象Accountの凍結/解除のみ。
 */

export interface RestrictionInfo {
  hasFreezeAuthority: boolean;
  freezeAuthority: string | null;
  permanentDelegate: string | null;
  transferHookProgram: string | null;
  isNonTransferable: boolean;
  defaultAccountFrozen: boolean;
}

export async function getAssetRestrictions(
  mintAddress: string,
  network: NetworkId,
): Promise<RestrictionInfo> {
  const connection = getConnection(network);
  const mintPubkey = new PublicKey(mintAddress);
  const mint = await getMint(connection, mintPubkey, 'confirmed', TOKEN_2022_PROGRAM_ID);

  const permanentDelegate = getPermanentDelegate(mint);
  const transferHook = getTransferHook(mint);
  const nonTransferable = getNonTransferable(mint);
  const defaultAccountState = getDefaultAccountState(mint);
  // Mint Close Authorityは直接Restrictionではないが、参考情報として今後拡張しやすいよう読み取り関数を用意している
  void getMintCloseAuthority;

  return {
    hasFreezeAuthority: mint.freezeAuthority !== null,
    freezeAuthority: mint.freezeAuthority?.toBase58() ?? null,
    permanentDelegate: permanentDelegate?.delegate.toBase58() ?? null,
    transferHookProgram: transferHook?.programId.toBase58() ?? null,
    isNonTransferable: nonTransferable !== null,
    defaultAccountFrozen: defaultAccountState?.state === AccountState.Frozen,
  };
}

async function sendFreezeOrThaw(
  action: 'freeze' | 'thaw',
  mintAddress: string,
  targetOwnerAddress: string,
  freezeAuthority: string,
  network: NetworkId,
  provider: WalletProvider,
): Promise<string> {
  const connection = getConnection(network);
  const mint = new PublicKey(mintAddress);
  const owner = new PublicKey(targetOwnerAddress);
  const authority = new PublicKey(freezeAuthority);

  const tokenAccount = getAssociatedTokenAddressSync(
    mint,
    owner,
    false,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  const instruction =
    action === 'freeze'
      ? createFreezeAccountInstruction(tokenAccount, mint, authority, [], TOKEN_2022_PROGRAM_ID)
      : createThawAccountInstruction(tokenAccount, mint, authority, [], TOKEN_2022_PROGRAM_ID);

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  const message = new TransactionMessage({
    payerKey: authority,
    recentBlockhash: blockhash,
    instructions: [instruction],
  }).compileToV0Message();

  const tx = new VersionedTransaction(message);
  const signed = await provider.signTransaction(tx.serialize());
  const signature = await connection.sendRawTransaction(signed, { skipPreflight: false });
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
  return signature;
}

export async function freezeTokenAccount(
  mintAddress: string,
  targetOwnerAddress: string,
  freezeAuthority: string,
  network: NetworkId,
  provider: WalletProvider,
): Promise<string> {
  return sendFreezeOrThaw('freeze', mintAddress, targetOwnerAddress, freezeAuthority, network, provider);
}

export async function thawTokenAccount(
  mintAddress: string,
  targetOwnerAddress: string,
  freezeAuthority: string,
  network: NetworkId,
  provider: WalletProvider,
): Promise<string> {
  return sendFreezeOrThaw('thaw', mintAddress, targetOwnerAddress, freezeAuthority, network, provider);
}
