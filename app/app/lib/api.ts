import axios from "axios";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api";

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
) => getComments({ video_id: videoId, page, search });

export const getCommentContext = async (
  videoId: string,
  targetOffset: number,
) => {
  const response = await api.get("/comments/context/", {
    params: { video_id: videoId, target_offset: targetOffset },
  });
  return response.data;
};

export const searchComments = async (
  query: string,
  page = 1,
  streamerId?: string,
) => getComments({ search: query, page, video__streamer: streamerId });

export const getStreamers = async () =>
  (await api.get("/streamers/")).data;

export const getStats = async (streamerId?: string) =>
  (await api.get("/comments/stats/", { params: { streamer_id: streamerId } }))
    .data;

export const getStatsChat = async (streamerId?: string) =>
  (await api.get("/comments/stats_chat/", {
    params: { streamer_id: streamerId },
  })).data;

export const getStatsTranscript = async (streamerId?: string) =>
  (await api.get("/comments/stats_transcript/", {
    params: { streamer_id: streamerId },
  })).data;

export const addStreamer = async (login: string) =>
  (await api.post("/streamers/", { login })).data;

export const refreshStreamerVods = async (streamerId: string) =>
  (await api.post(`/streamers/${streamerId}/refresh_vods/`)).data;

export const getScrapeTasks = async () =>
  (await api.get("/scrape-tasks/")).data;

export const getClassificationTasks = async () =>
  (await api.get("/classification-tasks/")).data;

export const requeueClassification = async (videoId: string) =>
  (await api.post("/classification-tasks/requeue/", { video_id: videoId }))
    .data;

export const clearScrapeTasks = async () =>
  (await api.post("/scrape-tasks/clear-failed/")).data;

export const clearClassificationTasks = async () =>
  (await api.post("/classification-tasks/clear-failed/")).data;

export const startScrape = async (videoId: string, oauth?: string) =>
  (await api.post(`/videos/scrape/${videoId}/`, { oauth })).data;

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

export function scrapeWithProgress(
  videoId: string,
  onProgress: (progress: ScrapeProgress) => void,
  onDone: () => void,
  onError: (message: string) => void,
  oauth?: string,
): () => void {
  const params = new URLSearchParams();
  if (oauth) params.set("oauth", oauth);
  const es = new EventSource(
    `${API_BASE_URL}/videos/scrape-stream/${videoId}/?${params}`,
  );

  es.onmessage = (event) => {
    try {
      const progress: ScrapeProgress = JSON.parse(event.data);
      onProgress(progress);
      if (progress.done || progress.error) {
        es.close();
        if (progress.error) {
          onError(progress.error);
        } else {
          onDone();
        }
      }
    } catch (error) {
      console.error("Error parsing SSE data", error);
    }
  };

  es.onerror = () => {
    es.close();
    onError("Connection to scrape stream lost.");
  };

  return () => es.close();
}

export const getClips = async (params?: {
  streamer?: string;
  video?: string;
  page?: number;
}) => (await api.get("/clips/", { params })).data;

export const getTranscripts = async (params?: {
  streamer?: string;
  video?: string;
  search_or?: string;
  search?: string;
  page?: number;
  page_size?: number;
}) => (await api.get("/transcripts/", { params })).data;

export const getChatterMentions = async (
  streamerId?: string,
  extraNames?: string[],
  minCount = 1,
): Promise<{ word: string; count: number }[]> =>
  (
    await api.get("/transcripts/unmatched_words/", {
      params: {
        streamer_id: streamerId,
        min_count: minCount,
        extra_names: extraNames?.join(",") || undefined,
      },
    })
  ).data;

export const getAliases = async (): Promise<
  { id: number; alias: string; canonical_name: string }[]
> => {
  const response = await api.get("/aliases/");
  return response.data.results ?? response.data;
};

export const bulkCreateAliases = async (
  aliases: { alias: string; canonical_name: string }[],
): Promise<{ created: number }> =>
  (await api.post("/aliases/bulk_create/", aliases)).data;

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
): Promise<{ id: number; name: string }> =>
  (await api.post("/excluded-shoutouts/", { name })).data;

export const deleteExcludedShoutout = async (id: number): Promise<void> => {
  await api.delete(`/excluded-shoutouts/${id}/`);
};

export const getClip = async (id: string) =>
  (await api.get(`/clips/${id}/`)).data;

export default api;
