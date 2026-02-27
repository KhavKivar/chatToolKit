"use client";

import React, { useEffect, useState } from "react";
import { Clapperboard, Sparkles, MonitorPlay, Share2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getClips } from "../lib/api";

interface ClipItem {
  id: string;
  title: string;
  youtube_url: string;
  youtube_video_id: string;
  streamladder_id: string;
  streamer_name: string;
  video_title: string;
  created_at: string;
}

export function ClipsView() {
  const [clips, setClips] = useState<ClipItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getClips()
      .then((res) => {
        // Handle both paginated and flat responses
        const data = res.results || res;
        setClips(Array.isArray(data) ? data : []);
      })
      .catch((err) => console.error("Failed to fetch clips:", err))
      .finally(() => setLoading(false));
  }, []);

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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="aspect-9/16 rounded-xl" />
          ))
        ) : clips.length > 0 ? (
          clips.map((clip) => (
            <Card
              key={clip.id}
              className="overflow-hidden border-none bg-muted/20 group hover:ring-2 hover:ring-primary/20 transition-all"
            >
              <div className="aspect-9/16 bg-black relative">
                {clip.youtube_video_id ? (
                  <iframe
                    className="w-full h-full"
                    src={`https://www.youtube.com/embed/${clip.youtube_video_id}?autoplay=0&rel=0`}
                    title={clip.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  ></iframe>
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-muted">
                    <div className="flex flex-col items-center gap-2">
                      <MonitorPlay
                        size={40}
                        className="text-muted-foreground opacity-20"
                      />
                      <span className="text-[10px] text-muted-foreground font-medium">
                        Draft - Pending YouTube Upload
                      </span>
                    </div>
                  </div>
                )}
              </div>
              <CardContent className="p-4 space-y-3">
                <div className="space-y-1">
                  <h3 className="font-bold text-sm line-clamp-2">
                    {clip.title}
                  </h3>
                  <p className="text-[10px] text-muted-foreground truncate uppercase font-bold tracking-wider">
                    {clip.streamer_name} · {clip.video_title}
                  </p>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-primary/5">
                  <Badge
                    variant="secondary"
                    className="text-[9px] bg-primary/5 text-primary border-none"
                  >
                    SL ID: {clip.streamladder_id?.substring(0, 8)}...
                  </Badge>
                  {clip.youtube_url && (
                    <a
                      href={clip.youtube_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-primary transition-colors"
                    >
                      <Share2 size={14} />
                    </a>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card className="border-dashed bg-muted/30 flex flex-col items-center justify-center py-16 text-center col-span-full">
            <div className="bg-primary/10 p-5 rounded-full mb-4">
              <Clapperboard size={40} className="text-primary" />
            </div>
            <CardTitle className="mb-2">No clips available</CardTitle>
            <CardDescription className="max-w-xs mx-auto">
              Ready to process VODs. When engagement spikes are detected, clips
              will be sent to Streamladder and then mirrored here from YouTube.
            </CardDescription>
            <div className="mt-8 flex items-center gap-2 text-xs font-bold text-muted-foreground/60 bg-muted/40 px-4 py-2 rounded-full">
              <Sparkles size={14} className="text-yellow-500/80" />
              INTEGRATION: STREAMLADDER + YOUTUBE
            </div>
          </Card>
        )}
      </div>

      <div className="bg-linear-to-br from-primary/5 to-purple-500/5 border border-primary/10 rounded-2xl p-8 flex flex-col md:flex-row items-center gap-8 justify-between mt-12">
        <div className="space-y-2">
          <h3 className="font-bold text-xl flex items-center gap-2">
            <Sparkles size={22} className="text-purple-500" />
            Engagement-Driven Clips
          </h3>
          <p className="text-sm text-muted-foreground max-w-xl">
            Our algorithm scans chat activity for "W", "LUL", and hype moments.
            Once a peak is found, the timeframe is sent to Streamladder for
            vertical formatting and then prepared for YouTube Shorts.
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
