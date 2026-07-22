type Tone = "ok" | "warn" | "err" | "info";

const STATUS_TONE: Record<string, Tone> = {
  active: "ok",
  success: "ok",
  new: "info",
  needs_login: "warn",
  paused: "warn",
  skipped: "warn",
  challenged: "warn",
  banned: "err",
  error: "err",
};

export function Badge({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? "info";
  return (
    <span className={`badge ${tone}`}>
      <span className="dot" />
      {status.replace(/_/g, " ")}
    </span>
  );
}
