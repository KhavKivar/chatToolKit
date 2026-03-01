"use client";

import React, { useEffect, useState, use } from "react";
import {
  ArrowLeft,
  Sparkles,
  MonitorPlay,
  Calendar,
  User,
  Video as VideoIcon,
  Share2,
  Check,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getClip } from "../../lib/api";

interface ClipItem {
  id: string;
  title: string;
  s3_url: string;
  streamladder_id: string;
  streamer_name: string;
  video_title: string;
  created_at: string;
}

export default function ClipPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [clip, setClip] = useState<ClipItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getClip(id)
      .then((res) => setClip(res))
      .catch((err) => console.error("Failed to fetch clip:", err))
      .finally(() => setLoading(false));
  }, [id]);

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="container max-w-4xl mx-auto py-12 px-4 space-y-8">
        <Skeleton className="h-10 w-32" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <Skeleton className="aspect-video rounded-2xl" />
          <div className="space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-32 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (!clip) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <MonitorPlay size={64} className="text-muted-foreground opacity-20" />
        <h2 className="text-2xl font-bold">Clip not found</h2>
        <p className="text-muted-foreground">
          The clip might have been removed or the link is invalid.
        </p>
        <Link href="/">
          <Button variant="outline">Go back home</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container max-w-5xl mx-auto py-8 md:py-16 px-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors mb-8 group"
      >
        <ArrowLeft
          size={16}
          className="group-hover:-translate-x-1 transition-transform"
        />
        Back to all clips
      </Link>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 lg:gap-16">
        {/* Video Player Section */}
        <div className="relative group">
          <div className="absolute -inset-4 bg-primary/20 blur-3xl opacity-20 rounded-[3rem] -z-10 group-hover:opacity-30 transition-opacity" />
          <Card className="overflow-hidden border-none bg-black ring-1 ring-white/10 shadow-2xl rounded-2xl aspect-video">
            {clip.s3_url ? (
              <video
                className="w-full h-full object-cover"
                src={clip.s3_url}
                controls
                autoPlay
                preload="metadata"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center space-y-4 bg-muted/10">
                <MonitorPlay
                  size={48}
                  className="text-muted-foreground opacity-20 animate-pulse"
                />
                <span className="text-sm text-muted-foreground font-medium">
                  Processing High Quality Asset...
                </span>
              </div>
            )}
          </Card>
        </div>

        {/* Content Section */}
        <div className="space-y-8 flex flex-col justify-center">
          <div className="space-y-4">
            <Badge
              variant="outline"
              className="gap-1.5 text-xs bg-purple-500/10 text-purple-500 border-purple-500/20"
            >
              <Sparkles size={11} />
              AI Generated Highlight
            </Badge>
            <h1 className="text-4xl md:text-5xl font-black tracking-tight leading-tight">
              {clip.title}
            </h1>
          </div>

          <div className="grid grid-cols-1 gap-6">
            <div className="flex items-start gap-4 p-4 rounded-xl bg-muted/30 border border-white/5">
              <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
                <User size={20} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold">
                  Streamer
                </p>
                <p className="font-bold text-lg">{clip.streamer_name}</p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-4 rounded-xl bg-muted/30 border border-white/5">
              <div className="p-2.5 rounded-lg bg-blue-500/10 text-blue-500">
                <VideoIcon size={20} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold">
                  Original Stream
                </p>
                <p className="font-bold text-lg line-clamp-1">
                  {clip.video_title}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-4 rounded-xl bg-muted/30 border border-white/5">
              <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-500">
                <Calendar size={20} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold">
                  Created
                </p>
                <p className="font-bold text-lg">
                  {new Date(clip.created_at).toLocaleDateString(undefined, {
                    dateStyle: "long",
                  })}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 pt-4">
            <Button
              size="lg"
              className="rounded-full px-8 gap-2 font-bold shadow-lg shadow-primary/20 flex-1 sm:flex-none"
              onClick={handleShare}
            >
              {copied ? <Check size={18} /> : <Share2 size={18} />}
              {copied ? "Copied Link!" : "Share Link"}
            </Button>
            <Link href="/" className="flex-1 sm:flex-none">
              <Button
                size="lg"
                variant="outline"
                className="rounded-full px-8 font-bold w-full"
              >
                Watch More
              </Button>
            </Link>
          </div>

          <div className="pt-8 border-t border-white/5">
            <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground/60">
              <Badge
                variant="secondary"
                className="bg-muted opacity-50 px-2 pointer-events-none"
              >
                SLID-{clip.streamladder_id}
              </Badge>
              <span className="opacity-30">•</span>
              <span>HOSTED ON S3 DIRECT</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
