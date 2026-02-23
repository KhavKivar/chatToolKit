import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface Comment {
  id: string;
  commenter_display_name: string;
  message: string;
  content_offset_seconds: number;
  video_id: string;
  video_title: string;
  video_streamer: string;
  video_created_at?: string;
}

interface ScoredComment extends Comment {
  score: number;
  matchedKeyword: string;
}

interface VideoGroup {
  video_id: string;
  video_title: string;
  video_streamer: string;
  video_created_at?: string;
  comments: ScoredComment[];
}

interface SearchState {
  input: string;
  keywords: string[];
  groups: VideoGroup[];
  loading: boolean;
  searched: boolean;
  totalMatches: number;
  streamerFilter: string;
  searchProgress: string; // "Scanning 5,000 comments..."
  canScanMore: boolean;
  lastScannedPage: number;
  isScanningMore: boolean;
}

const STORAGE_KEY = "global_search_state";

const loadState = (): SearchState | undefined => {
  if (typeof window === "undefined") return undefined;
  try {
    const serializedState = localStorage.getItem(STORAGE_KEY);
    if (serializedState === null) return undefined;
    const parsed = JSON.parse(serializedState) as SearchState;
    // CRITICAL FIX: Reset volatile network states that shouldn't persist across reloads
    return {
      ...parsed,
      loading: false,
      isScanningMore: false,
      searchProgress: "",
    };
  } catch {
    return undefined;
  }
};

const initialState: SearchState = loadState() || {
  input: "",
  keywords: [],
  groups: [],
  loading: false,
  searched: false,
  totalMatches: 0,
  streamerFilter: "",
  searchProgress: "",
  canScanMore: false,
  lastScannedPage: 0,
  isScanningMore: false,
};

const searchSlice = createSlice({
  name: "search",
  initialState,
  reducers: {
    setSearchInput: (state, action: PayloadAction<string>) => {
      state.input = action.payload;
    },
    setKeywords: (state, action: PayloadAction<string[]>) => {
      state.keywords = action.payload;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    },
    setGroups: (state, action: PayloadAction<VideoGroup[]>) => {
      state.groups = action.payload;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    setSearched: (state, action: PayloadAction<boolean>) => {
      state.searched = action.payload;
    },
    setTotalMatches: (state, action: PayloadAction<number>) => {
      state.totalMatches = action.payload;
    },
    setStreamerFilter: (state, action: PayloadAction<string>) => {
      state.streamerFilter = action.payload;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    },
    setSearchProgress: (state, action: PayloadAction<string>) => {
      state.searchProgress = action.payload;
    },
    setCanScanMore: (state, action: PayloadAction<boolean>) => {
      state.canScanMore = action.payload;
    },
    setLastScannedPage: (state, action: PayloadAction<number>) => {
      state.lastScannedPage = action.payload;
    },
    setIsScanningMore: (state, action: PayloadAction<boolean>) => {
      state.isScanningMore = action.payload;
    },
  },
});

export const {
  setSearchInput,
  setKeywords,
  setGroups,
  setLoading,
  setSearched,
  setTotalMatches,
  setStreamerFilter,
  setSearchProgress,
  setCanScanMore,
  setLastScannedPage,
  setIsScanningMore,
} = searchSlice.actions;
export default searchSlice.reducer;
