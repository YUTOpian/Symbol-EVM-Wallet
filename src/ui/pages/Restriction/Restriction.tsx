import { useEffect, useState } from 'react';
import { useNetworkStore } from '../../../core/stores/networkStore';
import { useWalletStore } from '../../../core/stores/walletStore';
import {
  getAssetRestrictions,
  freezeTokenAccount,
  thawTokenAccount,
  type RestrictionInfo,
} from '../../../adapters/solana/restriction/tokenRestriction';
import type { Asset } from '../../../core/types/asset';

interface Props {
  asset: Asset;
  onBack: () => void;
}

export default function Restriction({ asset, onBack }: Props) {
  const network = useNetworkStore((s) => s.network);
  const account = useWalletStore((s) => s.account);
  const provider = useWalletStore((s) => s.provider);

  const [info, setInfo] = useState<RestrictionInfo | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [targetOwner, setTargetOwner] = useState('');

  const isToken2022 = asset.tokenProgram === 'token-2022';

  async function load() {
    if (!asset.mint) return;
    setError(null);
    try {
      const result = await getAssetRestrictions(asset.mint, network);
      setInfo(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Restriction情報の取得に失敗しました');
      setInfo(null);
    }
  }

  useEffect(() => {
    if (!isToken2022 || !asset.mint) {
      setInfo(null);
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset.mint, network]);

  if (!account || !provider) return null;
  const walletProvider = provider;

  const isFreezeAuthority = !!info?.freezeAuthority && info.freezeAuthority === account.address;

  async function handleFreeze(action: 'freeze' | 'thaw') {
    if (!asset.mint || !info?.freezeAuthority) return;
    if (!targetOwner.trim()) {
      setError('対象のOwner Addressを入力してください');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const fn = action === 'freeze' ? freezeTokenAccount : thawTokenAccount;
      await fn(asset.mint, targetOwner.trim(), info.freezeAuthority, network, walletProvider);
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作に失敗しました');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button className="back-link" onClick={onBack}>
        ← 戻る
      </button>
      <h1 className="page-title">Asset Restrictions</h1>
      <p className="page-sub">
        {asset.name} ({asset.symbol}) に設定されているToken-2022の制限系Extensionです。
      </p>

      {!isToken2022 && (
        <div className="warning-banner">
          このAssetはToken-2022ではないため、Restriction情報は利用できません(SPL Token旧プログラムは非対応)。
        </div>
      )}

      {isToken2022 && info === undefined && (
        <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>読み込み中…</p>
      )}

      {error && <div className="error-banner">{error}</div>}

      {isToken2022 && info && (
        <>
          <div className="asset-row">
            <div>
              <div className="asset-name">Freeze Authority</div>
              <div className="asset-type">対象Accountを個別に凍結/解除できる権限</div>
            </div>
            <div className="asset-balance">{info.hasFreezeAuthority ? 'あり' : 'なし'}</div>
          </div>
          <div className="asset-row">
            <div>
              <div className="asset-name">Permanent Delegate</div>
              <div className="asset-type">保有者の同意なしに送金できる委任先</div>
            </div>
            <div className="asset-balance">{info.permanentDelegate ? 'あり' : 'なし'}</div>
          </div>
          <div className="asset-row">
            <div>
              <div className="asset-name">Transfer Hook</div>
              <div className="asset-type">送金時に外部プログラムでの検証を強制</div>
            </div>
            <div className="asset-balance">{info.transferHookProgram ? 'あり' : 'なし'}</div>
          </div>
          <div className="asset-row">
            <div>
              <div className="asset-name">Non-Transferable</div>
              <div className="asset-type">譲渡そのものを禁止(Soulbound的性質)</div>
            </div>
            <div className="asset-balance">{info.isNonTransferable ? 'はい' : 'いいえ'}</div>
          </div>
          <div className="asset-row">
            <div>
              <div className="asset-name">Default Account State</div>
              <div className="asset-type">新規Token Accountが凍結状態で作成されるか</div>
            </div>
            <div className="asset-balance">{info.defaultAccountFrozen ? '凍結' : '通常'}</div>
          </div>

          {info.permanentDelegate && (
            <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 12 }}>
              Permanent Delegate: {info.permanentDelegate}
            </p>
          )}
          {info.transferHookProgram && (
            <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>
              Transfer Hook Program: {info.transferHookProgram}
            </p>
          )}

          <p style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 12 }}>
            Permanent Delegate・Transfer Hook・Non-Transferable・Default Account StateはMint作成時にのみ設定可能なため、このアプリからの変更はできません(閲覧のみ)。
          </p>

          {info.hasFreezeAuthority && (
            <>
              <div className="section-title">Freeze / Thaw(対象Accountの凍結・解除)</div>
              {!isFreezeAuthority && (
                <div className="warning-banner">
                  接続中のAccountはこのMintのFreeze Authorityではないため、操作できません(閲覧のみ)。
                </div>
              )}
              <div className="field">
                <label>対象のOwner Address</label>
                <input
                  value={targetOwner}
                  onChange={(e) => setTargetOwner(e.target.value)}
                  placeholder="Address"
                  disabled={!isFreezeAuthority}
                />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  className="btn btn-primary"
                  disabled={!isFreezeAuthority || busy}
                  onClick={() => handleFreeze('freeze')}
                >
                  {busy ? '処理中…' : 'Freeze'}
                </button>
                <button
                  className="btn btn-secondary"
                  disabled={!isFreezeAuthority || busy}
                  onClick={() => handleFreeze('thaw')}
                >
                  {busy ? '処理中…' : 'Thaw'}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
