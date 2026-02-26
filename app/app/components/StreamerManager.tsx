"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Plus,
  Loader2,
  Twitch,
  RefreshCw,
  ServerCog,
  CheckCircle2,
  XCircle,
  Search,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";
import {
  getStreamers,
  addStreamer,
  getScrapeTasks,
  getClassificationTasks,
  refreshStreamerVods,
  requeueClassification,
} from "../lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

interface Streamer {
  id: string;
  login: string;
  display_name: string;
  profile_image_url: string;
}

interface ScrapeTask {
  id: string;
  video_id: string;
  streamer_login: string;
  streamer_display_name: string;
  status: "Pending" | "InProgress" | "Completed" | "Failed";
  progress_percent: number;
  error_message: string | null;
}

interface ClassificationTask {
  id: string;
  video_id: string;
  video_streamer: string;
  video_title: string;
  status: "Pending" | "InProgress" | "Completed" | "Failed";
  progress_percent: number;
  error_message: string | null;
}

export function StreamerManager() {
  const [streamers, setStreamers] = useState<Streamer[]>([]);
  const [tasks, setTasks] = useState<ScrapeTask[]>([]);
  const [classTasks, setClassTasks] = useState<ClassificationTask[]>([]);
  const [newLogin, setNewLogin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const [streamersData, tasksData, classTasksData] = await Promise.all([
        getStreamers(),
        getScrapeTasks(),
        getClassificationTasks(),
      ]);
      setStreamers(streamersData.results || streamersData);
      setTasks(tasksData.results || tasksData);
      setClassTasks(classTasksData.results || classTasksData);
    } catch (err) {
      console.error("Failed to fetch streamers/tasks", err);
    }
  }, []);

  // Poll for tasks every 3 seconds
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleAddStreamer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLogin.trim()) return;

    setLoading(true);
    setError("");

    try {
      await addStreamer(newLogin.trim().toLowerCase());
      setNewLogin("");
      fetchData(); // Immediately refresh
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { error?: string } } };
      setError(axiosError.response?.data?.error || "Failed to add streamer");
    } finally {
      setLoading(false);
    }
  };

  const pendingCount = tasks.filter((t) => t.status === "Pending").length;
  const inProgressCount = tasks.filter((t) => t.status === "InProgress").length;

  const classPendingCount = classTasks.filter(
    (t) => t.status === "Pending",
  ).length;
  const classInProgressCount = classTasks.filter(
    (t) => t.status === "InProgress",
  ).length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Streamers List */}
      <div className="flex flex-col gap-8">
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Twitch className="text-purple-500" size={20} />
              Tracked Streamers
            </CardTitle>
            <CardDescription>
              Add a Twitch username. The system will automatically find their
              recent VODs and queue them for download. It will also check daily
              for new VODs.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <form onSubmit={handleAddStreamer} className="flex gap-4">
              <Input
                placeholder="e.g. tarik, fps_shaka, ibai"
                value={newLogin}
                onChange={(e) => setNewLogin(e.target.value)}
                className="flex-1"
              />
              <Button type="submit" disabled={loading || !newLogin}>
                {loading ? (
                  <Loader2 className="animate-spin mr-2" size={18} />
                ) : (
                  <Plus className="mr-2" size={18} />
                )}
                Track
              </Button>
            </form>

            {error && (
              <p className="text-destructive text-sm font-medium">{error}</p>
            )}

            <ScrollArea className="h-[400px] border rounded-md p-4 bg-muted/20">
              <div className="space-y-4">
                {streamers.length === 0 ? (
                  <p className="text-center text-muted-foreground text-sm italic py-8">
                    No streamers tracked yet.
                  </p>
                ) : (
                  streamers.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center gap-4 p-3 bg-background rounded-lg border shadow-sm"
                    >
                      {s.profile_image_url ? (
                        <img
                          src={s.profile_image_url}
                          alt={s.display_name}
                          className="w-10 h-10 rounded-full bg-muted"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 font-bold">
                          {s.display_name.charAt(0)}
                        </div>
                      )}
                      <div className="flex-1">
                        <p className="font-bold">{s.display_name}</p>
                        <p className="text-xs text-muted-foreground">
                          @{s.login}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Link href={`/search?streamer=${s.id}`}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-emerald-500"
                            title="Search in this streamer's chats"
                          >
                            <Search size={16} />
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-primary"
                          onClick={async () => {
                            try {
                              await refreshStreamerVods(s.id);
                              fetchData();
                            } catch (e) {
                              console.error(e);
                            }
                          }}
                          title="Scan for new VODs"
                        >
                          <RefreshCw size={16} />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Task Queues Column */}
      <div className="flex flex-col gap-8">
        {/* Task Queue */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 justify-between">
              <div className="flex items-center gap-2">
                <ServerCog className="text-primary" size={20} />
                Download Queue
              </div>
              {(pendingCount > 0 || inProgressCount > 0) && (
                <Badge
                  variant="outline"
                  className="animate-pulse bg-primary/10 border-primary text-primary"
                >
                  Processing
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Live status of background downloads. You must leave the Python
              worker running in the terminal.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[470px] pr-4">
              <div className="space-y-3">
                {tasks.length === 0 ? (
                  <p className="text-center text-muted-foreground text-sm italic py-8">
                    No tasks in queue.
                  </p>
                ) : (
                  tasks.map((t) => (
                    <div
                      key={t.id}
                      className="p-3 border rounded-lg bg-card text-sm space-y-2"
                    >
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-foreground">
                            {t.streamer_display_name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            VOD: {t.video_id}
                          </span>
                        </div>

                        {t.status === "Pending" && (
                          <Badge variant="secondary" className="text-[10px]">
                            <RefreshCw size={10} className="mr-1" /> Pending
                          </Badge>
                        )}
                        {t.status === "InProgress" && (
                          <Badge className="text-[10px] bg-blue-500 hover:bg-blue-600">
                            <Loader2 size={10} className="mr-1 animate-spin" />{" "}
                            {t.progress_percent}%
                          </Badge>
                        )}
                        {t.status === "Completed" && (
                          <Badge className="text-[10px] bg-green-500 hover:bg-green-600">
                            <CheckCircle2 size={10} className="mr-1" /> Done
                          </Badge>
                        )}
                        {t.status === "Failed" && (
                          <Badge variant="destructive" className="text-[10px]">
                            <XCircle size={10} className="mr-1" /> Failed
                          </Badge>
                        )}
                      </div>

                      {t.status === "InProgress" && (
                        <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 transition-all duration-500"
                            style={{ width: `${t.progress_percent}%` }}
                          />
                        </div>
                      )}

                      {t.error_message && (
                        <p className="text-xs text-destructive bg-destructive/10 p-1.5 rounded mt-1 wrap-break-word">
                          {t.error_message}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Classification Queue */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 justify-between">
              <div className="flex items-center gap-2">
                <ServerCog className="text-primary" size={20} />
                AI Toxicity Scanner Queue
              </div>
              {(classPendingCount > 0 || classInProgressCount > 0) && (
                <Badge
                  variant="outline"
                  className="animate-pulse bg-primary/10 border-primary text-primary"
                >
                  Processing
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Live status of the background AI model scoring comments for
              toxicity.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[470px] pr-4">
              <div className="space-y-3">
                {classTasks.length === 0 ? (
                  <p className="text-center text-muted-foreground text-sm italic py-8">
                    No tasks in queue.
                  </p>
                ) : (
                  classTasks.map((t) => (
                    <div
                      key={t.id}
                      className="p-3 border rounded-lg bg-card text-sm space-y-2"
                    >
                      <div className="flex justify-between items-center gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-bold text-foreground shrink-0">
                            {t.video_streamer}
                          </span>
                          <span className="text-xs text-muted-foreground truncate">
                            {t.video_title || `VOD ${t.video_id}`}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {t.status === "Pending" && (
                            <Badge variant="secondary" className="text-[10px]">
                              <RefreshCw size={10} className="mr-1" /> Pending
                            </Badge>
                          )}
                          {t.status === "InProgress" && (
                            <Badge className="text-[10px] bg-blue-500 hover:bg-blue-600">
                              <Loader2 size={10} className="mr-1 animate-spin" />{" "}
                              {t.progress_percent}%
                            </Badge>
                          )}
                          {t.status === "Completed" && (
                            <Badge className="text-[10px] bg-green-500 hover:bg-green-600">
                              <CheckCircle2 size={10} className="mr-1" /> Done
                            </Badge>
                          )}
                          {t.status === "Failed" && (
                            <Badge variant="destructive" className="text-[10px]">
                              <XCircle size={10} className="mr-1" /> Failed
                            </Badge>
                          )}

                          {/* Re-classify button for completed or failed tasks */}
                          {(t.status === "Completed" || t.status === "Failed") && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-orange-500"
                              title="Re-run classification from scratch"
                              onClick={async () => {
                                try {
                                  await requeueClassification(t.video_id);
                                  fetchData();
                                } catch (e: unknown) {
                                  const err = e as { response?: { data?: { error?: string } } };
                                  alert(err.response?.data?.error || "Failed to re-queue");
                                }
                              }}
                            >
                              <RotateCcw size={12} />
                            </Button>
                          )}
                        </div>
                      </div>

                      {t.status === "InProgress" && (
                        <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 transition-all duration-500"
                            style={{ width: `${t.progress_percent}%` }}
                          />
                        </div>
                      )}

                      {t.error_message && (
                        <p className="text-xs text-destructive bg-destructive/10 p-1.5 rounded mt-1 wrap-break-word">
                          {t.error_message}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
