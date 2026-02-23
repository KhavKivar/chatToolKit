"use client";

import React, { useState, useEffect } from "react";
import { ArrowLeft, Play, User, Calendar, RefreshCcw } from "lucide-react";
import { refreshStreamerVods, getStreamers, getVideos } from "../lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import CommentList from "./CommentList";
import { Badge } from "@/components/ui/badge";

/* eslint-disable @next/next/no-img-element */

interface Streamer {
  id: string;
  login: string;
  display_name: string;
  profile_image_url?: string;
  video_count: number;
  last_vod_at: string | null;
}

interface Video {
  id: string;
  title: string;
  streamer: string; // ID
  streamer_login: string;
  streamer_display_name: string;
  created_at: string;
  length_seconds?: number;
  thumbnail_url?: string;
}

export function LibraryView() {
  const [streamers, setStreamers] = useState<Streamer[]>([]);
  const [streamerVideos, setStreamerVideos] = useState<Video[]>([]);
  const [selectedStreamer, setSelectedStreamer] = useState<Streamer | null>(
    null,
  );
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [loading, setLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);

  async function loadData() {
    setLoading(true);
    try {
      const streams = await getStreamers();
      setStreamers(streams.results || streams);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function loadStreamerVideos(streamerId: string, login: string) {
    setStreamerVideos([]); // Clear old videos while loading
    try {
      const data = await getVideos({ streamer_login: login, page_size: 500 });
      const vidsArray = Array.isArray(data) ? data : data.results || [];
      setStreamerVideos(vidsArray);
    } catch (e) {
      console.error("Failed to load VODs", e);
    }
  }

  useEffect(() => {
    if (selectedStreamer) {
      loadStreamerVideos(selectedStreamer.id, selectedStreamer.login);
    }
  }, [selectedStreamer]);

  useEffect(() => {
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="py-32 flex flex-col items-center justify-center text-muted-foreground gap-4">
        <RefreshCcw className="animate-spin text-primary" size={32} />
        <p className="font-medium animate-pulse">Loading Library Data...</p>
      </div>
    );
  }

  // Level 3: Full screen video comment view
  if (selectedVideo) {
    return (
      <div className="space-y-4 animate-in fade-in zoom-in-95 duration-300">
        <button
          onClick={() => setSelectedVideo(null)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted px-3 py-1.5 rounded-lg transition-colors border border-transparent hover:border-border -ml-3"
        >
          <ArrowLeft size={16} /> Back to {selectedStreamer?.display_name}
          &apos;s VODs
        </button>
        <div className="flex items-center gap-4 mb-4">
          <Badge variant="outline" className="text-xs text-primary font-mono">
            {selectedVideo.id}
          </Badge>
          <h2 className="text-xl font-bold truncate">
            {selectedVideo.title || `Video ${selectedVideo.id}`}
          </h2>
        </div>
        <div className="h-[80vh] border rounded-xl overflow-hidden shadow-2xl bg-card border-primary/20">
          <CommentList videoId={selectedVideo.id} />
        </div>
      </div>
    );
  }

  // Level 2: Streamer's VODs
  if (selectedStreamer) {
    const sortedVideos = [...streamerVideos].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    const handleRefreshVods = async () => {
      setIsScanning(true);
      try {
        const res = await refreshStreamerVods(selectedStreamer.id);
        alert(
          `RESET COMPLETE: All old videos and comments for ${selectedStreamer.display_name} have been DELETED. ${res.queued_vods || 0} fresh tasks have been queued.`,
        );
        loadData(); // Update counts
        loadStreamerVideos(selectedStreamer.id, selectedStreamer.login);
      } catch (e) {
        console.error("Refresh failed", e);
        alert("Scan failed. Please check the console.");
      } finally {
        setIsScanning(false);
      }
    };

    return (
      <div className="space-y-6 animate-in slide-in-from-right-8 duration-300">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <button
            onClick={() => setSelectedStreamer(null)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted px-3 py-1.5 rounded-lg transition-colors border border-transparent hover:border-border -ml-3"
          >
            <ArrowLeft size={16} /> Back to Library
          </button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleRefreshVods}
            disabled={isScanning}
            className="flex items-center gap-2 border-primary/30 hover:border-primary/60 hover:bg-primary/5 text-primary"
          >
            <RefreshCcw
              size={14}
              className={isScanning ? "animate-spin" : ""}
            />
            {isScanning ? "Scanning..." : "Scan for New VODs"}
          </Button>
        </div>

        <div className="flex items-center gap-5 p-6 bg-gradient-to-r from-primary/10 to-transparent rounded-2xl border border-primary/10">
          {selectedStreamer.profile_image_url ? (
            <img
              src={selectedStreamer.profile_image_url}
              alt=""
              className="w-20 h-20 rounded-full border-2 border-primary shadow-lg"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center text-primary shadow-lg">
              <User size={36} />
            </div>
          )}
          <div>
            <h2 className="text-3xl font-black tracking-tight">
              {selectedStreamer.display_name}
            </h2>
            <p className="text-muted-foreground mt-1 text-sm font-medium">
              {streamerVideos.length} VODs Downloaded
            </p>
          </div>
        </div>

        {sortedVideos.length === 0 ? (
          <div className="py-32 text-center text-muted-foreground border-2 border-dashed rounded-xl">
            No VODs found for this streamer yet. Use the Scan button or wait for
            downloads to finish.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {sortedVideos.map((v) => (
              <Card
                key={v.id}
                className="overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary hover:shadow-xl transition-all duration-300 group border-border/50 bg-card/50 hover:bg-card"
                onClick={() => setSelectedVideo(v)}
              >
                {/* VOD thumbnail */}
                <div className="aspect-video bg-muted relative overflow-hidden flex items-center justify-center rounded-t-lg border-b border-border/50">
                  {v.thumbnail_url ? (
                    <img
                      src={v.thumbnail_url}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-purple-900/40 to-black group-hover:scale-105 transition-transform duration-700" />
                  )}

                  <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors duration-300" />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 transform group-hover:scale-110">
                    <div className="bg-primary hover:bg-primary/90 text-primary-foreground p-4 rounded-full shadow-[0_0_30px_rgba(168,85,247,0.5)]">
                      <Play size={28} fill="currentColor" className="ml-1" />
                    </div>
                  </div>
                  {v.length_seconds && (
                    <Badge
                      className="absolute bottom-2 left-2 font-mono bg-black/80 text-white hover:bg-black/80 border-none"
                      variant="secondary"
                    >
                      {Math.floor(v.length_seconds / 3600)}:
                      {(Math.floor(v.length_seconds / 60) % 60)
                        .toString()
                        .padStart(2, "0")}
                      :{(v.length_seconds % 60).toString().padStart(2, "0")}
                    </Badge>
                  )}
                  <Badge className="absolute top-2 right-2 text-[10px] font-bold uppercase tracking-widest bg-emerald-500/20 text-emerald-500 border-none">
                    DOWNLOADED
                  </Badge>
                </div>
                <CardContent className="p-4 flex flex-col justify-between h-[100px]">
                  <h3
                    className="font-bold text-sm leading-tight line-clamp-2 text-foreground/90 group-hover:text-primary transition-colors"
                    title={v.title || `VOD ${v.id}`}
                  >
                    {v.title || `VOD ${v.id}`}
                  </h3>
                  <div className="flex items-center justify-between text-xs text-muted-foreground mt-3">
                    <span className="flex items-center gap-1.5">
                      <Calendar size={12} />{" "}
                      {new Date(v.created_at).toLocaleDateString()}
                    </span>
                    <span className="font-mono text-[10px] uppercase opacity-50">
                      ID {v.id}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Level 1: Streamers
  // Order streamers by their most recent VOD
  const sortedStreamers = [...streamers].sort((a, b) => {
    const timeA = a.last_vod_at ? new Date(a.last_vod_at).getTime() : 0;
    const timeB = b.last_vod_at ? new Date(b.last_vod_at).getTime() : 0;
    return timeB - timeA;
  });

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black tracking-tight mb-2 flex items-center gap-3">
            <div className="bg-primary/10 p-2 rounded-lg text-primary">
              <User size={20} />
            </div>
            Tracked Library
          </h2>
          <p className="text-muted-foreground text-sm">
            Select a streamer to view their downloaded VODs.
          </p>
        </div>
        <button
          onClick={loadData}
          className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
          title="Refresh"
        >
          <RefreshCcw size={18} />
        </button>
      </div>

      {sortedStreamers.length === 0 ? (
        <div className="py-32 text-center text-muted-foreground border-2 border-dashed rounded-xl bg-card/30">
          No streamers tracked yet. Head over to the Streamers tab.
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
          {sortedStreamers.map((s) => {
            const vCount = s.video_count;
            return (
              <Card
                key={s.id}
                className="cursor-pointer border-transparent bg-muted/30 hover:bg-card hover:border-primary/50 transition-all text-center p-6 flex flex-col items-center gap-5 hover:shadow-[0_8px_30px_rgb(0,0,0,0.12)] hover:-translate-y-1 transform duration-300"
                onClick={() => setSelectedStreamer(s)}
              >
                <div className="relative">
                  {s.profile_image_url ? (
                    <img
                      src={s.profile_image_url}
                      alt=""
                      className="w-24 h-24 rounded-full object-cover shadow-lg border-2 border-background"
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center text-primary shadow-lg border-2 border-background">
                      <User size={36} />
                    </div>
                  )}
                  {vCount > 0 && (
                    <div className="absolute -bottom-2 -right-2 bg-primary text-primary-foreground text-[10px] font-black w-8 h-8 rounded-full flex items-center justify-center border-2 border-background shadow-sm">
                      {vCount}
                    </div>
                  )}
                </div>
                <div>
                  <h3
                    className="font-bold text-base line-clamp-1 tracking-tight"
                    title={s.display_name}
                  >
                    {s.display_name}
                  </h3>
                  <p className="text-[11px] text-muted-foreground font-medium uppercase mt-1 tracking-wider">
                    {vCount} Vods
                  </p>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
