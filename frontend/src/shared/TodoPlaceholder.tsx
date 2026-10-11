interface TodoPlaceholderProps {
  title: string;
  issues: { number: number; label: string }[];
}

const REPO_ISSUES_URL = 'https://github.com/rlongdragon/EVENTOU/issues';

/** 尚未實作的頁面／區塊佔位，列出負責的 issue。實作時整個換掉。 */
export function TodoPlaceholder({ title, issues }: TodoPlaceholderProps) {
  return (
    <section
      style={{ border: '1px dashed #9e9e9e', borderRadius: 8, padding: '1rem', margin: '1rem 0' }}
    >
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      <p>尚未實作：</p>
      <ul>
        {issues.map((issue) => (
          <li key={issue.number}>
            <a href={`${REPO_ISSUES_URL}/${issue.number}`} target="_blank" rel="noreferrer">
              #{issue.number}
            </a>{' '}
            {issue.label}
          </li>
        ))}
      </ul>
    </section>
  );
}
