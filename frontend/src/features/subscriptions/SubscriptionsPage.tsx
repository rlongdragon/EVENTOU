import { TodoPlaceholder } from '../../shared/TodoPlaceholder';

export function SubscriptionsPage() {
  return (
    <>
      <h1>訂閱</h1>
      {/* TODO(#9): US-07 訂閱活動類別（需登入，#20；呼叫 /api/subscriptions） */}
      {/* TODO(#10): US-08 Email 通知設定 */}
      <TodoPlaceholder
        title="訂閱與通知"
        issues={[
          { number: 9, label: 'US-07 訂閱感興趣的活動類別' },
          { number: 10, label: 'US-08 新活動 Email 通知' },
        ]}
      />
    </>
  );
}
