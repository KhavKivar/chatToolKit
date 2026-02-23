import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface Streamer {
  id: string;
  login: string;
  display_name: string;
  profile_image_url?: string;
}

interface ScrapeTask {
  id: string;
  video_id: string;
  status: string;
  progress_percent: number;
  created_at: string;
}

interface StreamerState {
  streamers: Streamer[];
  tasks: ScrapeTask[];
  newLogin: string;
}

const initialState: StreamerState = {
  streamers: [],
  tasks: [],
  newLogin: "",
};

const streamerSlice = createSlice({
  name: "streamer",
  initialState,
  reducers: {
    setStreamers: (state, action: PayloadAction<Streamer[]>) => {
      state.streamers = action.payload;
    },
    setTasks: (state, action: PayloadAction<ScrapeTask[]>) => {
      state.tasks = action.payload;
    },
    setNewLogin: (state, action: PayloadAction<string>) => {
      state.newLogin = action.payload;
    },
  },
});

export const { setStreamers, setTasks, setNewLogin } = streamerSlice.actions;
export default streamerSlice.reducer;
