import { ImageResponse } from 'next/og';

export const alt = 'Clipop AI - Turn long videos into viral shorts';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * 全站默认社交分享图（Open Graph / Twitter Card）。
 * 使用 next/og 在构建期静态生成，运行时零开销。
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: '#0a0a0a',
          padding: '64px 72px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 34,
              fontWeight: 700,
              color: '#0a0a0a',
              background: 'linear-gradient(135deg, #F2D98C 0%, #C79A3E 100%)',
            }}
          >
            C
          </div>
          <div style={{ display: 'flex', fontSize: 34, fontWeight: 700, color: '#f5f5f5' }}>Clipop AI</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', fontSize: 68, fontWeight: 800, color: '#ffffff', lineHeight: 1.15 }}>
            Turn Long Videos into
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 68,
              fontWeight: 800,
              background: 'linear-gradient(90deg, #F2D98C 0%, #E9C46A 50%, #C79A3E 100%)',
              backgroundClip: 'text',
              color: '#E9C46A',
              lineHeight: 1.15,
            }}
          >
            Viral Vertical Shorts
          </div>
          <div style={{ display: 'flex', fontSize: 28, color: '#a3a3a3', marginTop: 10 }}>
            AI highlight detection · Auto captions · 9:16 export · Digital human videos
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              display: 'flex',
              padding: '12px 24px',
              borderRadius: 999,
              fontSize: 24,
              fontWeight: 700,
              color: '#0a0a0a',
              background: 'linear-gradient(135deg, #F2D98C 0%, #C79A3E 100%)',
            }}
          >
            60 free credits
          </div>
          <div style={{ display: 'flex', fontSize: 24, color: '#737373' }}>www.clipopai.com</div>
        </div>
      </div>
    ),
    size,
  );
}