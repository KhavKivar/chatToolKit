import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface Video {
  id: string;
  title: string;
  streamer_display_name: string;
  created_at: string;
}

interface VideoState {
  videos: Video[];
  selectedVideoId: string | null;
  loading: boolean;
}

const initialState: VideoState = {
  videos: [],
  selectedVideoId: null,
  loading: false,
};

const videoSlice = createSlice({
  name: "video",
  initialState,
  reducers: {
    setVideos: (state, action: PayloadAction<Video[]>) => {
      state.videos = action.payload;
    },
    setSelectedVideoId: (state, action: PayloadAction<string | null>) => {
      state.selectedVideoId = action.payload;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
  },
});

export const { setVideos, setSelectedVideoId, setLoading } = videoSlice.actions;
export default videoSlice.reducer;
