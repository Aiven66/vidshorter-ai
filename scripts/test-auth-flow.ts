import { getSupabaseClient } from '../src/storage/database/supabase-client';

async function testAuthFlow() {
  console.log('=== Testing Authentication Flow ===\n');
  
  try {
    // 1. Test Supabase connection
    console.log('1. Testing Supabase connection...');
    const client = getSupabaseClient();
    console.log('✓ Supabase client created successfully');
    
    // 2. Test session retrieval
    console.log('\n2. Testing session retrieval...');
    const { data, error } = await client.auth.getSession();
    if (error) {
      console.log('✗ Failed to get session:', error.message);
    } else if (data.session) {
      console.log('✓ Session found:', {
        userId: data.session.user.id,
        email: data.session.user.email,
        tokenExpiresIn: data.session.expires_in
      });
    } else {
      console.log('✓ No active session (expected for test)');
    }
    
    // 3. Test login
    console.log('\n3. Testing login flow...');
    const testEmail = process.env.TEST_EMAIL || 'test@example.com';
    const testPassword = process.env.TEST_PASSWORD || 'password123';
    
    try {
      const { error: signInError } = await client.auth.signInWithPassword({
        email: testEmail,
        password: testPassword
      });
      
      if (signInError) {
        console.log('Note: Login failed (expected if test credentials not set):', signInError.message);
      } else {
        const { data: sessionData } = await client.auth.getSession();
        if (sessionData.session) {
          console.log('✓ Login successful!');
          console.log('  - Access token:', sessionData.session.access_token?.substring(0, 20) + '...');
          console.log('  - Token expires in:', sessionData.session.expires_in + 's');
          
          // Test token verification
          console.log('\n4. Testing token verification...');
          const { data: userData } = await client.auth.getUser(sessionData.session.access_token);
          if (userData.user) {
            console.log('✓ Token verified successfully');
            console.log('  - User ID:', userData.user.id);
            console.log('  - Email:', userData.user.email);
          }
        }
      }
    } catch (e) {
      console.log('Note: Login test skipped (no test credentials)');
    }
    
    console.log('\n=== Authentication Flow Test Completed ===');
    
  } catch (e) {
    console.error('Test failed:', e);
    process.exit(1);
  }
}

// Run the test
testAuthFlow();
