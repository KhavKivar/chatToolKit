"use client";

import React, { Suspense } from "react";
import { GlobalSearch } from "../components/GlobalSearch";
import { ModeToggle } from "../components/mode-toggle";
import { Twitch, ChevronLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

function SearchContent() {
  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b sticky top-0 bg-background/95 backdrop-blur z-50">
        <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="hover:opacity-80 transition-opacity">
              <div className="flex items-center gap-2">
                <div className="bg-primary p-1.5 rounded-lg text-primary-foreground">
                  <Twitch size={24} />
                </div>
                <h1 className="text-xl font-bold tracking-tight hidden sm:block">
                  ChatToolkit
                </h1>
              </div>
            </Link>
            <div className="h-6 w-px bg-border hidden sm:block" />
            <Link href="/">
              <Button variant="ghost" size="sm" className="gap-2">
                <ChevronLeft size={16} />
                Back to Library
              </Button>
            </Link>
          </div>
          <ModeToggle />
        </div>
      </nav>

      <main className="p-4 md:p-10 max-w-7xl mx-auto space-y-10">
        <div className="flex flex-col gap-1">
          <h2 className="text-3xl font-bold tracking-tight">Search Results</h2>
          <p className="text-muted-foreground">
            Find specific moments across all stored chat logs.
          </p>
        </div>

        <GlobalSearch />
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

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <p className="animate-pulse font-medium">Loading search...</p>
        </div>
      }
    >
      <SearchContent />
    </Suspense>
  );
}
