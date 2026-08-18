'use client';

/**
 * AI 对话视频剪辑 — 聊天式视频编辑
 *
 * 用户通过自然语言描述剪辑需求 → AI 生成 ffmpeg 命令 → 服务端执行 → 预览/下载
 * 支持：裁剪、变速、缩放、滤镜、文字、音频、旋转、反转等专业级操作
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
  Sparkles,
  LogIn,
  RefreshCw,
  Trash2,
  ImageIcon,
} from 'lucide-react';
import Link from 'next/link';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  // 助理消息附加字段
  ffmpegCommand?: string;
  resultUrl?: string;
  sizeBytes?: number;
  error?: string;
}

const MAX_VIDEO_BYTES = 48 * 1024 * 1024;

export function ChatVideoEditor() {
  const { t, locale } = useLocale();
  const { user, accessToken, loading: authLoading } = useAuth();
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [processing, setProcessing] = useState(false);
  const [stage, setStage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [uploadingVideo, setUploadingVideo] = useState(false);

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

  // 清理视频预览 URL
  useEffect(() => {
    return () => {
      if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    };
  }, [videoPreviewUrl]);

  const handleVideoSelect = useCallback(async (file: File) => {
    // 验证
    if (!file.type.startsWith('video/')) {
      setError('Please select a video file.');
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      setError(t('aiTools.videoTooLarge'));
      return;
    }

    setError(null);
    setVideoFile(file);
    setVideoPreviewUrl(URL.createObjectURL(file));
    setMessages([]);
    setProcessing(false);
    setStage('');

    // 上传视频
    if (!accessToken) {
      setError(t('aiTools.needsLogin'));
      return;
    }

    setUploadingVideo(true);
    setStage(t('aiTools.uploading'));
    try {
      const upload = await uploadAiInput(accessToken, user?.id || '', file, file.name, file.type);
      setVideoUrl(upload.signedUrl);
      // 添加系统消息
      setMessages([
        {
          id: 'system-welcome',
          role: 'system',
          content: t('aiTools.chatNoMessages'),
          timestamp: Date.now(),
        },
      ]);
    } catch (e) {
      setError(e instanceof AiToolError ? e.message : 'Upload failed');
    } finally {
      setUploadingVideo(false);
      setStage('');
    }
  }, [accessToken, user, t]);

  const handleSendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || processing || !videoUrl) return;

    setInput('');
    setError(null);

    // 添加用户消息
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);

    // 添加占位助理消息
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
      // 构建消息历史
      const chatHistory = [...messages, userMsg].map(m => ({
        role: m.role === 'system' ? 'user' : m.role,
        content: m.content,
      }));

      const result = await callAiTool<AiChatVideoEditResult>(accessToken!, 'chat-video-edit', {
        videoUrl,
        messages: chatHistory,
        locale,
      });

      // 更新助理消息
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
      // 更新助理消息为错误
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
  }, [input, processing, videoUrl, messages, accessToken, locale, t]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }, [handleSendMessage]);

  const handleReset = useCallback(() => {
    setVideoFile(null);
    setVideoUrl(null);
    setVideoPreviewUrl(null);
    setMessages([]);
    setInput('');
    setProcessing(false);
    setStage('');
    setError(null);
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
  }, [videoPreviewUrl]);

  const handleRetry = useCallback(() => {
    const lastAssistantMsg = messages[messages.length - 1];
    if (lastAssistantMsg?.role === 'assistant' && lastAssistantMsg?.error) {
      // 移除错误消息，让用户重新发送
      setMessages(prev => prev.slice(0, -1));
      setError(null);
    }
  }, [messages]);

  const needsLogin = !authLoading && !user;

  return (
    <div className="flex flex-col lg:flex-row gap-4 min-h-[500px]">
      {/* 左侧：视频展示区 */}
      <div className="lg:w-80 xl:w-96 shrink-0">
        <Card className="h-full">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <Video className="h-4 w-4 text-emerald-500" />
                {t('aiTools.chatOriginal')}
              </h3>
              {videoFile && (
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleReset}>
                  <Trash2 className="h-3 w-3 mr-1" />
                  {t('aiTools.changeVideo')}
                </Button>
              )}
            </div>

            {!videoFile ? (
              <div
                className="relative flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-6 cursor-pointer hover:border-emerald-400 transition-colors min-h-[200px]"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); }}
                onDrop={e => {
                  e.preventDefault();
                  const file = e.dataTransfer.files[0];
                  if (file) handleVideoSelect(file);
                }}
              >
                {needsLogin ? (
                  <div className="text-center space-y-2">
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
                  <div className="text-center space-y-2">
                    <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                    <p className="text-sm font-medium">{t('aiTools.selectVideo')}</p>
                    <p className="text-xs text-muted-foreground">{t('aiTools.uploadVideoHint')}</p>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) handleVideoSelect(file);
                  }}
                  disabled={needsLogin}
                />
              </div>
            ) : (
              <div className="space-y-2">
                {uploadingVideo ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
                    <span className="ml-2 text-sm text-muted-foreground">{stage}</span>
                  </div>
                ) : (
                  <video
                    src={videoPreviewUrl!}
                    controls
                    className="w-full rounded-lg max-h-[300px] object-contain bg-black/5"
                  >
                    Your browser does not support video.
                  </video>
                )}
                {videoFile && (
                  <p className="text-xs text-muted-foreground truncate">
                    {videoFile.name} ({formatBytes(videoFile.size)})
                  </p>
                )}
              </div>
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
            {!videoUrl && !uploadingVideo && (
              <span className="text-xs text-muted-foreground ml-auto">
                {t('aiTools.uploadVideoFirst')}
              </span>
            )}
          </div>

          {/* 消息列表 */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && !uploadingVideo && (
              <div className="flex flex-col items-center justify-center h-full py-12 text-center">
                <MessageSquare className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">{t('aiTools.chatNoMessages')}</p>
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
                    <p className="text-xs">{msg.content}</p>
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

            {/* 处理中指示器 */}
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
                placeholder={videoUrl ? t('aiTools.chatPlaceholder') : t('aiTools.uploadVideoFirst')}
                disabled={!videoUrl || processing}
                rows={1}
                className="flex-1 min-h-[36px] max-h-[120px] rounded-lg border bg-background px-3 py-2 text-sm resize-none outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
              />
              <Button
                onClick={handleSendMessage}
                disabled={!videoUrl || !input.trim() || processing}
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