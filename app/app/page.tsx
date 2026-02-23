"use client";

import React from "react";
import AddVideo from "./components/AddVideo";
import { LibraryView } from "./components/LibraryView";
import { GlobalSearch } from "./components/GlobalSearch";
import { StreamerManager } from "./components/StreamerManager";
import { ModeToggle } from "./components/mode-toggle";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LayoutDashboard, Search, Twitch } from "lucide-react";

export default function Home() {
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
          <ModeToggle />
        </div>
      </nav>

      <main className="p-4 md:p-10 max-w-7xl mx-auto space-y-10">
        <AddVideo
          onAdded={() => {
            /* No-op or trigger LibraryView refresh if needed globally */
          }}
        />

        <Tabs defaultValue="videos" className="w-full">
          <TabsList className="grid w-full max-w-[600px] grid-cols-3 mb-8">
            <TabsTrigger value="videos" className="flex items-center gap-2">
              <LayoutDashboard size={16} /> Library
            </TabsTrigger>
            <TabsTrigger value="streamers" className="flex items-center gap-2">
              <Twitch size={16} /> Streamers
            </TabsTrigger>
            <TabsTrigger value="search" className="flex items-center gap-2">
              <Search size={16} /> Global Search
            </TabsTrigger>
          </TabsList>

          <TabsContent value="videos" className="space-y-4">
            <LibraryView />
          </TabsContent>

          <TabsContent value="streamers">
            <StreamerManager />
          </TabsContent>

          <TabsContent value="search">
            <GlobalSearch />
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
