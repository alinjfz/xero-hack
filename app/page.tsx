import { Badge } from "@/components/ui/badge";
import { XeroDashboard } from "@/components/xero-dashboard";
import { BypassToggle } from "@/components/bypass-toggle";

export default function HomePage() {
  return (
    <main className="relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,214,102,0.16),transparent_28%),radial-gradient(circle_at_80%_20%,rgba(73,152,255,0.18),transparent_24%),linear-gradient(180deg,rgba(10,14,24,0.92),rgba(10,14,24,1))]" />
      <div className="absolute inset-x-0 top-0 h-80 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.08),transparent)] blur-3xl" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-8 sm:px-10 lg:px-12">
        <header className="mb-10 flex flex-col gap-4 border-b border-white/8 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Badge variant="subtle" className="mb-3 w-fit">
              Live workspace
            </Badge>
            <h1 className="font-[family-name:var(--font-display)] text-3xl text-white sm:text-4xl">KISH</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--muted-foreground)]">
              Knowledge & Intelligent SME Hub for owners who want their Xero data turned into readable priorities.
            </p>
          </div>
        </header>
        <div className="flex-1">
          <XeroDashboard />
        </div>
        <BypassToggle />
      </div>
    </main>
  );
}
