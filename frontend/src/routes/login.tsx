import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ShieldCheck, Eye, EyeOff, Lock, User } from "lucide-react";
import { login } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Slight delay for UX feel
    await new Promise((r) => setTimeout(r, 600));

    const user = login(username.trim(), password);
    setLoading(false);

    if (!user) {
      setError("Invalid username or password. Please try again.");
      return;
    }

    toast.success(`Welcome back, ${user.displayName}!`);

    if (user.role === "admin") {
      navigate({ to: "/" });
    } else {
      navigate({ to: "/portal" });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden text-foreground">
      {/* Ambient background orbs */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 20% 30%, hsla(212,90%,55%,0.12) 0%, transparent 60%), radial-gradient(ellipse 60% 50% at 80% 70%, hsla(260,80%,60%,0.10) 0%, transparent 55%)",
        }}
      />

      {/* Card */}
      <div className="relative z-10 w-full max-w-[420px] px-4">
        <div className="glass rounded-[32px] p-8 flex flex-col gap-6">
          {/* Logo */}
          <div className="flex flex-col items-center gap-3 pb-2">
            <div
              className="size-14 rounded-2xl flex items-center justify-center"
              style={{
                background:
                  "linear-gradient(135deg, hsl(212 90% 55%), hsl(260 80% 60%))",
                boxShadow: "0 8px 24px rgba(0, 111, 207, 0.35)",
              }}
            >
              <ShieldCheck className="size-7 text-white" strokeWidth={1.8} />
            </div>
            <div className="text-center">
              <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
                Sentinel Gateway
              </h1>
              <p className="text-[13px] text-muted-foreground mt-1">
                American Express AI Safety Platform
              </p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Username */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="username"
                className="text-[12px] font-medium text-muted-foreground uppercase tracking-wider"
              >
                Username
              </label>
              <div className="relative">
                <User
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
                  strokeWidth={1.8}
                />
                <input
                  id="username"
                  type="text"
                  autoComplete="username"
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  className="w-full rounded-[12px] pl-10 pr-4 py-3 text-[14px] bg-white/8 border border-white/12 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 transition-all"
                  style={{ background: "rgba(255,255,255,0.06)" }}
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="password"
                className="text-[12px] font-medium text-muted-foreground uppercase tracking-wider"
              >
                Password
              </label>
              <div className="relative">
                <Lock
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
                  strokeWidth={1.8}
                />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full rounded-[12px] pl-10 pr-12 py-3 text-[14px] border border-white/12 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 transition-all"
                  style={{ background: "rgba(255,255,255,0.06)" }}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="size-4" strokeWidth={1.8} />
                  ) : (
                    <Eye className="size-4" strokeWidth={1.8} />
                  )}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-[10px] px-4 py-3 text-[13px] text-red-400 bg-red-500/10 border border-red-500/20">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="mt-1 w-full rounded-[12px] py-3 text-[14px] font-medium text-white transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed relative overflow-hidden"
              style={{
                background:
                  "linear-gradient(135deg, hsl(212 90% 52%), hsl(260 80% 58%))",
                boxShadow: loading
                  ? "none"
                  : "0 4px 20px rgba(0, 111, 207, 0.35)",
              }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="size-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Authenticating…
                </span>
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          {/* Demo hints */}
          <div
            className="rounded-[14px] p-4 flex flex-col gap-2"
            style={{ background: "rgba(255,255,255,0.05)" }}
          >
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
              Demo Credentials
            </p>
            {[
              { label: "Admin", u: "admin", p: "admin" },
              { label: "Customer (Adhi)", u: "adhi03", p: "adhi03" },
              { label: "Customer (Tara)", u: "tara05", p: "tara05" },
            ].map((cred) => (
              <button
                key={cred.u}
                type="button"
                onClick={() => {
                  setUsername(cred.u);
                  setPassword(cred.p);
                  setError("");
                }}
                className="flex items-center justify-between rounded-[10px] px-3 py-2 text-[12px] hover:bg-white/8 transition-colors text-left group"
              >
                <span className="text-muted-foreground group-hover:text-foreground transition-colors">
                  {cred.label}
                </span>
                <span className="mono text-muted-foreground/60 group-hover:text-muted-foreground transition-colors">
                  {cred.u} / {cred.p}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
