import { cn } from "@/lib/utils";
import { DECISION_META, type Decision } from "@/lib/sentinel";

export const TOKEN_TEXT: Record<string, string> = {
  allow: "text-allow",
  deny: "text-deny",
  hitl: "text-hitl",
  kill: "text-kill",
  duplicate: "text-duplicate",
  info: "text-info",
};

export const TOKEN_BG: Record<string, string> = {
  allow: "bg-allow",
  deny: "bg-deny",
  hitl: "bg-hitl",
  kill: "bg-kill",
  duplicate: "bg-duplicate",
  info: "bg-info",
};

/** 6px status dot — never a background fill. */
export function Dot({ token = "allow", className }: { token?: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-block size-1.5 shrink-0 rounded-full",
        TOKEN_BG[token] ?? TOKEN_BG.info,
        className,
      )}
    />
  );
}

/** Kept for API compatibility — renders a static dot, no pulse. */
export function PulseDot({ token = "allow" }: { token?: string }) {
  return <Dot token={token} />;
}

/** Muted pill badge: soft tinted background, dot, plain text. */
export function StatusPill({
  token,
  children,
  className,
}: {
  token: string;
  children: React.ReactNode;
  className?: string;
  pulse?: boolean;
}) {
  const color = `var(--${token in TOKEN_BG ? token : "info"})`;
  return (
    <span
      className={cn("pill", className)}
      style={{
        color,
        backgroundColor: `color-mix(in oklab, ${color} 10%, white)`,
        border: `1px solid color-mix(in oklab, ${color} 22%, transparent)`,
      }}
    >
      <span
        className="inline-block size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span>{children}</span>
    </span>
  );
}


export function DecisionBadge({
  decision,
  className,
}: {
  decision: Decision;
  className?: string;
}) {
  const meta = DECISION_META[decision] ?? DECISION_META.ALLOWED;
  return (
    <StatusPill token={meta.token} className={className}>
      {meta.label}
    </StatusPill>
  );
}

export function RiskBar({ score, className }: { score: number | null; className?: string }) {
  const token = score === null ? "info" : score >= 70 ? "deny" : score >= 50 ? "hitl" : "allow";
  const label = score === null ? "N/A" : score >= 70 ? "HIGH" : score >= 50 ? "MEDIUM" : "LOW";
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="mono text-[13px] font-light">{score === null ? "—" : score}</span>
      <span className={cn("text-[11px] tracking-[0.04em]", TOKEN_TEXT[token])}>{label}</span>
    </div>
  );
}

export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`mb-3 flex items-center gap-3 ${className ?? ""}`}>
      <span className="section-label">{children}</span>
      <span className="h-px flex-1 bg-hairline" />
    </div>
  );
}

export function JsonBlock({ value }: { value: unknown }) {
  const text = JSON.stringify(value, null, 2);
  return (
    <pre className="mono overflow-x-auto rounded-[14px] border border-hairline bg-white/50 p-3 text-[11.5px] leading-relaxed">
      {text.split("\n").map((line, i) => {
        const m = line.match(/^(\s*)"([^"]+)":\s?(.*)$/);
        if (!m) return <div key={i}>{line}</div>;
        const [, indent, key, rest] = m;
        return (
          <div key={i}>
            {indent}
            <span className="text-muted-foreground">"{key}"</span>
            <span className="text-muted-foreground">: </span>
            <span className="text-foreground">{rest}</span>
          </div>
        );
      })}
    </pre>
  );
}
