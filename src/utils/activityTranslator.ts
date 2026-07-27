import { ActivityItem } from "../lib/social";

export function getLocalizedActivity(act: ActivityItem, t: (key: string, replace?: Record<string, string | number>) => string): string {
  const title = act.targetTitle || "";
  if (act.type === "read") {
    if (act.title && (act.title.toLowerCase().includes("favorito") || act.title.toLowerCase().includes("favorite"))) {
      return t("activityFavorited", { title: title || act.title });
    }
    return t("activityStartedReading", { title: title || act.title });
  }
  if (act.type === "comment") {
    const match = act.title?.match(/(\d+)/);
    const rating = match ? match[1] : "5";
    return t("activityRated", { title: title || act.title, rating });
  }
  if (act.type === "published") {
    return t("activityCreatedPlaylist", { title: title || act.title });
  }
  if (act.type === "follow") {
    return t("activityFollowed");
  }
  if (act.type === "friend") {
    return t("activityFriendAccepted");
  }
  return act.title;
}
