"use client";

import React from "react";
import { Clapperboard, Sparkles, Clock, Play } from "lucide-react";
import {
  Card,
  CardContent,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
            AI Powered
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight">
            AI Generated Clips
          </h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Highlights and viral moments automatically extracted and formatted
            using Streamladder.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Placeholder / Coming Soon Card for now */}
        <Card className="border-dashed bg-muted/30 flex flex-col items-center justify-center py-12 text-center col-span-full">
          <div className="bg-primary/10 p-4 rounded-full mb-4">
            <Clapperboard size={32} className="text-primary" />
          </div>
          <CardTitle className="mb-2">No clips ready yet</CardTitle>
          <CardDescription className="max-w-sm px-4">
            The AI is currently processing recent VODs to identify
            high-engagement moments. Clips will appear here as they are
            generated.
          </CardDescription>
          <div className="mt-6 flex items-center gap-2 text-xs font-semibold text-muted-foreground bg-background px-3 py-1.5 rounded-full border">
            <Sparkles size={12} className="text-yellow-500" />
            POWERED BY STREAMLADDER AI
          </div>
        </Card>

        {/* Example of what a clip card might look like later */}
        <Card className="overflow-hidden group opacity-50 grayscale pointer-events-none">
          <div className="aspect-9/16 bg-black relative flex items-center justify-center">
            <Play size={48} className="text-white/20" />
            <div className="absolute inset-0 bg-linear-to-t from-black/80 via-transparent to-transparent" />
            <div className="absolute bottom-4 left-4 right-4">
              <Badge className="bg-purple-600 mb-2">Example Format</Badge>
              <h3 className="text-white font-bold truncate">Viral Moment #1</h3>
            </div>
          </div>
          <CardContent className="p-4 bg-card">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock size={12} /> 0:30s
              </span>
              <span className="flex items-center gap-1">
                Processed <Sparkles size={12} className="text-yellow-500" />
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-6 flex flex-col md:flex-row items-center gap-6 justify-between mt-10">
        <div className="space-y-1">
          <h3 className="font-bold flex items-center gap-2">
            <Sparkles size={18} className="text-blue-500" />
            AI Clip Strategy
          </h3>
          <p className="text-sm text-muted-foreground">
            We use engagement density statistics to find spikes in chat activity
            and send those timeframes to Streamladder for automatic conversion
            into vertical clips.
          </p>
        </div>
        <div className="flex shrink-0 gap-3">
          <Badge
            variant="secondary"
            className="bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border-none px-3 py-1 text-[10px] tracking-widest uppercase font-bold"
          >
            Chat Analysis Active
          </Badge>
        </div>
      </div>
    </div>
  );
}
