"use client";

import { useState } from "react";
import { Check, Copy, LoaderCircle, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function CliSeedSetup() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<{ refreshToken: string; tenantId: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function fetchCredentials() {
    setLoading(true);
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
      setLoading(false);
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
          <Terminal className="size-4 text-[color:var(--accent)]" />
          <CardTitle>CLI demo seed</CardTitle>
        </div>
        <CardDescription>
          Export your Xero session for <code className="text-xs">npm run seed:xero -- --reset</code>. Paste the lines into{" "}
          <code className="text-xs">.env.local</code>, then run the command in your terminal.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={fetchCredentials} disabled={loading}>
          {loading ? <LoaderCircle className="size-4 animate-spin" /> : null}
          Get CLI credentials
        </Button>

        {error ? <p className="text-sm text-red-300">{error}</p> : null}

        {envBlock ? (
          <div className="space-y-3">
            <pre className="overflow-x-auto rounded-2xl border border-[color:var(--border)] bg-black/25 p-4 text-xs leading-relaxed text-[color:var(--foreground-soft)]">
              {envBlock}
            </pre>
            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" size="sm" onClick={copyEnvBlock}>
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? "Copied" : "Copy to clipboard"}
              </Button>
            </div>
            <p className="text-sm text-[color:var(--muted-foreground)]">
              After pasting into <code className="text-xs">.env.local</code>, run:{" "}
              <code className="text-xs">npm run seed:xero -- --reset</code>
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
