import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { ApiError, casLoginUrl, type Role } from './api';
import { useAuth } from './AuthContext';

/** 只接受站內路徑，避免 ?redirect= 被拿來導向外部網站 */
function safeRedirect(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\')
    ? value
    : '/';
}

const errorStyle = { color: '#cf222e', margin: 0 } as const;
const fieldStyle = { display: 'flex', flexDirection: 'column', gap: '0.25rem' } as const;

// 開發模式（npm run dev）只有模擬登入；正式建置直接轉到海大 CAS，只有登入失敗回來時才停在這頁
export function LoginPage() {
  const { user, loading } = useAuth();
  const [searchParams] = useSearchParams();
  const redirect = safeRedirect(searchParams.get('redirect'));
  const casFailed = searchParams.get('error') === 'cas';
  const goToCas = !import.meta.env.DEV && !casFailed && !loading && !user;

  useEffect(() => {
    if (goToCas) window.location.replace(casLoginUrl(redirect));
  }, [goToCas, redirect]);

  if (user) return <Navigate to={redirect} replace />;
  if (loading || goToCas) return null;

  return (
    <section style={{ maxWidth: 360 }}>
      <h1>{import.meta.env.DEV ? '模擬登入' : '登入'}</h1>
      {import.meta.env.DEV ? (
        <DevLoginForm />
      ) : (
        <>
          <p role="alert" style={errorStyle}>
            海大帳號登入沒有完成，請再試一次
          </p>
          <p>
            <a className="button-primary" href={casLoginUrl(redirect)}>
              重新登入
            </a>
          </p>
        </>
      )}
    </section>
  );
}

function DevLoginForm() {
  const { devLogin } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    setSubmitting(true);
    try {
      await devLogin(String(form.get('studentId') ?? ''), form.get('role') as Role);
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.status === 404
          ? '後端沒有開啟模擬登入，請用 npm run dev 啟動'
          : caught instanceof ApiError
            ? caught.message
            : '無法連線到伺服器',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
    >
      <label style={fieldStyle}>
        學號
        <input name="studentId" defaultValue="00000001" pattern="[A-Za-z0-9]{1,32}" required />
      </label>
      <label style={fieldStyle}>
        角色
        <select name="role" defaultValue="user">
          <option value="user">一般使用者</option>
          <option value="admin">管理員</option>
        </select>
      </label>
      {error && (
        <p role="alert" style={errorStyle}>
          {error}
        </p>
      )}
      <button type="submit" disabled={submitting}>
        {submitting ? '登入中…' : '登入'}
      </button>
    </form>
  );
}
