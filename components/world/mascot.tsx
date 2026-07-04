"use client";

import { motion } from "framer-motion";

type Props = {
  tip: string;
};

export function Mascot({ tip }: Props) {
  return (
    <motion.div
      className="flex items-start gap-3 rounded-2xl border border-[color:var(--world-border)] bg-[color:var(--world-card)] px-4 py-3"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <motion.div
        className="relative flex size-14 shrink-0 items-center justify-center rounded-xl bg-[#6f4e37] shadow-[inset_0_-4px_0_#4a3424]"
        animate={{ y: [0, -2, 0] }}
        transition={{ repeat: Infinity, duration: 2.4, ease: "easeInOut" }}
      >
        <div className="absolute -top-1 left-2 size-2 rounded-full bg-[#e85d4c]" />
        <div className="absolute -top-1 right-2 size-2 rounded-full bg-[#e85d4c]" />
        <div className="text-2xl">🐦</div>
      </motion.div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--world-muted)]">Reginald</p>
        <p className="mt-1 text-sm leading-relaxed text-[color:var(--world-ink)]">{tip}</p>
      </div>
    </motion.div>
  );
}
