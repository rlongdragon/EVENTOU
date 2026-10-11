import { TodoPlaceholder } from '../../shared/TodoPlaceholder';

export function SubmitSourcePage() {
  return (
    <>
      <h1>提交活動資訊來源</h1>
      {/* TODO(#21): US-13 提交來源表單（需登入，#20；呼叫 POST /api/sources） */}
      <TodoPlaceholder
        title="提交來源"
        issues={[{ number: 21, label: 'US-13 提交新的活動資訊來源' }]}
      />
    </>
  );
}
