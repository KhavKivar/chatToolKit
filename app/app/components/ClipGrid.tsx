"use client";

import React, { useEffect, useState } from "react";
import { Clapperboard, MonitorPlay, Share2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getClips } from "../lib/api";

interface ClipItem {
  id: string;
  title: string;
  s3_url: string;
  streamladder_id: string;
  streamer_name: string;
  video_title: string;
  created_at: string;
}

interface ClipGridProps {
  videoId?: string;
  streamerId?: string;
}

export function ClipGrid({ videoId, streamerId }: ClipGridProps) {
  const [clips, setClips] = useState<ClipItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getClips({ video: videoId, streamer: streamerId })
      .then((res) => {
        const data = res.results || res;
        const sortedData = Array.isArray(data)
          ? [...data].sort((a, b) => {
              if (a.s3_url && !b.s3_url) return -1;
              if (!a.s3_url && b.s3_url) return 1;
              return 0;
            })
          : [];
        setClips(sortedData);
      })
      .catch((err) => console.error("Failed to fetch clips:", err))
      .finally(() => setLoading(false));
  }, [videoId, streamerId]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="aspect-video rounded-xl" />
        ))}
      </div>
    );
  }

  if (clips.length === 0) {
    return (
      <Card className="border-dashed bg-muted/30 flex flex-col items-center justify-center py-16 text-center col-span-full">
        <div className="bg-primary/10 p-5 rounded-full mb-4">
          <Clapperboard size={40} className="text-primary" />
        </div>
        <CardTitle className="mb-2">No clips available</CardTitle>
        <CardDescription className="max-w-xs mx-auto">
          {videoId ? "No clips found for this VOD." : "No clips available yet."}
        </CardDescription>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {clips.map((clip) => (
        <Card
          key={clip.id}
          className="overflow-hidden border-none bg-muted/20 group hover:ring-2 hover:ring-primary/20 transition-all"
        >
          <div className="aspect-video bg-black relative">
            {clip.s3_url ? (
              <video
                className="w-full h-full object-cover"
                src={clip.s3_url}
                controls
                preload="metadata"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-muted">
                <div className="flex flex-col items-center gap-2">
                  <MonitorPlay
                    size={40}
                    className="text-muted-foreground opacity-20"
                  />
                  <span className="text-[10px] text-muted-foreground font-medium">
                    Processing Assets...
                  </span>
                </div>
              </div>
            )}
          </div>
          <CardContent className="p-4 space-y-3">
            <div className="space-y-1">
              <h3 className="font-bold text-sm line-clamp-2">{clip.title}</h3>
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
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-primary transition-colors"
                onClick={() => {
                  const url = `${window.location.origin}/clips/${clip.id}`;
                  navigator.clipboard.writeText(url);
                }}
                title="Copy share link"
              >
                <Share2 size={14} />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
