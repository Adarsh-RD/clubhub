// backend/migrate-cascade-all.js
require('dotenv').config();
const { poolQuery, pool } = require('./db');

async function runMigration() {
  console.log('🔄 Running comprehensive cascade delete migration on database constraints...');
  try {
    // 1. users.club_id (SET NULL)
    console.log('Altering users (club_id)...');
    await poolQuery(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_club_id_fkey`);
    await poolQuery(`ALTER TABLE users ADD CONSTRAINT users_club_id_fkey FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE SET NULL`);

    // 2. announcements.club_id (CASCADE)
    console.log('Altering announcements (club_id)...');
    await poolQuery(`ALTER TABLE announcements DROP CONSTRAINT IF EXISTS announcements_club_id_fkey`);
    await poolQuery(`ALTER TABLE announcements ADD CONSTRAINT announcements_club_id_fkey FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE`);

    // 3. announcements.created_by (CASCADE)
    console.log('Altering announcements (created_by)...');
    await poolQuery(`ALTER TABLE announcements DROP CONSTRAINT IF EXISTS announcements_created_by_fkey`);
    await poolQuery(`ALTER TABLE announcements ADD CONSTRAINT announcements_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(email) ON DELETE CASCADE`);

    // 4. club_subscriptions.club_id (CASCADE)
    console.log('Altering club_subscriptions (club_id)...');
    await poolQuery(`ALTER TABLE club_subscriptions DROP CONSTRAINT IF EXISTS club_subscriptions_club_id_fkey`);
    await poolQuery(`ALTER TABLE club_subscriptions ADD CONSTRAINT club_subscriptions_club_id_fkey FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE`);

    // 5. club_subscriptions.user_id (CASCADE)
    console.log('Altering club_subscriptions (user_id)...');
    await poolQuery(`ALTER TABLE club_subscriptions DROP CONSTRAINT IF EXISTS club_subscriptions_user_id_fkey`);
    await poolQuery(`ALTER TABLE club_subscriptions ADD CONSTRAINT club_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`);

    // 6. event_registrations.announcement_id (CASCADE)
    console.log('Altering event_registrations (announcement_id)...');
    await poolQuery(`ALTER TABLE event_registrations DROP CONSTRAINT IF EXISTS event_registrations_announcement_id_fkey`);
    await poolQuery(`ALTER TABLE event_registrations ADD CONSTRAINT event_registrations_announcement_id_fkey FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE`);

    // 7. event_registrations.user_id (CASCADE)
    console.log('Altering event_registrations (user_id)...');
    await poolQuery(`ALTER TABLE event_registrations DROP CONSTRAINT IF EXISTS event_registrations_user_id_fkey`);
    await poolQuery(`ALTER TABLE event_registrations ADD CONSTRAINT event_registrations_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`);

    // 8. announcement_likes.announcement_id (CASCADE)
    console.log('Altering announcement_likes (announcement_id)...');
    await poolQuery(`ALTER TABLE announcement_likes DROP CONSTRAINT IF EXISTS announcement_likes_announcement_id_fkey`);
    await poolQuery(`ALTER TABLE announcement_likes ADD CONSTRAINT announcement_likes_announcement_id_fkey FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE`);

    // 9. announcement_likes.user_email (CASCADE)
    console.log('Altering announcement_likes (user_email)...');
    await poolQuery(`ALTER TABLE announcement_likes DROP CONSTRAINT IF EXISTS announcement_likes_user_email_fkey`);
    await poolQuery(`ALTER TABLE announcement_likes ADD CONSTRAINT announcement_likes_user_email_fkey FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE CASCADE`);

    // 10. announcement_comments.announcement_id (CASCADE)
    console.log('Altering announcement_comments (announcement_id)...');
    await poolQuery(`ALTER TABLE announcement_comments DROP CONSTRAINT IF EXISTS announcement_comments_announcement_id_fkey`);
    await poolQuery(`ALTER TABLE announcement_comments ADD CONSTRAINT announcement_comments_announcement_id_fkey FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE`);

    // 11. announcement_comments.user_email (CASCADE)
    console.log('Altering announcement_comments (user_email)...');
    await poolQuery(`ALTER TABLE announcement_comments DROP CONSTRAINT IF EXISTS announcement_comments_user_email_fkey`);
    await poolQuery(`ALTER TABLE announcement_comments ADD CONSTRAINT announcement_comments_user_email_fkey FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE CASCADE`);

    // 12. broadcast_messages.club_id (CASCADE)
    console.log('Altering broadcast_messages (club_id)...');
    await poolQuery(`ALTER TABLE broadcast_messages DROP CONSTRAINT IF EXISTS broadcast_messages_club_id_fkey`);
    await poolQuery(`ALTER TABLE broadcast_messages ADD CONSTRAINT broadcast_messages_club_id_fkey FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE`);

    // 13. broadcast_messages.sender_email (CASCADE)
    console.log('Altering broadcast_messages (sender_email)...');
    await poolQuery(`ALTER TABLE broadcast_messages DROP CONSTRAINT IF EXISTS broadcast_messages_sender_email_fkey`);
    await poolQuery(`ALTER TABLE broadcast_messages ADD CONSTRAINT broadcast_messages_sender_email_fkey FOREIGN KEY (sender_email) REFERENCES users(email) ON DELETE CASCADE`);

    // 14. broadcast_subscriptions.club_id (CASCADE)
    console.log('Altering broadcast_subscriptions (club_id)...');
    await poolQuery(`ALTER TABLE broadcast_subscriptions DROP CONSTRAINT IF EXISTS broadcast_subscriptions_club_id_fkey`);
    await poolQuery(`ALTER TABLE broadcast_subscriptions ADD CONSTRAINT broadcast_subscriptions_club_id_fkey FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE`);

    // 15. broadcast_subscriptions.user_email (CASCADE)
    console.log('Altering broadcast_subscriptions (user_email)...');
    await poolQuery(`ALTER TABLE broadcast_subscriptions DROP CONSTRAINT IF EXISTS broadcast_subscriptions_user_email_fkey`);
    await poolQuery(`ALTER TABLE broadcast_subscriptions ADD CONSTRAINT broadcast_subscriptions_user_email_fkey FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE CASCADE`);

    // 16. event_registration_fields.announcement_id (CASCADE)
    console.log('Altering event_registration_fields (announcement_id)...');
    await poolQuery(`ALTER TABLE event_registration_fields DROP CONSTRAINT IF EXISTS event_registration_fields_announcement_id_fkey`);
    await poolQuery(`ALTER TABLE event_registration_fields ADD CONSTRAINT event_registration_fields_announcement_id_fkey FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE`);

    console.log('✅ Database migration successful! All records can now be deleted at any time with automatic cascading.');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
  } finally {
    await pool.end();
  }
}

runMigration();
