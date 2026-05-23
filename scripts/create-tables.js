const { Client } = require('pg');

const client = new Client({
  host: 'db.zqvcgzypiirkultrlhll.supabase.co',
  port: 5432,
  user: 'postgres',
  password: 'postgres',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

const createTables = async () => {
  try {
    await client.connect();
    console.log('✅ Connected to Supabase database');

    const usersTable = `
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) NOT NULL UNIQUE,
        name VARCHAR(128),
        password_hash VARCHAR(255),
        role VARCHAR(20) NOT NULL DEFAULT 'user',
        google_id VARCHAR(255),
        avatar_url VARCHAR(500),
        is_active BOOLEAN DEFAULT true NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;

    const creditsTable = `
      CREATE TABLE IF NOT EXISTS credits (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        balance INTEGER NOT NULL DEFAULT 100,
        last_reset_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;

    const subscriptionsTable = `
      CREATE TABLE IF NOT EXISTS subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        plan_type VARCHAR(20) NOT NULL DEFAULT 'free',
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        stripe_subscription_id VARCHAR(255),
        stripe_customer_id VARCHAR(255),
        current_period_start TIMESTAMPTZ,
        current_period_end TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;

    const rlsCommands = `
      ALTER TABLE users ENABLE ROW LEVEL SECURITY;
      ALTER TABLE credits ENABLE ROW LEVEL SECURITY;
      ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
      
      CREATE POLICY "Users can view own data" ON users FOR SELECT USING (auth.uid() = id);
      CREATE POLICY "Users can update own data" ON users FOR UPDATE USING (auth.uid() = id);
      CREATE POLICY "Users can view own credits" ON credits FOR SELECT USING (auth.uid() = user_id);
      CREATE POLICY "Users can view own subscriptions" ON subscriptions FOR SELECT USING (auth.uid() = user_id);
    `;

    await client.query(usersTable);
    console.log('✅ Created users table');

    await client.query(creditsTable);
    console.log('✅ Created credits table');

    await client.query(subscriptionsTable);
    console.log('✅ Created subscriptions table');

    await client.query(rlsCommands);
    console.log('✅ Enabled RLS and created policies');

    console.log('\n🎉 All database tables created successfully!');
  } catch (err) {
    console.error('❌ Error creating tables:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
};

createTables();