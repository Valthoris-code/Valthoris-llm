/**
 * adapters/storage/IStorageAdapter.ts
 *
 * Provider-agnostic interface for object storage operations.
 * Implementations wrap Supabase Storage (or any S3-compatible backend).
 */

export interface UploadOptions {
  /** MIME content type */
  contentType?: string;
  /** Whether to overwrite an existing object (default: false) */
  upsert?: boolean;
  /** Cache-control header value */
  cacheControl?: string;
}

export interface StorageObject {
  /** Full storage path, e.g. "fraud-evidence/2024/01/abc.json" */
  path: string;
  /** Public or signed URL for download */
  url: string;
  /** File size in bytes */
  size: number | null;
  /** MIME type */
  contentType: string | null;
  /** ISO-8601 last-modified timestamp */
  lastModified: string | null;
}

export interface IStorageAdapter {
  /**
   * Upload a file or raw data to storage.
   * @param bucket  Storage bucket name
   * @param path    Object path within the bucket
   * @param data    Content to upload (Buffer, string, or Blob)
   * @param options Upload options
   * @returns The full public URL of the uploaded object
   */
  upload(
    bucket: string,
    path: string,
    data: Buffer | string | Blob,
    options?: UploadOptions,
  ): Promise<string>;

  /**
   * Download an object and return its raw Buffer.
   */
  download(bucket: string, path: string): Promise<Buffer>;

  /**
   * Generate a time-limited signed URL for private objects.
   * @param expiresInSeconds  Lifetime of the signed URL (default: 3600)
   */
  createSignedUrl(
    bucket: string,
    path: string,
    expiresInSeconds?: number,
  ): Promise<string>;

  /**
   * Retrieve metadata for a stored object.
   */
  getMetadata(bucket: string, path: string): Promise<StorageObject | null>;

  /**
   * Delete a single object.
   * @returns true if deleted, false if the object did not exist
   */
  delete(bucket: string, path: string): Promise<boolean>;

  /**
   * List objects under a path prefix.
   */
  list(bucket: string, prefix?: string): Promise<StorageObject[]>;
}
