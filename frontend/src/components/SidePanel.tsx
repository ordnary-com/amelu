import type { ReactNode } from "react";

export function SidePanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="side-panel">
      <h3>{title}</h3>
      {children}
    </div>
  );
}
