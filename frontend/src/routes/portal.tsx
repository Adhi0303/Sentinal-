import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  CreditCard,
  Send,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Activity,
  ShieldCheck,
  LogOut,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getApiBase, getBankingApiBase } from "@/lib/sentinel";
import { getUser, logout } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/portal")({
  component: CustomerPortal,
});

// ── Types ────────────────────────────────────────────────────────────────────
interface AccountData {
  account_id: string;
  name: string;
  type: string;
  status: string;
  balance: number;
  credit_limit: number;
  credit_score: number;
  years_as_customer: number;
  ytd_fees_waived: number;
}

interface Transaction {
  id: string;
  date: string;
  amount: number;
  type: string;
  description: string;
}

interface Msg {
  id: number;
  role: "user" | "ai";
  text: string;
  tone?: "ok" | "blocked";
}

interface LogLine {
  ts: string;
  text: string;
  token?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const txnColor = (amount: number) =>
  amount >= 0 ? "text-green-400" : "text-red-400";

const txnIcon = (amount: number) =>
  amount >= 0 ? (
    <TrendingUp className="size-3.5 text-green-400" />
  ) : (
    <TrendingDown className="size-3.5 text-red-400" />
  );

const statusBadge = (status: string) => {
  const map: Record<string, string> = {
    ACTIVE: "bg-green-500/15 text-green-400 border-green-500/20",
    SUSPENDED: "bg-red-500/15 text-red-400 border-red-500/20",
    PROBATION: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
  };
  return map[status] ?? "bg-white/10 text-white/60 border-white/10";
};

const LOG_COLOR: Record<string, string> = {
  allow: "text-green-400",
  deny: "text-red-400",
  hitl: "text-yellow-400",
  duplicate: "text-blue-400",
  default: "text-white/70",
};

function nowStr() {
  const d = new Date();
  return `${d.toLocaleTimeString("en-GB", { hour12: false })}.${String(d.getMilliseconds()).padStart(3, "0")}`;
}

// ── Component ─────────────────────────────────────────────────────────────────
function CustomerPortal() {
  const navigate = useNavigate();
  const user = getUser();

  // Auth guard — redirect to login if not authenticated or if admin (wrong page)
  useEffect(() => {
    if (!user) {
      navigate({ to: "/login" });
    } else if (user.role === "admin") {
      navigate({ to: "/" });
    }
  }, []);

  const [account, setAccount] = useState<AccountData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingAccount, setLoadingAccount] = useState(true);

  // Chat state
  const [messages, setMessages] = useState<Msg[]>([
    {
      id: 0,
      role: "ai",
      text: `Hello ${user?.displayName?.split(" ")[0] ?? "there"}! 👋 I'm your American Express virtual assistant. How can I help you with your account today?`,
    },
  ]);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const apiBase = getApiBase();

  // Fetch account data
  useEffect(() => {
    if (!user?.accountId) return;
    const fetchData = async () => {
      try {
        const bankBase = getBankingApiBase();
        const [accResp, txResp] = await Promise.all([
          fetch(`${bankBase}/api/v1/accounts/${user.accountId}`),
          fetch(`${bankBase}/api/v1/accounts/${user.accountId}/transactions`),
        ]);
        if (accResp.ok) setAccount(await accResp.json());
        if (txResp.ok) {
          const data = await txResp.json();
          setTransactions(data.transactions ?? []);
        }
      } catch {
        // Banking API might not be up — fail gracefully
      } finally {
        setLoadingAccount(false);
      }
    };
    fetchData();
  }, [user?.accountId]);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [logs]);

  const handleLogout = () => {
    logout();
    toast.success("You've been signed out.");
    navigate({ to: "/login" });
  };

  const sendMessage = async (text: string) => {
    if (busy || !text.trim()) return;
    setBusy(true);
    setLogs([]);

    setMessages((m) => [...m, { id: Date.now(), role: "user", text }]);
    setLogs([{ ts: nowStr(), text: "Connecting to Sentinel AI gateway...", token: "default" }]);

    try {
      const resp = await fetch(`${apiBase}/api/v1/demo/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, use_poisoned_rag: false }),
      });

      if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`);

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalReply = "";
      let blocked = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const chunk of lines) {
          const line = chunk.replace(/^data: /, "").trim();
          if (!line) continue;
          try {
            const event = JSON.parse(line);
            if (event.type === "log") {
              setLogs((l) => [...l, { ts: nowStr(), text: event.text, token: event.token ?? "default" }]);
              if (event.token === "deny") blocked = true;
            } else if (event.type === "reply") {
              finalReply = event.text;
            } else if (event.type === "error") {
              setLogs((l) => [...l, { ts: nowStr(), text: "[ERROR] " + event.text, token: "deny" }]);
              finalReply = "Sorry, I encountered an error. Please try again.";
              blocked = true;
            }
          } catch (_) {}
        }
      }

      if (finalReply) {
        setMessages((m) => [
          ...m,
          { id: Date.now() + 1, role: "ai", text: finalReply, tone: blocked ? "blocked" : "ok" },
        ]);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessages((m) => [
        ...m,
        { id: Date.now() + 1, role: "ai", text: "I'm unable to connect right now. Please ensure the backend service is running.", tone: "blocked" },
      ]);
      setLogs((l) => [...l, { ts: nowStr(), text: `Connection error: ${msg}`, token: "deny" }]);
    } finally {
      setBusy(false);
    }
  };

  const handleSend = () => {
    const text = input.trim();
    setInput("");
    sendMessage(text);
  };

  if (!user) return null;

  return (
    <div className="min-h-screen flex flex-col text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-30 flex h-24 items-center justify-between px-10">
        <div className="flex items-center gap-3">
          <div
            className="size-9 rounded-xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, hsl(212 90% 55%), hsl(260 80% 60%))" }}
          >
            <ShieldCheck className="size-4 text-white" strokeWidth={1.8} />
          </div>
          <div>
            <div className="text-[15px] font-semibold tracking-tight">American Express</div>
            <div className="text-[11px] text-muted-foreground">Customer Portal</div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-[13px] font-medium">{user.displayName}</div>
            <div className="text-[11px] text-muted-foreground">
              {user.accountId?.replace("acc_", "Account #")}
            </div>
          </div>
          <div
            className="size-9 rounded-full flex items-center justify-center text-[12px] font-semibold text-white"
            style={{ background: "linear-gradient(135deg, hsl(212 90% 55%), hsl(260 80% 60%))" }}
          >
            {user.initials}
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 rounded-[10px] px-3 py-2 text-[12px] text-muted-foreground hover:text-foreground hover:bg-white/10 transition-all"
          >
            <LogOut className="size-3.5" strokeWidth={1.8} />
            Sign Out
          </button>
        </div>
      </header>

      <div className="px-10 pb-10 max-w-[1400px] w-full mx-auto grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)] flex-1">
        {/* LEFT: Account Info + Transactions */}
        <div className="flex flex-col gap-6">
          {/* Account Summary Cards */}
          {loadingAccount ? (
            <div className="glass rounded-[20px] p-8 flex items-center justify-center">
              <div className="size-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
            </div>
          ) : account ? (
            <>
              {/* Main account card */}
              <div className="glass rounded-[32px] p-8 relative overflow-hidden flex flex-col justify-between min-h-[220px]">
                <div className="flex items-start justify-between mb-8">
                  <div>
                    <p className="text-[12px] text-muted-foreground uppercase tracking-wider font-medium">Cardholder</p>
                    <h2 className="text-[28px] font-medium text-foreground tracking-tight mt-1">{account.name}</h2>
                  </div>
                  <span
                    className={cn(
                      "px-3 py-1 rounded-full text-[12px] font-medium border",
                      account.status === "ACTIVE" 
                        ? "bg-allow/10 text-allow border-allow/20" 
                        : "bg-deny/10 text-deny border-deny/20",
                    )}
                  >
                    {account.status}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-6">
                  <div>
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Balance</p>
                    <p className="text-[24px] font-semibold text-foreground tracking-tight mt-1">
                      ${account.balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Credit Limit</p>
                    <p className="text-[24px] font-semibold text-foreground tracking-tight mt-1">
                      ${account.credit_limit.toLocaleString("en-US")}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Credit Score</p>
                    <p className="text-[24px] font-semibold text-primary tracking-tight mt-1">{account.credit_score}</p>
                  </div>
                </div>
              </div>

              {/* Stat chips */}
              <div className="grid grid-cols-3 gap-4">
                {[
                  {
                    label: "Years with Amex",
                    value: `${account.years_as_customer} yrs`,
                    icon: <Activity className="size-4" />,
                  },
                  {
                    label: "Available Credit",
                    value: `$${(account.credit_limit - Math.max(account.balance, 0)).toLocaleString()}`,
                    icon: <CreditCard className="size-4" />,
                  },
                  {
                    label: "Fees Waived YTD",
                    value: `$${account.ytd_fees_waived.toFixed(2)}`,
                    icon: <DollarSign className="size-4" />,
                  },
                ].map((s) => (
                  <div key={s.label} className="glass rounded-[24px] p-5">
                    <div className="flex items-center gap-2 text-muted-foreground mb-3">
                      {s.icon}
                      <span className="text-[11px] uppercase tracking-wider font-medium">{s.label}</span>
                    </div>
                    <p className="text-[20px] font-medium text-foreground tracking-tight">{s.value}</p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="glass rounded-[20px] p-8 text-center text-muted-foreground text-[14px]">
              Could not load account data. Make sure the Banking API is running.
            </div>
          )}

          {/* Transaction History */}
          <div className="glass rounded-[32px] p-8 flex-1 flex flex-col min-h-[300px]">
            <h3 className="text-[15px] font-semibold mb-6 flex items-center gap-2">
              <Activity className="size-4 text-primary" strokeWidth={1.8} />
              Recent Transactions
            </h3>
            {transactions.length === 0 ? (
              <div className="text-center text-muted-foreground text-[13px] py-8">
                No transactions found.
              </div>
            ) : (
              <div className="flex flex-col divide-y divide-border/40">
                {[...transactions].reverse().map((txn) => (
                  <div key={txn.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-full glass flex items-center justify-center">
                        {txnIcon(txn.amount)}
                      </div>
                      <div>
                        <p className="text-[13px] font-medium text-foreground">{txn.description}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {txn.date} · {txn.type.replace(/_/g, " ")}
                        </p>
                      </div>
                    </div>
                    <span className={cn("text-[14px] font-semibold mono", txnColor(txn.amount))}>
                      {txn.amount >= 0 ? "+" : ""}
                      {txn.amount.toLocaleString("en-US", { style: "currency", currency: "USD" })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Chat + Telemetry */}
        <div className="flex flex-col gap-4">
          {/* Chat window */}
          <div className="glass rounded-[32px] flex flex-col flex-1 h-[600px] xl:h-auto">
            <div className="px-5 py-4 border-b border-border/40 flex items-center gap-2">
              <User className="size-4 text-primary" strokeWidth={1.8} />
              <span className="text-[13px] font-semibold">Amex Virtual Assistant</span>
              <span className="ml-auto text-[11px] text-green-400 flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-green-400 inline-block animate-pulse" />
                Online
              </span>
            </div>

            {/* Messages */}
            <div ref={chatRef} className="flex-1 overflow-y-auto p-5 flex flex-col gap-3">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-[16px] px-4 py-3 text-[13px] leading-relaxed",
                      m.role === "user"
                        ? "text-white rounded-br-[4px]"
                        : m.tone === "blocked"
                          ? "bg-red-500/10 border border-red-500/20 text-red-300 rounded-bl-[4px]"
                          : "glass text-foreground rounded-bl-[4px]",
                    )}
                    style={
                      m.role === "user"
                        ? { background: "linear-gradient(135deg, hsl(212 90% 52%), hsl(260 80% 58%))" }
                        : {}
                    }
                  >
                    {m.text}
                  </div>
                </div>
              ))}
              {busy && (
                <div className="flex justify-start">
                  <div className="glass rounded-[16px] rounded-bl-[4px] px-4 py-3 flex items-center gap-3 text-[12px] text-muted-foreground max-w-[85%]">
                    <div className="size-3.5 rounded-full border-2 border-primary/30 border-t-primary animate-spin shrink-0" />
                    <span className="truncate">
                      Amex Virtual Assistant is working...
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="p-4 border-t border-border/40">
              <div className="flex items-center gap-2 glass rounded-[14px] px-4 py-2">
                <input
                  type="text"
                  placeholder="Ask about your account, fee waivers…"
                  value={input}
                  disabled={busy}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                  className="flex-1 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
                />
                <button
                  onClick={handleSend}
                  disabled={busy || !input.trim()}
                  className="size-8 rounded-full flex items-center justify-center text-white disabled:opacity-40 transition-all"
                  style={{ background: "linear-gradient(135deg, hsl(212 90% 52%), hsl(260 80% 58%))" }}
                >
                  <Send className="size-3.5" strokeWidth={2} />
                </button>
              </div>
            </div>
          </div>


        </div>
      </div>
    </div>
  );
}
