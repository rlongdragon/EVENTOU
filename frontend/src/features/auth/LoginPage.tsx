import { TodoPlaceholder } from '../../shared/TodoPlaceholder';

export function LoginPage() {
  return (
    <>
      <h1>登入</h1>
      {/* TODO(#20): US-06 註冊／登入表單（呼叫 /api/auth/*），並提供登入狀態給其他頁面使用 */}
      <TodoPlaceholder
        title="註冊／登入"
        issues={[{ number: 20, label: 'US-06 註冊／登入帳號' }]}
      />
    </>
  );
}
