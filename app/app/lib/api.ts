import axios from "axios";

const API_BASE_URL =
  typeof window !== "undefined" && window.location.hostname === "localhost"
    ? "http://localhost:8000/api"
    : "https://backend.permisossubtel.cl/api";

const api = axios.create({
  baseURL: API_BASE_URL,
});

export const getVideos = async (params?: {
  streamer?: string;
  streamer_login?: string;
  page?: number;
  page_size?: number;
}) => {
  const response = await api.get("/videos/", { params });
  return response.data;
};

export const getComments = async (params: {
  video_id?: string;
  video__streamer?: string;
  search?: string;
  search_or?: string;
  exclude_users?: string;
  is_toxic?: boolean;
  min_toxicity?: number;
  page?: number;
  page_size?: number;
}) => {
  const response = await api.get("/comments/", { params });
  return response.data;
};

export const getVideoComments = async (
  videoId: string,
  page = 1,
  search?: string,
) => {
  return getComments({ video_id: videoId, page, search });
};

export const getCommentContext = async (
  videoId: string,
  targetOffset: number,
) => {
  const response = await api.get("/comments/context/", {
    params: {
      video_id: videoId,
      target_offset: targetOffset,
    },
  });
  return response.data;
};

export const searchComments = async (
  query: string,
  page = 1,
  streamerId?: string,
) => {
  return getComments({ search: query, page, video__streamer: streamerId });
};

export const getStreamers = async () => {
  const response = await api.get("/streamers/");
  return response.data;
};

export const getStats = async (streamerId?: string) => {
  const response = await api.get("/comments/stats/", {
    params: { streamer_id: streamerId },
  });
  return response.data;
};

export const addStreamer = async (login: string) => {
  const response = await api.post("/streamers/", { login });
  return response.data;
};

export const refreshStreamerVods = async (streamerId: string) => {
  const response = await api.post(`/streamers/${streamerId}/refresh_vods/`);
  return response.data;
};

export const getScrapeTasks = async () => {
  const response = await api.get("/scrape-tasks/");
  return response.data;
};

export const getClassificationTasks = async () => {
  const response = await api.get("/classification-tasks/");
  return response.data;
};

export const requeueClassification = async (videoId: string) => {
  const response = await api.post("/classification-tasks/requeue/", {
    video_id: videoId,
  });
  return response.data;
};

export const startScrape = async (videoId: string, oauth?: string) => {
  const response = await api.post(`/videos/scrape/${videoId}/`, { oauth });
  return response.data;
};

export interface ScrapeProgress {
  page: number;
  offset: number;
  total_seconds: number;
  total_comments: number;
  percent: number;
  video_title?: string;
  done?: boolean;
  error?: string;
}

/**
 * Opens an SSE connection to the scrape-stream endpoint.
 * Returns a cleanup function that closes the connection.
 */
export function scrapeWithProgress(
  videoId: string,
  onProgress: (p: ScrapeProgress) => void,
  onDone: () => void,
  onError: (msg: string) => void,
  oauth?: string,
): () => void {
  const url = `${API_BASE_URL}/videos/scrape-stream/${videoId}/?oauth=${oauth || ""}`;
  const es = new EventSource(url);

  es.onmessage = (event) => {
    try {
      const data: ScrapeProgress = JSON.parse(event.data);
      onProgress(data);
      if (data.done || data.error) {
        es.close();
        if (data.error) {
          onError(data.error);
        } else {
          onDone();
        }
      }
    } catch (e) {
      console.error("Error parsing SSE data", e);
    }
  };

  es.onerror = (err) => {
    console.error("EventSource error:", err);
    es.close();
    onError("Connection to scrape stream lost.");
  };

  return () => es.close();
}

export default api;
