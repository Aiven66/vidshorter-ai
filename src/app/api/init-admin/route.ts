import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function POST(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    
    // Check if admin already exists
    const { data: existingAdmin } = await client
      .from('users')
      .select('id')
      .eq('role', 'admin')
      .maybeSingle();

    if (existingAdmin) {
      return NextResponse.json({ 
        message: 'Admin account already exists',
        exists: true 
      });
    }

    // Create admin auth user
    const { data: authData, error: authError } = await client.auth.signUp({
      email: 'admin@vidshorter.ai',
      password: 'admin123',
      options: {
        data: { name: 'Admin' },
      },
    });

    if (authError) {
      // If user already exists in auth, try to sign in
      if (authError.message.includes('already registered')) {
        const { data: signInData, error: signInError } = await client.auth.signInWithPassword({
          email: 'admin@vidshorter.ai',
          password: 'admin123',
        });

        if (signInError) {
          return NextResponse.json({ 
            error: 'Admin account exists but credentials are incorrect' 
          }, { status: 400 });
        }

        // Update role to admin
        if (signInData.user) {
          await client
            .from('users')
            .update({ role: 'admin' })
            .eq('id', signInData.user.id);

          return NextResponse.json({ 
            message: 'Admin role updated successfully',
            credentials: { email: 'admin@vidshorter.ai', password: 'admin123' }
          });
        }
      }
      
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    if (!authData.user) {
      return NextResponse.json({ error: 'Failed to create admin user' }, { status: 500 });
    }

    // Update user role to admin
    const { error: updateError } = await client
      .from('users')
      .update({ role: 'admin' })
      .eq('id', authData.user.id);

    if (updateError) {
      console.error('Error updating admin role:', updateError);
    }

    // Create credits for admin
    await client.from('credits').insert({
      user_id: authData.user.id,
      balance: 999999,
    });

    // Create subscription for admin
    await client.from('subscriptions').insert({
      user_id: authData.user.id,
      plan_type: 'pro',
      status: 'active',
    });

    return NextResponse.json({ 
      message: 'Admin account created successfully',
      credentials: { email: 'admin@vidshorter.ai', password: 'admin123' }
    });

  } catch (error) {
    console.error('Init admin error:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ 
    message: 'Use POST to initialize admin account',
    credentials: { email: 'admin', password: 'admin123' }
  });
}
