import { useState } from 'react';
import { useNetworkStore } from '../../../core/stores/networkStore';
import { useWalletStore } from '../../../core/stores/walletStore';
import {
  createNewWallet,
  deriveWalletFromMnemonic,
  persistWallet,
} from '../../../adapters/solana/wallet/localWallet';
import { LocalWalletProvider } from '../../../adapters/solana/wallet/localWallet';
import {
  listAvailableWallets,
  WalletStandardProvider,
} from '../../../adapters/solana/wallet/walletStandard';
import type { Account } from '../../../core/types/account';

type Screen = 'menu' | 'create-reveal' | 'create-password' | 'restore' | 'connect-list';

export default function Onboarding() {
  const network = useNetworkStore((s) => s.network);
  const setConnected = useWalletStore((s) => s.setConnected);

  const [screen, setScreen] = useState<Screen>('menu');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // create flow state
  const [pendingMnemonic, setPendingMnemonic] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');

  // restore flow state
  const [restoreMnemonic, setRestoreMnemonic] = useState('');
  const [restorePassword, setRestorePassword] = useState('');

  function resetAndGoTo(next: Screen) {
    setError(null);
    setScreen(next);
  }

  function startCreate() {
    const { mnemonic } = createNewWallet();
    setPendingMnemonic(mnemonic);
    resetAndGoTo('create-reveal');
  }

  async function finishCreate() {
    if (!pendingMnemonic) return;
    if (password.length < 8) {
      setError('パスワードは8文字以上にしてください');
      return;
    }
    if (password !== passwordConfirm) {
      setError('パスワードが一致しません');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await persistWallet(pendingMnemonic, password);
      const provider = new LocalWalletProvider();
      await provider.unlock(password);
      const address = await provider.connect();
      const account: Account = {
        id: `${network}:${address}`,
        name: 'My Wallet',
        address,
        publicKey: address,
        network,
        source: 'local',
      };
      setConnected(account, provider);
    } catch (e) {
      setError(e instanceof Error ? e.message : '作成に失敗しました');
    } finally {
      setBusy(false);
    }
  }

  async function doRestore() {
    setBusy(true);
    setError(null);
    try {
      // 復元できることを先に検証してから保存する
      await deriveWalletFromMnemonic(restoreMnemonic);
      if (restorePassword.length < 8) {
        throw new Error('パスワードは8文字以上にしてください');
      }
      await persistWallet(restoreMnemonic, restorePassword);
      const provider = new LocalWalletProvider();
      await provider.unlock(restorePassword);
      const address = await provider.connect();
      const account: Account = {
        id: `${network}:${address}`,
        name: 'My Wallet',
        address,
        publicKey: address,
        network,
        source: 'local',
      };
      setConnected(account, provider);
    } catch (e) {
      setError(e instanceof Error ? e.message : '復元に失敗しました');
    } finally {
      setBusy(false);
    }
  }

  async function connectExternal(walletName: string) {
    setBusy(true);
    setError(null);
    try {
      const wallets = listAvailableWallets();
      const wallet = wallets.find((w) => w.name === walletName);
      if (!wallet) throw new Error(`${walletName} が見つかりません`);
      const provider = new WalletStandardProvider(wallet);
      const address = await provider.connect();
      const account: Account = {
        id: `${network}:${address}`,
        name: walletName,
        address,
        publicKey: address,
        network,
        source: 'wallet-standard',
        providerName: walletName,
      };
      setConnected(account, provider);
    } catch (e) {
      setError(e instanceof Error ? e.message : '接続に失敗しました');
    } finally {
      setBusy(false);
    }
  }

  if (screen === 'menu') {
    const externalWallets = listAvailableWallets();
    return (
      <div>
        <h1 className="page-title">Wallet を準備する</h1>
        <p className="page-sub">新規作成、既存Seed Phraseからの復元、または外部Walletへの接続を選んでください。</p>

        <div className="option-list">
          <button className="option-button" onClick={startCreate}>
            <span className="label">新規 Wallet を作成</span>
            <span className="desc">Seed Phraseを新しく生成します</span>
          </button>
          <button className="option-button" onClick={() => resetAndGoTo('restore')}>
            <span className="label">Seed Phraseから復元</span>
            <span className="desc">既存のニーモニックでWalletを復元します</span>
          </button>

          {externalWallets.length > 0 ? (
            externalWallets.map((w) => (
              <button
                key={w.name}
                className="option-button"
                disabled={busy}
                onClick={() => connectExternal(w.name)}
              >
                <span className="label">{w.name} に接続</span>
                <span className="desc">Wallet Standard経由で接続します</span>
              </button>
            ))
          ) : (
            <button className="option-button" disabled>
              <span className="label">Phantom / Solflare が見つかりません</span>
              <span className="desc">ブラウザ拡張機能をインストールすると表示されます</span>
            </button>
          )}
        </div>

        {error && <div className="error-banner">{error}</div>}
      </div>
    );
  }

  if (screen === 'create-reveal' && pendingMnemonic) {
    const words = pendingMnemonic.split(' ');
    return (
      <div>
        <button className="back-link" onClick={() => resetAndGoTo('menu')}>
          ← 戻る
        </button>
        <h1 className="page-title">Seed Phraseを保管してください</h1>
        <p className="page-sub">
          この12語はWalletの復元に必要です。誰にも見せず、オフラインで安全な場所に保管してください。
        </p>
        <div className="mnemonic-box">
          {words.map((w, i) => (
            <div key={i}>
              <span>{i + 1}. </span>
              {w}
            </div>
          ))}
        </div>
        <div className="warning-banner">
          このSeed Phraseはこの端末のブラウザ内でのみ生成されました。外部サーバーへは一切送信されません。紛失すると復元できません。
        </div>
        <button className="btn btn-primary" onClick={() => resetAndGoTo('create-password')}>
          保管しました。次へ
        </button>
      </div>
    );
  }

  if (screen === 'create-password') {
    return (
      <div>
        <button className="back-link" onClick={() => resetAndGoTo('create-reveal')}>
          ← 戻る
        </button>
        <h1 className="page-title">Unlock用パスワードを設定</h1>
        <p className="page-sub">
          Seed Phraseはこのパスワードで暗号化してブラウザ内に保存します(8文字以上)。
        </p>
        <div className="field">
          <label>パスワード</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="field">
          <label>パスワード(確認)</label>
          <input
            type="password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
          />
        </div>
        {error && <div className="error-banner">{error}</div>}
        <button className="btn btn-primary" disabled={busy} onClick={finishCreate}>
          {busy ? '作成中…' : 'Walletを作成'}
        </button>
      </div>
    );
  }

  if (screen === 'restore') {
    return (
      <div>
        <button className="back-link" onClick={() => resetAndGoTo('menu')}>
          ← 戻る
        </button>
        <h1 className="page-title">Seed Phraseから復元</h1>
        <p className="page-sub">12語をスペース区切りで入力してください。</p>
        <div className="field">
          <label>Seed Phrase</label>
          <textarea
            value={restoreMnemonic}
            onChange={(e) => setRestoreMnemonic(e.target.value)}
            placeholder="word1 word2 word3 ..."
          />
        </div>
        <div className="field">
          <label>新しいUnlockパスワード</label>
          <input
            type="password"
            value={restorePassword}
            onChange={(e) => setRestorePassword(e.target.value)}
          />
        </div>
        {error && <div className="error-banner">{error}</div>}
        <button className="btn btn-primary" disabled={busy} onClick={doRestore}>
          {busy ? '復元中…' : '復元する'}
        </button>
      </div>
    );
  }

  return null;
}
