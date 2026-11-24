import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ApiError, verifyEmail } from './api';
import { useAuth } from './AuthContext';

type VerifyState = 'verifying' | 'verified' | 'failed';

/**
 * #99 驗證信中的連結開啟這一頁，由頁面以 POST 送出 token。
 * 不在 GET 時直接驗證，避免信箱的連結掃描程式開啟網址就完成驗證。不需登入。
 */
export function VerifyEmailPage() {
  const { user, refreshUser } = useAuth();
  const [state, setState] = useState<VerifyState>('verifying');
  const [message, setMessage] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    // 開發模式的 StrictMode 會執行兩次 effect；token 只能用一次，所以只送一次
    if (started.current) return;
    started.current = true;
    const token = new URLSearchParams(window.location.search).get('token') ?? '';
    // 把 token 從網址列與瀏覽紀錄移除
    window.history.replaceState(null, '', window.location.pathname);
    verifyEmail(token)
      .then(async () => {
        setState('verified');
        await refreshUser().catch(() => undefined);
      })
      .catch((caught: unknown) => {
        setState('failed');
        setMessage(caught instanceof ApiError ? caught.message : '無法連線到伺服器，請稍後再試');
      });
  }, [refreshUser]);

  return (
    <section style={{ maxWidth: 420 }}>
      <h1>驗證通知信箱</h1>
      {state === 'verifying' && <p role="status">驗證中…</p>}
      {state === 'verified' && <p role="status">信箱驗證完成，之後的新活動通知會寄到這個信箱。</p>}
      {state === 'failed' && <p role="alert">{message}</p>}
      {state !== 'verifying' && (
        <Link to={user ? '/account' : '/'}>{user ? '回到帳號頁' : '回到首頁'}</Link>
      )}
    </section>
  );
}
