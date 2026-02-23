"use client";

import { Calendar, User } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface VideoData {
  id: string;
  title: string;
  streamer_display_name: string;
  created_at: string;
}

export default function VideoList({
  videos,
  onSelect,
  selectedId,
}: {
  videos: VideoData[];
  onSelect: (id: string | null) => void;
  selectedId: string | null;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Library
        </h2>
        <Badge variant="outline">{videos.length}</Badge>
      </div>

      <div className="space-y-2">
        {videos.length === 0 ? (
          <p className="text-muted-foreground italic text-sm text-center py-10 border rounded-lg border-dashed">
            Empty library.
          </p>
        ) : (
          videos.map((v) => (
            <Card
              key={v.id}
              className={`cursor-pointer transition-colors hover:bg-muted/50 ${selectedId === v.id ? "border-primary bg-primary/5" : ""}`}
              onClick={() => onSelect(selectedId === v.id ? null : v.id)}
            >
              <CardContent className="p-4">
                <h3 className="font-bold text-sm mb-2 line-clamp-1">
                  {v.title || `Video ${v.id}`}
                </h3>
                <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <User size={12} />
                    <span>{v.streamer_display_name}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Calendar size={12} />
                    <span>{new Date(v.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
