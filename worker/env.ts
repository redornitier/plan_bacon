export interface Env {
  DB: D1Database;
  PHOTOS: R2Bucket;
  IMAGES: ImagesBinding;
  ASSETS: Fetcher;
  RESTAURANT_ID: string;
}
