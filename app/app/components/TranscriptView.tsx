"use client";

import React, { useState, useEffect } from "react";
import { Search, Clapperboard, RefreshCcw, ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getTranscripts } from "../lib/api";
import { Badge } from "@/components/ui/badge";

interface TranscriptEntry {
  id: number;
  video: string;
  start_seconds: number;
  end_seconds: number;
  text: string;
}

interface TranscriptViewProps {
  videoId: string;
}

export function TranscriptView({ videoId }: TranscriptViewProps) {
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    getTranscripts({ video: videoId })
      .then((res) => {
        setEntries(res.results || res);
      })
      .catch((err) => console.error("Failed to fetch transcripts:", err))
      .finally(() => setLoading(false));
  }, [videoId]);

  const filteredEntries = entries.filter((e) =>
    e.text.toLowerCase().includes(search.toLowerCase()),
  );

  function formatTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return h > 0
      ? `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
      : `${m}:${s.toString().padStart(2, "0")}`;
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
        <RefreshCcw className="animate-spin text-primary" size={24} />
        <p className="animate-pulse">Loading Stream Transcript...</p>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-4 bg-muted/30 rounded-xl border border-dashed">
        <div className="p-4 bg-muted rounded-full">
          <Clapperboard size={32} className="opacity-20" />
        </div>
        <div className="text-center">
          <p className="font-semibold text-foreground/70">
            No transcript found for this VOD
          </p>
          <p className="text-sm">
            Transcripts are automatically scraped from Streamladder projects.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 bg-muted/30 p-1 rounded-xl border">
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            size={16}
          />
          <Input
            placeholder="Search in transcript..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-10 border-none bg-transparent focus-visible:ring-0"
          />
        </div>
        <Badge variant="secondary" className="mr-2">
          {filteredEntries.length} entries
        </Badge>
      </div>

      <ScrollArea className="h-[65vh] pr-4 border rounded-xl bg-card/30">
        <div className="space-y-1 p-2">
          {filteredEntries.map((entry) => (
            <div
              key={entry.id}
              className="group flex gap-4 p-3 rounded-lg hover:bg-primary/5 transition-colors border border-transparent hover:border-primary/10"
            >
              <div className="shrink-0 w-24 flex flex-col pt-0.5">
                <span className="text-[11px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded text-center">
                  {formatTime(entry.start_seconds)}
                </span>
                <a
                  href={`https://www.twitch.tv/videos/${videoId}?t=${formatTime(entry.start_seconds).replace(/:/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 text-[10px] text-primary opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1 font-bold"
                >
                  WATCH <ExternalLink size={10} />
                </a>
              </div>
              <div className="flex-1">
                <p className="text-sm leading-relaxed text-foreground/90">
                  {entry.text}
                </p>
              </div>
            </div>
          ))}
          {filteredEntries.length === 0 && (
            <div className="py-20 text-center text-muted-foreground italic">
              No matches found for &quot;{search}&quot;
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
