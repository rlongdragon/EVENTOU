import { useEffect, useState } from 'react';
import { TodoPlaceholder } from '../../shared/TodoPlaceholder';
import { ApiError } from '../auth/api';
import type { CategorySubscription } from './api';
import { fetchSubscriptions, setSubscribed } from './api';

const CONNECTION_ERROR = '無法連線到伺服器，請稍後再試';

function errorMessage(caught: unknown): string {
  return caught instanceof ApiError ? caught.message : CONNECTION_ERROR;
}

// 這個頁面包在 <RequireAuth> 裡，訪客點進來會先被導向登入，登入後回到這裡
export function SubscriptionsPage() {
  const [categories, setCategories] = useState<CategorySubscription[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // 正在送出訂閱／取消訂閱的類別代碼
  const [busyCategory, setBusyCategory] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSubscriptions()
      .then((loaded) => {
        if (!cancelled) setCategories(loaded);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setLoadError(errorMessage(caught));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle(item: CategorySubscription) {
    setActionError(null);
    setBusyCategory(item.category);
    try {
      setCategories(await setSubscribed(item.category, !item.subscribed));
    } catch (caught) {
      setActionError(errorMessage(caught));
    } finally {
      setBusyCategory(null);
    }
  }

  const subscribed = categories?.filter((item) => item.subscribed) ?? [];

  return (
    <>
      <h1>訂閱</h1>
      {loadError && <p role="alert">無法載入訂閱：{loadError}</p>}
      {!categories && !loadError && <p>載入中…</p>}
      {categories && (
        <>
          <section>
            <h2>我的訂閱</h2>
            {subscribed.length === 0 ? (
              <p>你還沒有訂閱任何類別。</p>
            ) : (
              <ul>
                {subscribed.map((item) => (
                  <li key={item.category}>{item.label}</li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h2>活動類別</h2>
            <p>訂閱感興趣的類別，可以同時訂閱多個，也可以隨時取消。</p>
            {actionError && (
              <p role="alert" style={{ color: '#cf222e' }}>
                {actionError}
              </p>
            )}
            <table>
              <thead>
                <tr>
                  <th scope="col">類別</th>
                  <th scope="col">訂閱狀態</th>
                  <th scope="col">操作</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((item) => (
                  <tr key={item.category}>
                    <th scope="row" style={{ textAlign: 'left', paddingRight: '1.5rem' }}>
                      {item.label}
                    </th>
                    <td style={{ paddingRight: '1.5rem' }}>
                      {item.subscribed ? '已訂閱' : '未訂閱'}
                    </td>
                    <td>
                      <button
                        type="button"
                        disabled={busyCategory !== null}
                        aria-label={`${item.subscribed ? '取消訂閱' : '訂閱'}${item.label}`}
                        onClick={() => void toggle(item)}
                      >
                        {item.subscribed ? '取消訂閱' : '訂閱'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
      {/* TODO(#10): US-08 Email 通知設定 */}
      <TodoPlaceholder
        title="Email 通知"
        issues={[{ number: 10, label: 'US-08 新活動 Email 通知' }]}
      />
    </>
  );
}
