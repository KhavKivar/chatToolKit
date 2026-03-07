"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
} from "recharts";
import { useTheme } from "next-themes";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import api, {
  getStatsChat,
  getStatsTranscript,
  getStreamers,
  getAliases,
  bulkCreateAliases,
  deleteAlias,
  getChatterMentions,
  getExcludedShoutouts,
  createExcludedShoutout,
  deleteExcludedShoutout,
} from "../lib/api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  MessageSquare,
  TrendingUp,
  AlertTriangle,
  BarChart2,
  Flame,
  Trophy,
  Video,
  Skull,
  ExternalLink,
  Users,
  X,
  Plus,
  Tag,
  Ban,
} from "lucide-react";
import Link from "next/link";

// Custom YAxis tick that renders title on line 1 and date on line 2
function VideoYAxisTick({
  x,
  y,
  payload,
  tickColor,
  dateColor,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  x?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y?: any;
  payload?: { value: string };
  tickColor: string;
  dateColor: string;
}) {
  if (!payload) return null;
  const parts = payload.value.split("\n");
  const title = parts[0] ?? "";
  const date = parts[1] ?? "";
  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0}
        y={date ? -5 : 0}
        textAnchor="end"
        dominantBaseline="middle"
        fontSize={10}
        fontWeight={500}
        fill={tickColor}
      >
        {title}
      </text>
      {date && (
        <text
          x={0}
          y={8}
          textAnchor="end"
          dominantBaseline="middle"
          fontSize={9}
          fill={dateColor}
        >
          {date}
        </text>
      )}
    </g>
  );
}

interface StatItem {
  commenter_login?: string;
  commenter_display_name?: string;
  count?: number;
  toxic_count?: number;
  total_count?: number;
  ratio?: number;
  video__title?: string;
  video__id?: string;
  video__streamer_display_name?: string;
  video__created_at?: string;
  video__length_seconds?: number;
  engagement_density?: number;
  hour?: number;
}

interface WordStat {
  word: string;
  count: number;
}

interface ChatStatsData {
  top_commenters: StatItem[];
  most_toxic_absolute: StatItem[];
  most_toxic_relative: StatItem[];
  toxicity_by_video: StatItem[];
  top_videos_by_volume: StatItem[];
  hourly_stats: StatItem[];
  total_videos: number;
}

interface TranscriptStatsData {
  top_streamer_words: WordStat[];
  top_complex_words: WordStat[];
  top_mentioned_users: { username: string; count: number }[];
}

interface Streamer {
  id: string;
  login: string;
  display_name: string;
}

function useChartTheme() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  return {
    isDark,
    tickColor: isDark ? "hsl(215, 15%, 60%)" : "hsl(215, 13%, 40%)",
    dateColor: isDark ? "hsl(215, 12%, 45%)" : "hsl(215, 10%, 58%)",
    gridColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.07)",
    tooltipBg: isDark ? "#1c1c1e" : "#ffffff",
    tooltipBorder: isDark ? "#2e2e32" : "#e4e4e7",
    tooltipText: isDark ? "#f4f4f5" : "#18181b",
  };
}

function chartTooltipStyle(isDark: boolean) {
  return {
    backgroundColor: isDark ? "#1c1c1e" : "#ffffff",
    border: `1px solid ${isDark ? "#2e2e32" : "#e4e4e7"}`,
    borderRadius: "8px",
    color: isDark ? "#f4f4f5" : "#18181b",
    fontSize: "12px",
    padding: "8px 12px",
    boxShadow: isDark
      ? "0 4px 20px rgba(0,0,0,0.5)"
      : "0 4px 20px rgba(0,0,0,0.1)",
  };
}

function StatKpiCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
  truncate,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  color: string;
  truncate?: boolean;
}) {
  return (
    <Card className="overflow-hidden border-border/50 bg-card/50 hover:bg-card transition-colors">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </CardTitle>
        <div
          className={`p-1.5 rounded-md ${color} bg-opacity-10 text-opacity-100`}
        >
          <Icon className={color.replace("bg-", "text-")} size={14} />
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div
          className={`font-bold tracking-tight leading-tight ${
            truncate ? "text-base truncate" : "text-2xl"
          }`}
          title={truncate ? String(value) : undefined}
        >
          {value}
        </div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function EmptyChart({
  message = "No data available for this view.",
}: {
  message?: string;
}) {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center text-muted-foreground bg-muted/10 rounded-lg border border-dashed border-border/50 animate-in fade-in duration-500">
      <AlertTriangle size={24} className="mb-2 opacity-20" />
      <span className="text-sm font-medium opacity-60 uppercase tracking-widest text-[10px]">
        {message}
      </span>
    </div>
  );
}

export function StatsView({ standalone = false }: { standalone?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [chatData, setChatData] = useState<ChatStatsData | null>(null);
  const [transcriptData, setTranscriptData] = useState<TranscriptStatsData | null>(null);
  const [chatLoading, setChatLoading] = useState(true);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [transcriptFetched, setTranscriptFetched] = useState(false);
  const [activeTab, setActiveTab] = useState("chat");
  const [streamers, setStreamers] = useState<Streamer[]>([]);

  // Alias Manager state
  const [aliasTab, setAliasTab] = useState<"aliases" | "blocked">("aliases");
  const [existingAliases, setExistingAliases] = useState<{ id: number; alias: string; canonical_name: string }[]>([]);
  const [aliasesLoaded, setAliasesLoaded] = useState(false);
  const [newAliasWord, setNewAliasWord] = useState("");
  const [newAliasCanonical, setNewAliasCanonical] = useState("");
  const [aliasSaving, setAliasSaving] = useState(false);
  const [chatterMentions, setChatterMentions] = useState<{ word: string; count: number }[]>([]);
  const [mentionsLoaded, setMentionsLoaded] = useState(false);
  const [mentionsLoading, setMentionsLoading] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const [extraNamesInput, setExtraNamesInput] = useState("");
  const [extraNames, setExtraNames] = useState<string[]>([]);
  const [excludedShoutouts, setExcludedShoutouts] = useState<{ id: number; name: string }[]>([]);
  const [excludedLoaded, setExcludedLoaded] = useState(false);
  const [newExcludedName, setNewExcludedName] = useState("");

  const streamerFilter = searchParams.get("streamer") ?? "";

  const setStreamerFilter = (val: string) => {
    setChatLoading(true);
    setTranscriptFetched(false);
    setTranscriptData(null);
    setAliasesLoaded(false);
    setExcludedLoaded(false);
    setExistingAliases([]);
    setExcludedShoutouts([]);
    setChatterMentions([]);
    setMentionsLoaded(false);
    const params = new URLSearchParams(searchParams.toString());
    if (val) {
      params.set("streamer", val);
    } else {
      params.delete("streamer");
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  // Load streamers and default to Shigity if no filter set
  useEffect(() => {
    getStreamers().then((res) => {
      const list: Streamer[] = res.results || res;
      setStreamers(list);
      if (!searchParams.get("streamer")) {
        const shigity = list.find((s) => s.display_name.toLowerCase() === "shigity");
        if (shigity) {
          const params = new URLSearchParams(searchParams.toString());
          params.set("streamer", shigity.id);
          router.replace(`${pathname}?${params.toString()}`, { scroll: false });
        }
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load chat stats whenever streamer changes
  useEffect(() => {
    setChatLoading(true);
    getStatsChat(streamerFilter || undefined)
      .then(setChatData)
      .catch((err) => console.error("Failed to fetch chat stats:", err))
      .finally(() => setChatLoading(false));
  }, [streamerFilter]);

  // Reset transcript when streamer changes
  useEffect(() => {
    setTranscriptFetched(false);
    setTranscriptData(null);
  }, [streamerFilter]);

  // Auto-load transcript when on transcript tab and data is stale
  useEffect(() => {
    if (activeTab === "transcript" && !transcriptFetched && !transcriptLoading) {
      setTranscriptLoading(true);
      setTranscriptFetched(true);
      getStatsTranscript(streamerFilter || undefined)
        .then(setTranscriptData)
        .catch((err) => console.error("Failed to fetch transcript stats:", err))
        .finally(() => setTranscriptLoading(false));
    }
  }, [activeTab, transcriptFetched, streamerFilter, transcriptLoading]);

  const loadTranscriptStats = () => {
    if (transcriptFetched) return;
    setTranscriptLoading(true);
    setTranscriptFetched(true);
    getStatsTranscript(streamerFilter || undefined)
      .then(setTranscriptData)
      .catch((err) => console.error("Failed to fetch transcript stats:", err))
      .finally(() => setTranscriptLoading(false));
  };

  const refreshShoutouts = () => {
    setTranscriptFetched(false);
    setTranscriptData(null);
    setTranscriptLoading(true);
    getStatsTranscript(streamerFilter || undefined)
      .then((data) => {
        setTranscriptData(data);
        setTranscriptFetched(true);
      })
      .catch((err) => console.error("Failed to refresh transcript stats:", err))
      .finally(() => setTranscriptLoading(false));
  };

  const loadAliases = () => {
    if (aliasesLoaded) return;
    getAliases()
      .then((data) => { setExistingAliases(data); setAliasesLoaded(true); })
      .catch((err) => console.error("Failed to load aliases:", err));
  };

  const loadChatterMentions = (names?: string[]) => {
    setMentionsLoading(true);
    getChatterMentions(streamerFilter || undefined, names ?? extraNames)
      .then((data) => { setChatterMentions(data); setMentionsLoaded(true); })
      .catch((err) => console.error("Failed to load chatter mentions:", err))
      .finally(() => setMentionsLoading(false));
  };

  const handleAddExtraName = () => {
    const name = extraNamesInput.trim();
    if (!name || extraNames.includes(name)) return;
    const updated = [...extraNames, name];
    setExtraNames(updated);
    setExtraNamesInput("");
    if (mentionsLoaded) loadChatterMentions(updated);
  };

  const loadExcludedShoutouts = () => {
    if (excludedLoaded) return;
    getExcludedShoutouts()
      .then((data) => { setExcludedShoutouts(data); setExcludedLoaded(true); })
      .catch((err) => console.error("Failed to load excluded shoutouts:", err));
  };

  const handleAddAlias = async () => {
    const alias = newAliasWord.trim();
    const canonical_name = newAliasCanonical.trim();
    if (!alias || !canonical_name) return;
    setAliasSaving(true);
    try {
      await bulkCreateAliases([{ alias, canonical_name }]);
      setExistingAliases((prev) => {
        const filtered = prev.filter((a) => a.alias !== alias);
        return [...filtered, { id: Date.now(), alias, canonical_name }].sort((a, b) =>
          a.alias.localeCompare(b.alias),
        );
      });
      setNewAliasWord("");
      setNewAliasCanonical("");
      // Re-run fix_names for the current streamer
      const streamer = streamers.find((s) => s.id === streamerFilter);
      if (streamer) {
        await api
          .post("/transcripts/fix_names/", { streamer_login: streamer.login })
          .catch(() => null);
      }
      refreshShoutouts();
    } finally {
      setAliasSaving(false);
    }
  };

  const handleDeleteAlias = async (id: number) => {
    try {
      await deleteAlias(id);
      setExistingAliases((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      console.error("Failed to delete alias:", err);
    }
  };

  const handleAddExcluded = async () => {
    const name = newExcludedName.trim();
    if (!name) return;
    try {
      const created = await createExcludedShoutout(name);
      setExcludedShoutouts((prev) =>
        [...prev, created].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setNewExcludedName("");
      refreshShoutouts();
    } catch (err) {
      console.error("Failed to add excluded shoutout:", err);
    }
  };

  const handleDeleteExcluded = async (id: number) => {
    try {
      await deleteExcludedShoutout(id);
      setExcludedShoutouts((prev) => prev.filter((e) => e.id !== id));
      refreshShoutouts();
    } catch (err) {
      console.error("Failed to delete excluded shoutout:", err);
    }
  };

  const chart = useChartTheme();

  const kpis = useMemo(() => {
    if (!chatData) return null;
    const totalMessages = chatData.hourly_stats.reduce(
      (s, h) => s + (h.count || 0),
      0,
    );
    const totalToxic = chatData.hourly_stats.reduce(
      (s, h) => s + (h.toxic_count || 0),
      0,
    );
    const toxicRate =
      totalMessages > 0 ? ((totalToxic / totalMessages) * 100).toFixed(1) : "0";
    const topCommenter = chatData.top_commenters[0]?.commenter_display_name ?? "—";
    return {
      totalMessages,
      totalToxic,
      toxicRate,
      topCommenter,
      uniqueVideos: chatData.total_videos,
    };
  }, [chatData]);

  const commenterCrossData = useMemo(() => {
    if (!chatData) return [];
    return chatData.top_commenters.slice(0, 8).map((c) => {
      const toxicEntry = chatData.most_toxic_absolute.find(
        (t) => t.commenter_login === c.commenter_login,
      );
      return {
        name: c.commenter_display_name ?? c.commenter_login ?? "?",
        messages: c.count ?? 0,
        toxic: toxicEntry?.toxic_count ?? 0,
        clean: (c.count ?? 0) - (toxicEntry?.toxic_count ?? 0),
      };
    });
  }, [chatData]);

  const toxicityPieData = useMemo(() => {
    if (!kpis) return [];
    return [
      { name: "Clean", value: kpis.totalMessages - kpis.totalToxic, fill: "#22c55e" },
      { name: "Toxic", value: kpis.totalToxic, fill: "#ef4444" },
    ];
  }, [kpis]);

  const mostPopularData = useMemo(() => {
    if (!chatData) return [];
    const sorted = [...chatData.toxicity_by_video]
      .sort((a, b) => (b.engagement_density ?? 0) - (a.engagement_density ?? 0))
      .slice(0, 8);
    return sorted.map((v) => {
      const streamer = v.video__streamer_display_name ? `[${v.video__streamer_display_name}] ` : "";
      const date = v.video__created_at
        ? new Date(v.video__created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
        : "";
      const fullTitle = `${streamer}${v.video__title ?? "Unknown"}`;
      const truncated = fullTitle.length > 22 ? fullTitle.substring(0, 19) + "…" : fullTitle;
      return {
        title: date ? `${truncated}\n${date}` : truncated,
        fullTitle: date ? `${fullTitle} · ${date}` : fullTitle,
        engagement: parseFloat((v.engagement_density ?? 0).toFixed(1)),
        total: v.total_count ?? 0,
      };
    });
  }, [chatData]);

  const topVideosVolumeData = useMemo(() => {
    if (!chatData?.top_videos_by_volume) return [];
    return chatData.top_videos_by_volume.slice(0, 10).map((v) => {
      const streamer = v.video__streamer_display_name ? `[${v.video__streamer_display_name}] ` : "";
      const date = v.video__created_at
        ? new Date(v.video__created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
        : "";
      const fullTitle = `${streamer}${v.video__title ?? "Unknown"}`;
      const truncated = fullTitle.length > 22 ? fullTitle.substring(0, 19) + "…" : fullTitle;
      return {
        title: date ? `${truncated}\n${date}` : truncated,
        fullTitle: date ? `${fullTitle} · ${date}` : fullTitle,
        total: v.total_count ?? 0,
      };
    });
  }, [chatData]);

  if (chatLoading && !chatData) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-4">
        <Loader2 className="animate-spin text-primary" size={40} strokeWidth={2} />
        <p className="text-sm font-medium">Loading analytics…</p>
      </div>
    );
  }

  if (!chatData || !kpis) return null;

  const tickProps = { fontSize: 11, fill: chart.tickColor };

  const content = (
    <div className="space-y-8 pb-16 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header & Filter */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 pb-6 border-b">

        <div className="space-y-1">
          <Badge variant="outline" className="mb-2 gap-1.5 text-xs">
            <TrendingUp size={11} />
            Analytics
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight">VOD Statistics</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Behavioral insights across{" "}
            {streamerFilter
              ? streamers.find((s) => s.id === streamerFilter)?.display_name
              : "all channels"}
            .
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Select
            value={streamerFilter || "all"}
            onValueChange={(v) => setStreamerFilter(v === "all" ? "" : v)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Streamers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Streamers</SelectItem>
              {streamers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {!standalone && (
            <Link
              href={`/stats${streamerFilter ? `?streamer=${streamerFilter}` : ""}`}
            >
              <Badge
                variant="outline"
                className="gap-1.5 cursor-pointer hover:bg-accent transition-colors whitespace-nowrap"
              >
                <ExternalLink size={11} />
                Open full page
              </Badge>
            </Link>
          )}
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(val) => { setActiveTab(val); if (val === "transcript") loadTranscriptStats(); }}
        className="w-full"
      >
        <TabsList className="w-full h-12 mb-8 p-1 rounded-xl bg-muted/60 border border-border/50">
          <TabsTrigger
            value="chat"
            className="flex-1 h-full text-sm font-semibold rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-foreground transition-all"
          >
            💬 Chat Stats
          </TabsTrigger>
          <TabsTrigger
            value="transcript"
            className="flex-1 h-full text-sm font-semibold rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-foreground transition-all"
          >
            🎙️ Transcript Stats
          </TabsTrigger>
        </TabsList>

        <TabsContent value="chat" className="space-y-8">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatKpiCard
          label="Total Messages"
          value={kpis.totalMessages.toLocaleString()}
          icon={MessageSquare}
          color="bg-blue-500"
        />
        <StatKpiCard
          label="Toxic Messages"
          value={kpis.totalToxic.toLocaleString()}
          icon={AlertTriangle}
          color="bg-red-500"
        />
        <StatKpiCard
          label="Toxicity Rate"
          value={`${kpis.toxicRate}%`}
          sub="of all messages"
          icon={Flame}
          color="bg-orange-500"
        />
        <StatKpiCard
          label="Videos Tracked"
          value={kpis.uniqueVideos}
          icon={Video}
          color="bg-purple-500"
        />
        <StatKpiCard
          label="Top Commenter"
          value={kpis.topCommenter}
          icon={Trophy}
          color="bg-yellow-500"
          truncate
        />
      </div>
      {/* Row 1a: Top Commenters | Most Toxic by Volume */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Power Users */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Trophy size={16} className="text-yellow-500" />
              Top Commenters
            </CardTitle>
            <CardDescription>Most messages sent overall</CardDescription>
          </CardHeader>
          <CardContent className="h-[280px]">
            {chatData.top_commenters.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chatData.top_commenters}
                  layout="vertical"
                  margin={{ left: 8, right: 40, top: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    horizontal={false}
                    strokeDasharray="3 3"
                    stroke={chart.gridColor}
                  />
                  <XAxis
                    type="number"
                    axisLine={false}
                    tickLine={false}
                    tick={tickProps}
                  />
                  <YAxis
                    dataKey="commenter_display_name"
                    type="category"
                    width={110}
                    axisLine={false}
                    tickLine={false}
                    tick={tickProps}
                  />
                  <Tooltip
                    contentStyle={chartTooltipStyle(chart.isDark)}
                    cursor={{ fill: "rgba(59,130,246,0.06)" }}
                    formatter={(v) => [Number(v).toLocaleString(), "Messages"]}
                  />
                  <Bar
                    dataKey="count"
                    radius={[0, 4, 4, 0]}
                    barSize={18}
                    fill="#3b82f6"
                    minPointSize={2}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart message="No commenters found" />
            )}
          </CardContent>
        </Card>

        {/* Most Toxic by Volume */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle size={16} className="text-red-500" />
              Most Toxic by Volume
            </CardTitle>
            <CardDescription>Highest count of flagged messages</CardDescription>
          </CardHeader>
          <CardContent className="h-[280px]">
            {chatData.most_toxic_absolute.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chatData.most_toxic_absolute}
                  layout="vertical"
                  margin={{ left: 8, right: 40, top: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    horizontal={false}
                    strokeDasharray="3 3"
                    stroke={chart.gridColor}
                  />
                  <XAxis
                    type="number"
                    axisLine={false}
                    tickLine={false}
                    tick={tickProps}
                  />
                  <YAxis
                    dataKey="commenter_display_name"
                    type="category"
                    width={110}
                    axisLine={false}
                    tickLine={false}
                    tick={tickProps}
                  />
                  <Tooltip
                    contentStyle={chartTooltipStyle(chart.isDark)}
                    cursor={{ fill: "rgba(239,68,68,0.06)" }}
                    formatter={(v) => [
                      Number(v).toLocaleString(),
                      "Toxic messages",
                    ]}
                  />
                  <Bar
                    dataKey="toxic_count"
                    radius={[0, 4, 4, 0]}
                    barSize={18}
                    fill="#ef4444"
                    minPointSize={2}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart message="No toxic behavior detected yet" />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 1b: Highest Toxicity Rate — full width */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Skull size={16} className="text-orange-500" />
            Highest Toxicity Rate
          </CardTitle>
          <CardDescription>% flagged per user (min 10 msgs)</CardDescription>
        </CardHeader>
        <CardContent className="h-[280px]">
          {chatData.most_toxic_relative.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chatData.most_toxic_relative}
                layout="vertical"
                margin={{ left: 8, right: 48, top: 0, bottom: 0 }}
              >
                <CartesianGrid
                  horizontal={false}
                  strokeDasharray="3 3"
                  stroke={chart.gridColor}
                />
                <XAxis
                  type="number"
                  domain={[0, "auto"]}
                  axisLine={false}
                  tickLine={false}
                  tick={tickProps}
                  tickFormatter={(v) => `${v}%`}
                />
                <YAxis
                  dataKey="commenter_display_name"
                  type="category"
                  width={130}
                  axisLine={false}
                  tickLine={false}
                  tick={tickProps}
                />
                <Tooltip
                  contentStyle={chartTooltipStyle(chart.isDark)}
                  cursor={{ fill: "rgba(249,115,22,0.06)" }}
                  formatter={(v) => [
                    `${Number(v).toFixed(1)}%`,
                    "Toxicity Rate",
                  ]}
                />
                <Bar
                  dataKey="ratio"
                  radius={[0, 4, 4, 0]}
                  barSize={22}
                  fill="#f97316"
                  minPointSize={2}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="Insufficient data for percentage analysis" />
          )}
        </CardContent>
      </Card>

      {/* Row 2: Most Popular VODs — by density */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp size={16} className="text-blue-500" />
            Most Popular VODs (Engagement Density)
          </CardTitle>
          <CardDescription>
            Messages per minute of stream time — shows which streams had the
            most intense chat activity
          </CardDescription>
        </CardHeader>
        <CardContent className="h-[360px]">
          {mostPopularData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={mostPopularData}
                layout="vertical"
                margin={{ left: 8, right: 32, top: 16, bottom: 8 }}
              >
                <CartesianGrid
                  horizontal={false}
                  strokeDasharray="3 3"
                  stroke={chart.gridColor}
                />
                <XAxis
                  type="number"
                  axisLine={false}
                  tickLine={false}
                  tick={tickProps}
                />
                <YAxis
                  dataKey="title"
                  type="category"
                  width={155}
                  interval={0}
                  axisLine={false}
                  tickLine={false}
                  tick={(props) => (
                    <VideoYAxisTick
                      {...props}
                      tickColor={chart.tickColor}
                      dateColor={chart.dateColor}
                    />
                  )}
                />
                <Tooltip
                  contentStyle={chartTooltipStyle(chart.isDark)}
                  cursor={{
                    fill: chart.isDark
                      ? "rgba(255,255,255,0.04)"
                      : "rgba(0,0,0,0.04)",
                  }}
                  labelFormatter={(_, payload) =>
                    payload?.[0]
                      ? (payload[0].payload as { fullTitle: string }).fullTitle
                      : ""
                  }
                  formatter={(val) => [
                    `${Number(val).toLocaleString()}`,
                    "msgs / min",
                  ]}
                />
                <Bar
                  dataKey="engagement"
                  name="msgs / min"
                  fill="#3b82f6"
                  radius={[0, 4, 4, 0]}
                  barSize={20}
                  minPointSize={2}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="No stream activity density to display" />
          )}
        </CardContent>
      </Card>

      {/* Row 3: Toxicity Overview + Most Toxic Videos (ratio, auto-scaled) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Toxicity Overview Pie */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Flame size={16} className="text-orange-500" />
              Toxicity Overview
            </CardTitle>
            <CardDescription>
              Share of clean vs flagged messages
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[260px] flex flex-col items-center justify-center gap-2">
            {kpis.totalMessages > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={toxicityPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={82}
                      paddingAngle={3}
                      dataKey="value"
                      animationDuration={900}
                    >
                      {toxicityPieData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={chartTooltipStyle(chart.isDark)}
                      formatter={(val) => [
                        Number(val).toLocaleString(),
                        undefined,
                      ]}
                    />
                    <Legend
                      iconType="circle"
                      iconSize={8}
                      wrapperStyle={{ fontSize: 11 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="text-center">
                  <p className="text-2xl font-bold">{kpis.toxicRate}%</p>
                  <p className="text-xs text-muted-foreground">
                    overall toxicity
                  </p>
                </div>
              </>
            ) : (
              <EmptyChart message="No messages detected" />
            )}
          </CardContent>
        </Card>

        {/* Top VODs by count — replaced Toxicity Ratio */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <MessageSquare size={16} className="text-emerald-500" />
              Highest Volume VODs
            </CardTitle>
            <CardDescription>
              Top 10 VODs by total message count
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[400px]">
            {topVideosVolumeData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={topVideosVolumeData}
                  layout="vertical"
                  margin={{ left: 8, right: 32, top: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    horizontal={false}
                    strokeDasharray="3 3"
                    stroke={chart.gridColor}
                  />
                  <XAxis
                    type="number"
                    axisLine={false}
                    tickLine={false}
                    tick={tickProps}
                  />
                  <YAxis
                    dataKey="title"
                    type="category"
                    width={155}
                    interval={0}
                    axisLine={false}
                    tickLine={false}
                    tick={(props) => (
                      <VideoYAxisTick
                        {...props}
                        tickColor={chart.tickColor}
                        dateColor={chart.dateColor}
                      />
                    )}
                  />
                  <Tooltip
                    contentStyle={chartTooltipStyle(chart.isDark)}
                    cursor={{ fill: "rgba(16,185,129,0.07)" }}
                    labelFormatter={(_, payload) =>
                      payload?.[0]
                        ? (payload[0].payload as { fullTitle: string })
                            .fullTitle
                        : ""
                    }
                    formatter={(val) => [
                      Number(val).toLocaleString(),
                      "Total Messages",
                    ]}
                  />
                  <Bar
                    dataKey="total"
                    radius={[0, 4, 4, 0]}
                    barSize={18}
                    fill="#10b981"
                    minPointSize={2}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart message="No tracked VODs found" />
            )}
          </CardContent>
        </Card>
      </div>

        </TabsContent>

        <TabsContent value="transcript" className="space-y-8">
          {transcriptLoading && (
            <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-4">
              <Loader2 className="animate-spin text-primary" size={40} strokeWidth={2} />
              <p className="text-sm font-medium">Analyzing transcripts…</p>
            </div>
          )}
          {!transcriptLoading && !transcriptData && transcriptFetched && (
            <div className="flex items-center justify-center py-24 text-muted-foreground text-sm">
              No transcript data available.
            </div>
          )}
          {transcriptData && (
            <>
      {/* Row: Streamer Vocabulary */}
      {transcriptData.top_streamer_words && transcriptData.top_streamer_words.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <MessageSquare size={16} className="text-purple-500" />
              Streamer&apos;s Vocabulary (Top Words)
            </CardTitle>
            <CardDescription>
              Most used words in transcripts by{" "}
              {streamerFilter
                ? streamers.find((s) => s.id === streamerFilter)?.display_name
                : "streamers"}
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={transcriptData.top_streamer_words}
                layout="vertical"
                margin={{ left: 8, right: 40, top: 0, bottom: 0 }}
              >
                <CartesianGrid
                  horizontal={false}
                  strokeDasharray="3 3"
                  stroke={chart.gridColor}
                />
                <XAxis
                  type="number"
                  axisLine={false}
                  tickLine={false}
                  tick={tickProps}
                />
                <YAxis
                  dataKey="word"
                  type="category"
                  width={110}
                  axisLine={false}
                  tickLine={false}
                  tick={tickProps}
                  className="font-mono text-[10px] uppercase font-black"
                />
                <Tooltip
                  contentStyle={chartTooltipStyle(chart.isDark)}
                  cursor={{ fill: "rgba(168,85,247,0.06)" }}
                  formatter={(v) => [Number(v).toLocaleString(), "Times said"]}
                />
                <Bar
                  dataKey="count"
                  radius={[0, 4, 4, 0]}
                  barSize={18}
                  minPointSize={2}
                >
                  {transcriptData.top_streamer_words.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={`hsl(271, 91%, ${65 - index * 3}%)`}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Row: Complex Vocabulary */}
      {transcriptData.top_complex_words && transcriptData.top_complex_words.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Skull size={16} className="text-emerald-500" />
              Advanced Vocabulary (Complex Words)
            </CardTitle>
            <CardDescription>
              Most used words with 9+ characters by{" "}
              {streamerFilter
                ? streamers.find((s) => s.id === streamerFilter)?.display_name
                : "streamers"}
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={transcriptData.top_complex_words}
                layout="vertical"
                margin={{ left: 8, right: 40, top: 0, bottom: 0 }}
              >
                <CartesianGrid
                  horizontal={false}
                  strokeDasharray="3 3"
                  stroke={chart.gridColor}
                />
                <XAxis
                  type="number"
                  axisLine={false}
                  tickLine={false}
                  tick={tickProps}
                />
                <YAxis
                  dataKey="word"
                  type="category"
                  width={110}
                  axisLine={false}
                  tickLine={false}
                  tick={tickProps}
                  className="font-mono text-[10px] uppercase font-black"
                />
                <Tooltip
                  contentStyle={chartTooltipStyle(chart.isDark)}
                  cursor={{ fill: "rgba(16,185,129,0.06)" }}
                  formatter={(v) => [Number(v).toLocaleString(), "Times said"]}
                />
                <Bar
                  dataKey="count"
                  radius={[0, 4, 4, 0]}
                  barSize={18}
                  minPointSize={2}
                >
                  {transcriptData.top_complex_words.map((entry, index) => (
                    <Cell
                      key={`cell-complex-${index}`}
                      fill={`hsl(142, 70%, ${55 - index * 3}%)`}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Row 4: Top Commenters stacked clean vs toxic */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <BarChart2 size={16} className="text-blue-500" />
            Top Commenters — Clean vs Toxic Breakdown
          </CardTitle>
          <CardDescription>
            Message volume split by clean and flagged content for the most
            active users
          </CardDescription>
        </CardHeader>
        <CardContent className="h-[280px]">
          {commenterCrossData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={commenterCrossData}
                layout="vertical"
                margin={{ left: 8, right: 32, top: 0, bottom: 0 }}
              >
                <CartesianGrid
                  horizontal={false}
                  strokeDasharray="3 3"
                  stroke={chart.gridColor}
                />
                <XAxis
                  type="number"
                  axisLine={false}
                  tickLine={false}
                  tick={tickProps}
                />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={110}
                  axisLine={false}
                  tickLine={false}
                  tick={tickProps}
                />
                <Tooltip
                  contentStyle={chartTooltipStyle(chart.isDark)}
                  cursor={{
                    fill: chart.isDark
                      ? "rgba(255,255,255,0.03)"
                      : "rgba(0,0,0,0.03)",
                  }}
                />
                <Legend
                  iconType="square"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 11 }}
                />
                <Bar
                  dataKey="clean"
                  name="Clean"
                  stackId="a"
                  fill="#3b82f6"
                  barSize={18}
                  minPointSize={2}
                />
                <Bar
                  dataKey="toxic"
                  name="Toxic"
                  stackId="a"
                  fill="#ef4444"
                  radius={[0, 4, 4, 0]}
                  barSize={18}
                  minPointSize={2}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="No comments to analyze" />
          )}
        </CardContent>
      </Card>

      {/* Mentions Row */}
      {transcriptData.top_mentioned_users && transcriptData.top_mentioned_users.length > 0 && (
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Users size={16} className="text-pink-500" />
              Community Shoutouts
            </CardTitle>
            <CardDescription>
              Which community members does the streamer mention most?
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={transcriptData.top_mentioned_users}
                layout="vertical"
                margin={{ left: 8, right: 32, top: 0, bottom: 0 }}
              >
                <CartesianGrid
                  horizontal={false}
                  strokeDasharray="3 3"
                  stroke={chart.gridColor}
                />
                <XAxis
                  type="number"
                  axisLine={false}
                  tickLine={false}
                  tick={tickProps}
                />
                <YAxis
                  dataKey="username"
                  type="category"
                  width={110}
                  axisLine={false}
                  tickLine={false}
                  tick={tickProps}
                />
                <Tooltip
                  contentStyle={chartTooltipStyle(chart.isDark)}
                  cursor={{ fill: "rgba(236,72,153,0.06)" }}
                  formatter={(v) => [Number(v).toLocaleString(), "Mentions"]}
                />
                <Bar
                  dataKey="count"
                  radius={[0, 4, 4, 0]}
                  barSize={18}
                  fill="#ec4899"
                  minPointSize={2}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Alias Manager */}
      {(() => {
        // Known user names for datalist autocomplete
        const knownNames = Array.from(new Set([
          ...(transcriptData?.top_mentioned_users ?? []).map((u) => u.username),
          ...(chatData?.top_commenters ?? []).map((c) => c.commenter_display_name ?? "").filter(Boolean),
        ])).sort();
        return (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Tag size={16} className="text-indigo-500" />
                Alias Manager
              </CardTitle>
              <CardDescription>
                Map words in transcripts to known usernames, or block false positives from shoutouts
              </CardDescription>
            </CardHeader>
            <CardContent>
              <datalist id="known-users-list">
                {knownNames.map((n) => <option key={n} value={n} />)}
              </datalist>

              {/* Sub-tabs */}
              <div className="flex gap-1 mb-4 p-1 bg-muted/50 rounded-lg w-fit">
                <button
                  onClick={() => { setAliasTab("aliases"); loadAliases(); if (!mentionsLoaded) loadChatterMentions(); }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                    aliasTab === "aliases"
                      ? "bg-background shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Aliases
                </button>
                <button
                  onClick={() => { setAliasTab("blocked"); loadExcludedShoutouts(); }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                    aliasTab === "blocked"
                      ? "bg-background shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Blocked from Shoutouts
                </button>
              </div>

              {aliasTab === "aliases" && (
                <div className="space-y-4">
                  {/* Manual alias add form */}
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Add alias manually:</p>
                    <div className="flex gap-2 items-center flex-wrap">
                      <input
                        type="text"
                        placeholder="word in transcript…"
                        value={newAliasWord}
                        onChange={(e) => setNewAliasWord(e.target.value)}
                        className="w-36 bg-transparent border border-border/50 rounded-md px-3 py-1.5 text-xs focus:outline-none focus:border-primary transition-colors placeholder:text-muted-foreground/50"
                      />
                      <span className="text-xs text-muted-foreground">→</span>
                      <input
                        type="text"
                        list="known-users-list"
                        placeholder="canonical username…"
                        value={newAliasCanonical}
                        onChange={(e) => setNewAliasCanonical(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleAddAlias()}
                        className="w-44 bg-transparent border border-border/50 rounded-md px-3 py-1.5 text-xs focus:outline-none focus:border-primary transition-colors placeholder:text-muted-foreground/50"
                      />
                      <button
                        onClick={handleAddAlias}
                        disabled={!newAliasWord.trim() || !newAliasCanonical.trim() || aliasSaving}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                      >
                        {aliasSaving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                        Add
                      </button>
                    </div>
                  </div>

                  {/* Existing aliases */}
                  {aliasesLoaded && existingAliases.length > 0 && (
                    <div className="border rounded-lg overflow-hidden">
                      <div className="bg-muted/50 px-3 py-1.5 text-xs font-medium text-muted-foreground">Existing aliases</div>
                      <table className="w-full text-xs">
                        <tbody className="divide-y divide-border/50">
                          {existingAliases.map((a) => (
                            <tr key={a.id} className="hover:bg-muted/20 transition-colors">
                              <td className="px-3 py-1.5 font-mono font-semibold">{a.alias}</td>
                              <td className="px-3 py-1.5 text-center text-muted-foreground">→</td>
                              <td className="px-3 py-1.5 text-muted-foreground">{a.canonical_name}</td>
                              <td className="px-3 py-1.5 text-right">
                                <button onClick={() => handleDeleteAlias(a.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                                  <X size={12} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Chatter mentions lookup */}
                  <div className="border-t pt-4 space-y-3">
                    <p className="text-xs text-muted-foreground">Check which chatters appear in transcripts:</p>
                    <div className="flex gap-2 flex-wrap items-center">
                      <button
                        onClick={() => loadChatterMentions()}
                        disabled={mentionsLoading}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-muted hover:bg-muted/80 border border-border/50 disabled:opacity-50 transition-colors"
                      >
                        {mentionsLoading ? <Loader2 size={12} className="animate-spin" /> : <Users size={12} />}
                        {mentionsLoaded ? "Refresh" : "Load chatters"}
                      </button>
                      {/* Add extra names */}
                      <input
                        type="text"
                        placeholder="Add name to check…"
                        value={extraNamesInput}
                        onChange={(e) => setExtraNamesInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleAddExtraName()}
                        className="w-40 bg-transparent border border-border/50 rounded-md px-3 py-1.5 text-xs focus:outline-none focus:border-primary transition-colors placeholder:text-muted-foreground/50"
                      />
                      <button
                        onClick={handleAddExtraName}
                        disabled={!extraNamesInput.trim()}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-muted hover:bg-muted/80 border border-border/50 disabled:opacity-50 transition-colors"
                      >
                        <Plus size={12} /> Add
                      </button>
                    </div>
                    {extraNames.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {extraNames.map((n) => (
                          <span key={n} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-primary/10 border border-primary/20 text-primary">
                            {n}
                            <button onClick={() => setExtraNames((prev) => prev.filter((x) => x !== n))} className="hover:text-destructive transition-colors"><X size={10} /></button>
                          </span>
                        ))}
                      </div>
                    )}
                    {mentionsLoaded && chatterMentions.length > 0 && (
                      <>
                        <input
                          type="text"
                          placeholder="Filter results…"
                          value={mentionSearch}
                          onChange={(e) => setMentionSearch(e.target.value)}
                          className="w-full max-w-xs bg-transparent border border-border/50 rounded-md px-3 py-1.5 text-xs focus:outline-none focus:border-primary transition-colors placeholder:text-muted-foreground/50"
                        />
                        <div className="border rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                          <table className="w-full text-xs">
                            <thead className="bg-muted/50 sticky top-0">
                              <tr>
                                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Chatter</th>
                                <th className="text-right px-3 py-2 font-medium text-muted-foreground w-16">Mentions</th>
                                <th className="w-16 px-3 py-2 text-muted-foreground text-right">Alias</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border/50">
                              {chatterMentions
                                .filter((m) => !mentionSearch || m.word.toLowerCase().includes(mentionSearch.toLowerCase()))
                                .map(({ word, count }) => (
                                  <tr key={word} className="hover:bg-muted/20 transition-colors">
                                    <td className="px-3 py-1.5 font-mono font-semibold">{word}</td>
                                    <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{count}</td>
                                    <td className="px-3 py-1.5 text-right">
                                      <button
                                        onClick={() => { setNewAliasCanonical(word); setNewAliasWord(""); }}
                                        className="text-xs text-primary hover:underline"
                                      >
                                        alias
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                    {mentionsLoaded && chatterMentions.length === 0 && (
                      <p className="text-xs text-muted-foreground">No chatters found in transcripts.</p>
                    )}
                  </div>
                </div>
              )}

              {aliasTab === "blocked" && (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      list="known-users-list"
                      placeholder="Name to block…"
                      value={newExcludedName}
                      onChange={(e) => setNewExcludedName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddExcluded()}
                      className="flex-1 max-w-[200px] bg-transparent border border-border/50 rounded-md px-3 py-1.5 text-xs focus:outline-none focus:border-primary transition-colors placeholder:text-muted-foreground/50"
                    />
                    <button
                      onClick={handleAddExcluded}
                      disabled={!newExcludedName.trim()}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    >
                      <Ban size={12} />
                      Block
                    </button>
                  </div>
                  {excludedLoaded && excludedShoutouts.length === 0 && (
                    <p className="text-xs text-muted-foreground">No blocked names yet.</p>
                  )}
                  {excludedShoutouts.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {excludedShoutouts.map((e) => (
                        <span
                          key={e.id}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-muted border border-border/50"
                        >
                          {e.name}
                          <button
                            onClick={() => handleDeleteExcluded(e.id)}
                            className="ml-0.5 text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <X size={11} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );

  if (standalone) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-10">{content}</div>
      </div>
    );
  }

  return content;
}
