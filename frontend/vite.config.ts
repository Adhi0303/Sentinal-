// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// NOTE: mcpPlugin() is a Lovable-editor-only integration for live editing in the Lovable cloud IDE.
// It has a Windows path bug (forward vs backslash mismatch in assertContains).
// We intentionally omit it here — the app works fully without it for local development.

export default defineConfig({
  vite: {
    plugins: [],
    server: {
      port: 5173,
      host: "localhost",
      cors: true,
    },
  },
  tanstackStart: {
    server: { entry: "server" },
  },
});
