import { TodoPlaceholder } from '../../shared/TodoPlaceholder';

export function AdminSourcesPage() {
  return (
    <>
      <h1>來源管理</h1>
      {/* TODO(#22): US-14 審核來源 */}
      {/* TODO(#23): US-15 來源可信度／風險提示 */}
      {/* TODO(#24): US-16 啟用／停用來源 */}
      <TodoPlaceholder
        title="來源管理"
        issues={[
          { number: 22, label: 'US-14 審核來源' },
          { number: 23, label: 'US-15 來源可信度／風險提示' },
          { number: 24, label: 'US-16 啟用／停用來源' },
        ]}
      />
    </>
  );
}
