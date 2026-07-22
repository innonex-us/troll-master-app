import type { ReactNode } from "react";

/** Renders **bold** inline segments as <strong>, everything else as plain text. */
function renderInline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

/**
 * A minimal, dependency-free renderer for the small markdown subset our own
 * GitHub release notes actually use: **bold** emphasis and "- " bullet lists.
 * Not a general markdown parser — just enough to stop raw `**`/`-` characters
 * from showing up literally in the UI.
 */
export function MarkdownLite({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let listItems: string[] = [];

  function flushList() {
    if (listItems.length === 0) return;
    blocks.push(
      <ul key={`list-${blocks.length}`}>
        {listItems.map((item, i) => (
          <li key={i}>{renderInline(item)}</li>
        ))}
      </ul>,
    );
    listItems = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const bulletMatch = line.match(/^[-*]\s+(.*)/);
    if (bulletMatch) {
      listItems.push(bulletMatch[1]);
      continue;
    }
    flushList();
    if (line.length > 0) {
      blocks.push(<p key={blocks.length}>{renderInline(line)}</p>);
    }
  }
  flushList();

  return <div className="markdown-lite">{blocks}</div>;
}
