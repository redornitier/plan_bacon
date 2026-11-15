export interface Env {
  DB: D1Database;
  PHOTOS: R2Bucket;
  IMAGES: ImagesBinding;
  ASSETS: Fetcher;
  RESTAURANT_ID: string; // Existing restaurant anchoring the shared group and legacy API.
}
