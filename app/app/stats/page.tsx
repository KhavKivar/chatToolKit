"use client";

import { Suspense } from "react";
import { Loader2, BarChart2, Twitch } from "lucide-react";
import Link from "next/link";
import { ModeToggle } from "../components/mode-toggle";
import { StatsView } from "../components/StatsView";

export default function StatsPage() {
  return (
    <>
      <nav className="border-b sticky top-0 bg-background/95 backdrop-blur z-50">
        <div className="max-w-6xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="bg-primary p-1.5 rounded-lg text-primary-foreground">
              <Twitch size={20} />
            </div>
            <span className="text-lg font-bold tracking-tight">ChatToolkit</span>
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <BarChart2 size={16} />
              Stats
            </span>
            <ModeToggle />
          </div>
        </div>
      </nav>
      <Suspense
        fallback={
          <div className="min-h-screen bg-background flex items-center justify-center">
            <Loader2 className="animate-spin text-primary" size={40} />
          </div>
        }
      >
        <StatsView standalone />
      </Suspense>
    </>
  );
}
