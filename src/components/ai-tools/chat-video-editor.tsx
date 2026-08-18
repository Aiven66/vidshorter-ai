'use client';

/**
 * AI 对话视频剪辑 — 聊天式视频编辑（支持多视频混剪）
 *
 * 上传多个视频 → 通过自然语言描述混剪需求 → AI 生成 ffmpeg 命令 → 服务端执行 → 预览/下载
 * 支持：拼接、分屏、画中画、淡入淡出、裁剪、变速、滤镜等专业级操作
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useLocale } from '@/lib/locale-context';
import { useAuth } from '@/lib/auth-context';
import {
  AiToolError,
  AiChatVideoEditResult,
  callAiTool,
  uploadAiInput,
} from '@/lib/ai-tools/client-api';
import { formatBytes } from '@/lib/ai-tools/image-utils';
import {
  Send,
  Loader2,
  Upload,
  Download,
  MessageSquare,
  Video,
  Terminal,
  LogIn,
  RefreshCw,
  Trash2,
  ListVideo,
  Plus,
  Play,
} from 'lucide-react';
import Link from 'next/link';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  ffmpegCommand?: string;
  resultUrl?: string;
  sizeBytes?: number;
  error?: string;
}

interface VideoEntry {
  file: File;
  previewUrl: string;
  signedUrl: string;
  uploading: boolean;
}

const MAX_VIDEO_BYTES = 48 * 1024 * 1024;
const MAX_VIDEO_COUNT = 6;

export function ChatVideoEditor() {
  const { t, locale } = useLocale();
  const { user, accessToken, loading: authLoading } = useAuth();
  const [videos, setVideos] = useState<VideoEntry[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [processing, setProcessing] = useState(false);
  const [stage, setStage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [activeVideoIndex, setActiveVideoIndex] = useState<number>(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 调整 textarea 高度
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + 'px';
    }
  }, [input]);

  // 清理所有预览 URL
  useEffect(() => {
    return () => {
      videos.forEach(v => URL.revokeObjectURL(v.previewUrl));
    };
  }, [videos]);

  const allUploaded = videos.length > 0 && videos.every(v => v.signedUrl && !v.uploading);
  const anyUploading = videos.some(v => v.uploading);

  /** 上传单个视频 */
  const uploadSingleVideo = useCallback(async (file: File, index: number) => {
    if (!accessToken || !user?.id) {
      setError(t('aiTools.needsLogin'));
      return;
    }

    setVideos(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], uploading: true };
      return updated;
    });
    setStage(t('aiTools.uploading'));

    try {
      const upload = await uploadAiInput(accessToken, user.id, file, file.name, file.type);
      setVideos(prev => {
        const updated = [...prev];
        updated[index] = { ...updated[index], signedUrl: upload.signedUrl, uploading: false };
        return updated;
      });
    } catch (e) {
      setVideos(prev => {
        const updated = [...prev];
        updated[index] = { ...updated[index], uploading: false };
        return updated;
      });
      setError(e instanceof AiToolError ? e.message : 'Upload failed');
    } finally {
      setStage('');
    }
  }, [accessToken, user, t]);

  /** 处理文件选择 */
  const handleFilesSelected = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    const validFiles = fileArray.filter(f => {
      if (!f.type.startsWith('video/')) {
        setError('Please select video files only.');
        return false;
      }
      if (f.size > MAX_VIDEO_BYTES) {
        setError(t('aiTools.videoTooLarge'));
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) return;

    const remaining = MAX_VIDEO_COUNT - videos.length;
    const toAdd = validFiles.slice(0, remaining);

    if (toAdd.length < validFiles.length) {
      setError(`Maximum ${MAX_VIDEO_COUNT} videos allowed.`);
    }

    const newEntries: VideoEntry[] = toAdd.map(f => ({
      file: f,
      previewUrl: URL.createObjectURL(f),
      signedUrl: '',
      uploading: false,
    }));

    const startIndex = videos.length;
    setVideos(prev => [...prev, ...newEntries]);
    setError(null);
    setMessages([]);
    setProcessing(false);

    // 自动上传每个视频
    for (let i = 0; i < toAdd.length; i++) {
      await uploadSingleVideo(toAdd[i], startIndex + i);
    }

    // 所有视频上传完后添加欢迎消息
    setVideos(prev => {
      if (prev.every(v => v.signedUrl && !v.uploading) && prev.length > 0) {
        setMessages([{
          id: 'system-welcome',
          role: 'system',
          content: `${t('aiTools.chatNoMessages')}\n\n${t('aiTools.multiMixExamples')}`,
          timestamp: Date.now(),
        }]);
      }
      return prev;
    });
  }, [videos.length, uploadSingleVideo, t]);

  const handleSendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || processing || !allUploaded) return;

    setInput('');
    setError(null);

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);

    const assistantId = `assistant-${Date.now()}`;
    const placeholderMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, placeholderMsg]);

    setProcessing(true);
    setStage(t('aiTools.chatProcessing'));

    try {
      const chatHistory = [...messages, userMsg].map(m => ({
        role: m.role === 'system' ? 'user' : m.role,
        content: m.content,
      }));

      const videoUrls = videos.map(v => v.signedUrl);

      const result = await callAiTool<AiChatVideoEditResult>(accessToken!, 'chat-video-edit', {
        videoUrls,
        messages: chatHistory,
        locale,
      });

      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? {
                ...m,
                content: result.reply,
                ffmpegCommand: result.ffmpegCommand,
                resultUrl: result.resultUrl,
                sizeBytes: result.sizeBytes,
              }
            : m
        )
      );
      setStage('');
    } catch (e) {
      const errMsg = e instanceof AiToolError ? e.message : t('aiTools.chatError');
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? { ...m, content: '', error: errMsg }
            : m
        )
      );
      setError(errMsg);
    } finally {
      setProcessing(false);
      setStage('');
    }
  }, [input, processing, allUploaded, videos, messages, accessToken, locale, t]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }, [handleSendMessage]);

  const handleReset = useCallback(() => {
    videos.forEach(v => URL.revokeObjectURL(v.previewUrl));
    setVideos([]);
    setMessages([]);
    setInput('');
    setProcessing(false);
    setStage('');
    setError(null);
    setActiveVideoIndex(0);
  }, [videos]);

  const handleRemoveVideo = useCallback((index: number) => {
    URL.revokeObjectURL(videos[index].previewUrl);
    setVideos(prev => {
      const updated = prev.filter((_, i) => i !== index);
      if (updated.length === 0) {
        setMessages([]);
      }
      return updated;
    });
    if (activeVideoIndex >= index) {
      setActiveVideoIndex(prev => Math.max(0, prev - 1));
    }
  }, [videos, activeVideoIndex]);

  const handleRetry = useCallback(() => {
    const lastAssistantMsg = messages[messages.length - 1];
    if (lastAssistantMsg?.role === 'assistant' && lastAssistantMsg?.error) {
      setMessages(prev => prev.slice(0, -1));
      setError(null);
    }
  }, [messages]);

  const needsLogin = !authLoading && !user;

  return (
    <div className="flex flex-col lg:flex-row gap-4 min-h-[500px]">
      {/* 左侧：视频列表面板 */}
      <div className="lg:w-80 xl:w-96 shrink-0">
        <Card className="h-full">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <ListVideo className="h-4 w-4 text-emerald-500" />
                {t('aiTools.videoList', { count: videos.length })}
              </h3>
              {videos.length > 0 && (
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleReset}>
                  <Trash2 className="h-3 w-3 mr-1" />
                  {t('aiTools.chatNewEdit')}
                </Button>
              )}
            </div>

            {needsLogin ? (
              <div className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-6 min-h-[200px] text-center space-y-2">
                <LogIn className="h-8 w-8 mx-auto text-muted-foreground" />
                <p className="text-sm font-medium">{t('aiTools.needsLogin')}</p>
                <Link href="/login">
                  <Button size="sm" className="mt-2">
                    <LogIn className="h-4 w-4 mr-2" />
                    {t('aiTools.signInToUse')}
                  </Button>
                </Link>
              </div>
            ) : (
              <>
                {/* 视频列表 */}
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {videos.length === 0 && (
                    <div
                      className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-6 cursor-pointer hover:border-emerald-400 transition-colors min-h-[180px]"
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={e => { e.preventDefault(); }}
                      onDrop={e => {
                        e.preventDefault();
                        if (e.dataTransfer.files) handleFilesSelected(e.dataTransfer.files);
                      }}
                    >
                      <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm font-medium">{t('aiTools.selectVideos')}</p>
                      <p className="text-xs text-muted-foreground mt-1">{t('aiTools.selectVideosHint')}</p>
                    </div>
                  )}

                  {videos.map((v, i) => (
                    <div
                      key={i}
                      className={`relative rounded-lg border overflow-hidden cursor-pointer transition-colors ${
                        activeVideoIndex === i ? 'ring-2 ring-emerald-500' : 'hover:border-emerald-300'
                      }`}
                      onClick={() => setActiveVideoIndex(i)}
                    >
                      <div className="relative">
                        <video
                          src={v.previewUrl}
                          className="w-full h-24 object-cover bg-black/5"
                          muted
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/20 transition-colors">
                          <Play className="h-6 w-6 text-white/0 hover:text-white/80" />
                        </div>
                      </div>
                      <div className="p-2 flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">
                            {t('aiTools.videoN', { n: i + 1 })}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {v.file.name} ({formatBytes(v.file.size)})
                          </p>
                        </div>
                        {v.uploading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-500 shrink-0 ml-1" />
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0 ml-1"
                            onClick={e => { e.stopPropagation(); handleRemoveVideo(i); }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* 添加更多视频按钮 */}
                {videos.length > 0 && videos.length < MAX_VIDEO_COUNT && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-9 text-xs"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={anyUploading}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    {t('aiTools.addMoreVideos')}
                  </Button>
                )}

                {/* 隐藏的文件输入 */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  multiple
                  className="hidden"
                  onChange={e => {
                    if (e.target.files) handleFilesSelected(e.target.files);
                    e.target.value = '';
                  }}
                />
              </>
            )}

            {error && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                <p className="text-xs text-destructive">{error}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 右侧：聊天区 */}
      <div className="flex-1 flex flex-col min-w-0">
        <Card className="flex-1 flex flex-col min-h-[450px]">
          {/* 聊天头部 */}
          <div className="flex items-center gap-2 px-4 py-3 border-b">
            <MessageSquare className="h-4 w-4 text-emerald-500" />
            <span className="text-sm font-semibold">{t('aiTools.chatEditHistory')}</span>
            {!allUploaded && !anyUploading && (
              <span className="text-xs text-muted-foreground ml-auto">
                {t('aiTools.uploadVideoFirst')}
              </span>
            )}
            {anyUploading && (
              <span className="text-xs text-muted-foreground ml-auto flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                {t('aiTools.uploading')}
              </span>
            )}
          </div>

          {/* 消息列表 */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && !anyUploading && (
              <div className="flex flex-col items-center justify-center h-full py-12 text-center">
                <MessageSquare className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">{t('aiTools.chatNoMessages')}</p>
                <p className="text-xs text-muted-foreground/60 mt-1 max-w-sm">
                  {t('aiTools.multiMixExamples')}
                </p>
              </div>
            )}

            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm ${
                    msg.role === 'user'
                      ? 'bg-emerald-500 text-white'
                      : msg.role === 'system'
                      ? 'bg-muted/50 text-muted-foreground italic'
                      : msg.error
                      ? 'bg-destructive/10 border border-destructive/20'
                      : 'bg-muted'
                  }`}
                >
                  {msg.role === 'system' ? (
                    <div className="text-xs space-y-1">
                      {msg.content.split('\n').map((line, i) => (
                        <p key={i}>{line}</p>
                      ))}
                    </div>
                  ) : msg.role === 'user' ? (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  ) : (
                    <div className="space-y-2">
                      {msg.error ? (
                        <div>
                          <p className="text-destructive text-xs font-medium mb-1">{t('aiTools.chatError')}</p>
                          <p className="text-xs text-destructive/80">{msg.error}</p>
                        </div>
                      ) : (
                        <>
                          {msg.content && <p className="whitespace-pre-wrap">{msg.content}</p>}

                          {msg.ffmpegCommand && (
                            <div className="bg-black/5 rounded-lg p-2.5 mt-2">
                              <div className="flex items-center gap-1 mb-1.5">
                                <Terminal className="h-3 w-3 text-emerald-600" />
                                <span className="text-xs font-medium text-emerald-700">{t('aiTools.chatCommand')}</span>
                              </div>
                              <pre className="text-xs font-mono whitespace-pre-wrap break-all text-muted-foreground">
                                {msg.ffmpegCommand}
                              </pre>
                            </div>
                          )}

                          {msg.resultUrl && (
                            <div className="mt-2 space-y-2">
                              <video
                                src={msg.resultUrl}
                                controls
                                className="w-full rounded-lg max-h-[200px] object-contain bg-black/5"
                              />
                              <div className="flex items-center gap-2">
                                <a
                                  href={msg.resultUrl}
                                  download
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <Button size="sm" className="h-8 text-xs">
                                    <Download className="h-3.5 w-3.5 mr-1.5" />
                                    {t('aiTools.chatDownload')}
                                    {msg.sizeBytes ? ` (${formatBytes(msg.sizeBytes)})` : ''}
                                  </Button>
                                </a>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 text-xs"
                                  onClick={handleReset}
                                >
                                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                                  {t('aiTools.chatNewEdit')}
                                </Button>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {processing && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-xl px-3.5 py-2.5 text-sm">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
                    <span className="text-xs text-muted-foreground">{stage}</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* 输入区域 */}
          <div className="border-t p-3">
            {messages.some(m => m.role === 'assistant' && m.error) && (
              <div className="mb-2">
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleRetry}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  {t('aiTools.chatRetry')}
                </Button>
              </div>
            )}
            <div className="flex gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={allUploaded ? t('aiTools.multiVideoPlaceholder') : t('aiTools.uploadVideoFirst')}
                disabled={!allUploaded || processing}
                rows={1}
                className="flex-1 min-h-[36px] max-h-[120px] rounded-lg border bg-background px-3 py-2 text-sm resize-none outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
              />
              <Button
                onClick={handleSendMessage}
                disabled={!allUploaded || !input.trim() || processing}
                size="icon"
                className="shrink-0 h-9 w-9"
              >
                {processing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
            {processing && (
              <p className="text-xs text-muted-foreground mt-1.5">{t('aiTools.chatProcessingLong')}</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}