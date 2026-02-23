"use client";

import { useState } from "react";
import { Plus, Loader2, Link as LinkIcon, TrendingUp } from "lucide-react";
import { scrapeWithProgress, ScrapeProgress } from "../lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

export default function AddVideo({ onAdded }: { onAdded: () => void }) {
  const [videoId, setVideoId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<ScrapeProgress | null>(null);

  const handleScrape = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoId) return;

    setLoading(true);
    setError("");
    setProgress(null);

    // Extract video ID from URL if necessary
    let id = videoId.trim();
    const match = id.match(/\/videos\/(\d+)/);
    if (match) id = match[1];

    scrapeWithProgress(
      id,
      (p) => {
        setProgress(p);
      },
      () => {
        setLoading(false);
        setVideoId("");
        onAdded();
      },
      (err) => {
        setError(err);
        setLoading(false);
      },
    );
  };

  return (
    <Card className="mb-8 border-primary/20 bg-card/50 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LinkIcon className="text-primary" size={20} />
          New Extraction
        </CardTitle>
        <CardDescription>
          Enter a Twitch VOD URL or ID to begin downloading the chat logs in
          real-time.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!loading && !progress && (
          <form onSubmit={handleScrape} className="flex gap-4">
            <Input
              placeholder="https://www.twitch.tv/videos/..."
              value={videoId}
              onChange={(e) => setVideoId(e.target.value)}
              className="flex-1"
            />
            <Button type="submit" disabled={loading || !videoId}>
              <Plus className="mr-2" size={18} />
              Extract Chat
            </Button>
          </form>
        )}

        {loading && (
          <div className="space-y-4 animate-in fade-in duration-500">
            <div className="flex justify-between items-end mb-1">
              <div className="space-y-1">
                <p className="text-sm font-medium flex items-center gap-2 text-primary">
                  <Loader2 className="animate-spin" size={14} />
                  {progress?.video_title || "Initializing..."}
                </p>
                {progress && (
                  <p className="text-xs text-muted-foreground flex items-center gap-2">
                    <TrendingUp size={12} />
                    Scraped {progress.total_comments.toLocaleString()} comments
                    (Page {progress.page})
                  </p>
                )}
              </div>
              <span className="text-xs font-bold text-primary">
                {progress?.percent || 0}%
              </span>
            </div>

            <div className="h-2 w-full bg-secondary rounded-full overflow-hidden border border-border/50">
              <div
                className="h-full bg-primary transition-all duration-500 ease-out shadow-[0_0_10px_rgba(var(--primary),0.5)]"
                style={{ width: `${progress?.percent || 0}%` }}
              />
            </div>

            <p className="text-[10px] text-center text-muted-foreground uppercase tracking-wider font-semibold">
              Streamer offset: {progress ? Math.floor(progress.offset / 60) : 0}{" "}
              minutes / {progress ? Math.floor(progress.total_seconds / 60) : 0}{" "}
              minutes
            </p>
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
            <span className="font-bold">Error:</span> {error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
