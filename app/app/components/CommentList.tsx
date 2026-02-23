"use client";

import React, { useEffect, useState, useCallback } from "react";
import { MessageSquare, Loader2, Search, X } from "lucide-react";
import { getVideoComments } from "../lib/api";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Comment {
  id: string;
  commenter_display_name: string;
  message: string;
  content_offset_seconds: number;
}

export default function CommentList({ videoId }: { videoId: string }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFetchingNext, setIsFetchingNext] = useState(false);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearch, setActiveSearch] = useState("");

  const fetchComments = useCallback(
    async (pageNum: number, isInitial = false) => {
      if (isInitial) setLoading(true);
      else setIsFetchingNext(true);

      try {
        const data = await getVideoComments(videoId, pageNum, activeSearch);
        const newComments = data.results || [];

        setComments((prev) =>
          isInitial ? newComments : [...prev, ...newComments],
        );
        setHasNextPage(!!data.next);
        setPage(pageNum);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
        setIsFetchingNext(false);
      }
    },
    [videoId, activeSearch],
  );

  // Initial load or search change
  useEffect(() => {
    setComments([]);
    setPage(1);
    fetchComments(1, true);
  }, [videoId, activeSearch, fetchComments]);

  // Intersection Observer for infinite scroll
  const observerTarget = React.useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0].isIntersecting &&
          hasNextPage &&
          !loading &&
          !isFetchingNext
        ) {
          fetchComments(page + 1);
        }
      },
      { threshold: 1.0 },
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => observer.disconnect();
  }, [hasNextPage, loading, isFetchingNext, page, fetchComments]);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setActiveSearch(searchQuery);
    }, 400);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setActiveSearch(searchQuery);
  };

  const clearSearch = () => {
    setSearchQuery("");
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <Card className="h-full flex flex-col border-none shadow-none bg-transparent">
      <CardHeader className="flex flex-col gap-4 pb-4">
        <div className="flex flex-row items-center justify-between">
          <CardTitle className="text-xl font-black flex items-center gap-2 tracking-tight">
            <div className="bg-primary/10 p-2 rounded-lg">
              <MessageSquare size={20} className="text-primary" />
            </div>
            CHAT FEED
          </CardTitle>
          <div className="bg-muted/30 px-3 py-1 rounded-full border border-border/50">
            <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
              {comments.length} Messages
            </span>
          </div>
        </div>

        <form onSubmit={handleSearch} className="relative group">
          <Input
            placeholder="Search in this chat..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-muted/30 border-none focus-visible:ring-1 focus-visible:ring-primary/50 transition-all h-9 text-xs"
          />
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X size={14} />
            </button>
          )}
        </form>
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden pt-0">
        <ScrollArea className="h-[calc(100vh-320px)] pr-4">
          <div className="space-y-3">
            {comments.map((c) => (
              <div
                key={c.id}
                className="text-[13px] leading-relaxed flex gap-3 group items-start hover:bg-muted/30 p-2 rounded-lg transition-colors border border-transparent hover:border-border/10"
              >
                <span className="text-[10px] font-mono text-muted-foreground/60 tabular-nums shrink-0 pt-0.5">
                  {formatTime(c.content_offset_seconds)}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="font-bold text-primary mr-1.5 hover:underline cursor-pointer">
                    {c.commenter_display_name}
                  </span>
                  <span className="text-foreground/90 wrap-break-word">
                    {c.message}
                  </span>
                </div>
              </div>
            ))}

            {/* Infinite Scroll Sentinel */}
            <div
              ref={observerTarget}
              className="h-20 flex items-center justify-center"
            >
              {isFetchingNext && (
                <div className="flex items-center gap-2 text-muted-foreground animate-pulse">
                  <Loader2 className="animate-spin" size={16} />
                  <span className="text-[10px] font-bold uppercase tracking-widest">
                    Loading more...
                  </span>
                </div>
              )}
              {!hasNextPage && comments.length > 0 && (
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40">
                  End of chat
                </p>
              )}
              {loading && comments.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground animate-pulse w-full">
                  <Loader2
                    className="animate-spin mb-3 text-primary"
                    size={24}
                  />
                  <p className="text-[10px] font-bold uppercase tracking-widest">
                    Loading messages...
                  </p>
                </div>
              )}
              {!loading && comments.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground border-2 border-dashed border-border/50 rounded-xl w-full">
                  <Search size={32} className="mb-4 opacity-20" />
                  <p className="text-xs font-medium italic">
                    {activeSearch
                      ? `No matches for "${activeSearch}"`
                      : "This chat is empty"}
                  </p>
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
