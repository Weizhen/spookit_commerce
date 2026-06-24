const CLASS: Record<string, string> = {
  PREMIUM: "pill pill-premium",
  STANDARD: "pill pill-standard",
  THROTTLED: "pill pill-throttled",
  REJECTED: "pill pill-rejected",
};

export function DecisionPill({ decision }: { decision: string }) {
  return (
    <span className={CLASS[decision] ?? "pill pill-standard"}>{decision}</span>
  );
}
