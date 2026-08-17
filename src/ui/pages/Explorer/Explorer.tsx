import { useState } from 'react';
import { useNetworkStore } from '../../../core/stores/networkStore';
import { explore, type ExplorerResult } from '../../../adapters/solana/explorer/explorer';
import { getNetworkConfig } from '../../../adapters/solana/network/networkConfig';

interface Props {
  onBack: () => void;
}

const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  wallet: 'Address(Wallet)',
  'token-mint': 'Token Mint',
  'nft-mint': 'NFT',
  program: 'Program',
  unknown: 'Account(種別不明)',
};

const PROGRAM_NAME_MAP: Record<string, string> = {
  '11111111111111111111111111111111111111': 'System Program',
  TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA: 'Token Program',
  TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb: 'Token-2022 Program',
  MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr: 'Memo Program',
  ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL: 'Associated Token Account Program',
};

function programLabel(programId: string): string {
  return PROGRAM_NAME_MAP[programId] ?? programId;
}

export default function Explorer({ onBack }: Props) {
  const network = useNetworkStore((s) => s.network);
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<ExplorerResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await explore(query, network);
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : '検索に失敗しました');
    } finally {
      setLoading(false);
    }
  }

  const explorerBase = getNetworkConfig(network).explorer;
  const clusterParam = network === 'testnet' ? '?cluster=testnet' : '';

  return (
    <div>
      <button className="back-link" onClick={onBack}>
        ← 戻る
      </button>
      <h1 className="page-title">Explorer</h1>
      <p className="page-sub">
        Address / Transaction Signature / Token Mint / NFT / Program / Slot のいずれかを入力してください。
      </p>

      <div className="field">
        <label>Search</label>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
          placeholder="Address, Signature, Mint, Program, Slot…"
        />
      </div>
      <button className="btn btn-primary" style={{ marginBottom: 20 }} disabled={loading} onClick={search}>
        {loading ? '検索中…' : '検索'}
      </button>

      {error && <div className="error-banner">{error}</div>}

      {result?.kind === 'not_found' && (
        <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>
          "{result.query}" に一致するAddress/Transaction/Slotが見つかりませんでした。
        </p>
      )}

      {result?.kind === 'slot' && (
        <>
          <div className="section-title">Slot</div>
          <div className="account-card">
            <div className="name">Slot</div>
            <div className="address">{result.slot}</div>
          </div>
          {result.block ? (
            <>
              <div className="account-card">
                <div className="name">Blockhash</div>
                <div className="address">{result.block.blockhash}</div>
              </div>
              <div className="account-card">
                <div className="name">Parent Slot</div>
                <div className="address">{result.block.parentSlot}</div>
              </div>
              <div className="account-card">
                <div className="name">Block Time</div>
                <div className="address">
                  {result.block.blockTime ? new Date(result.block.blockTime * 1000).toLocaleString('ja-JP') : '—'}
                </div>
              </div>
              <div className="account-card">
                <div className="name">Transactions</div>
                <div className="address">{result.block.transactions.length}件</div>
              </div>
            </>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>このSlotのBlock情報は取得できませんでした。</p>
          )}
        </>
      )}

      {result?.kind === 'transaction' && (
        <>
          <div className="section-title">Transaction</div>
          <div className="account-card">
            <div className="name">Signature</div>
            <div className="address">{result.signature}</div>
          </div>
          {result.tx ? (
            <>
              <div className="account-card">
                <div className="name">Status</div>
                <div className="address">{result.tx.meta?.err ? 'Failed' : 'Success'}</div>
              </div>
              <div className="account-card">
                <div className="name">Slot</div>
                <div className="address">{result.tx.slot}</div>
              </div>
              <div className="account-card">
                <div className="name">Block Time</div>
                <div className="address">
                  {result.tx.blockTime ? new Date(result.tx.blockTime * 1000).toLocaleString('ja-JP') : '—'}
                </div>
              </div>
              <div className="account-card">
                <div className="name">Fee</div>
                <div className="address">{result.tx.meta?.fee ?? 0} lamports</div>
              </div>
              <div className="section-title">Instructions</div>
              {result.tx.transaction.message.instructions.map((ix, i) => (
                <div className="asset-row" key={i}>
                  <div className="asset-name">{programLabel(ix.programId.toBase58())}</div>
                </div>
              ))}
              <a
                className="btn btn-secondary"
                style={{ display: 'block', textAlign: 'center', textDecoration: 'none', marginTop: 16 }}
                href={`${explorerBase}/tx/${result.signature}${clusterParam}`}
                target="_blank"
                rel="noreferrer"
              >
                Solana Explorerで開く
              </a>
            </>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>Transaction詳細を取得できませんでした。</p>
          )}
        </>
      )}

      {result?.kind === 'account' && (
        <>
          <div className="section-title">{ACCOUNT_TYPE_LABEL[result.accountType]}</div>
          <div className="account-card">
            <div className="name">Address</div>
            <div className="address">{result.address}</div>
          </div>
          <div className="account-card">
            <div className="name">Owner Program</div>
            <div className="address">{programLabel(result.owner)}</div>
          </div>
          <div className="account-card">
            <div className="name">Balance</div>
            <div className="address">{(result.lamports / 1_000_000_000).toLocaleString('ja-JP')} SOL</div>
          </div>
          {result.mintInfo && (
            <>
              <div className="account-card">
                <div className="name">Decimals</div>
                <div className="address">{result.mintInfo.decimals}</div>
              </div>
              <div className="account-card">
                <div className="name">Supply</div>
                <div className="address">{result.mintInfo.supply}</div>
              </div>
              <div className="account-card">
                <div className="name">Token Program</div>
                <div className="address">{result.mintInfo.tokenProgram === 'token-2022' ? 'Token-2022' : 'SPL Token'}</div>
              </div>
            </>
          )}
          <a
            className="btn btn-secondary"
            style={{ display: 'block', textAlign: 'center', textDecoration: 'none', marginTop: 16 }}
            href={`${explorerBase}/address/${result.address}${clusterParam}`}
            target="_blank"
            rel="noreferrer"
          >
            Solana Explorerで開く
          </a>
        </>
      )}
    </div>
  );
}
