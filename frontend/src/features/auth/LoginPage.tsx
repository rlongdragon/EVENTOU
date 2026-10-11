import { useState, type FormEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { ApiError } from './api';
import { useAuth } from './AuthContext';

type Mode = 'login' | 'register';

const PASSWORD_MIN_LENGTH = 8;

/** 只接受站內路徑，避免 ?redirect= 被拿來導向外部網站 */
function safeRedirect(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/';
}

const fieldStyle = { display: 'flex', flexDirection: 'column', gap: '0.25rem' } as const;
const errorStyle = { color: '#cf222e', margin: 0 } as const;

export function LoginPage() {
  const { user, login, register } = useAuth();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<Mode>('login');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  if (user) return <Navigate to={safeRedirect(searchParams.get('redirect'))} replace />;

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setFieldErrors({});
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '');
    const password = String(form.get('password') ?? '');

    setError(null);
    setFieldErrors({});

    if (mode === 'register' && password !== form.get('confirmPassword')) {
      setFieldErrors({ confirmPassword: '兩次輸入的密碼不一致' });
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login({ email, password });
      } else {
        await register({ email, password, displayName: String(form.get('displayName') ?? '') });
      }
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        setFieldErrors(caught.fields);
      } else {
        setError('無法連線到伺服器，請稍後再試');
      }
    } finally {
      setSubmitting(false);
    }
  }

  const isRegister = mode === 'register';

  return (
    <section style={{ maxWidth: 360 }}>
      <h1>{isRegister ? '註冊' : '登入'}</h1>

      <form
        key={mode}
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
      >
        {isRegister && (
          <label style={fieldStyle}>
            顯示名稱
            <input name="displayName" autoComplete="nickname" maxLength={50} required />
            {fieldErrors.displayName && <p style={errorStyle}>{fieldErrors.displayName}</p>}
          </label>
        )}

        <label style={fieldStyle}>
          Email
          <input name="email" type="email" autoComplete="email" required />
          {fieldErrors.email && <p style={errorStyle}>{fieldErrors.email}</p>}
        </label>

        <label style={fieldStyle}>
          密碼
          <input
            name="password"
            type="password"
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            minLength={isRegister ? PASSWORD_MIN_LENGTH : undefined}
            required
          />
          {fieldErrors.password && <p style={errorStyle}>{fieldErrors.password}</p>}
        </label>

        {isRegister && (
          <label style={fieldStyle}>
            確認密碼
            <input name="confirmPassword" type="password" autoComplete="new-password" required />
            {fieldErrors.confirmPassword && <p style={errorStyle}>{fieldErrors.confirmPassword}</p>}
          </label>
        )}

        {error && (
          <p role="alert" style={errorStyle}>
            {error}
          </p>
        )}

        <button type="submit" disabled={submitting}>
          {submitting ? '處理中…' : isRegister ? '註冊' : '登入'}
        </button>
      </form>

      <p>
        {isRegister ? '已經有帳號？' : '還沒有帳號？'}
        <button
          type="button"
          onClick={() => switchMode(isRegister ? 'login' : 'register')}
          style={{
            background: 'none',
            border: 'none',
            color: '#0969da',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          {isRegister ? '登入' : '註冊新帳號'}
        </button>
      </p>
    </section>
  );
}
