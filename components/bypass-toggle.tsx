"use client";

import { useEffect, useState } from "react";
import { Hammer, Sparkles } from "lucide-react";

export function BypassToggle() {
  const [isBypassed, setIsBypassed] = useState(false);

  useEffect(() => {
    const match = document.cookie.match(/(?:^|; )kish_force_showcase=([^;]*)/);
    setIsBypassed(match ? match[1] === "true" : false);
  }, []);

  const handleToggle = () => {
    if (isBypassed) {
      document.cookie = "kish_force_showcase=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    } else {
      document.cookie = "kish_force_showcase=true; path=/; max-age=2592000"; // 30 days
    }
    window.location.reload();
  };

  return (
    <footer className="mt-16 w-full border-t border-white/5 bg-black/40 py-6 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 sm:flex-row sm:px-10 lg:px-12">
        <p className="text-xs text-[color:var(--muted-foreground)]">
          &copy; {new Date().getFullYear()} KISH. All rights reserved.
        </p>
        <button
          onClick={handleToggle}
          className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-medium transition-all duration-300 backdrop-blur-sm ${
            isBypassed
              ? "border-amber-500/30 bg-amber-500/10 text-amber-300 shadow-md shadow-amber-500/10 hover:border-amber-500/50"
              : "border-white/10 bg-white/5 text-[color:var(--muted-foreground)] hover:border-white/20 hover:text-white"
          }`}
        >
          <Hammer className="size-3.5" />
          <span>Bypass Xero (Showcase):</span>
          <span className="font-semibold">{isBypassed ? "ACTIVE" : "OFF"}</span>
          <Sparkles className={`size-3 ${isBypassed ? "text-amber-400 animate-pulse" : "opacity-40"}`} />
        </button>
      </div>
    </footer>
  );
}
