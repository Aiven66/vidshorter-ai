'use client';

/**
 * @clipop/blog - Cover Image Uploader
 *
 * Click-to-select or drag-and-drop an image, upload it to
 * /api/blog/upload-cover (multipart/form-data), and report back the URL.
 *
 * If the upload fails (network or storage error), the file is automatically
 * converted to a base64 data URL via FileReader and used as a fallback.
 *
 * No shadcn/ui — pure native HTML + Tailwind.
 */

import { useRef, useState, useCallback } from 'react';

export interface CoverUploaderProps {
  /** Current image URL (or data URL). */
  value: string;
  /** Called whenever the image URL changes (upload success or base64 fallback). */
  onChange: (imageUrl: string) => void;
  /** Optional bearer token; required for upload endpoint. */
  token?: string | null;
  /** UI label. Default: 'Cover Image'. */
  label?: string;
  /** Locale: 'zh' shows Chinese UI strings. */
  locale?: 'zh' | 'en';
  /** Override the upload endpoint. Default: '/api/blog/upload-cover'. */
  endpoint?: string;
  /** Max file size in bytes (default: 5MB). */
  maxFileSize?: number;
}

const DEFAULT_MAX_SIZE = 5 * 1024 * 1024;

export function CoverUploader({
  value,
  onChange,
  token,
  label = 'Cover Image',
  locale = 'en',
  endpoint = '/api/blog/upload-cover',
  maxFileSize = DEFAULT_MAX_SIZE,
}: CoverUploaderProps) {
  const isZh = locale === 'zh';
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const uploadFile = useCallback(
    async (file: File): Promise<void> => {
      if (!file.type.startsWith('image/')) {
        setError(isZh ? '只支持图片文件' : 'Only image files are supported');
        return;
      }
      if (file.size > maxFileSize) {
        setError(
          isZh
            ? `文件过大（最大 ${Math.floor(maxFileSize / 1024 / 1024)}MB）`
            : `File too large (max ${Math.floor(maxFileSize / 1024 / 1024)}MB)`,
        );
        return;
      }

      setError(null);
      setUploading(true);

      try {
        const formData = new FormData();
        formData.append('file', file);

        const headers: HeadersInit = {};
        if (token) headers.Authorization = `Bearer ${token}`;

        const res = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: formData,
        });

        if (res.ok) {
          const data = (await res.json()) as { cover_image?: string; error?: string };
          if (data.cover_image) {
            onChange(data.cover_image);
            return;
          }
          setError(data.error || (isZh ? '上传失败：未返回图片地址' : 'Upload failed: no image URL returned'));
        } else {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          setError(err.error || `Upload failed (${res.status})`);
        }
      } catch (err) {
        // Network / server error → fall back to base64 data URL
        setError(
          isZh ? '服务器上传失败，使用本地 base64 兜底' : 'Server upload failed, falling back to base64',
        );
        try {
          const dataUrl = await readFileAsDataUrl(file);
          onChange(dataUrl);
        } catch (readErr) {
          setError(
            readErr instanceof Error
              ? readErr.message
              : isZh
                ? '读取文件失败'
                : 'Failed to read file',
          );
        }
      } finally {
        setUploading(false);
      }
    },
    [endpoint, token, onChange, maxFileSize, isZh],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void uploadFile(file);
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [uploadFile],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void uploadFile(file);
    },
    [uploadFile],
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleClear = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onChange('');
      setError(null);
    },
    [onChange],
  );

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <div
        onClick={handleClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`relative flex h-44 cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed transition ${
          isDragging
            ? 'border-primary bg-primary/5'
            : value
              ? 'border-border'
              : 'border-muted-foreground/30 hover:border-primary/40 hover:bg-muted/30'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="sr-only"
        />

        {value ? (
          <>
            <img
              src={value}
              alt={isZh ? '封面预览' : 'Cover preview'}
              className="absolute inset-0 h-full w-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
              aria-label={isZh ? '清除图片' : 'Clear image'}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
            {!uploading && (
              <div className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-1 text-xs text-white">
                {isZh ? '点击更换' : 'Click to change'}
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 text-center text-sm text-muted-foreground">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-8 w-8"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span>
              {isZh
                ? '点击选择或拖拽图片到这里'
                : 'Click to select or drag and drop an image'}
            </span>
          </div>
        )}

        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
            <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-white border-r-transparent" />
            <span className="ml-2 text-sm">{isZh ? '上传中...' : 'Uploading...'}</span>
          </div>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('FileReader returned non-string result'));
    };
    reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
    reader.readAsDataURL(file);
  });
}
