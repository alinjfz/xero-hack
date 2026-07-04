"use client";

import { useState } from "react";
import { Check, Copy, DatabaseZap, LoaderCircle, RotateCcw, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type SeedResponse = {
  removed?: number;
  created?: string[];
  error?: string;
};

export function CliSeedSetup() {
  const [loadingMode, setLoadingMode] = useState<"seed" | "reset" | "credentials" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<{ refreshToken: string; tenantId: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [seedResult, setSeedResult] = useState<SeedResponse | null>(null);

  async function runSeedAction(mode: "seed" | "reset") {
    setLoadingMode(mode);
    setError(null);

    try {
      const response = await fetch("/api/xero/seed", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(mode === "seed" ? { resetFirst: true } : { resetOnly: true }),
      });

      const data = (await response.json()) as SeedResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "Could not update Xero starter data.");
      }

      setSeedResult(data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not update Xero starter data.");
    } finally {
      setLoadingMode(null);
    }
  }

  async function fetchCredentials() {
    setLoadingMode("credentials");
    setError(null);
    setCopied(false);

    try {
      const response = await fetch("/api/xero/export-token", { credentials: "include" });
      const data = (await response.json()) as {
        refreshToken?: string;
        tenantId?: string;
        error?: string;
      };

      if (!response.ok || !data.refreshToken || !data.tenantId) {
        throw new Error(data.error ?? "Could not export credentials.");
      }

      setCredentials({
        refreshToken: data.refreshToken,
        tenantId: data.tenantId,
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not export credentials.");
    } finally {
      setLoadingMode(null);
    }
  }

  async function copyEnvBlock() {
    if (!credentials) {
      return;
    }

    const block = `XERO_REFRESH_TOKEN=${credentials.refreshToken}\nXERO_TENANT_ID=${credentials.tenantId}`;
    await navigator.clipboard.writeText(block);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  const envBlock = credentials
    ? `XERO_REFRESH_TOKEN=${credentials.refreshToken}\nXERO_TENANT_ID=${credentials.tenantId}`
    : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <DatabaseZap className="size-4 text-[color:var(--accent)]" />
          <CardTitle>Xero data setup</CardTitle>
        </div>
        <CardDescription>
          Push starter records into the connected Xero tenant so the product can work with real invoices and bills immediately.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => runSeedAction("seed")} disabled={loadingMode !== null}>
            {loadingMode === "seed" ? <LoaderCircle className="size-4 animate-spin" /> : <DatabaseZap className="size-4" />}
            Import starter records
          </Button>
          <Button variant="secondary" onClick={() => runSeedAction("reset")} disabled={loadingMode !== null}>
            {loadingMode === "reset" ? <LoaderCircle className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
            Remove starter records
          </Button>
        </div>

        {seedResult ? (
          <div className="rounded-2xl border border-[color:var(--border)] bg-black/15 p-4 text-sm leading-6 text-[color:var(--foreground-soft)]">
            <p>
              Removed: <span className="font-semibold text-[color:var(--foreground)]">{seedResult.removed ?? 0}</span>
            </p>
            <p>
              Created: <span className="font-semibold text-[color:var(--foreground)]">{seedResult.created?.length ?? 0}</span>
            </p>
            {seedResult.created && seedResult.created.length > 0 ? (
              <div className="mt-2 space-y-1 text-xs">
                {seedResult.created.map((item) => (
                  <p key={item}>{item}</p>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {error ? <p className="text-sm text-red-300">{error}</p> : null}

        <div className="rounded-2xl border border-[color:var(--border)] bg-black/10 p-4">
          <div className="flex items-center gap-2">
            <Terminal className="size-4 text-[color:var(--accent)]" />
            <p className="text-sm font-semibold text-[color:var(--foreground)]">Advanced CLI access</p>
          </div>
          <p className="mt-2 text-sm leading-6 text-[color:var(--muted-foreground)]">
            If you still want local terminal access for bulk scripts, export your browser session and paste it into <code className="text-xs">.env.local</code>.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Button variant="outline" size="sm" onClick={fetchCredentials} disabled={loadingMode !== null}>
              {loadingMode === "credentials" ? <LoaderCircle className="size-4 animate-spin" /> : null}
              Get CLI credentials
            </Button>
          </div>
          {envBlock ? (
            <div className="mt-4 space-y-3">
              <pre className="overflow-x-auto rounded-2xl border border-[color:var(--border)] bg-black/25 p-4 text-xs leading-relaxed text-[color:var(--foreground-soft)]">
                {envBlock}
              </pre>
              <Button variant="secondary" size="sm" onClick={copyEnvBlock}>
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? "Copied" : "Copy to clipboard"}
              </Button>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
