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
  AreaChart,
  Area,
  Legend,
} from "recharts";
import { getStats, getStreamers } from "../lib/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Loader2,
  Users,
  Skull,
  MessageSquare,
  TrendingUp,
  Filter,
  Twitch,
  Clock,
  ShieldAlert,
} from "lucide-react";

interface StatItem {
  commenter_login?: string;
  commenter_display_name?: string;
  count?: number;
  toxic_count?: number;
  total_count?: number;
  ratio?: number;
  video__title?: string;
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

export function StatsView() {
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [streamers, setStreamers] = useState<Streamer[]>([]);
  const [streamerFilter, setStreamerFilter] = useState("");

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

  const hourlyChartData = useMemo(() => {
    if (!data?.hourly_stats) return [];
    // Ensure all 24 hours are represented
    const fullDay = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      display: `${i}:00`,
      count: 0,
      toxic_count: 0,
      toxic_ratio: 0,
    }));

    data.hourly_stats.forEach((item) => {
      if (item.hour !== undefined && fullDay[item.hour]) {
        fullDay[item.hour].count = item.count || 0;
        fullDay[item.hour].toxic_count = item.toxic_count || 0;
        fullDay[item.hour].toxic_ratio = item.count
          ? (item.toxic_count! / item.count) * 100
          : 0;
      }
    });
    return fullDay;
  }, [data]);

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground animate-in fade-in zoom-in duration-700">
        <div className="relative mb-6">
          <Loader2
            className="animate-spin text-primary"
            size={48}
            strokeWidth={2.5}
          />
          <div className="absolute inset-0 blur-xl bg-primary/20 rounded-full animate-pulse" />
        </div>
        <p className="text-sm font-black uppercase tracking-[0.3em] bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/40">
          Synthesizing Intelligence
        </p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      {/* Header & Filter */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-6 border-b border-border/40 pb-10">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-[10px] font-black uppercase tracking-widest text-primary mb-2">
            <TrendingUp size={12} />
            Ecosystem Pulse
          </div>
          <h2 className="text-5xl font-black tracking-tighter italic uppercase underline decoration-primary/30 decoration-4 underline-offset-8">
            VOD ANALYTICS
          </h2>
          <p className="text-muted-foreground text-sm font-medium tracking-tight max-w-md">
            Advanced behavioral modeling and sentiment distribution across{" "}
            {streamerFilter
              ? streamers.find((s) => s.id === streamerFilter)?.display_name
              : "all integrated channels"}
            .
          </p>
        </div>

        <div className="group relative">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-primary to-purple-600 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-500" />
          <div className="relative flex items-center gap-3 bg-zinc-950 px-5 py-3 rounded-2xl border border-white/10 ring-1 ring-white/5 shadow-2xl">
            <Filter size={18} className="text-primary/70" />
            <span className="text-xs font-black text-muted-foreground uppercase tracking-tighter mr-2">
              Streamer:
            </span>
            <select
              className="bg-transparent border-none text-sm font-black focus:ring-0 cursor-pointer pr-8 outline-none text-white appearance-none hover:text-primary transition-colors"
              style={{ colorScheme: "dark" }}
              value={streamerFilter}
              onChange={(e) => setStreamerFilter(e.target.value)}
            >
              <option value="" className="bg-zinc-950 font-bold">
                GLOBAL (ALL)
              </option>
              {streamers.map((s) => (
                <option
                  key={s.id}
                  value={s.id}
                  className="bg-zinc-950 font-bold"
                >
                  {s.display_name.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Hero Stats: Hourly Pulse */}
      <div className="grid grid-cols-1 gap-8">
        <Card className="border-none bg-zinc-900/40 backdrop-blur-xl ring-1 ring-white/5 overflow-hidden group shadow-2xl">
          <CardHeader className="pb-2">
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-2xl font-black tracking-tight flex items-center gap-3">
                  <Clock className="text-primary animate-pulse" />
                  HOURLY CHAT TEMPO
                </CardTitle>
                <CardDescription className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">
                  Global activity vs toxicity ratio by time of day
                </CardDescription>
              </div>
              <div className="flex gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-primary" />
                  <span className="text-[10px] font-black uppercase tracking-tighter">
                    Messages
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <span className="text-[10px] font-black uppercase tracking-tighter">
                    Toxicity %
                  </span>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="h-[400px] pt-10">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={hourlyChartData}
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="hsl(var(--primary))"
                      stopOpacity={0.4}
                    />
                    <stop
                      offset="95%"
                      stopColor="hsl(var(--primary))"
                      stopOpacity={0}
                    />
                  </linearGradient>
                  <linearGradient id="colorToxic" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="rgba(255,255,255,0.03)"
                />
                <XAxis
                  dataKey="display"
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fontSize: 10,
                    fontWeight: 900,
                    fill: "rgba(255,255,255,0.4)",
                  }}
                />
                <YAxis yAxisId="left" hide />
                <YAxis yAxisId="right" orientation="right" hide />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0a0a0a",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "16px",
                    boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
                    padding: "12px",
                  }}
                  itemStyle={{
                    fontSize: "11px",
                    fontWeight: 900,
                    textTransform: "uppercase",
                  }}
                  labelStyle={{
                    marginBottom: "8px",
                    color: "#fff",
                    fontWeight: 900,
                  }}
                />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="count"
                  stroke="hsl(var(--primary))"
                  strokeWidth={4}
                  fillOpacity={1}
                  fill="url(#colorCount)"
                  animationDuration={2000}
                />
                <Area
                  yAxisId="right"
                  type="monotone"
                  dataKey="toxic_ratio"
                  stroke="#ef4444"
                  strokeWidth={4}
                  fillOpacity={1}
                  fill="url(#colorToxic)"
                  animationDuration={2500}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Grid Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-8">
        {/* Most Contentious Videos */}
        <Card className="bg-zinc-900/30 border-none ring-1 ring-white/5 shadow-xl hover:ring-purple-500/20 transition-all duration-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-lg font-black tracking-tight text-purple-400">
              <ShieldAlert size={20} />
              HOSTILE ENVIRONMENTS
            </CardTitle>
            <CardDescription className="text-[10px] font-bold uppercase tracking-widest opacity-50">
              Videos with the most concentrated toxicity
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.toxicity_by_video}
                layout="vertical"
                margin={{ left: 10, right: 30 }}
              >
                <XAxis type="number" domain={[0, 100]} hide />
                <YAxis
                  dataKey="video__title"
                  type="category"
                  width={140}
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fontSize: 9,
                    fontWeight: 800,
                    fill: "rgba(255,255,255,0.6)",
                  }}
                  tickFormatter={(val) =>
                    val.length > 22 ? val.substring(0, 19) + "..." : val
                  }
                />
                <Tooltip
                  cursor={{ fill: "rgba(139, 92, 246, 0.05)" }}
                  formatter={(value) => [
                    `${Number(value).toFixed(1)}% Toxicity`,
                    "Ratio",
                  ]}
                  contentStyle={{
                    backgroundColor: "#09090b",
                    border: "1px solid #27272a",
                    borderRadius: "12px",
                  }}
                />
                <Bar dataKey="ratio" radius={[0, 6, 6, 0]} barSize={18}>
                  {data.toxicity_by_video.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={`rgba(139, 92, 246, ${1 - index * 0.08})`}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top 10 Most Toxic (Relative %) */}
        <Card className="bg-zinc-900/30 border-none ring-1 ring-white/5 shadow-xl hover:ring-orange-500/20 transition-all duration-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-lg font-black tracking-tight text-orange-400">
              <Skull size={20} />
              TOXICITY LEADERSHIP
            </CardTitle>
            <CardDescription className="text-[10px] font-bold uppercase tracking-widest opacity-50">
              Users with highest toxicity per message (min 10)
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.most_toxic_relative}
                layout="vertical"
                margin={{ left: 10, right: 30 }}
              >
                <XAxis type="number" domain={[0, 100]} hide />
                <YAxis
                  dataKey="commenter_display_name"
                  type="category"
                  width={120}
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fontSize: 10,
                    fontWeight: 900,
                    fill: "rgba(255,255,255,0.7)",
                  }}
                />
                <Tooltip
                  cursor={{ fill: "rgba(249, 115, 22, 0.05)" }}
                  formatter={(value) => [
                    `${Number(value).toFixed(1)}% Toxic`,
                    "Ratio",
                  ]}
                  contentStyle={{
                    backgroundColor: "#09090b",
                    border: "1px solid #27272a",
                    borderRadius: "12px",
                  }}
                />
                <Bar dataKey="ratio" radius={[0, 6, 6, 0]} barSize={18}>
                  {data.most_toxic_relative.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={`rgba(249, 115, 22, ${1 - index * 0.07})`}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top 10 Commenters */}
        <Card className="bg-zinc-900/30 border-none ring-1 ring-white/5 shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-lg font-black tracking-tight text-blue-400">
              <Users size={20} />
              POWER USERS
            </CardTitle>
            <CardDescription className="text-[10px] font-bold uppercase tracking-widest opacity-50">
              Most active community members by volume
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.top_commenters}
                layout="vertical"
                margin={{ left: 10, right: 30 }}
              >
                <XAxis type="number" hide />
                <YAxis
                  dataKey="commenter_display_name"
                  type="category"
                  width={120}
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fontSize: 10,
                    fontWeight: 900,
                    fill: "rgba(255,255,255,0.7)",
                  }}
                />
                <Tooltip
                  cursor={{ fill: "rgba(59, 130, 246, 0.05)" }}
                  contentStyle={{
                    backgroundColor: "#09090b",
                    border: "1px solid #27272a",
                    borderRadius: "12px",
                  }}
                />
                <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={18}>
                  {data.top_commenters.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={`rgba(59, 130, 246, ${1 - index * 0.08})`}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top 10 Most Toxic (Absolute) */}
        <Card className="bg-zinc-900/30 border-none ring-1 ring-white/5 shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-lg font-black tracking-tight text-red-500">
              <MessageSquare size={20} />
              TOXIC VOLUME
            </CardTitle>
            <CardDescription className="text-[10px] font-bold uppercase tracking-widest opacity-50">
              Highest total number of flagged messages
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.most_toxic_absolute}
                layout="vertical"
                margin={{ left: 10, right: 30 }}
              >
                <XAxis type="number" hide />
                <YAxis
                  dataKey="commenter_display_name"
                  type="category"
                  width={120}
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fontSize: 10,
                    fontWeight: 900,
                    fill: "rgba(255,255,255,0.7)",
                  }}
                />
                <Tooltip
                  cursor={{ fill: "rgba(239, 68, 68, 0.05)" }}
                  contentStyle={{
                    backgroundColor: "#09090b",
                    border: "1px solid #27272a",
                    borderRadius: "12px",
                  }}
                />
                <Bar dataKey="toxic_count" radius={[0, 6, 6, 0]} barSize={18}>
                  {data.most_toxic_absolute.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={`rgba(239, 68, 68, ${1 - index * 0.08})`}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
