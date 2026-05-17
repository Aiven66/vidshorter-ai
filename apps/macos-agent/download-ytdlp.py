#!/usr/bin/env python3
import urllib.request
import os

def main():
    url = 'https://github.com/yt-dlp/yt-dlp/releases/download/2026.03.17/yt-dlp_macos'
    output_path = '/Users/aiven/Desktop/AI/codex/projects/apps/macos-agent/bin/yt-dlp'
    
    print(f'Downloading yt-dlp from {url}...')
    try:
        urllib.request.urlretrieve(url, output_path)
        print('Download complete!')
        
        os.chmod(output_path, 0o755)
        print('Set executable permissions')
        
        print(f'File size: {os.path.getsize(output_path)} bytes')
    except Exception as e:
        print(f'Error: {e}')

if __name__ == '__main__':
    main()
