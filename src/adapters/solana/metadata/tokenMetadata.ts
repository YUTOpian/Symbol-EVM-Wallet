import { PublicKey, TransactionMessage, VersionedTransaction, TransactionInstruction } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, getTokenMetadata } from '@solana/spl-token';
import { createUpdateFieldInstruction, createRemoveKeyInstruction } from '@solana/spl-token-metadata';
import type { NetworkId } from '../../../core/types/network';
import type { AssetMetadataEntry } from '../../../core/types/metadata';
import type { WalletProvider } from '../../../core/adapters/ChainAdapter';
import { getConnection } from '../network/connectionFactory';

/**
 * SymbolのMetadata(Key/Value)概念を、Token-2022のMetadata Extensionで再現する。
 * これはSolanaネイティブの仕組みであり、独自プログラムのデプロイを必要としない。
 * 制約: Token-2022かつMetadata Extensionが初期化されているmintのみ対応(SPL Token旧プログラムは非対応)。
 */

export interface TokenMetadataInfo {
  name: string;
  symbol: string;
  uri: string;
  updateAuthority: string | null;
  entries: AssetMetadataEntry[];
}

export async function getAssetMetadataEntries(
  mintAddress: string,
  network: NetworkId,
): Promise<TokenMetadataInfo | null> {
  const connection = getConnection(network);
  const mint = new PublicKey(mintAddress);

  const metadata = await getTokenMetadata(connection, mint, 'confirmed', TOKEN_2022_PROGRAM_ID);
  if (!metadata) return null;

  return {
    name: metadata.name,
    symbol: metadata.symbol,
    uri: metadata.uri,
    updateAuthority: metadata.updateAuthority?.toBase58() ?? null,
    entries: metadata.additionalMetadata.map(([key, value]) => ({
      key,
      value,
      mint: mintAddress,
      network,
    })),
  };
}

async function sendMetadataInstruction(
  instruction: TransactionInstruction,
  updateAuthority: string,
  network: NetworkId,
  provider: WalletProvider,
): Promise<string> {
  const connection = getConnection(network);
  const payer = new PublicKey(updateAuthority);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

  const message = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: blockhash,
    instructions: [instruction],
  }).compileToV0Message();

  const tx = new VersionedTransaction(message);
  const signed = await provider.signTransaction(tx.serialize());
  const signature = await connection.sendRawTransaction(signed, { skipPreflight: false });
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
  return signature;
}

/** Key/Valueを追加、または既存Keyの場合は上書きする */
export async function setMetadataField(
  mintAddress: string,
  updateAuthority: string,
  key: string,
  value: string,
  network: NetworkId,
  provider: WalletProvider,
): Promise<string> {
  const mint = new PublicKey(mintAddress);
  const instruction = createUpdateFieldInstruction({
    programId: TOKEN_2022_PROGRAM_ID,
    metadata: mint, // Token-2022ではMetadata ExtensionはMint自身のアカウントに格納される
    updateAuthority: new PublicKey(updateAuthority),
    field: key,
    value,
  });
  return sendMetadataInstruction(instruction, updateAuthority, network, provider);
}

export async function removeMetadataField(
  mintAddress: string,
  updateAuthority: string,
  key: string,
  network: NetworkId,
  provider: WalletProvider,
): Promise<string> {
  const mint = new PublicKey(mintAddress);
  const instruction = createRemoveKeyInstruction({
    programId: TOKEN_2022_PROGRAM_ID,
    metadata: mint,
    updateAuthority: new PublicKey(updateAuthority),
    key,
    idempotent: true,
  });
  return sendMetadataInstruction(instruction, updateAuthority, network, provider);
}
