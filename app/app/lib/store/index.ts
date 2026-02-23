import { configureStore } from "@reduxjs/toolkit";
import videoReducer from "./features/videoSlice";
import searchReducer from "./features/searchSlice";
import streamerReducer from "./features/streamerSlice";

export const store = configureStore({
  reducer: {
    video: videoReducer,
    search: searchReducer,
    streamer: streamerReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
