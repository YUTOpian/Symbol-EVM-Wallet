import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
} from '@solana/spl-token';
import type { NetworkId } from '../../../core/types/network';
import type { Asset } from '../../../core/types/asset';
import type { WalletProvider } from '../../../core/adapters/ChainAdapter';
import { getConnection } from '../network/connectionFactory';

const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

function buildMemoInstruction(memo: string): TransactionInstruction {
  return new TransactionInstruction({
    programId: MEMO_PROGRAM_ID,
    keys: [],
    data: Buffer.from(memo, 'utf-8'),
  });
}

export interface SendParams {
  asset: Asset;
  fromAddress: string;
  toAddress: string;
  /** UI表示単位(例: "1.5")。lamports/最小単位への変換はここで行う */
  amount: string;
  memo?: string;
  network: NetworkId;
}

/** SOL(Native) / SPL Token / Token-2022 のいずれにも対応した送金Instruction列を組み立てる */
export async function buildTransferInstructions(params: SendParams): Promise<TransactionInstruction[]> {
  const { asset, fromAddress, toAddress, amount, memo } = params;
  const from = new PublicKey(fromAddress);
  const to = new PublicKey(toAddress);
  const instructions: TransactionInstruction[] = [];

  if (asset.type === 'native') {
    const lamports = Math.round(Number(amount) * 1_000_000_000);
    if (!Number.isFinite(lamports) || lamports <= 0) {
      throw new Error('金額が正しくありません');
    }
    instructions.push(
      SystemProgram.transfer({
        fromPubkey: from,
        toPubkey: to,
        lamports,
      }),
    );
  } else {
    // fungible / nft (NFTはamount="1"固定でdecimals=0として扱う)
    if (!asset.mint) throw new Error('Token mintが不明です');
    const mint = new PublicKey(asset.mint);
    const programId = asset.tokenProgram === 'token-2022' ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;

    const fromAta = getAssociatedTokenAddressSync(mint, from, false, programId, ASSOCIATED_TOKEN_PROGRAM_ID);
    const toAta = getAssociatedTokenAddressSync(mint, to, false, programId, ASSOCIATED_TOKEN_PROGRAM_ID);

    // 送信先のATAが存在しない場合に備え、冪等(idempotent)な作成命令を先頭に追加する。
    // 既に存在する場合は何もしない命令になるため安全。
    instructions.push(
      createAssociatedTokenAccountIdempotentInstruction(from, toAta, to, mint, programId, ASSOCIATED_TOKEN_PROGRAM_ID),
    );

    const rawAmount = BigInt(Math.round(Number(amount) * 10 ** asset.decimals));
    if (rawAmount <= 0n) {
      throw new Error('金額が正しくありません');
    }

    instructions.push(
      createTransferCheckedInstruction(
        fromAta,
        mint,
        toAta,
        from,
        rawAmount,
        asset.decimals,
        [],
        programId,
      ),
    );
  }

  if (memo && memo.trim().length > 0) {
    instructions.push(buildMemoInstruction(memo.trim()));
  }

  return instructions;
}

/**
 * Transactionを組み立て、WalletProvider(ローカルWalletでもPhantom/Solflareでも同じ形)で
 * 署名させてからネットワークへ送信する。署名前の内容確認はUI(Send画面)側の責務。
 */
export async function buildAndSendTransaction(
  params: SendParams,
  provider: WalletProvider,
): Promise<string> {
  const connection = getConnection(params.network);
  const instructions = await buildTransferInstructions(params);

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  const from = new PublicKey(params.fromAddress);

  const message = new TransactionMessage({
    payerKey: from,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();

  const tx = new VersionedTransaction(message);
  const serialized = tx.serialize();

  const signed = await provider.signTransaction(serialized);
  const signature = await connection.sendRawTransaction(signed, { skipPreflight: false });

  await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    'confirmed',
  );

  return signature;
}
