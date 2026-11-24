import { useState, type FormEvent } from 'react';
import { ApiError } from './api';
import { AdminBadge } from './AdminBadge';
import { useAuth } from './AuthContext';

const fieldStyle = { display: 'flex', flexDirection: 'column', gap: '0.25rem' } as const;
const errorStyle = { color: '#cf222e', margin: 0 } as const;
const successStyle = { color: '#1a7f37', margin: 0 } as const;
const noticeStyle = {
  border: '1px solid #d4a72c',
  background: '#fff8c5',
  color: '#3b2300',
  borderRadius: 6,
  padding: '0.75rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
} as const;

/** #90 會員資料：顯示名稱（留言等公開位置使用）與新活動通知信箱 */
export function AccountPage() {
  const { user, updateProfile, resendEmailVerification, cancelEmailVerification } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  if (!user) return null;
  const pendingEmail = user.pendingEmail ?? null;

  function showError(caught: unknown) {
    if (caught instanceof ApiError) {
      setError(caught.message);
      setFieldErrors(caught.fields);
    } else {
      setError('無法連線到伺服器，請稍後再試');
    }
  }

  async function runPendingAction(action: () => Promise<void>, done: string) {
    setError(null);
    setSaved(null);
    setSubmitting(true);
    try {
      await action();
      setSaved(done);
    } catch (caught) {
      showError(caught);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '')
      .trim()
      .toLowerCase();
    setError(null);
    setSaved(null);
    setFieldErrors({});
    setSubmitting(true);
    try {
      const updated = await updateProfile({
        displayName: String(form.get('displayName') ?? ''),
        // 信箱沒改就不送，避免只改名稱時取消了等待驗證的新信箱
        email: email === (user?.email ?? '') ? undefined : email,
      });
      setSaved(
        updated.pendingEmail && updated.pendingEmail === email
          ? `已儲存，驗證信已寄到 ${email}`
          : '已儲存',
      );
    } catch (caught) {
      showError(caught);
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
        // 儲存後依最新的會員資料重設表單，信箱欄位顯示目前已驗證的信箱
        key={`${user.email ?? ''}|${pendingEmail ?? ''}`}
        onSubmit={handleSubmit}
        onChange={() => setSaved(null)}
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
          <small>改成學校信箱以外的地址時，需要點驗證信中的連結才會生效。</small>
        </label>
        {pendingEmail && (
          <div role="status" style={noticeStyle}>
            <p style={{ margin: 0 }}>
              新信箱 <strong>{pendingEmail}</strong> 等待驗證，請到該信箱點驗證連結（24
              小時內有效）。
              {user.email ? `驗證前，通知仍寄到 ${user.email}。` : '驗證前不會寄送通知。'}
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                disabled={submitting}
                onClick={() => runPendingAction(resendEmailVerification, '已重寄驗證信')}
              >
                重寄驗證信
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => runPendingAction(cancelEmailVerification, '已取消修改信箱')}
              >
                取消修改
              </button>
            </div>
          </div>
        )}
        {error && (
          <p role="alert" style={errorStyle}>
            {error}
          </p>
        )}
        {saved && (
          <p role="status" style={successStyle}>
            {saved}
          </p>
        )}
        <button type="submit" disabled={submitting}>
          {submitting ? '儲存中…' : '儲存'}
        </button>
      </form>
    </section>
  );
}
