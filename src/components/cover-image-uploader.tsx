'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Upload,
  X,
  Image as ImageIcon,
  Loader2,
} from 'lucide-react';

interface CoverImageUploaderProps {
  value: string;
  onChange: (imageUrl: string) => void;
  accessToken: string | null;
  label?: string;
  locale?: 'zh' | 'en';
}

export function CoverImageUploader({
  value,
  onChange,
  accessToken,
  label,
  locale = 'en',
}: CoverImageUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const hasImage = !!value;

  async function uploadFile(file: File) {
    if (!accessToken) {
      setUploadError(locale === 'zh' ? '请先登录' : 'Please sign in');
      return;
    }

    if (!file.type.startsWith('image/')) {
      setUploadError(locale === 'zh' ? '只支持图片文件' : 'Only image files are supported');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setUploadError(
        locale === 'zh' ? '图片过大（最大5MB）' : 'Image too large (max 5 MB)'
      );
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/blog/upload-cover', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        if (data.cover_image) {
          onChange(data.cover_image);
        } else {
          setUploadError(
            locale === 'zh' ? '上传失败：未返回图片地址' : 'Upload failed: no image URL returned'
          );
        }
      } else {
        const err = await res.json().catch(() => ({}));
        setUploadError(
          err.error ||
          (locale === 'zh' ? `上传失败（${res.status}）` : `Upload failed (${res.status})`)
        );
      }
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  }

  function handleRemove() {
    onChange('');
    setUploadError(null);
  }

  const t = {
    title: label || (locale === 'zh' ? '封面图片' : 'Cover Image'),
    upload: locale === 'zh' ? '上传本地图片' : 'Upload Local Image',
    drop: locale === 'zh' ? '或拖放图片到这里' : 'or drop an image here',
    replace: locale === 'zh' ? '更换图片' : 'Replace Image',
    remove: locale === 'zh' ? '移除图片' : 'Remove Image',
    uploading: locale === 'zh' ? '上传中...' : 'Uploading...',
    preview: locale === 'zh' ? '封面预览' : 'Cover Preview',
  };

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">{t.title}</div>

      {hasImage ? (
        <div className="relative">
          <div className="border rounded-lg overflow-hidden bg-muted/30">
            <img
              src={value}
              alt="Cover preview"
              className="w-full h-52 object-cover"
            />
          </div>
          <div className="mt-2 flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t.uploading}
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  {t.replace}
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRemove}
              disabled={isUploading}
            >
              <X className="h-4 w-4 mr-2" />
              {t.remove}
            </Button>
          </div>
        </div>
      ) : (
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors hover:bg-muted/30 ${
            isDragging ? 'border-primary bg-muted/50' : 'border-muted-foreground/25'
          }`}
        >
          {isUploading ? (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="text-sm">{t.uploading}</span>
            </div>
          ) : (
            <>
              <ImageIcon className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm font-medium mb-1">
                {t.upload}
              </p>
              <p className="text-xs text-muted-foreground">{t.drop}</p>
            </>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {uploadError && (
        <p className="text-xs text-red-600 mt-1">{uploadError}</p>
      )}
    </div>
  );
}
