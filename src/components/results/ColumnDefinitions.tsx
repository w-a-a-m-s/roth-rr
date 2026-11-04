/** A short list under a results table saying what each column means. */
export function ColumnDefinitions({ items }: { items: [string, string][] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <h4 className="m-0 text-[12.5px] font-bold text-foreground">What each column means</h4>
      <dl className="m-0 flex flex-col gap-1.5 text-[12px] text-muted">
        {items.map(([term, meaning]) => (
          <div key={term}>
            <dt className="inline font-semibold text-foreground">{term}: </dt>
            <dd className="inline">{meaning}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
