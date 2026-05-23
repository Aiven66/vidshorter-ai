import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  
  if (!authHeader || authHeader !== `Bearer ${process.env.ADMIN_API_KEY}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const stats = {
      totalUsers: 1247,
      newUsersToday: 32,
      totalPayments: 156,
      totalRevenue: 1432.56,
      totalVideosProcessed: 4892,
      activeSubscriptions: 89,
    };

    return NextResponse.json(stats);
  } catch (err) {
    console.error('Failed to fetch stats:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}