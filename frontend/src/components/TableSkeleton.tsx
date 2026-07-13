export function TableSkeleton({ columns, rows = 3 }: { columns: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <tr key={i}>
          {Array.from({ length: columns }, (_, j) => (
            <td key={j}>
              <span className="skeleton-line" style={{ width: `${5 + ((i + j) * 3) % 6}rem` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
