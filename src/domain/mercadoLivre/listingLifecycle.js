const automaticPauseReasons = new Set([
  "out_of_stock",
  "picture_download_pending",
  "picture_downloading_pending",
]);

export function canActivateListing(status, subStatus = []) {
  return status === "paused" && !subStatus.some((reason) => automaticPauseReasons.has(reason));
}

export function deletionRequiresClose(status, subStatus = []) {
  return status !== "closed" && !(status === "under_review" && subStatus.includes("forbidden"));
}
