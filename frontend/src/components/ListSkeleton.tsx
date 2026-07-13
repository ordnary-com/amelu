export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <md-list>
      {Array.from({ length: rows }, (_, i) => (
        <md-list-item key={i} type="text">
          <div slot="headline">
            <span className="skeleton-line" style={{ width: `${10 + ((i * 7) % 10)}rem` }} />
          </div>
          <div slot="supporting-text">
            <span className="skeleton-line" style={{ width: `${6 + ((i * 5) % 8)}rem` }} />
          </div>
        </md-list-item>
      ))}
    </md-list>
  );
}
