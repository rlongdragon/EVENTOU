import { useState, type FormEvent } from 'react';
import { ApiError } from './api';
import { AdminBadge } from './AdminBadge';
import { useAuth } from './AuthContext';

const fieldStyle = { display: 'flex', flexDirection: 'column', gap: '0.25rem' } as const;
const errorStyle = { color: '#cf222e', margin: 0 } as const;
const successStyle = { color: '#1a7f37', margin: 0 } as const;

/** #90 會員資料：顯示名稱（留言等公開位置使用）與新活動通知信箱 */
export function AccountPage() {
  const { user, updateProfile } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  if (!user) return null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    setSaved(false);
    setFieldErrors({});
    setSubmitting(true);
    try {
      await updateProfile({
        displayName: String(form.get('displayName') ?? ''),
        email: String(form.get('email') ?? ''),
      });
      setSaved(true);
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

  return (
    <section style={{ maxWidth: 420 }}>
      <h1>帳號</h1>
      {user.studentId && <p>學號 {user.studentId}</p>}
      <p>身分 {user.role === 'admin' ? <AdminBadge /> : '一般使用者'}</p>
      <form
        onSubmit={handleSubmit}
        onChange={() => setSaved(false)}
        style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
      >
        <label style={fieldStyle}>
          顯示名稱
          <input
            name="displayName"
            defaultValue={user.displayName}
            autoComplete="nickname"
            maxLength={50}
            required
          />
          {fieldErrors.displayName && <p style={errorStyle}>{fieldErrors.displayName}</p>}
          {user.role !== 'admin' && (
            <small>顯示在留言等公開位置；不可包含「管理員」「官方」「admin」等保留字。</small>
          )}
        </label>
        <label style={fieldStyle}>
          通知信箱
          <input
            name="email"
            type="email"
            defaultValue={user.email ?? ''}
            autoComplete="email"
            maxLength={254}
          />
          {fieldErrors.email && <p style={errorStyle}>{fieldErrors.email}</p>}
        </label>
        {error && (
          <p role="alert" style={errorStyle}>
            {error}
          </p>
        )}
        {saved && (
          <p role="status" style={successStyle}>
            已儲存
          </p>
        )}
        <button type="submit" disabled={submitting}>
          {submitting ? '儲存中…' : '儲存'}
        </button>
      </form>
    </section>
  );
}
