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
import { getStats, getStreamers } from "../lib/api";
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

interface StatsData {
  top_commenters: StatItem[];
  most_toxic_absolute: StatItem[];
  most_toxic_relative: StatItem[];
  top_streamer_words: WordStat[];
  top_complex_words: WordStat[];
  toxicity_by_video: StatItem[];
  top_videos_by_volume: StatItem[];
  hourly_stats: StatItem[];
  total_videos: number;
  funny_stats?: {
    laugh_vs_cry: { laugh: number; cry: number };
    longest_segment: { text: string; duration: number };
    unique_vocabulary_size: number;
  };
}

interface Streamer {
  id: string;
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
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [streamers, setStreamers] = useState<Streamer[]>([]);

  // Read streamer filter from URL param
  const streamerFilter = searchParams.get("streamer") ?? "";

  const setStreamerFilter = (val: string) => {
    setLoading(true);
    const params = new URLSearchParams(searchParams.toString());
    if (val) {
      params.set("streamer", val);
    } else {
      params.delete("streamer");
    }
    // Correct redirection: use current pathname instead of assuming '/'
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  useEffect(() => {
    getStreamers().then((res) => {
      setStreamers(res.results || res);
    });
  }, []);

  useEffect(() => {
    getStats(streamerFilter || undefined)
      .then(setData)
      .catch((err) => console.error("Failed to fetch stats:", err))
      .finally(() => setLoading(false));
  }, [streamerFilter]);

  const chart = useChartTheme();

  const kpis = useMemo(() => {
    if (!data) return null;
    const totalMessages = data.hourly_stats.reduce(
      (s, h) => s + (h.count || 0),
      0,
    );
    const totalToxic = data.hourly_stats.reduce(
      (s, h) => s + (h.toxic_count || 0),
      0,
    );
    const toxicRate =
      totalMessages > 0 ? ((totalToxic / totalMessages) * 100).toFixed(1) : "0";
    const topCommenter = data.top_commenters[0]?.commenter_display_name ?? "—";
    return {
      totalMessages,
      totalToxic,
      toxicRate,
      topCommenter,
      uniqueVideos: data.total_videos,
    };
  }, [data]);

  // Top commenters cross-referenced with toxicity
  const commenterCrossData = useMemo(() => {
    if (!data) return [];
    return data.top_commenters.slice(0, 8).map((c) => {
      const toxicEntry = data.most_toxic_absolute.find(
        (t) => t.commenter_login === c.commenter_login,
      );
      return {
        name: c.commenter_display_name ?? c.commenter_login ?? "?",
        messages: c.count ?? 0,
        toxic: toxicEntry?.toxic_count ?? 0,
        clean: (c.count ?? 0) - (toxicEntry?.toxic_count ?? 0),
      };
    });
  }, [data]);

  // Pie chart: clean vs toxic
  const toxicityPieData = useMemo(() => {
    if (!kpis) return [];
    return [
      {
        name: "Clean",
        value: kpis.totalMessages - kpis.totalToxic,
        fill: "#22c55e",
      },
      { name: "Toxic", value: kpis.totalToxic, fill: "#ef4444" },
    ];
  }, [kpis]);

  // Video data for most popular (engagement density: comments/min)
  const mostPopularData = useMemo(() => {
    if (!data) return [];
    // Clone and sort by engagement_density descending
    const sorted = [...data.toxicity_by_video]
      .sort((a, b) => (b.engagement_density ?? 0) - (a.engagement_density ?? 0))
      .slice(0, 8);

    return sorted.map((v) => {
      const streamer = v.video__streamer_display_name
        ? `[${v.video__streamer_display_name}] `
        : "";
      const date = v.video__created_at
        ? new Date(v.video__created_at).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })
        : "";
      const fullTitle = `${streamer}${v.video__title ?? "Unknown"}`;
      const truncated =
        fullTitle.length > 22 ? fullTitle.substring(0, 19) + "…" : fullTitle;
      return {
        title: date ? `${truncated}\n${date}` : truncated,
        fullTitle: date ? `${fullTitle} · ${date}` : fullTitle,
        engagement: parseFloat((v.engagement_density ?? 0).toFixed(1)),
        total: v.total_count ?? 0,
      };
    });
  }, [data]);

  // Top videos by total volume
  const topVideosVolumeData = useMemo(() => {
    if (!data || !data.top_videos_by_volume) return [];
    return data.top_videos_by_volume.slice(0, 10).map((v) => {
      const streamer = v.video__streamer_display_name
        ? `[${v.video__streamer_display_name}] `
        : "";
      const date = v.video__created_at
        ? new Date(v.video__created_at).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })
        : "";
      const fullTitle = `${streamer}${v.video__title ?? "Unknown"}`;
      const truncated =
        fullTitle.length > 22 ? fullTitle.substring(0, 19) + "…" : fullTitle;
      return {
        title: date ? `${truncated}\n${date}` : truncated,
        fullTitle: date ? `${fullTitle} · ${date}` : fullTitle,
        total: v.total_count ?? 0,
      };
    });
  }, [data]);

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-4">
        <Loader2
          className="animate-spin text-primary"
          size={40}
          strokeWidth={2}
        />
        <p className="text-sm font-medium">Loading analytics…</p>
      </div>
    );
  }

  if (!data || !kpis) return null;

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

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
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
        <StatKpiCard
          label="Unique Vocabulary"
          value={
            data.funny_stats?.unique_vocabulary_size?.toLocaleString() ?? "—"
          }
          sub="distinct words used"
          icon={MessageSquare}
          color="bg-emerald-500"
        />
        <StatKpiCard
          label="Laughs"
          value={data.funny_stats?.laugh_vs_cry?.laugh?.toLocaleString() ?? "—"}
          sub="jajaja/lol/xd"
          icon={Trophy}
          color="bg-pink-500"
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
            {data.top_commenters.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.top_commenters}
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
            {data.most_toxic_absolute.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.most_toxic_absolute}
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
          {data.most_toxic_relative.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.most_toxic_relative}
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

      {/* Row: Funny Stats / Vibe Check */}
      {data.funny_stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Flame size={16} className="text-pink-500" />
                Vibe Check: Laugh vs Cry
              </CardTitle>
              <CardDescription>
                Frequency of laughter vs &quot;F in chat&quot; moments
              </CardDescription>
            </CardHeader>
            <CardContent className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      {
                        name: "Laughs",
                        value: data.funny_stats.laugh_vs_cry.laugh,
                        fill: "#ec4899",
                      },
                      {
                        name: "Cries",
                        value: data.funny_stats.laugh_vs_cry.cry,
                        fill: "#3b82f6",
                      },
                    ]}
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    <Cell fill="#ec4899" />
                    <Cell fill="#3b82f6" />
                  </Pie>
                  <Tooltip contentStyle={chartTooltipStyle(chart.isDark)} />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp size={16} className="text-emerald-500" />
                Longest Monologue
              </CardTitle>
              <CardDescription>
                Longest continuous transcript segment detected
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col justify-center h-[220px] space-y-4">
              <div className="bg-muted/30 p-4 rounded-lg border border-border/50 italic text-sm relative">
                <span className="absolute -top-3 -left-1 text-4xl text-primary/20 font-serif">
                  &quot;
                </span>
                {data.funny_stats.longest_segment.text}...
                <span className="absolute -bottom-6 -right-1 text-4xl text-primary/20 font-serif">
                  &quot;
                </span>
              </div>
              <div className="flex items-center justify-between">
                <Badge variant="secondary" className="font-mono">
                  {data.funny_stats.longest_segment.duration} seconds
                </Badge>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">
                  Absolute Yapper
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

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

      {/* Row: Streamer Vocabulary */}
      {data.top_streamer_words && data.top_streamer_words.length > 0 && (
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
                data={data.top_streamer_words}
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
                  {data.top_streamer_words.map((entry, index) => (
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
      {data.top_complex_words && data.top_complex_words.length > 0 && (
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
                data={data.top_complex_words}
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
                  {data.top_complex_words.map((entry, index) => (
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
