"use client";

import React from "react";
import { useSearchParams } from "next/navigation";
import AddVideo from "./components/AddVideo";
import { LibraryView } from "./components/LibraryView";
import { StreamerManager } from "./components/StreamerManager";
import { ModeToggle } from "./components/mode-toggle";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  LayoutDashboard,
  Search,
  Twitch,
  BarChart2,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { StatsView } from "./components/StatsView";

import { Suspense } from "react";

function HomeContent() {
  const searchParams = useSearchParams();
  const defaultTab = searchParams.get("tab") || "videos";
  const [activeTab, setActiveTab] = React.useState(defaultTab);

  React.useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab) setActiveTab(tab);
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b sticky top-0 bg-background/95 backdrop-blur z-50">
        <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-primary p-1.5 rounded-lg text-primary-foreground">
              <Twitch size={24} />
            </div>
            <h1 className="text-xl font-bold tracking-tight">ChatToolkit</h1>
          </div>
          <div className="flex items-center gap-6">
            <Link
              href="/search"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2"
            >
              <Search size={16} />
              Global Search
            </Link>
            <Link
              href="/?tab=stats"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2"
            >
              <BarChart2 size={16} />
              Stats
            </Link>
            <ModeToggle />
          </div>
        </div>
      </nav>

      <main className="p-4 md:p-10 max-w-7xl mx-auto space-y-10">
        <AddVideo
          onAdded={() => {
            /* No-op or trigger LibraryView refresh if needed globally */
          }}
        />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="flex items-center gap-4 mb-8">
            <TabsList className="grid w-full max-w-[500px] grid-cols-3">
              <TabsTrigger value="videos" className="flex items-center gap-2">
                <LayoutDashboard size={16} /> Library
              </TabsTrigger>
              <TabsTrigger
                value="streamers"
                className="flex items-center gap-2"
              >
                <Twitch size={16} /> Streamers
              </TabsTrigger>
              <TabsTrigger value="stats" className="flex items-center gap-2">
                <BarChart2 size={16} /> Stats
              </TabsTrigger>
            </TabsList>
            <Link href="/search">
              <button className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 hover:border-primary/40 transition-all">
                <Search size={16} />
                Global Search
              </button>
            </Link>
          </div>

          <TabsContent value="videos" className="space-y-4">
            <LibraryView />
          </TabsContent>

          <TabsContent value="streamers">
            <StreamerManager />
          </TabsContent>

          <TabsContent value="stats">
            <StatsView />
          </TabsContent>
        </Tabs>
      </main>

      <footer className="py-12 border-t mt-20">
        <div className="max-w-7xl mx-auto px-4 md:px-8 flex flex-col md:flex-row justify-between items-center gap-4 text-muted-foreground text-xs font-medium">
          <p>© 2026 CHAT TOOLKIT. ALL LOGS SECURED.</p>
          <div className="flex gap-8">
            <a href="#" className="hover:text-foreground">
              PRIVACY
            </a>
            <a href="#" className="hover:text-foreground">
              SUPABASE
            </a>
            <a href="#" className="hover:text-foreground">
              RESOURCES
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <Loader2 className="animate-spin text-primary" size={40} />
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
