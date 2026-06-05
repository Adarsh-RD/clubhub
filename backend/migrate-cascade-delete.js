// backend/migrate-cascade-delete.js
require('dotenv').config();
const { poolQuery, pool } = require('./db');

async function runMigration() {
  console.log('🔄 Running cascade delete migration on database constraints...');
  try {
    // 1. Alter club_subscriptions foreign key to cascade delete
    console.log('Altering club_subscriptions...');
    await poolQuery(`
      ALTER TABLE club_subscriptions 
      DROP CONSTRAINT IF EXISTS club_subscriptions_user_id_fkey
    `);
    await poolQuery(`
      ALTER TABLE club_subscriptions 
      ADD CONSTRAINT club_subscriptions_user_id_fkey 
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    `);

    // 2. Alter event_registrations foreign key to cascade delete
    console.log('Altering event_registrations...');
    await poolQuery(`
      ALTER TABLE event_registrations 
      DROP CONSTRAINT IF EXISTS event_registrations_user_id_fkey
    `);
    await poolQuery(`
      ALTER TABLE event_registrations 
      ADD CONSTRAINT event_registrations_user_id_fkey 
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    `);

    // 3. Alter announcements foreign key to cascade delete
    console.log('Altering announcements...');
    await poolQuery(`
      ALTER TABLE announcements 
      DROP CONSTRAINT IF EXISTS announcements_created_by_fkey
    `);
    await poolQuery(`
      ALTER TABLE announcements 
      ADD CONSTRAINT announcements_created_by_fkey 
      FOREIGN KEY (created_by) REFERENCES users(email) ON DELETE CASCADE
    `);

    // 4. Alter broadcast_messages foreign key to cascade delete
    console.log('Altering broadcast_messages...');
    await poolQuery(`
      ALTER TABLE broadcast_messages 
      DROP CONSTRAINT IF EXISTS broadcast_messages_sender_email_fkey
    `);
    await poolQuery(`
      ALTER TABLE broadcast_messages 
      ADD CONSTRAINT broadcast_messages_sender_email_fkey 
      FOREIGN KEY (sender_email) REFERENCES users(email) ON DELETE CASCADE
    `);

    console.log('✅ Database migration successful! User deletions will now cascade.');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
  } finally {
    await pool.end();
  }
}

runMigration();
