"use client";

import React, { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
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
} from "lucide-react";

interface StatItem {
  commenter_login?: string;
  commenter_display_name?: string;
  count?: number;
  toxic_count?: number;
  total_count?: number;
  ratio?: number;
  video__title?: string;
}

interface StatsData {
  top_commenters: StatItem[];
  most_toxic_absolute: StatItem[];
  most_toxic_relative: StatItem[];
  toxicity_by_video: StatItem[];
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

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground animate-pulse">
        <Loader2 className="animate-spin mb-4 text-primary" size={40} />
        <p className="text-sm font-bold uppercase tracking-widest">
          Calculating Statistics...
        </p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black tracking-tight flex items-center gap-2">
            <TrendingUp className="text-primary" />
            COMMUNITY OVERVIEW
          </h2>
          <p className="text-muted-foreground text-sm font-medium">
            Analyzing chat behavior and sentiment across your library.
          </p>
        </div>

        <div className="flex items-center gap-3 bg-muted/30 p-2 rounded-xl border border-border/50">
          <Filter size={16} className="ml-2 text-muted-foreground" />
          <select
            className="bg-transparent border-none text-sm font-bold focus:ring-0 cursor-pointer pr-10 outline-none"
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top 10 Commenters */}
        <Card className="overflow-hidden border-none bg-muted/20 shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl font-black">
              <Users className="text-blue-500" />
              TOP 10 COMMENTERS
            </CardTitle>
            <CardDescription className="font-medium">
              Users with the highest message volume.
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.top_commenters}
                layout="vertical"
                margin={{ left: 10, right: 30 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  horizontal={false}
                  opacity={0.1}
                />
                <XAxis type="number" hide />
                <YAxis
                  dataKey="commenter_display_name"
                  type="category"
                  width={100}
                  tick={{
                    fontSize: 10,
                    fontWeight: "bold",
                    fill: "currentColor",
                  }}
                />
                <Tooltip
                  cursor={{ fill: "rgba(59, 130, 246, 0.1)" }}
                  contentStyle={{
                    borderRadius: "12px",
                    border: "none",
                    boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)",
                    backgroundColor: "hsl(var(--card))",
                  }}
                />
                <Bar
                  dataKey="count"
                  fill="hsl(var(--primary))"
                  radius={[0, 4, 4, 0]}
                  barSize={20}
                >
                  {data.top_commenters.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={`hsl(var(--primary) / ${1 - index * 0.05})`}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top 10 Most Toxic (Absolute) */}
        <Card className="overflow-hidden border-none bg-muted/20 shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl font-black text-red-500">
              <Skull size={20} />
              MOST TOXIC (COUNT)
            </CardTitle>
            <CardDescription className="font-medium">
              Total toxic messages detected.
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.most_toxic_absolute}
                layout="vertical"
                margin={{ left: 10, right: 30 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  horizontal={false}
                  opacity={0.1}
                />
                <XAxis type="number" hide />
                <YAxis
                  dataKey="commenter_display_name"
                  type="category"
                  width={100}
                  tick={{
                    fontSize: 10,
                    fontWeight: "bold",
                    fill: "currentColor",
                  }}
                />
                <Tooltip
                  cursor={{ fill: "rgba(239, 68, 68, 0.1)" }}
                  contentStyle={{
                    borderRadius: "12px",
                    border: "none",
                    backgroundColor: "hsl(var(--card))",
                  }}
                />
                <Bar
                  dataKey="toxic_count"
                  fill="#ef4444"
                  radius={[0, 4, 4, 0]}
                  barSize={20}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top 10 Most Toxic (Relative %) */}
        <Card className="overflow-hidden border-none bg-muted/20 shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl font-black text-orange-500">
              <MessageSquare size={20} />
              TOXICITY RATIO (%)
            </CardTitle>
            <CardDescription className="font-medium">
              Percentage of messages that are toxic (min. 10 msgs).
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.most_toxic_relative}
                layout="vertical"
                margin={{ left: 10, right: 30 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  horizontal={false}
                  opacity={0.1}
                />
                <XAxis type="number" domain={[0, 100]} hide />
                <YAxis
                  dataKey="commenter_display_name"
                  type="category"
                  width={100}
                  tick={{
                    fontSize: 10,
                    fontWeight: "bold",
                    fill: "currentColor",
                  }}
                />
                <Tooltip
                  formatter={(value) => `${Number(value).toFixed(1)}%`}
                  contentStyle={{
                    borderRadius: "12px",
                    border: "none",
                    backgroundColor: "hsl(var(--card))",
                  }}
                />
                <Bar
                  dataKey="ratio"
                  fill="#f97316"
                  radius={[0, 4, 4, 0]}
                  barSize={20}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Most Toxic Videos */}
        <Card className="overflow-hidden border-none bg-muted/20 shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl font-black text-purple-500">
              <Twitch size={20} />
              TOXIC VIDEOS (%)
            </CardTitle>
            <CardDescription className="font-medium">
              Videos with the most hostile chat atmosphere.
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.toxicity_by_video}
                layout="vertical"
                margin={{ left: 10, right: 30 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  horizontal={false}
                  opacity={0.1}
                />
                <XAxis type="number" domain={[0, 100]} hide />
                <YAxis
                  dataKey="video__title"
                  type="category"
                  width={120}
                  tick={{
                    fontSize: 9,
                    fontWeight: "bold",
                    fill: "currentColor",
                  }}
                  tickFormatter={(val) =>
                    val.length > 20 ? val.substring(0, 17) + "..." : val
                  }
                />
                <Tooltip
                  formatter={(value) => `${Number(value).toFixed(1)}%`}
                  contentStyle={{
                    borderRadius: "12px",
                    border: "none",
                    backgroundColor: "hsl(var(--card))",
                  }}
                />
                <Bar
                  dataKey="ratio"
                  fill="#8b5cf6"
                  radius={[0, 4, 4, 0]}
                  barSize={20}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
