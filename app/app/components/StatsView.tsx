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
  Loader2,
  Users,
  Skull,
  MessageSquare,
  TrendingUp,
  Filter,
  ShieldAlert,
  AlertTriangle,
  BarChart2,
  Flame,
  Trophy,
  Video,
} from "lucide-react";

interface StatItem {
  commenter_login?: string;
  commenter_display_name?: string;
  count?: number;
  toxic_count?: number;
  total_count?: number;
  ratio?: number;
  video__title?: string;
  video__id?: string;
  hour?: number;
}

interface StatsData {
  top_commenters: StatItem[];
  most_toxic_absolute: StatItem[];
  most_toxic_relative: StatItem[];
  toxicity_by_video: StatItem[];
  hourly_stats: StatItem[];
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
    tickColor: isDark ? "hsl(215 20.2% 65.1%)" : "hsl(215.4 16.3% 46.9%)",
    gridColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
    tooltipBg: isDark ? "hsl(222.2 84% 4.9%)" : "hsl(0 0% 100%)",
    tooltipBorder: isDark ? "hsl(217.2 32.6% 17.5%)" : "hsl(214.3 31.8% 91.4%)",
    tooltipText: isDark ? "hsl(210 40% 98%)" : "hsl(222.2 47.4% 11.2%)",
  };
}

function StatKpiCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardDescription className="text-xs font-medium uppercase tracking-wider">
            {label}
          </CardDescription>
          <div className={`p-2 rounded-lg ${color}`}>
            <Icon size={14} className="text-white" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="text-3xl font-bold tracking-tight">{value}</div>
        {sub && (
          <p className="text-xs text-muted-foreground mt-1">{sub}</p>
        )}
      </CardContent>
    </Card>
  );
}

function TooltipStyle(isDark: boolean) {
  return {
    backgroundColor: isDark ? "hsl(222.2, 84%, 4.9%)" : "#ffffff",
    border: `1px solid ${isDark ? "hsl(217.2, 32.6%, 17.5%)" : "hsl(214.3, 31.8%, 91.4%)"}`,
    borderRadius: "10px",
    color: isDark ? "#f8fafc" : "#0f172a",
    fontSize: "12px",
    padding: "10px 14px",
  };
}

export function StatsView() {
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [streamers, setStreamers] = useState<Streamer[]>([]);
  const [streamerFilter, setStreamerFilter] = useState("");
  const chart = useChartTheme();

  useEffect(() => {
    getStreamers().then((res) => {
      setStreamers(res.results || res);
    });
  }, []);

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      try {
        const stats = await getStats(streamerFilter || undefined);
        setData(stats);
      } catch (err) {
        console.error("Failed to fetch stats:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [streamerFilter]);

  const kpis = useMemo(() => {
    if (!data) return null;
    const totalMessages = data.hourly_stats.reduce((s, h) => s + (h.count || 0), 0);
    const totalToxic = data.hourly_stats.reduce((s, h) => s + (h.toxic_count || 0), 0);
    const toxicRate = totalMessages > 0 ? ((totalToxic / totalMessages) * 100).toFixed(1) : "0";
    const topCommenter = data.top_commenters[0]?.commenter_display_name ?? "—";
    const mostToxicVideo = data.toxicity_by_video[0]?.video__title ?? "—";
    const uniqueVideos = data.toxicity_by_video.length;
    return { totalMessages, totalToxic, toxicRate, topCommenter, mostToxicVideo, uniqueVideos };
  }, [data]);

  // Merge top commenters with their toxicity data
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

  // Toxicity overview pie
  const toxicityPieData = useMemo(() => {
    if (!kpis) return [];
    const toxic = kpis.totalToxic;
    const clean = kpis.totalMessages - toxic;
    return [
      { name: "Clean", value: clean, fill: "#22c55e" },
      { name: "Toxic", value: toxic, fill: "#ef4444" },
    ];
  }, [kpis]);

  // Video toxicity with both ratio and total_count
  const videoToxicityData = useMemo(() => {
    if (!data) return [];
    return data.toxicity_by_video.slice(0, 8).map((v) => ({
      title:
        (v.video__title ?? "Unknown").length > 20
          ? (v.video__title ?? "Unknown").substring(0, 17) + "…"
          : (v.video__title ?? "Unknown"),
      ratio: parseFloat((v.ratio ?? 0).toFixed(1)),
      total: v.total_count ?? 0,
      toxic: v.toxic_count ?? 0,
    }));
  }, [data]);

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-4">
        <Loader2 className="animate-spin text-primary" size={40} strokeWidth={2} />
        <p className="text-sm font-medium tracking-wide">Loading analytics…</p>
      </div>
    );
  }

  if (!data || !kpis) return null;

  const tickProps = { fontSize: 11, fill: chart.tickColor };

  return (
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

        <div className="flex items-center gap-2 border rounded-lg px-3 py-2 bg-background text-sm">
          <Filter size={14} className="text-muted-foreground" />
          <label className="text-muted-foreground font-medium sr-only" htmlFor="streamer-filter">
            Streamer
          </label>
          <select
            id="streamer-filter"
            className="bg-transparent border-none focus:ring-0 outline-none cursor-pointer text-foreground"
            value={streamerFilter}
            onChange={(e) => setStreamerFilter(e.target.value)}
          >
            <option value="">All Streamers</option>
            {streamers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.display_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
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
        />
        <StatKpiCard
          label="Streamers"
          value={streamers.length}
          icon={Users}
          color="bg-green-500"
        />
      </div>

      {/* Row 1: Toxicity Overview Pie + Toxicity by Video */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Toxicity Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Flame size={16} className="text-orange-500" />
              Toxicity Overview
            </CardTitle>
            <CardDescription>Share of clean vs flagged messages</CardDescription>
          </CardHeader>
          <CardContent className="h-[260px] flex flex-col items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={toxicityPieData}
                  cx="50%"
                  cy="45%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                  animationDuration={1000}
                >
                  {toxicityPieData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={TooltipStyle(chart.isDark)}
                  formatter={(val) => [Number(val).toLocaleString(), ""]}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="text-center -mt-2">
              <p className="text-2xl font-bold">{kpis.toxicRate}%</p>
              <p className="text-xs text-muted-foreground">overall toxicity</p>
            </div>
          </CardContent>
        </Card>

        {/* Toxicity by Video */}
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
                margin={{ left: 8, right: 24, top: 0, bottom: 0 }}
              >
                <CartesianGrid
                  horizontal={false}
                  strokeDasharray="3 3"
                  stroke={chart.gridColor}
                />
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  axisLine={false}
                  tickLine={false}
                  tick={tickProps}
                  tickFormatter={(v) => `${v}%`}
                />
                <YAxis
                  dataKey="title"
                  type="category"
                  width={130}
                  axisLine={false}
                  tickLine={false}
                  tick={tickProps}
                />
                <Tooltip
                  contentStyle={TooltipStyle(chart.isDark)}
                  cursor={{ fill: "rgba(139,92,246,0.08)" }}
                  formatter={(val) => [`${Number(val).toFixed(1)}%`, "Toxicity"]}
                />
                <Bar dataKey="ratio" radius={[0, 4, 4, 0]} barSize={16} maxBarSize={20}>
                  {videoToxicityData.map((_, i) => (
                    <Cell
                      key={i}
                      fill={`rgba(139,92,246,${1 - i * 0.09})`}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Top Commenters vs Toxicity (stacked bar) */}
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
              margin={{ left: 8, right: 24, top: 0, bottom: 0 }}
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
                contentStyle={TooltipStyle(chart.isDark)}
                cursor={{ fill: chart.isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)" }}
              />
              <Legend
                iconType="square"
                iconSize={8}
                wrapperStyle={{ fontSize: 11 }}
              />
              <Bar dataKey="clean" name="Clean" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} barSize={18} />
              <Bar dataKey="toxic" name="Toxic" stackId="a" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Row 3: Two charts side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Toxicity Leadership (relative %) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Skull size={16} className="text-orange-500" />
              Highest Toxicity Rate
            </CardTitle>
            <CardDescription>Users with highest % of flagged messages (min 10 msgs)</CardDescription>
          </CardHeader>
          <CardContent className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.most_toxic_relative}
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
                  domain={[0, 100]}
                  axisLine={false}
                  tickLine={false}
                  tick={tickProps}
                  tickFormatter={(v) => `${v}%`}
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
                  contentStyle={TooltipStyle(chart.isDark)}
                  cursor={{ fill: "rgba(249,115,22,0.06)" }}
                  formatter={(v) => [`${Number(v).toFixed(1)}%`, "Toxicity rate"]}
                />
                <Bar dataKey="ratio" radius={[0, 4, 4, 0]} barSize={18}>
                  {data.most_toxic_relative.map((_, i) => (
                    <Cell key={i} fill={`rgba(249,115,22,${1 - i * 0.08})`} />
                  ))}
                </Bar>
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
            <CardDescription>Highest absolute count of flagged messages sent</CardDescription>
          </CardHeader>
          <CardContent className="h-[280px]">
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
                  contentStyle={TooltipStyle(chart.isDark)}
                  cursor={{ fill: "rgba(239,68,68,0.06)" }}
                  formatter={(v) => [Number(v).toLocaleString(), "Toxic messages"]}
                />
                <Bar dataKey="toxic_count" radius={[0, 4, 4, 0]} barSize={18}>
                  {data.most_toxic_absolute.map((_, i) => (
                    <Cell key={i} fill={`rgba(239,68,68,${1 - i * 0.08})`} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Row 4: Power Users & Video Message Volume */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Power Users */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Trophy size={16} className="text-yellow-500" />
              Power Users
            </CardTitle>
            <CardDescription>Most active community members by message count</CardDescription>
          </CardHeader>
          <CardContent className="h-[280px]">
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
                  contentStyle={TooltipStyle(chart.isDark)}
                  cursor={{ fill: chart.isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)" }}
                  formatter={(v) => [Number(v).toLocaleString(), "Messages"]}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={18}>
                  {data.top_commenters.map((_, i) => (
                    <Cell key={i} fill={`rgba(59,130,246,${1 - i * 0.08})`} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Video message volume + toxicity count side by side */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Video size={16} className="text-green-500" />
              Video Engagement vs Toxicity
            </CardTitle>
            <CardDescription>Total messages and toxic count per VOD</CardDescription>
          </CardHeader>
          <CardContent className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={videoToxicityData}
                layout="vertical"
                margin={{ left: 8, right: 24, top: 0, bottom: 0 }}
                barCategoryGap="25%"
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
                  width={130}
                  axisLine={false}
                  tickLine={false}
                  tick={tickProps}
                />
                <Tooltip
                  contentStyle={TooltipStyle(chart.isDark)}
                  cursor={{ fill: chart.isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)" }}
                />
                <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="total" name="Total msgs" fill="#22c55e" radius={[0, 2, 2, 0]} barSize={10} />
                <Bar dataKey="toxic" name="Toxic msgs" fill="#ef4444" radius={[0, 2, 2, 0]} barSize={10} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
