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
  Sparkles,
  ChevronDown,
  RotateCcw,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import {
  getComments,
  getStreamers,
  getCommentContext,
  getTranscripts,
  getAliases,
} from "../lib/api";
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
  setExcludedUsersInput,
  setExcludedUsers,
  setGroups,
  setLoading,
  setSearched,
  setTotalMatches,
  setStreamerFilter,
  setSearchProgress,
  setCanScanMore,
  setLastScannedPage,
  setIsScanningMore,
  setToxicOnly,
  setToxicityThreshold,
  setOnlyTranscripts,
  clearSearchCache,
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
  is_toxic?: boolean;
  toxicity_score?: number;
}

interface Streamer {
  id: string;
  display_name: string;
}

interface ScoredComment extends Comment {
  score: number;
  matchedKeyword: string;
}

interface TranscriptMatch {
  id: string;
  video_id: string;
  video_title: string;
  video_streamer: string;
  video_created_at?: string;
  start_seconds: number;
  text: string;
  score: number;
  matchedKeyword: string;
}

interface VideoGroup {
  video_id: string;
  video_title: string;
  video_streamer: string;
  video_created_at?: string;
  comments: ScoredComment[];
  transcripts: TranscriptMatch[];
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
  const kLower = keyword.toLowerCase();
  const mLower = message.toLowerCase();
  if (mLower.includes(kLower)) return 1;

  // Clean punctuation but keep spaces to split words
  const cleanKeyword = kLower.replace(/[^\w\s]/g, "");
  const cleanMessage = mLower.replace(/[^\w\s]/g, "");

  if (cleanMessage.includes(cleanKeyword)) return 1;

  const mWords = cleanMessage.split(/\s+/).filter(Boolean);
  const kWords = cleanKeyword.split(/\s+/).filter(Boolean);

  if (mWords.length === 0 || kWords.length === 0) return 0;

  // Single word keyword: check against all words in message
  if (kWords.length === 1) {
    return Math.max(0, ...mWords.map((word) => similarity(cleanKeyword, word)));
  }

  // Multi-word keyword: assess full string similarity, and also check word against word
  return Math.max(
    similarity(cleanKeyword, cleanMessage),
    ...mWords.map((word) => similarity(cleanKeyword, word)),
  );
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

// Generate 4-char n-grams from a keyword so backend icontains pre-filter
// catches near-typos (e.g. "guldasan" → ngrams match "guldansan")
function getSearchTerms(keyword: string): string[] {
  const clean = keyword.toLowerCase().replace(/[^\w]/g, "");
  if (clean.length <= 4) return [clean];
  const ngrams = new Set<string>([clean]);
  for (let i = 0; i <= clean.length - 4; i++) {
    ngrams.add(clean.slice(i, i + 4));
  }
  return [...ngrams];
}

// Given a list of keywords + alias table, returns a Map<expandedTerm, originalKeyword>
// so backend searches also cover alias expansions and we can attribute matches back.
// Searching a canonical OR any alias expands to ALL aliases of that canonical.
function buildExpansionMap(
  keywords: string[],
  aliases: { alias: string; canonical_name: string }[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const kw of keywords) {
    map.set(kw.toLowerCase(), kw);

    // Collect all canonical names this keyword resolves to
    const canonicals = new Set<string>();
    for (const a of aliases) {
      if (a.alias.toLowerCase() === kw.toLowerCase()) {
        canonicals.add(a.canonical_name.toLowerCase());
        map.set(a.canonical_name.toLowerCase(), kw);
      }
      if (a.canonical_name.toLowerCase() === kw.toLowerCase()) {
        canonicals.add(a.canonical_name.toLowerCase());
      }
    }

    // Expand all aliases of every resolved canonical
    for (const canonical of canonicals) {
      for (const a of aliases) {
        if (a.canonical_name.toLowerCase() === canonical) {
          map.set(a.alias.toLowerCase(), kw);
        }
      }
    }
  }
  return map;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function GlobalSearch() {
  const dispatch = useDispatch();
  const {
    input,
    keywords,
    excludedUsersInput,
    excludedUsers,
    groups,
    loading,
    searched,
    totalMatches,
    streamerFilter,
    searchProgress,
    canScanMore,
    lastScannedPage,
    isScanningMore,
    toxicOnly,
    toxicityThreshold,
    onlyTranscripts,
  } = useSelector((state: RootState) => state.search);

  const searchParams = useSearchParams();
  const [streamers, setStreamers] = React.useState<Streamer[]>([]);
  const [aliases, setAliases] = React.useState<{ alias: string; canonical_name: string }[]>([]);

  // Sentinel ref for infinite scroll
  const sentinelRef = React.useRef<HTMLDivElement>(null);

  // Stable refs to avoid recreating searchWithFilter on every state change
  const groupsRef = React.useRef(groups);
  groupsRef.current = groups;
  const lastScannedPageRef = React.useRef(lastScannedPage);
  lastScannedPageRef.current = lastScannedPage;

  // Accordion state: set of expanded video_ids
  const [expandedGroups, setExpandedGroups] = React.useState<Set<string>>(
    new Set(),
  );

  const toggleGroup = (videoId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(videoId)) next.delete(videoId);
      else next.add(videoId);
      return next;
    });
  };

  // Auto-expand groups when new results arrive
  React.useEffect(() => {
    if (groups.length > 0) {
      setExpandedGroups((prev) => {
        const next = new Set(prev);
        // Only auto-expand the first group if nothing is expanded yet
        if (next.size === 0) next.add(groups[0].video_id);
        return next;
      });
    }
  }, [groups]);

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

  const setExcludedInput = (val: string) =>
    dispatch(setExcludedUsersInput(val));

  const saveExcludedUsers = (users: string[]) => {
    dispatch(setExcludedUsers(users));
  };

  const addExcludedUser = () => {
    const u = excludedUsersInput.trim().toLowerCase();
    if (!u || excludedUsers.includes(u)) {
      setExcludedInput("");
      return;
    }
    saveExcludedUsers([...excludedUsers, u]);
    setExcludedInput("");
  };

  const removeExcludedUser = (u: string) =>
    saveExcludedUsers(excludedUsers.filter((x) => x !== u));

  // searchWithFilter lets us run a fresh search with an explicit streamer value
  // without relying on the Redux state (which might not have updated yet).
  const searchWithFilter = React.useCallback(
    async (isLoadMore = false, filterOverride?: string) => {
      const activeFilter =
        filterOverride !== undefined ? filterOverride : streamerFilter;

      if (keywords.length === 0 && !toxicOnly) {
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
        const startPage = isLoadMore ? lastScannedPageRef.current + 1 : 1;

        const allCommentMatches: ScoredComment[] = [];
        const allTranscriptMatches: TranscriptMatch[] = [];
        let page = startPage;
        let hasMoreOnServer = true;
        // Scan enough pages to cover multiple VODs; infinite scroll loads even more
        const BATCH_SIZE = isLoadMore ? 15 : 10;

        // Expand keywords with aliases (e.g. "gds" → also search "guldasan")
        const expansionMap = buildExpansionMap(keywords, aliases);
        const expandedTerms = [...expansionMap.keys()];

        while (hasMoreOnServer && page <= startPage + BATCH_SIZE - 1) {
          // 1. Fetch Comments
          // .catch handles 404 from DRF when page is out of range
          const emptyPage = { results: [], next: null };
          const commentPromise = !onlyTranscripts
            ? getComments({
                page,
                page_size: 500,
                search_or: expandedTerms.flatMap(getSearchTerms).join(","),
                exclude_users: excludedUsers.join(","),
                min_toxicity: toxicOnly ? toxicityThreshold : undefined,
                video__streamer: activeFilter || undefined,
              }).catch(() => emptyPage)
            : Promise.resolve(emptyPage);

          // 2. Fetch Transcripts (only if keywords are present and not in toxicOnly mode)
          const transcriptPromise =
            keywords.length > 0
              ? getTranscripts({
                  page,
                  page_size: 500,
                  search_or: expandedTerms.join(","),
                  streamer: activeFilter || undefined,
                }).catch(() => emptyPage)
              : Promise.resolve(emptyPage);

          const [commentData, transcriptData] = await Promise.all([
            commentPromise,
            transcriptPromise,
          ]);

          const newCommentBatch: Comment[] = commentData.results ?? [];
          const newTranscriptBatch: {
            id: string;
            video: string;
            video_title: string;
            streamer_name: string;
            video_created_at: string;
            start_seconds: number;
            text: string;
          }[] = transcriptData.results ?? transcriptData ?? [];
          hasMoreOnServer = !!commentData.next || !!transcriptData.next;

          // Fuzzy filter Comments
          for (const c of newCommentBatch) {
            if (!c.video_id) continue;
            let best = 0,
              bestKw = "";
            for (const term of expandedTerms) {
              const msgMatch = bestWordMatch(term, c.message ?? "");
              const nameMatch = bestWordMatch(term, c.commenter_display_name ?? "");
              const s = Math.max(msgMatch, nameMatch);
              if (s > best) {
                best = s;
                bestKw = expansionMap.get(term) ?? term;
              }
            }
            if (keywords.length === 0 && toxicOnly) {
              allCommentMatches.push({
                ...c,
                score: 1,
                matchedKeyword: "Toxic Comment",
              });
            } else if (best >= THRESHOLD) {
              allCommentMatches.push({
                ...c,
                score: best,
                matchedKeyword: bestKw,
              });
            }
          }

          // Fuzzy filter Transcripts
          for (const t of newTranscriptBatch) {
            let best = 0,
              bestKw = "";
            for (const term of expandedTerms) {
              const s = bestWordMatch(term, t.text ?? "");
              if (s > best) {
                best = s;
                bestKw = expansionMap.get(term) ?? term;
              }
            }
            if (best >= THRESHOLD) {
              allTranscriptMatches.push({
                id: `ts-${t.id}`,
                video_id: t.video,
                video_title: t.video_title,
                video_streamer: t.streamer_name,
                video_created_at: t.video_created_at,
                start_seconds: t.start_seconds,
                text: t.text,
                score: best,
                matchedKeyword: bestKw,
              });
            }
          }

          dispatch(setLastScannedPage(page));
          dispatch(setCanScanMore(hasMoreOnServer));

          if (!hasMoreOnServer) {
            break;
          }

          page++;
          dispatch(
            setSearchProgress(
              `Scanning page ${page}... (${allCommentMatches.length + allTranscriptMatches.length} matches so far)`,
            ),
          );
        }

        const newGroupsMap = new Map<string, VideoGroup>();

        if (isLoadMore) {
          groupsRef.current.forEach((g) =>
            newGroupsMap.set(g.video_id, {
              ...g,
              comments: [...g.comments],
              transcripts: [...(g.transcripts || [])],
            }),
          );
        }

        // Add Comment Matches
        for (const c of allCommentMatches) {
          if (!newGroupsMap.has(c.video_id)) {
            newGroupsMap.set(c.video_id, {
              video_id: c.video_id,
              video_title: c.video_title || `Video ${c.video_id}`,
              video_streamer: c.video_streamer || "Unknown",
              video_created_at: c.video_created_at,
              comments: [],
              transcripts: [],
            });
          }
          const group = newGroupsMap.get(c.video_id)!;
          if (!group.comments.find((existing) => existing.id === c.id)) {
            group.comments.push(c);
          }
        }

        // Add Transcript Matches
        for (const t of allTranscriptMatches) {
          if (!newGroupsMap.has(t.video_id)) {
            newGroupsMap.set(t.video_id, {
              video_id: t.video_id,
              video_title: t.video_title || `Video ${t.video_id}`,
              video_streamer: t.video_streamer || "Unknown",
              video_created_at: t.video_created_at,
              comments: [],
              transcripts: [],
            });
          }
          const group = newGroupsMap.get(t.video_id)!;
          if (!group.transcripts.find((existing) => existing.id === t.id)) {
            group.transcripts.push(t);
          }
        }

        const grouped = [...newGroupsMap.values()].sort((a, b) => {
          const dateA = a.video_created_at
            ? new Date(a.video_created_at).getTime()
            : 0;
          const dateB = b.video_created_at
            ? new Date(b.video_created_at).getTime()
            : 0;
          return dateB - dateA;
        });

        grouped.forEach((g) => {
          g.comments.sort(
            (a, b) => a.content_offset_seconds - b.content_offset_seconds,
          );
          g.transcripts.sort((a, b) => a.start_seconds - b.start_seconds);
        });

        dispatch(setGroups(grouped));
        const totalFound = grouped.reduce(
          (acc, g) => acc + g.comments.length + g.transcripts.length,
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
    // groups and lastScannedPage accessed via refs to keep this callback stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      keywords,
      streamerFilter,
      dispatch,
      excludedUsers,
      toxicOnly,
      toxicityThreshold,
      onlyTranscripts,
    ],
  );

  // Convenience alias — keeps existing call-sites working
  const handleSearch = React.useCallback(
    (isLoadMore = false) => searchWithFilter(isLoadMore),
    [searchWithFilter],
  );

  React.useEffect(() => {
    const init = async () => {
      const urlKw = searchParams.get("keywords") || searchParams.get("keyword");
      let initialKeywords: string[] = [];
      if (urlKw) {
        initialKeywords = urlKw.split(",").filter(Boolean);
        dispatch(setKeywords(initialKeywords));
      }

      const urlExcluded = searchParams.get("excluded");
      if (urlExcluded) {
        dispatch(setExcludedUsers(urlExcluded.split(",").filter(Boolean)));
      }

      const urlStreamer = searchParams.get("streamer");
      if (urlStreamer) {
        dispatch(setStreamerFilter(urlStreamer));
      }

      getStreamers().then((res) => {
        setStreamers(res.results || res);
      });
      getAliases().then(setAliases).catch(() => null);
    };
    init();
  }, [dispatch, searchParams]);

  React.useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());

    if (keywords.length > 0) {
      params.set("keywords", keywords.join(","));
      params.delete("keyword"); // Clean up singular keyword if we have plural
    } else {
      params.delete("keywords");
    }

    if (excludedUsers.length > 0) {
      params.set("excluded", excludedUsers.join(","));
    } else {
      params.delete("excluded");
    }

    if (streamerFilter) {
      params.set("streamer", streamerFilter);
    } else {
      params.delete("streamer");
    }

    const newUrl = `${window.location.pathname}${params.toString() ? "?" + params.toString() : ""}`;
    window.history.replaceState(null, "", newUrl);
  }, [keywords, streamerFilter, searchParams, excludedUsers]);

  // When 0 matches so far but more pages exist, auto-continue scanning
  // (sentinel can't be used — it would be immediately visible and loop)
  React.useEffect(() => {
    if (!canScanMore || loading || isScanningMore || !searched) return;
    if (groups.length > 0) return; // handled by IntersectionObserver below
    const timer = setTimeout(() => handleSearch(true), 300);
    return () => clearTimeout(timer);
  }, [canScanMore, loading, isScanningMore, searched, groups.length, handleSearch]);

  // Infinite scroll: auto-load more when sentinel enters viewport
  // Only active when there are already results pushing sentinel below fold
  React.useEffect(() => {
    if (!canScanMore || loading || isScanningMore || !searched) return;
    if (groups.length === 0) return; // use auto-continue effect above instead

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          handleSearch(true);
        }
      },
      { threshold: 0.1 },
    );

    const sentinel = sentinelRef.current;
    if (sentinel) observer.observe(sentinel);
    return () => observer.disconnect();
  }, [canScanMore, loading, isScanningMore, searched, groups.length, handleSearch]);

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
        <CardContent className="space-y-3">
          {/* ── Keyword input ── */}
          <div className="flex gap-2">
            <Input
              placeholder='Add keyword and press Enter (e.g. "gg", "pog", "hack")...'
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addKeyword()}
              className="h-10"
            />
            <Button
              variant="outline"
              onClick={addKeyword}
              disabled={!input.trim()}
              className="shrink-0 h-10"
            >
              <Tag size={14} className="mr-1.5" /> Add
            </Button>
          </div>

          {/* ── Options row: streamer + toxic + exclude ── */}
          <div className="flex flex-wrap gap-2 items-center">
            {/* Streamer filter */}
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              value={streamerFilter}
              onChange={(e) => dispatch(setStreamerFilter(e.target.value))}
            >
              <option value="">All Streamers</option>
              {streamers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.display_name}
                </option>
              ))}
            </select>

            {/* Toxic toggle */}
            <button
              onClick={() => dispatch(setToxicOnly(!toxicOnly))}
              className={`h-9 px-3 rounded-md border text-xs font-bold transition-colors ${
                toxicOnly
                  ? "bg-red-500/10 border-red-500/30 text-red-500"
                  : "border-input text-muted-foreground hover:text-foreground"
              }`}
            >
              🔴 Toxic Only
            </button>

            {/* Only Transcripts toggle */}
            <button
              onClick={() => dispatch(setOnlyTranscripts(!onlyTranscripts))}
              className={`h-9 px-3 rounded-md border text-xs font-bold transition-colors ${
                onlyTranscripts
                  ? "bg-purple-500/10 border-purple-500/30 text-purple-600"
                  : "border-input text-muted-foreground hover:text-foreground"
              }`}
            >
              🎙️ Said by Streamer
            </button>

            {/* Threshold — only when toxic */}
            {toxicOnly && (
              <select
                value={toxicityThreshold}
                onChange={(e) =>
                  dispatch(setToxicityThreshold(Number(e.target.value)))
                }
                className="h-9 bg-red-500/5 border border-red-500/20 text-xs font-bold rounded-md px-2 focus:outline-none text-red-500 cursor-pointer"
              >
                <option value={70}>≥70%</option>
                <option value={80}>≥80%</option>
                <option value={90}>≥90%</option>
              </select>
            )}

            {/* Exclude users — compact inline */}
            <div className="flex gap-1 ml-auto">
              <Input
                placeholder="Exclude user..."
                value={excludedUsersInput}
                onChange={(e) => setExcludedInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addExcludedUser()}
                className="h-9 w-36 text-xs"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={addExcludedUser}
                disabled={!excludedUsersInput.trim()}
                className="h-9 px-2 text-muted-foreground hover:text-destructive"
                title="Exclude user"
              >
                <X size={14} />
              </Button>
            </div>
          </div>

          {/* ── Chips: keywords + excluded users ── */}
          {(keywords.length > 0 || excludedUsers.length > 0) && (
            <div className="flex flex-wrap gap-1.5 p-2 bg-muted/20 rounded-lg border border-border/40">
              {keywords.map((kw) => (
                <Badge
                  key={kw}
                  variant="secondary"
                  className="gap-1 bg-primary/10 border-primary/20 text-xs"
                >
                  <Tag size={10} className="text-primary" />
                  {kw}
                  <button
                    onClick={() => removeKeyword(kw)}
                    className="ml-0.5 hover:text-destructive"
                  >
                    <X size={10} />
                  </button>
                </Badge>
              ))}
              {excludedUsers.map((u) => (
                <Badge
                  key={u}
                  variant="secondary"
                  className="gap-1 bg-destructive/10 border-destructive/20 text-destructive text-xs"
                >
                  <X size={10} />
                  {u}
                  <button
                    onClick={() => removeExcludedUser(u)}
                    className="ml-0.5 hover:opacity-70"
                  >
                    <X size={10} />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          {/* ── Search button ── */}
          <Button
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 transition-all active:scale-[0.98]"
            onClick={() => handleSearch()}
            disabled={loading || (keywords.length === 0 && !toxicOnly)}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin mr-2" />
                {searchProgress || "Scanning..."}
              </>
            ) : (
              <>
                <Search size={16} className="mr-2" />
                {streamerFilter
                  ? `Search in @${streamers.find((s) => s.id === streamerFilter)?.display_name || "Streamer"}'s Chats`
                  : "Search in All Chats"}
                {keywords.length > 0
                  ? ` (${keywords.length} keyword${keywords.length !== 1 ? "s" : ""})`
                  : toxicOnly
                    ? " (Toxic only)"
                    : ""}
                {onlyTranscripts ? " (Transcripts only)" : ""}
              </>
            )}
          </Button>

          {/* ── Clear cache link ── */}
          <div className="flex justify-end">
            <button
              onClick={clearSearchCache}
              className="text-xs text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1"
            >
              <RotateCcw size={10} />
              Clear search cache
            </button>
          </div>
        </CardContent>
      </Card>

      {/* ── Results grouped by video ─────────────────────────────── */}
      {searched && (
        <div className="space-y-4">
          {/* Summary bar — always shown once searched to avoid flicker */}
          {searched && (
            <div className="flex items-center justify-between text-sm px-1">
              <div className="flex items-center gap-3">
                {loading || isScanningMore ? (
                  <div className="flex items-center gap-2 text-primary">
                    <div className="relative">
                      <Loader2 size={16} className="animate-spin" />
                    </div>
                    <span className="font-medium animate-pulse">
                      Scanning through library...
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-4 text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <MessageSquare size={14} className="text-primary" />
                      <strong className="text-foreground">
                        {totalMatches}
                      </strong>
                      <span>match{totalMatches !== 1 ? "es" : ""}</span>
                    </div>
                    <span className="text-border">|</span>
                    <div className="flex items-center gap-1.5">
                      <Twitch size={14} className="text-purple-500" />
                      <strong className="text-foreground">
                        {groups.length}
                      </strong>
                      <span>video{groups.length !== 1 ? "s" : ""}</span>
                    </div>
                    {canScanMore && (
                      <>
                        <span className="text-border">|</span>
                        <span className="text-[11px] text-amber-500 dark:text-amber-400 font-semibold animate-pulse">
                          ↓ older VODs not yet scanned
                        </span>
                      </>
                    )}
                    {streamerFilter && (
                      <>
                        <span className="text-border">|</span>
                        <Badge
                          variant="secondary"
                          className="text-[10px] gap-1"
                        >
                          Filtered:{" "}
                          {streamers.find((s) => s.id === streamerFilter)
                            ?.display_name || "Streamer"}
                          <button
                            onClick={() => {
                              dispatch(setStreamerFilter(""));
                              searchWithFilter(false, "");
                            }}
                            className="ml-1 hover:text-destructive"
                          >
                            <X size={10} />
                          </button>
                        </Badge>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Loading Progress */}
          {loading && (
            <div className="relative overflow-hidden rounded-xl border bg-card">
              {/* Animated gradient top bar */}
              <div className="h-1 w-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-linear-to-r from-primary/0 via-primary to-primary/0 animate-shimmer"
                  style={{
                    width: "200%",
                    animation: "shimmer 1.5s infinite linear",
                  }}
                />
              </div>
              <div className="p-8 flex flex-col items-center gap-4">
                <div className="relative">
                  <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping" />
                  <div className="relative bg-primary/10 p-4 rounded-full">
                    <Search size={28} className="text-primary" />
                  </div>
                </div>
                <div className="text-center space-y-1">
                  <p className="font-semibold text-foreground">
                    {searchProgress || "Initializing search..."}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Fuzzy matching with ≥{Math.round(THRESHOLD * 100)}%
                    similarity threshold
                  </p>
                </div>
              </div>

              {/* Skeleton cards preview */}
              {groups.length === 0 && (
                <div className="px-4 pb-4 space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-border/50 p-4 animate-pulse"
                      style={{ animationDelay: `${i * 150}ms` }}
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-8 h-8 rounded-lg bg-muted" />
                        <div className="flex-1 space-y-1.5">
                          <div className="h-3.5 bg-muted rounded w-2/3" />
                          <div className="h-2.5 bg-muted rounded w-1/3" />
                        </div>
                        <div className="h-5 w-16 bg-muted rounded-full" />
                      </div>
                      <div className="space-y-2 pl-11">
                        <div className="h-2.5 bg-muted/60 rounded w-full" />
                        <div className="h-2.5 bg-muted/40 rounded w-4/5" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* No results — only shown once all pages are exhausted */}
          {groups.length === 0 && searched && !loading && !isScanningMore && !canScanMore && (
            <Card className="border-dashed">
              <CardContent className="py-16 flex flex-col items-center gap-4 text-muted-foreground">
                <div className="bg-muted/50 p-4 rounded-full">
                  <MessageSquare size={32} className="opacity-30" />
                </div>
                <div className="text-center space-y-1">
                  <p className="font-medium text-foreground/70">
                    No matches found
                  </p>
                  <p className="text-sm">
                    No messages matched with ≥{Math.round(THRESHOLD * 100)}%
                    similarity. Try different keywords or remove the streamer
                    filter.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Results cards */}
          {groups.length > 0 && (
            <div className="space-y-4">
              {groups.map((group, groupIdx) => {
                const matchCount = group.comments.length + group.transcripts.length;
                const isSmall = matchCount <= 10;
                const isExpanded = isSmall || expandedGroups.has(group.video_id);
                return (
                <Card
                  key={group.video_id}
                  className="overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300 border-border/60 hover:border-border transition-colors"
                  style={{ animationDelay: `${groupIdx * 50}ms` }}
                >
                  {/* Video header — click to expand/collapse (only for >10 matches) */}
                  <CardHeader
                    className={`py-4 bg-linear-to-r from-muted/30 to-transparent transition-colors ${isSmall ? "" : "cursor-pointer select-none hover:bg-muted/30"}`}
                    onClick={isSmall ? undefined : () => toggleGroup(group.video_id)}
                  >
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
                        <Badge className="bg-primary/10 text-primary hover:bg-primary/20 border-none shrink-0">
                          {group.comments.length + group.transcripts.length}{" "}
                          matches
                        </Badge>
                        <a
                          href={`https://www.twitch.tv/videos/${group.video_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-[11px] text-purple-500 hover:text-purple-400 flex items-center gap-1 border border-purple-300 dark:border-purple-700 rounded px-2 py-0.5 hover:bg-purple-50 dark:hover:bg-purple-950 transition-colors"
                        >
                          VOD <ExternalLink size={10} />
                        </a>
                        {!isSmall && (
                        <ChevronDown
                          size={16}
                          className={`text-muted-foreground transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                        />
                        )}
                      </div>
                    </div>
                  </CardHeader>

                  {/* Results list — only rendered when expanded */}
                  {isExpanded && (
                  <CardContent className="pt-0 pb-4 px-4 overflow-hidden">
                    <div className="space-y-4">
                      {/* Comments Section */}
                      {group.comments.length > 0 && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 mb-1">
                            <MessageSquare
                              size={12}
                              className="text-primary/50"
                            />
                            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/50">
                              Chat Mentions
                            </span>
                          </div>
                          {group.comments.map(
                            (c: ScoredComment, idx: number) => (
                              <div key={c.id}>
                                {idx > 0 && (
                                  <Separator className="my-2 opacity-50" />
                                )}
                                <div className="flex items-start justify-between gap-2">
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
                                    {c.toxicity_score !== undefined &&
                                      c.toxicity_score >= 0.8 && (
                                        <Badge
                                          variant="destructive"
                                          className="text-[10px]"
                                        >
                                          Toxic
                                        </Badge>
                                      )}
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <button
                                      onClick={() => handleViewContext(c)}
                                      className="flex items-center gap-1.5 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-500 border border-blue-300 dark:border-blue-700 rounded px-2 py-0.5 hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors"
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
                                      className="flex items-center gap-1.5 text-[11px] font-semibold text-purple-600 dark:text-purple-400 hover:text-purple-500 border border-purple-300 dark:border-purple-700 rounded px-2 py-0.5 hover:bg-purple-50 dark:hover:bg-purple-950 transition-colors"
                                    >
                                      <Twitch size={11} /> Watch{" "}
                                      <ExternalLink size={10} />
                                    </a>
                                  </div>
                                </div>
                                <p className="text-sm text-foreground/90 mt-1.5 leading-relaxed">
                                  {c.message}
                                </p>
                              </div>
                            ),
                          )}
                        </div>
                      )}

                      {/* Transcripts Section */}
                      {group.transcripts && group.transcripts.length > 0 && (
                        <div className="space-y-3 pt-2 border-t mt-4 border-dashed">
                          <div className="flex items-center gap-2 mb-1">
                            <Sparkles
                              size={12}
                              className="text-purple-500/50"
                            />
                            <span className="text-[10px] font-black uppercase tracking-widest text-purple-500/50">
                              Said by Streamer
                            </span>
                          </div>
                          {group.transcripts.map((t: TranscriptMatch) => (
                            <div
                              key={t.id}
                              className="bg-purple-500/5 dark:bg-purple-500/10 p-3 rounded-xl border border-purple-500/10"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Badge className="bg-purple-600 text-white border-none text-[9px] font-black h-4 px-1.5 uppercase tracking-tighter shadow-sm">
                                    VOD TRANSCRIPT
                                  </Badge>
                                  <span className="text-[11px] font-mono text-purple-600/70 dark:text-purple-400/70 font-bold">
                                    {formatTime(t.start_seconds)}
                                  </span>
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] font-mono px-1.5 border-purple-500/30 text-purple-600 dark:text-purple-400"
                                  >
                                    {Math.round(t.score * 100)}%
                                  </Badge>
                                  <Badge
                                    variant="secondary"
                                    className="text-[10px] bg-purple-500/20 text-purple-700 dark:text-purple-300 border-none"
                                  >
                                    {t.matchedKeyword}
                                  </Badge>
                                </div>
                                <a
                                  href={twitchTimestampLink(
                                    t.video_id,
                                    Math.floor(t.start_seconds),
                                  )}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1.5 text-[11px] font-semibold text-purple-600 dark:text-purple-400 hover:text-purple-500 border border-purple-300 dark:border-purple-700 rounded px-2 py-0.5 hover:bg-purple-50 dark:hover:bg-purple-950 transition-colors shrink-0"
                                >
                                  <Twitch size={11} /> Watch{" "}
                                  <ExternalLink size={10} />
                                </a>
                              </div>
                              <p className="text-sm text-foreground/90 mt-2 font-medium italic leading-relaxed">
                                &quot;{t.text}&quot;
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                  )}
                </Card>
                );
              })}
            </div>
          )}

          {/* Infinite scroll sentinel — only shown when results exist (avoids loop when 0 matches) */}
          {canScanMore && !loading && !isScanningMore && groups.length > 0 && (
            <div
              ref={sentinelRef}
              className="py-6 flex items-center justify-center gap-2 text-xs text-muted-foreground/60 font-medium"
            >
              <Loader2 size={13} className="animate-spin opacity-40" />
              <span>Scroll down to load older VODs...</span>
            </div>
          )}

          {/* Incremental Scan Status — only shown when there are results above (avoids flicker) */}
          {(loading || isScanningMore) && groups.length > 0 && (
            <div className="py-12 flex flex-col items-center justify-center gap-4">
              <div className="flex flex-col items-center gap-4 text-muted-foreground animate-in fade-in slide-in-from-bottom-2 duration-300 bg-card border border-border/50 px-10 py-8 rounded-3xl shadow-2xl min-w-[300px]">
                <div className="bg-primary/10 p-4 rounded-full animate-pulse">
                  <Loader2 size={32} className="animate-spin text-primary" />
                </div>
                <div className="text-center">
                  <p className="text-md font-bold text-foreground">
                    {isScanningMore
                      ? "Searching in older VODs..."
                      : "Initializing Library Search..."}
                  </p>
                  {searchProgress && (
                    <p className="text-xs opacity-60 mt-1 font-mono">
                      {searchProgress}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {!canScanMore &&
            searched &&
            groups.length > 0 &&
            !loading &&
            !isScanningMore && (
              <div className="py-12 flex flex-col items-center gap-2 opacity-30">
                <Separator className="w-24 mb-2" />
                <p className="text-[10px] font-black uppercase tracking-[0.2em]">
                  Full library has been scanned
                </p>
              </div>
            )}
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
