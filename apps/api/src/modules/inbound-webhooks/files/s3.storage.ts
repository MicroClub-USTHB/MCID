import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { Readable } from 'stream';
import type { StorageAdapter } from './storage.adapter';

/** S3 or any S3-compatible store (MinIO in development). */
@Injectable()
export class S3StorageAdapter implements StorageAdapter {
  private client?: S3Client;

  constructor(private readonly configService: ConfigService) {}

  assertReady(): void {
    this.s3();
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.s3().send(
        new HeadObjectCommand({ Bucket: this.bucket(), Key: key }),
      );
      return true;
    } catch (error) {
      if ((error as { name?: string }).name === 'NotFound') return false;
      throw error;
    }
  }

  async put(key: string, body: Readable, size: number): Promise<void> {
    await this.s3().send(
      new PutObjectCommand({
        Bucket: this.bucket(),
        Key: key,
        Body: body,
        ContentLength: size,
      }),
    );
  }

  async delete(key: string): Promise<void> {
    await this.s3().send(
      new DeleteObjectCommand({ Bucket: this.bucket(), Key: key }),
    );
  }

  private bucket(): string {
    this.s3();
    return this.configService.getOrThrow<string>('S3_BUCKET');
  }

  private s3(): S3Client {
    if (this.client) return this.client;

    const bucket = this.configService.get<string>('S3_BUCKET');
    const accessKeyId = this.configService.get<string>('S3_ACCESS_KEY');
    const secretAccessKey = this.configService.get<string>('S3_SECRET_KEY');
    if (!bucket || !accessKeyId || !secretAccessKey) {
      throw new ServiceUnavailableException('File storage is not configured');
    }

    const endpoint = this.configService.get<string>('S3_ENDPOINT') || undefined;
    this.client = new S3Client({
      region: this.configService.get<string>('S3_REGION') || 'us-east-1',
      endpoint,
      // MinIO and most self-hosted stores serve buckets by path, not subdomain
      forcePathStyle: endpoint !== undefined,
      credentials: { accessKeyId, secretAccessKey },
    });
    return this.client;
  }
}
