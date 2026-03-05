import axios from "axios";

const API_BASE_URL =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname.startsWith("192.168."))
    ? `http://${window.location.hostname}:8000/api`
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

export const getStatsChat = async (streamerId?: string) => {
  const response = await api.get("/comments/stats_chat/", {
    params: { streamer_id: streamerId },
  });
  return response.data;
};

export const getStatsTranscript = async (streamerId?: string) => {
  const response = await api.get("/comments/stats_transcript/", {
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

export const clearScrapeTasks = async () => {
  const response = await api.post("/scrape-tasks/clear-failed/");
  return response.data;
};

export const clearClassificationTasks = async () => {
  const response = await api.post("/classification-tasks/clear-failed/");
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

export const getClips = async (params?: {
  streamer?: string;
  video?: string;
  page?: number;
}) => {
  const response = await api.get("/clips/", { params });
  return response.data;
};

export const getTranscripts = async (params?: {
  streamer?: string;
  video?: string;
  search_or?: string;
  search?: string;
  page?: number;
  page_size?: number;
}) => {
  const response = await api.get("/transcripts/", { params });
  return response.data;
};

export const getUnmatchedWords = async (
  streamerId?: string,
  minCount = 5,
  limit = 50,
): Promise<{ word: string; count: number }[]> => {
  const response = await api.get("/transcripts/unmatched_words/", {
    params: { streamer_id: streamerId, min_count: minCount, limit },
  });
  return response.data;
};

export const getAliases = async (): Promise<
  { id: number; alias: string; canonical_name: string }[]
> => {
  const response = await api.get("/aliases/");
  return response.data.results ?? response.data;
};

export const bulkCreateAliases = async (
  aliases: { alias: string; canonical_name: string }[],
): Promise<{ created: number }> => {
  const response = await api.post("/aliases/bulk_create/", aliases);
  return response.data;
};

export const deleteAlias = async (id: number): Promise<void> => {
  await api.delete(`/aliases/${id}/`);
};

export const getExcludedShoutouts = async (): Promise<
  { id: number; name: string }[]
> => {
  const response = await api.get("/excluded-shoutouts/");
  return response.data.results ?? response.data;
};

export const createExcludedShoutout = async (
  name: string,
): Promise<{ id: number; name: string }> => {
  const response = await api.post("/excluded-shoutouts/", { name });
  return response.data;
};

export const deleteExcludedShoutout = async (id: number): Promise<void> => {
  await api.delete(`/excluded-shoutouts/${id}/`);
};

export const getClip = async (id: string) => {
  const response = await api.get(`/clips/${id}/`);
  return response.data;
};

export default api;
