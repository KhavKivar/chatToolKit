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
import { useRouter, useSearchParams } from "next/navigation";
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
  Users,
  MessageSquare,
  TrendingUp,
  ShieldAlert,
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
  hour?: number;
}

interface StatsData {
  top_commenters: StatItem[];
  most_toxic_absolute: StatItem[];
  most_toxic_relative: StatItem[];
  toxicity_by_video: StatItem[];
  hourly_stats: StatItem[];
  total_videos: number;
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
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardDescription className="text-[11px] font-medium uppercase tracking-wider leading-tight">
            {label}
          </CardDescription>
          <div className={`p-1.5 rounded-md shrink-0 ${color}`}>
            <Icon size={13} className="text-white" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div
          className={`font-bold tracking-tight leading-tight ${
            truncate
              ? "text-base truncate"
              : "text-2xl"
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

export function StatsView({ standalone = false }: { standalone?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [streamers, setStreamers] = useState<Streamer[]>([]);

  // Read streamer filter from URL param
  const streamerFilter = searchParams.get("streamer") ?? "";

  const setStreamerFilter = (val: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (val) {
      params.set("streamer", val);
    } else {
      params.delete("streamer");
    }
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  useEffect(() => {
    getStreamers().then((res) => {
      setStreamers(res.results || res);
    });
  }, []);

  useEffect(() => {
    setLoading(true);
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
      0
    );
    const totalToxic = data.hourly_stats.reduce(
      (s, h) => s + (h.toxic_count || 0),
      0
    );
    const toxicRate =
      totalMessages > 0
        ? ((totalToxic / totalMessages) * 100).toFixed(1)
        : "0";
    const topCommenter =
      data.top_commenters[0]?.commenter_display_name ?? "—";
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
        (t) => t.commenter_login === c.commenter_login
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
      { name: "Clean", value: kpis.totalMessages - kpis.totalToxic, fill: "#22c55e" },
      { name: "Toxic", value: kpis.totalToxic, fill: "#ef4444" },
    ];
  }, [kpis]);

  // Video data with streamer name + date in label
  const videoToxicityData = useMemo(() => {
    if (!data) return [];
    return data.toxicity_by_video.slice(0, 8).map((v) => {
      const streamer = v.video__streamer_display_name
        ? `[${v.video__streamer_display_name}] `
        : "";
      const date = v.video__created_at
        ? new Date(v.video__created_at).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })
        : null;
      const fullTitle = `${streamer}${v.video__title ?? "Unknown"}`;
      const truncated =
        fullTitle.length > 22 ? fullTitle.substring(0, 19) + "…" : fullTitle;
      return {
        title: date ? `${truncated}\n${date}` : truncated,
        fullTitle: date ? `${fullTitle} · ${date}` : fullTitle,
        ratio: parseFloat((v.ratio ?? 0).toFixed(1)),
        total: v.total_count ?? 0,
        toxic: v.toxic_count ?? 0,
      };
    });
  }, [data]);

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-4">
        <Loader2 className="animate-spin text-primary" size={40} strokeWidth={2} />
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
          <Select value={streamerFilter || "all"} onValueChange={(v) => setStreamerFilter(v === "all" ? "" : v)}>
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
            <Link href={`/stats${streamerFilter ? `?streamer=${streamerFilter}` : ""}`}>
              <Badge variant="outline" className="gap-1.5 cursor-pointer hover:bg-accent transition-colors whitespace-nowrap">
                <ExternalLink size={11} />
                Open full page
              </Badge>
            </Link>
          )}
        </div>
      </div>

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
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.top_commenters}
                layout="vertical"
                margin={{ left: 8, right: 40, top: 0, bottom: 0 }}
              >
                <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke={chart.gridColor} />
                <XAxis type="number" axisLine={false} tickLine={false} tick={tickProps} />
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
                  cursor={{ fill: chart.isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)" }}
                  formatter={(v) => [Number(v).toLocaleString(), "Messages"]}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={18} fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
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
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.most_toxic_absolute}
                layout="vertical"
                margin={{ left: 8, right: 40, top: 0, bottom: 0 }}
              >
                <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke={chart.gridColor} />
                <XAxis type="number" axisLine={false} tickLine={false} tick={tickProps} />
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
                  formatter={(v) => [Number(v).toLocaleString(), "Toxic messages"]}
                />
                <Bar dataKey="toxic_count" radius={[0, 4, 4, 0]} barSize={18} fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
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
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data.most_toxic_relative}
              layout="vertical"
              margin={{ left: 8, right: 48, top: 0, bottom: 0 }}
            >
              <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke={chart.gridColor} />
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
                formatter={(v) => [`${Number(v).toFixed(1)}%`, "Toxicity rate"]}
              />
              <Bar dataKey="ratio" radius={[0, 4, 4, 0]} barSize={22} fill="#f97316" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Row 2: Video Engagement vs Toxicity — with date on Y axis */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Video size={16} className="text-green-500" />
            Video Engagement vs Toxicity
          </CardTitle>
          <CardDescription>
            Total messages and toxic count per VOD — see which streams had the
            most activity and how much was flagged
          </CardDescription>
        </CardHeader>
        <CardContent className="h-[360px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={videoToxicityData}
              layout="vertical"
              margin={{ left: 8, right: 32, top: 16, bottom: 8 }}
              barCategoryGap="30%"
              barGap={3}
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
                  fill: chart.isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
                }}
                labelFormatter={(_, payload) =>
                  payload?.[0]
                    ? (payload[0].payload as { fullTitle: string }).fullTitle
                    : ""
                }
              />
              <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="total" name="Total msgs" fill="#3b82f6" radius={[0, 3, 3, 0]} barSize={10} />
              <Bar dataKey="toxic" name="Toxic msgs" fill="#ef4444" radius={[0, 3, 3, 0]} barSize={10} />
            </BarChart>
          </ResponsiveContainer>
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
            <CardDescription>Share of clean vs flagged messages</CardDescription>
          </CardHeader>
          <CardContent className="h-[260px] flex flex-col items-center justify-center gap-2">
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
                  formatter={(val) => [Number(val).toLocaleString(), undefined]}
                />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="text-center">
              <p className="text-2xl font-bold">{kpis.toxicRate}%</p>
              <p className="text-xs text-muted-foreground">overall toxicity</p>
            </div>
          </CardContent>
        </Card>

        {/* Most Toxic Videos — auto-scaled domain so bars are visible */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ShieldAlert size={16} className="text-purple-500" />
              Most Toxic Videos
            </CardTitle>
            <CardDescription>Toxicity ratio per VOD (%)</CardDescription>
          </CardHeader>
          <CardContent className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={videoToxicityData}
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
                  domain={[0, "auto"]}
                  axisLine={false}
                  tickLine={false}
                  tick={tickProps}
                  tickFormatter={(v) => `${v}%`}
                />
                <YAxis
                  dataKey="title"
                  type="category"
                  width={155}
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
                  cursor={{ fill: "rgba(139,92,246,0.07)" }}
                  labelFormatter={(_, payload) =>
                    payload?.[0]
                      ? (payload[0].payload as { fullTitle: string }).fullTitle
                      : ""
                  }
                  formatter={(val) => [`${Number(val).toFixed(1)}%`, "Toxicity"]}
                />
                <Bar dataKey="ratio" radius={[0, 4, 4, 0]} barSize={18} fill="#a855f7" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Row 4: Top Commenters stacked clean vs toxic */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <BarChart2 size={16} className="text-blue-500" />
            Top Commenters — Clean vs Toxic Breakdown
          </CardTitle>
          <CardDescription>
            Message volume split by clean and flagged content for the most active users
          </CardDescription>
        </CardHeader>
        <CardContent className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={commenterCrossData}
              layout="vertical"
              margin={{ left: 8, right: 32, top: 0, bottom: 0 }}
            >
              <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke={chart.gridColor} />
              <XAxis type="number" axisLine={false} tickLine={false} tick={tickProps} />
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
                cursor={{ fill: chart.isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)" }}
              />
              <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="clean" name="Clean" stackId="a" fill="#3b82f6" barSize={18} />
              <Bar dataKey="toxic" name="Toxic" stackId="a" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={18} />
            </BarChart>
          </ResponsiveContainer>
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
