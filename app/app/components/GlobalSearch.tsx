"use client";

import * as React from "react";
import {
  Search,
  Tag,
  Twitch,
  ExternalLink,
  Eye,
  Loader2,
  X,
  MessageSquare,
} from "lucide-react";
import { getComments, getStreamers, getCommentContext } from "../lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useSelector, useDispatch } from "react-redux";
import { RootState } from "../lib/store";
import {
  setSearchInput,
  setKeywords,
  setGroups,
  setLoading,
  setSearched,
  setTotalMatches,
  setStreamerFilter,
  setSearchProgress,
  setCanScanMore,
  setLastScannedPage,
  setIsScanningMore,
} from "../lib/store/features/searchSlice";

interface Comment {
  id: string;
  commenter_display_name: string;
  message: string;
  content_offset_seconds: number;
  video_id: string;
  video_title: string;
  video_streamer: string;
  video_created_at?: string;
}

interface Streamer {
  id: string;
  display_name: string;
}

interface ScoredComment extends Comment {
  score: number;
  matchedKeyword: string;
}

interface VideoGroup {
  video_id: string;
  video_title: string;
  video_streamer: string;
  video_created_at?: string;
  comments: ScoredComment[];
}

// ── Fuzzy similarity (Levenshtein-based) ──────────────────────────────────────
function levenshtein(a: string, b: string): number {
  const m = a.length,
    n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

function similarity(a: string, b: string): number {
  a = a.toLowerCase();
  b = b.toLowerCase();
  if (a === b) return 1;
  if (b.includes(a)) return 1;
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 1 : 1 - levenshtein(a, b) / maxLen;
}

function bestWordMatch(keyword: string, message: string): number {
  if (message.toLowerCase().includes(keyword.toLowerCase())) return 1;
  const words = message.toLowerCase().split(/\s+/);
  return Math.max(0, ...words.map((word) => similarity(keyword, word)));
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function twitchTimestampLink(videoId: string, seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const t = [h > 0 ? `${h}h` : "", m > 0 ? `${m}m` : "", `${s}s`].join("");
  return `https://www.twitch.tv/videos/${videoId}?t=${t}`;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0
    ? `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
    : `${m}:${s.toString().padStart(2, "0")}`;
}

const THRESHOLD = 0.7; // Lowered from 0.8 for better results

// ── Component ─────────────────────────────────────────────────────────────────
export function GlobalSearch() {
  const dispatch = useDispatch();
  const {
    input,
    keywords,
    groups,
    loading,
    searched,
    totalMatches,
    streamerFilter,
    searchProgress,
    canScanMore,
    lastScannedPage,
    isScanningMore,
  } = useSelector((state: RootState) => state.search);

  const [streamers, setStreamers] = React.useState<Streamer[]>([]);

  const [contextModalOpen, setContextModalOpen] = React.useState(false);
  const [contextComments, setContextComments] = React.useState<Comment[]>([]);
  const [contextLoading, setContextLoading] = React.useState(false);
  const [selectedContextMatch, setSelectedContextMatch] =
    React.useState<ScoredComment | null>(null);

  // Guard to prevent concurrent searches
  const searchInProgress = React.useRef(false);

  const setInput = (val: string) => dispatch(setSearchInput(val));

  const handleViewContext = async (match: ScoredComment) => {
    setSelectedContextMatch(match);
    setContextModalOpen(true);
    setContextLoading(true);
    setContextComments([]);
    try {
      const data = await getCommentContext(
        match.video_id,
        match.content_offset_seconds,
      );
      setContextComments(data);
    } catch (err) {
      console.error("Failed to load context:", err);
    } finally {
      setContextLoading(false);
    }
  };

  const saveKeywords = (kws: string[]) => {
    dispatch(setKeywords(kws));
  };

  const addKeyword = () => {
    const kw = input.trim().toLowerCase();
    if (!kw || keywords.includes(kw)) {
      setInput("");
      return;
    }
    saveKeywords([...keywords, kw]);
    setInput("");
  };

  const removeKeyword = (kw: string) =>
    saveKeywords(keywords.filter((k) => k !== kw));

  const handleSearch = React.useCallback(
    async (isLoadMore = false) => {
      if (keywords.length === 0) {
        dispatch(setLoading(false));
        dispatch(setIsScanningMore(false));
        return;
      }
      if (searchInProgress.current) return;
      searchInProgress.current = true;

      try {
        if (isLoadMore) {
          dispatch(setIsScanningMore(true));
        } else {
          dispatch(setLoading(true));
          dispatch(setGroups([]));
          dispatch(setTotalMatches(0));
          dispatch(setLastScannedPage(0));
        }

        dispatch(setSearched(true));
        const startPage = isLoadMore ? lastScannedPage + 1 : 1;

        const allMatches: ScoredComment[] = [];
        let page = startPage;
        let hasMoreOnServer = true;
        const BATCH_SIZE = 50;
        const ABSOLUTE_MAX_PAGES = 1000;

        while (hasMoreOnServer && page <= startPage + ABSOLUTE_MAX_PAGES - 1) {
          const data = await getComments({
            page,
            page_size: 500,
            video__streamer: streamerFilter || undefined,
          });
          const newBatch: Comment[] = data.results ?? [];
          hasMoreOnServer = !!data.next;

          dispatch(setLastScannedPage(page));
          dispatch(setCanScanMore(hasMoreOnServer));

          // Fuzzy filter ONLY the new batch (high performance)
          for (const c of newBatch) {
            if (!c.video_id) continue;
            let best = 0,
              bestKw = "";
            for (const kw of keywords) {
              const s = bestWordMatch(kw, c.message ?? "");
              if (s > best) {
                best = s;
                bestKw = kw;
              }
            }
            if (best >= THRESHOLD)
              allMatches.push({ ...c, score: best, matchedKeyword: bestKw });
          }

          // Stop loop if we found matches OR we reached a batch limit
          if (
            allMatches.length > 0 ||
            page - startPage + 1 >= BATCH_SIZE ||
            !!isLoadMore ||
            !hasMoreOnServer
          ) {
            break;
          }

          page++;
          dispatch(
            setSearchProgress(
              `Scanning database... Checked ${(page - startPage + 1) * 500} messages...`,
            ),
          );
        }

        if (allMatches.length === 0 && !isLoadMore) {
          dispatch(setGroups([]));
          return;
        }

        const newGroupsMap = new Map<string, VideoGroup>();

        // Merge with existing groups
        if (isLoadMore) {
          groups.forEach((g) =>
            newGroupsMap.set(g.video_id, { ...g, comments: [...g.comments] }),
          );
        }

        // Add/Merge new matches
        for (const c of allMatches) {
          if (!newGroupsMap.has(c.video_id)) {
            newGroupsMap.set(c.video_id, {
              video_id: c.video_id,
              video_title: c.video_title || `Video ${c.video_id}`,
              video_streamer: c.video_streamer || "Unknown",
              video_created_at: c.video_created_at,
              comments: [],
            });
          }
          // Avoid duplicates if same comment fetched twice
          const group = newGroupsMap.get(c.video_id)!;
          if (!group.comments.find((existing) => existing.id === c.id)) {
            group.comments.push(c);
          }
        }

        // Sort and update
        const grouped = [...newGroupsMap.values()].sort((a, b) => {
          const dateA = a.video_created_at
            ? new Date(a.video_created_at).getTime()
            : 0;
          const dateB = b.video_created_at
            ? new Date(b.video_created_at).getTime()
            : 0;
          return dateB - dateA;
        });

        grouped.forEach((g) =>
          g.comments.sort(
            (a, b) => a.content_offset_seconds - b.content_offset_seconds,
          ),
        );

        dispatch(setGroups(grouped));
        const totalFound = grouped.reduce(
          (acc, g) => acc + g.comments.length,
          0,
        );
        dispatch(setTotalMatches(totalFound));
      } catch (err) {
        console.error(err);
      } finally {
        searchInProgress.current = false;
        dispatch(setLoading(false));
        dispatch(setIsScanningMore(false));
        dispatch(setSearchProgress(""));
      }
    },
    [keywords, streamerFilter, dispatch, lastScannedPage, groups],
  );

  // Trigger search on mount if keywords are present (once)
  const hasTriggeredInitialSearch = React.useRef(false);
  React.useEffect(() => {
    if (
      !searched &&
      keywords.length > 0 &&
      !hasTriggeredInitialSearch.current
    ) {
      hasTriggeredInitialSearch.current = true;
      handleSearch();
    }
  }, [keywords, searched, handleSearch]);

  React.useEffect(() => {
    const init = async () => {
      const params = new URLSearchParams(window.location.search);
      const urlKw = params.get("keywords");
      let initialKeywords: string[] = [];
      if (urlKw) {
        initialKeywords = urlKw.split(",").filter(Boolean);
        dispatch(setKeywords(initialKeywords));
      }

      const urlStreamer = params.get("streamer");
      if (urlStreamer) {
        dispatch(setStreamerFilter(urlStreamer));
      }

      getStreamers().then((res) => {
        setStreamers(res.results || res);
      });
    };
    init();
  }, [dispatch]);

  // Intersection Observer for incremental scanning
  const searchObserverTarget = React.useRef(null);
  React.useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0].isIntersecting &&
          canScanMore &&
          !loading &&
          !isScanningMore &&
          searched
        ) {
          handleSearch(true);
        }
      },
      { threshold: 0.1, rootMargin: "400px" },
    );

    if (searchObserverTarget.current) {
      observer.observe(searchObserverTarget.current);
    }

    return () => observer.disconnect();
  }, [canScanMore, loading, isScanningMore, searched, handleSearch]);

  React.useEffect(() => {
    // We only want to sync to URL if we've initialized to avoid wiping it out on first render
    const params = new URLSearchParams(window.location.search);

    if (keywords.length > 0) {
      params.set("keywords", keywords.join(","));
    } else {
      params.delete("keywords");
    }

    if (streamerFilter) {
      params.set("streamer", streamerFilter);
    } else {
      params.delete("streamer");
    }

    const newUrl = `${window.location.pathname}${params.toString() ? "?" + params.toString() : ""}`;
    window.history.replaceState(null, "", newUrl);
  }, [keywords, streamerFilter]);

  return (
    <div className="space-y-6">
      {/* ── Keyword Manager ─────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tag size={18} className="text-primary" />
            Keyword Tracker
          </CardTitle>
          <CardDescription>
            Add keywords to monitor. Matches with ≥{Math.round(THRESHOLD * 100)}
            % similarity are shown, grouped by video.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder='Type a keyword and press Enter (e.g. "gg", "pog", "hack")...'
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addKeyword()}
            />
            <Button
              variant="outline"
              onClick={addKeyword}
              disabled={!input.trim()}
            >
              <Tag size={15} className="mr-1" /> Add
            </Button>
          </div>

          <div className="flex gap-2">
            <select
              className="flex h-10 w-full md:w-[250px] items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              value={streamerFilter}
              onChange={(e) => dispatch(setStreamerFilter(e.target.value))}
            >
              <option value="">Filter by: All Streamers</option>
              {streamers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.display_name}
                </option>
              ))}
            </select>
          </div>

          {keywords.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {keywords.map((kw) => (
                <Badge
                  key={kw}
                  variant="secondary"
                  className="gap-1.5 px-3 py-1 text-sm bg-primary/10 border-primary/20"
                >
                  {kw}
                  <button
                    onClick={() => removeKeyword(kw)}
                    className="ml-1 hover:text-destructive transition-colors"
                  >
                    <X size={11} />
                  </button>
                </Badge>
              ))}
            </div>
          ) : !loading ? (
            <p className="text-sm text-muted-foreground italic">
              No keywords yet — add some above.
            </p>
          ) : null}

          <Button
            className="w-full"
            onClick={() => handleSearch()}
            disabled={loading || keywords.length === 0}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin mr-2" />
                {searchProgress || "Scanning..."}
              </>
            ) : (
              <>
                <Search size={16} className="mr-2" />
                Search in All Chats ({keywords.length} keyword
                {keywords.length !== 1 ? "s" : ""})
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* ── Results grouped by video ─────────────────────────────── */}
      {searched && (
        <div className="space-y-4">
          {/* Summary bar */}
          {searched && (groups.length > 0 || (!loading && !isScanningMore)) && (
            <div className="flex items-center justify-between text-sm text-muted-foreground px-1">
              <span>
                {loading || isScanningMore ? (
                  <span className="animate-pulse">
                    Searching through library...
                  </span>
                ) : (
                  <>
                    Found{" "}
                    <strong className="text-foreground">{totalMatches}</strong>{" "}
                    message{totalMatches !== 1 ? "s" : ""} across{" "}
                    <strong className="text-foreground">{groups.length}</strong>{" "}
                    video{groups.length !== 1 ? "s" : ""}
                  </>
                )}
              </span>
            </div>
          )}

          {loading && groups.length === 0 ? (
            <Card>
              <CardContent className="py-20 flex flex-col items-center gap-3 text-muted-foreground">
                <Loader2 size={32} className="animate-spin text-primary" />
                <p className="text-sm font-medium">{searchProgress}</p>
                <p className="text-xs opacity-50">
                  This may take a few seconds depending on library size.
                </p>
              </CardContent>
            </Card>
          ) : groups.length === 0 && searched && !loading ? (
            <Card>
              <CardContent className="py-20 flex flex-col items-center gap-3 text-muted-foreground">
                <MessageSquare size={40} className="opacity-20" />
                <p className="text-sm italic">
                  No matches found with ≥{Math.round(THRESHOLD * 100)}%
                  similarity.
                </p>
              </CardContent>
            </Card>
          ) : (
            groups.map((group) => {
              return (
                <Card key={group.video_id} className="overflow-hidden">
                  {/* Video header */}
                  <CardHeader className="py-4 bg-muted/20">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="bg-purple-600/10 p-2 rounded-lg shrink-0">
                          <Twitch size={16} className="text-purple-500" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-sm truncate">
                            {group.video_title}
                          </p>
                          <p className="text-xs text-muted-foreground flex gap-2 items-center">
                            <span>@{group.video_streamer}</span>
                            {group.video_created_at && (
                              <>
                                <span>&bull;</span>
                                <span>
                                  {new Date(
                                    group.video_created_at,
                                  ).toLocaleDateString([], {
                                    year: "numeric",
                                    month: "short",
                                    day: "numeric",
                                  })}
                                </span>
                              </>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <Badge>
                          {group.comments.length} match
                          {group.comments.length !== 1 ? "es" : ""}
                        </Badge>
                        <a
                          href={`https://www.twitch.tv/videos/${group.video_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-[11px] text-purple-500 hover:text-purple-400 flex items-center gap-1 border border-purple-300 dark:border-purple-700 rounded px-2 py-0.5"
                        >
                          VOD <ExternalLink size={10} />
                        </a>
                      </div>
                    </div>
                  </CardHeader>

                  {/* Comments list (Always Open) */}
                  <CardContent className="pt-0 pb-4 px-4">
                    <div className="space-y-3">
                      {group.comments.map((c: ScoredComment, idx: number) => (
                        <div key={c.id}>
                          {idx > 0 && <Separator className="my-2" />}
                          <div className="flex items-start justify-between gap-2">
                            {/* Left: username + timestamp + badges */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-sm text-primary">
                                {c.commenter_display_name}
                              </span>
                              <span className="text-[11px] font-mono text-muted-foreground">
                                {formatTime(c.content_offset_seconds)}
                              </span>
                              <Badge
                                variant="outline"
                                className="text-[10px] font-mono px-1.5"
                              >
                                {Math.round(c.score * 100)}%
                              </Badge>
                              <Badge
                                variant="secondary"
                                className="text-[10px]"
                              >
                                {c.matchedKeyword}
                              </Badge>
                            </div>
                            {/* Right: Actions */}
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                onClick={() => handleViewContext(c)}
                                className="flex items-center gap-1.5 shrink-0 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-500 border border-blue-300 dark:border-blue-700 rounded px-2 py-0.5 hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors"
                              >
                                <Eye size={11} /> Context
                              </button>
                              <a
                                href={twitchTimestampLink(
                                  c.video_id,
                                  c.content_offset_seconds,
                                )}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 shrink-0 text-[11px] font-semibold text-purple-600 dark:text-purple-400 hover:text-purple-500 border border-purple-300 dark:border-purple-700 rounded px-2 py-0.5 hover:bg-purple-50 dark:hover:bg-purple-950 transition-colors"
                              >
                                <Twitch size={11} />
                                Watch
                                <ExternalLink size={10} />
                              </a>
                            </div>
                          </div>
                          <p className="text-sm text-foreground/90 mt-1.5 leading-relaxed">
                            {c.message}
                          </p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}

          {/* Incremental Scan Sentinel */}
          <div
            ref={searchObserverTarget}
            className="py-16 flex flex-col items-center justify-center gap-4"
          >
            {isScanningMore && (
              <div className="flex flex-col items-center gap-3 text-muted-foreground animate-in fade-in slide-in-from-bottom-2 duration-300 bg-card border border-border/50 px-8 py-4 rounded-2xl shadow-xl">
                <Loader2 size={24} className="animate-spin text-primary" />
                <div className="text-center">
                  <p className="text-sm font-black uppercase tracking-widest text-foreground">
                    Scanning more VODs...
                  </p>
                  <p className="text-[11px] font-medium opacity-60 mt-1 italic">
                    {searchProgress}
                  </p>
                </div>
              </div>
            )}
            {!canScanMore &&
              searched &&
              groups.length > 0 &&
              !loading &&
              !isScanningMore && (
                <div className="flex flex-col items-center gap-2 opacity-30">
                  <Separator className="w-24 mb-2" />
                  <p className="text-[10px] font-black uppercase tracking-[0.2em]">
                    End of trackable library
                  </p>
                </div>
              )}
          </div>
        </div>
      )}

      {/* Context Dialog */}
      <Dialog open={contextModalOpen} onOpenChange={setContextModalOpen}>
        <DialogContent className="max-w-2xl h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Chat Context</DialogTitle>
            <DialogDescription>
              Viewing chat messages surrounding the matched comment in{" "}
              <span className="font-semibold text-foreground">
                {selectedContextMatch?.video_title}
              </span>
              .
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-hidden mt-4">
            {contextLoading ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-3">
                <Loader2 size={32} className="animate-spin" />
                <p>Loading context...</p>
              </div>
            ) : (
              <ScrollArea className="h-full pr-4">
                <div className="space-y-4">
                  {contextComments.length === 0 && (
                    <p className="text-center text-muted-foreground text-sm py-12">
                      No surrounding comments found.
                    </p>
                  )}
                  {contextComments.map((ctxComment) => {
                    const isTarget = ctxComment.id === selectedContextMatch?.id;
                    return (
                      <div
                        key={ctxComment.id}
                        className={`p-3 rounded-lg border text-sm transition-colors ${
                          isTarget
                            ? "bg-primary/10 border-primary"
                            : "bg-card border-border"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`font-bold ${isTarget ? "text-primary" : ""}`}
                          >
                            {ctxComment.commenter_display_name}
                          </span>
                          <span className="text-xs font-mono text-muted-foreground">
                            {formatTime(ctxComment.content_offset_seconds)}
                          </span>
                          {isTarget && (
                            <Badge
                              variant="default"
                              className="text-[10px] ml-auto"
                            >
                              Matched Comment
                            </Badge>
                          )}
                        </div>
                        <p
                          className={`leading-relaxed ${isTarget ? "font-medium" : "text-card-foreground/90"}`}
                        >
                          {ctxComment.message}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
