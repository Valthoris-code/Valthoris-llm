/**
 * adapters/storage/SupabaseStorageAdapter.ts
 *
 * Supabase Storage implementation of IStorageAdapter.
 *
 * Uses the @supabase/supabase-js storage client to perform all operations.
 *
 * TODO: Create the required storage buckets in your Supabase project:
 *   - "fraud-evidence"  — stores raw fraud event payloads and evidence files
 *   - "audit-exports"   — stores exported audit log archives
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { IStorageAdapter, StorageObject, UploadOptions } from './IStorageAdapter';

export class SupabaseStorageAdapter implements IStorageAdapter {
  constructor(private readonly supabase: SupabaseClient) {}

  async upload(
    bucket: string,
    path: string,
    data: Buffer | string | Blob,
    options: UploadOptions = {},
  ): Promise<string> {
    const fileBody: Blob | Buffer =
      typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;

    const { error } = await this.supabase.storage.from(bucket).upload(path, fileBody, {
      contentType: options.contentType ?? 'application/octet-stream',
      upsert: options.upsert ?? false,
      cacheControl: options.cacheControl ?? '3600',
    });

    if (error) {
      throw new Error(`Storage upload failed [${bucket}/${path}]: ${error.message}`);
    }

    const { data: urlData } = this.supabase.storage.from(bucket).getPublicUrl(path);
    return urlData.publicUrl;
  }

  async download(bucket: string, path: string): Promise<Buffer> {
    const { data, error } = await this.supabase.storage.from(bucket).download(path);

    if (error) {
      throw new Error(`Storage download failed [${bucket}/${path}]: ${error.message}`);
    }

    if (!data) {
      throw new Error(`Storage download returned no data [${bucket}/${path}]`);
    }

    const arrayBuffer = await data.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async createSignedUrl(
    bucket: string,
    path: string,
    expiresInSeconds = 3_600,
  ): Promise<string> {
    const { data, error } = await this.supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresInSeconds);

    if (error) {
      throw new Error(`Failed to create signed URL [${bucket}/${path}]: ${error.message}`);
    }

    if (!data?.signedUrl) {
      throw new Error(`Signed URL is empty [${bucket}/${path}]`);
    }

    return data.signedUrl;
  }

  async getMetadata(bucket: string, path: string): Promise<StorageObject | null> {
    const prefix = path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : '';
    const fileName = path.includes('/') ? path.substring(path.lastIndexOf('/') + 1) : path;

    const { data, error } = await this.supabase.storage.from(bucket).list(prefix, {
      search: fileName,
    });

    if (error) {
      throw new Error(`Storage list failed [${bucket}/${prefix}]: ${error.message}`);
    }

    const item = data?.find((f) => f.name === fileName);
    if (!item) return null;

    const { data: urlData } = this.supabase.storage.from(bucket).getPublicUrl(path);

    return {
      path,
      url: urlData.publicUrl,
      size: item.metadata?.size ?? null,
      contentType: item.metadata?.mimetype ?? null,
      lastModified: item.updated_at ?? null,
    };
  }

  async delete(bucket: string, path: string): Promise<boolean> {
    const { error } = await this.supabase.storage.from(bucket).remove([path]);

    if (error) {
      // Not-found is treated as a no-op
      if (error.message.includes('not found') || error.message.includes('404')) {
        return false;
      }
      throw new Error(`Storage delete failed [${bucket}/${path}]: ${error.message}`);
    }

    return true;
  }

  async list(bucket: string, prefix = ''): Promise<StorageObject[]> {
    const { data, error } = await this.supabase.storage.from(bucket).list(prefix);

    if (error) {
      throw new Error(`Storage list failed [${bucket}/${prefix}]: ${error.message}`);
    }

    return (data ?? []).map((item) => {
      const itemPath = prefix ? `${prefix}/${item.name}` : item.name;
      const { data: urlData } = this.supabase.storage.from(bucket).getPublicUrl(itemPath);
      return {
        path: itemPath,
        url: urlData.publicUrl,
        size: item.metadata?.size ?? null,
        contentType: item.metadata?.mimetype ?? null,
        lastModified: item.updated_at ?? null,
      };
    });
  }
}
