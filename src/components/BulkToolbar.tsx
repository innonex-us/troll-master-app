import type { ReactNode } from "react";

export function BulkToolbar({ count, children }: { count: number; children: ReactNode }) {
  return (
    <div className="bulk-toolbar">
      <span className="count">{count} selected</span>
      {children}
    </div>
  );
}
