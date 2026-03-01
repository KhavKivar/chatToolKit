"use client";

import React from "react";
import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ClipGrid } from "./ClipGrid";

export function ClipsView() {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 pb-6 border-b">
        <div className="space-y-1">
          <Badge
            variant="outline"
            className="mb-2 gap-1.5 text-xs bg-purple-500/10 text-purple-500 border-purple-500/20"
          >
            <Sparkles size={11} />
            AI Highlights
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight">
            AI Generated Clips
          </h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Viral moments extracted via chat analysis and formatted using
            Streamladder.
          </p>
        </div>
      </div>

      <ClipGrid />

      <div className="bg-linear-to-br from-primary/5 to-purple-500/5 border border-primary/10 rounded-2xl p-8 flex flex-col md:flex-row items-center gap-8 justify-between mt-12">
        <div className="space-y-2">
          <h3 className="font-bold text-xl flex items-center gap-2">
            <Sparkles size={22} className="text-purple-500" />
            Engagement-Driven Clips
          </h3>
          <p className="text-sm text-muted-foreground max-w-xl">
            Our algorithm scans chat activity for &quot;W&quot;,
            &quot;LUL&quot;, and hype moments. Once a peak is found, the
            timeframe is sent to Streamladder for vertical formatting and then
            hosted on S3.
          </p>
        </div>
        <div className="flex flex-col gap-2 shrink-0 items-end">
          <Badge className="bg-emerald-500/10 text-emerald-500 border-none px-4 py-1.5 text-[11px] font-black uppercase tracking-tighter">
            System Online
          </Badge>
          <span className="text-[10px] text-muted-foreground/50 font-medium">
            Auto-scan every 10 mins
          </span>
        </div>
      </div>
    </div>
  );
}
