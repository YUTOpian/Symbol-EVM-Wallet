import { useState } from 'react';
import { useNetworkStore } from '../../../core/stores/networkStore';
import { useWalletStore } from '../../../core/stores/walletStore';
import {
  getMultisigInfo,
  listPendingProposals,
  approveProposal,
  type MultisigInfo,
  type PendingProposal,
} from '../../../adapters/solana/multisig/squadsAdapter';

interface Props {
  onBack: () => void;
}

export default function Multisig({ onBack }: Props) {
  const network = useNetworkStore((s) => s.network);
  const account = useWalletStore((s) => s.account);
  const provider = useWalletStore((s) => s.provider);

  const [input, setInput] = useState('');
  const [info, setInfo] = useState<MultisigInfo | null>(null);
  const [proposals, setProposals] = useState<PendingProposal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approvingIndex, setApprovingIndex] = useState<number | null>(null);

  if (!account || !provider) return null;
  const walletProvider = provider;
  const acc = account;

  async function load() {
    setError(null);
    setLoading(true);
    setInfo(null);
    setProposals([]);
    try {
      const multisigInfo = await getMultisigInfo(input.trim(), network);
      setInfo(multisigInfo);
      const pending = await listPendingProposals(multisigInfo, network, acc.address);
      setProposals(pending);
    } catch (e) {
      setError(
        e instanceof Error
          ? `${e.message}(Squads Multisigアカウントとして解決できませんでした)`
          : 'Multisig情報の取得に失敗しました',
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(transactionIndex: number) {
    if (!info) return;
    setApprovingIndex(transactionIndex);
    setError(null);
    try {
      await approveProposal(info.address, transactionIndex, acc.address, network, walletProvider);
      const pending = await listPendingProposals(info, network, acc.address);
      setProposals(pending);
    } catch (e) {
      setError(e instanceof Error ? e.message : '承認に失敗しました');
    } finally {
      setApprovingIndex(null);
    }
  }

  const isMember = !!info?.members.some((m) => m.key === acc.address);

  return (
    <div>
      <button className="back-link" onClick={onBack}>
        ← 戻る
      </button>
      <h1 className="page-title">Multisig</h1>
      <p className="page-sub">
        Squads Protocolを利用したMultisig Accountを閲覧します。AddressはVault/MultisigのPDAアドレスを入力してください。
      </p>

      <div className="field">
        <label>Multisig Address</label>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Address" />
      </div>
      <button className="btn btn-primary" style={{ marginBottom: 20 }} disabled={loading} onClick={load}>
        {loading ? '読み込み中…' : '読み込む'}
      </button>

      {error && <div className="error-banner">{error}</div>}

      {info && (
        <>
          <div className="account-card">
            <div className="name">Members</div>
            {info.members.map((m) => (
              <div key={m.key} className="address" style={{ marginTop: 4 }}>
                {m.key}
                {m.key === acc.address ? '(あなた)' : ''}
              </div>
            ))}
          </div>
          <div className="account-card">
            <div className="name">Threshold</div>
            <div className="address">
              {info.threshold} / {info.members.length}
            </div>
          </div>

          {!isMember && (
            <div className="warning-banner">
              接続中のAccountはこのMultisigのMemberではないため、承認はできません(閲覧のみ)。
            </div>
          )}

          <div className="section-title">Pending Transactions</div>
          {proposals.length === 0 && (
            <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>承認待ちのTransactionはありません。</p>
          )}
          {proposals.map((p) => (
            <div key={p.transactionIndex} className="account-card">
              <div className="name">Transaction #{p.transactionIndex}</div>
              <div className="address" style={{ marginBottom: 10 }}>
                Signatures {p.approvedCount} / {p.threshold}
                {p.alreadyApprovedByMe ? '(あなたは承認済み)' : ''}
              </div>
              {isMember && !p.alreadyApprovedByMe && (
                <button
                  className="btn btn-primary"
                  disabled={approvingIndex === p.transactionIndex}
                  onClick={() => handleApprove(p.transactionIndex)}
                >
                  {approvingIndex === p.transactionIndex ? '承認中…' : 'Approve'}
                </button>
              )}
            </div>
          ))}
          <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 12 }}>
            送金内容(宛先・金額)の詳細表示は未対応です。実行内容はExplorerで確認してください。
          </p>
        </>
      )}
    </div>
  );
}
