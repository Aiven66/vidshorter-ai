'use client';

import { useEffect, useRef } from 'react';

type Props = {
  embedUrl: string;
  videoId: string | null;
  sourceType: 'youtube' | 'bilibili' | 'local';
  onReady: (api: {
    seekTo: (t: number, autoplay?: boolean) => void;
    getCurrentTime: () => number;
    getDuration: () => number;
    playVideo: () => void;
    pauseVideo: () => void;
  }) => void;
  onTimeUpdate: (t: number, duration: number, playing: boolean) => void;
};

// YouTube IFrame API 类型（简化版）
declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export default function VideoPlayer({ embedUrl, videoId, sourceType, onReady, onTimeUpdate }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const intervalRef = useRef<number | null>(null);
  const readyCalledRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current) return;

    if (sourceType === 'youtube' && videoId) {
      initYouTubePlayer(containerRef.current, videoId, (player) => {
        playerRef.current = player;
        emitApi();
        startPolling();
      });
    } else {
      // Bilibili / 本地视频：使用原生 iframe
      containerRef.current.innerHTML = '';
      const iframe = document.createElement('iframe');
      iframe.src = embedUrl;
      iframe.allow = 'autoplay; fullscreen';
      iframe.allowFullscreen = true;
      iframe.className = 'w-full h-full border-0';
      iframe.style.aspectRatio = '16 / 9';
      iframe.style.display = 'block';
      containerRef.current.appendChild(iframe);

      // Bilibili 没有 JS API，使用一个最小的伪 API（通过 postMessage 无法跨站 seek）
      // 退化：通过更换 src 的 start 参数实现 seek
      const bilibiliApi = {
        seekTo: (t: number) => {
          if (!containerRef.current) return;
          const bvidMatch = embedUrl.match(/bvid=([^&]+)/);
          const bvid = bvidMatch ? bvidMatch[1] : '';
          const page = Math.floor(t / 360) + 1;
          const newSrc = `https://player.bilibili.com/player.html?bvid=${bvid}&page=${page}&t=${Math.floor(t)}&autoplay=1&high_quality=1&danmaku=0`;
          iframe.src = newSrc;
        },
        getCurrentTime: () => 0,
        getDuration: () => 0,
        playVideo: () => { /* noop */ },
        pauseVideo: () => { /* noop */ },
      };
      playerRef.current = bilibiliApi;
      emitApi();
    }

    function emitApi() {
      if (readyCalledRef.current) return;
      readyCalledRef.current = true;
      onReady({
        seekTo: (t: number, autoplay?: boolean) => {
          const p = playerRef.current;
          if (!p) return;
          if (sourceType === 'youtube') {
            try {
              p.seekTo(t, autoplay ?? true);
              if (autoplay) p.playVideo?.();
            } catch {}
          } else {
            p.seekTo(t);
          }
        },
        getCurrentTime: () => playerRef.current?.getCurrentTime?.() ?? 0,
        getDuration: () => playerRef.current?.getDuration?.() ?? 0,
        playVideo: () => playerRef.current?.playVideo?.(),
        pauseVideo: () => playerRef.current?.pauseVideo?.(),
      });
    }

    function startPolling() {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      intervalRef.current = window.setInterval(() => {
        const p = playerRef.current;
        if (!p || sourceType !== 'youtube') return;
        try {
          const t = p.getCurrentTime?.() ?? 0;
          const d = p.getDuration?.() ?? 0;
          const playing = p.getPlayerState?.() === 1;
          onTimeUpdate(t, d, playing);
        } catch {}
      }, 500);
    }

    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedUrl, videoId, sourceType]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ aspectRatio: '16 / 9' }}
    />
  );
}

function initYouTubePlayer(container: HTMLElement, videoId: string, onReady: (player: any) => void) {
  // 加载 YouTube IFrame API
  if (!window.YT || !window.YT.Player) {
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (prev) prev();
      createPlayer(container, videoId, onReady);
    };
  } else {
    createPlayer(container, videoId, onReady);
  }
}

function createPlayer(container: HTMLElement, videoId: string, onReady: (player: any) => void) {
  const player = new window.YT.Player(container, {
    videoId,
    playerVars: {
      autoplay: 0,
      rel: 0,
      modestbranding: 1,
      playsinline: 1,
      controls: 1,
    },
    events: {
      onReady: () => onReady(player),
      onStateChange: () => {
        // 可用于扩展
      },
      onError: () => {
        // 静默处理
      },
    },
  });
}
