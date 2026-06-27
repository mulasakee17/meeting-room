export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="max-w-lg text-center space-y-6">
        <div className="flex items-center justify-center gap-3">
          <span className="text-3xl">🐜</span>
          <h1 className="text-3xl font-bold tracking-tight">SwarmAlpha API</h1>
        </div>
        <p className="text-sm text-zinc-500">
          This is the SwarmAlpha backend API server. The frontend has moved to a
          dedicated TanStack Start application.
        </p>

        <div className="rounded-lg border border-zinc-800 bg-[#0f0f0f] p-6 text-left space-y-3">
          <h2 className="text-sm font-semibold text-zinc-300">API Endpoints</h2>
          <div className="space-y-2 text-xs">
            <Endpoint method="POST" path="/api/swarm" desc="Run a swarm experiment (v9.7 engine)" />
            <Endpoint method="POST" path="/api/swarm/mock" desc="Run with pre-computed demo data" />
            <Endpoint method="POST" path="/api/swarm/stream" desc="Stream experiment results via SSE" />
            <Endpoint method="GET" path="/api/health" desc="Health check" />
          </div>
        </div>

        <p className="text-xs text-zinc-600">
          API version: v9.7 ·{" "}
          <a
            href="/api/health"
            className="underline underline-offset-4 hover:text-zinc-400"
          >
            Health check →
          </a>
        </p>
      </div>
    </main>
  );
}

function Endpoint({
  method,
  path,
  desc,
}: {
  method: "GET" | "POST";
  path: string;
  desc: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
          method === "POST"
            ? "bg-emerald-500/20 text-emerald-400"
            : "bg-blue-500/20 text-blue-400"
        }`}
      >
        {method}
      </span>
      <code className="text-zinc-300">{path}</code>
      <span className="text-zinc-600 ml-auto">{desc}</span>
    </div>
  );
}
