import { useEffect, useState } from 'react';
import { useNetworkStore } from '../../../core/stores/networkStore';
import { useWalletStore } from '../../../core/stores/walletStore';
import { getAllAssets } from '../../../adapters/solana/asset';
import { getTransactionHistory } from '../../../adapters/solana/tx/history';
import type { Asset } from '../../../core/types/asset';
import type { WalletTransaction } from '../../../core/types/transaction';

interface Props {
  onSend: () => void;
  onBatchSend: () => void;
  onOpenMetadata: (asset: Asset) => void;
  onOpenMultisig: () => void;
  onOpenExplorer: () => void;
}

export default function Dashboard({ onSend, onBatchSend, onOpenMetadata, onOpenMultisig, onOpenExplorer }: Props) {
  const network = useNetworkStore((s) => s.network);
  const account = useWalletStore((s) => s.account);
  const clear = useWalletStore((s) => s.clear);

  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);

  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getAllAssets(account.address, network)
      .then((result) => {
        if (!cancelled) setAssets(result);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '資産の取得に失敗しました');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [account, network]);

  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    setTxLoading(true);
    setTxError(null);
    getTransactionHistory(account.address, network)
      .then((result) => {
        if (!cancelled) setTransactions(result);
      })
      .catch((e) => {
        if (!cancelled) setTxError(e instanceof Error ? e.message : '取引履歴の取得に失敗しました');
      })
      .finally(() => {
        if (!cancelled) setTxLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [account, network]);

  if (!account) return null;

  const native = assets.find((a) => a.type === 'native');
  const fungibles = assets.filter((a) => a.type === 'fungible');
  const nfts = assets.filter((a) => a.type === 'nft');

  return (
    <div>
      <div className="account-card">
        <div className="name">{account.name}</div>
        <div className="address">{account.address}</div>
      </div>

      <div className="balance-hero">
        {loading && !native ? (
          <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>読み込み中…</span>
        ) : (
          <>
            <span className="amount">{native ? formatBalance(native.balance) : '—'}</span>
            <span className="symbol">SOL</span>
          </>
        )}
      </div>

      {error && <div className="error-banner">{error}</div>}

      <button className="btn btn-primary" style={{ marginBottom: 10 }} onClick={onSend}>
        Send
      </button>
      <button className="btn btn-secondary" style={{ marginBottom: 10 }} onClick={onBatchSend}>
        Batch Send
      </button>
      <button className="btn btn-secondary" style={{ marginBottom: 10 }} onClick={onOpenMultisig}>
        Multisig
      </button>
      <button className="btn btn-secondary" style={{ marginBottom: 24 }} onClick={onOpenExplorer}>
        Explorer
      </button>

      {fungibles.length > 0 && (
        <>
          <div className="section-title">Fungible Tokens</div>
          {fungibles.map((asset) => (
            <div
              className="asset-row"
              key={asset.id}
              onClick={() => onOpenMetadata(asset)}
              style={{ cursor: 'pointer' }}
            >
              <div>
                <div className="asset-name">{asset.name}</div>
                <div className="asset-type">
                  {asset.tokenProgram === 'token-2022' ? 'Token-2022' : 'Fungible Token'}
                </div>
              </div>
              <div className="asset-balance">
                {formatBalance(asset.balance)} {asset.symbol}
              </div>
            </div>
          ))}
        </>
      )}

      {nfts.length > 0 && (
        <>
          <div className="section-title">NFT</div>
          {nfts.map((asset) => (
            <div
              className="asset-row"
              key={asset.id}
              onClick={() => onOpenMetadata(asset)}
              style={{ cursor: 'pointer' }}
            >
              <div>
                <div className="asset-name">{asset.name}</div>
                <div className="asset-type">NFT{asset.tokenProgram === 'token-2022' ? ' · Token-2022' : ''}</div>
              </div>
              <div className="asset-balance">1</div>
            </div>
          ))}
        </>
      )}

      <div className="section-title">Transactions</div>
      {txError && <div className="error-banner">{txError}</div>}
      {txLoading && transactions.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>読み込み中…</p>
      )}
      {!txLoading && transactions.length === 0 && !txError && (
        <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>取引履歴がありません。</p>
      )}
      {groupByDay(transactions).map((group) => (
        <div key={group.label} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', margin: '12px 0 4px' }}>
            {group.label}
          </div>
          {group.items.map((tx) => (
            <div className="asset-row" key={tx.id}>
              <div>
                <div className="asset-name">{categoryLabel(tx.category)}</div>
                <div className="asset-type">
                  {tx.status === 'failed' ? '失敗' : tx.id.slice(0, 8) + '…'}
                </div>
              </div>
              <div
                className="asset-balance"
                style={{
                  color: tx.displayAmount?.startsWith('-') ? 'var(--danger)' : 'var(--text)',
                }}
              >
                {tx.displayAmount
                  ? `${tx.displayAmount} ${tx.displaySymbol ?? ''}`.trim()
                  : '—'}
              </div>
            </div>
          ))}
        </div>
      ))}

      {!loading && fungibles.length === 0 && nfts.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 20 }}>
          SOL以外の資産は見つかりませんでした。
        </p>
      )}

      <button className="btn btn-secondary" style={{ marginTop: 32 }} onClick={clear}>
        切断してWallet選択に戻る
      </button>
    </div>
  );
}

function formatBalance(raw: string): string {
  const n = Number(raw);
  if (Number.isNaN(n)) return raw;
  return n.toLocaleString('ja-JP', { maximumFractionDigits: 4 });
}

function groupByDay(transactions: WalletTransaction[]): { label: string; items: WalletTransaction[] }[] {
  const groups = new Map<string, WalletTransaction[]>();
  const now = new Date();
  const todayKey = now.toDateString();

  for (const tx of transactions) {
    const date = tx.blockTime ? new Date(tx.blockTime * 1000) : null;
    const key = date ? date.toDateString() : 'unknown';
    const label = !date
      ? '日時不明'
      : key === todayKey
        ? 'Today'
        : date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
    const list = groups.get(label) ?? [];
    list.push(tx);
    groups.set(label, list);
  }

  return [...groups.entries()].map(([label, items]) => ({ label, items }));
}

function categoryLabel(category: WalletTransaction['category']): string {
  switch (category) {
    case 'send':
      return 'Send';
    case 'receive':
      return 'Receive';
    case 'token_transfer':
      return 'Token Transfer';
    case 'nft_transfer':
      return 'NFT Transfer';
    case 'swap':
      return 'Swap';
    case 'stake':
      return 'Stake';
    case 'program_interaction':
      return 'Program Interaction';
    case 'memo':
      return 'Memo';
    default:
      return 'Unknown';
  }
}
