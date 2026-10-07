import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const urlParam = req.nextUrl.searchParams.get('url');
  if (!urlParam) {
    return new NextResponse('Missing url parameter', { status: 400 });
  }

  try {
    const targetUrl = decodeURIComponent(urlParam);
    const parsed = new URL(targetUrl);

    // Security check: Only allow images from Facebook CDNs or safe image domains
    const allowedHosts = [
      'fbcdn.net',
      'facebook.com',
      'fna.fbcdn.net',
      'scontent.fhan3-3.fna.fbcdn.net',
      'scontent.fhan3-1.fna.fbcdn.net',
      'scontent.fhan3-2.fna.fbcdn.net',
      'scontent.fsgn2-1.fna.fbcdn.net',
      'scontent.fsgn2-4.fna.fbcdn.net',
      'scontent.fsgn2-6.fna.fbcdn.net',
      'scontent.fsgn2-9.fna.fbcdn.net',
      'scontent.fsgn5-1.fna.fbcdn.net',
      'scontent.fsgn5-2.fna.fbcdn.net',
      'scontent.fsgn5-5.fna.fbcdn.net',
      'scontent.fsgn5-9.fna.fbcdn.net',
    ];

    const isAllowed = allowedHosts.some(h => parsed.hostname === h || parsed.hostname.endsWith('.' + h));
    if (!isAllowed) {
      return new NextResponse('Domain not allowed for image proxy', { status: 403 });
    }

    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });

    if (!response.ok) {
      return new NextResponse(`Upstream image failed: ${response.status}`, { status: response.status });
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const buffer = await response.arrayBuffer();

    return new NextResponse(Buffer.from(buffer), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      },
    });
  } catch (err: any) {
    return new NextResponse(`Error proxying image: ${err.message}`, { status: 500 });
  }
}
