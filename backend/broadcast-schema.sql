-- Broadcast Channels Schema for Club Hub (PostgreSQL / Supabase)
-- These tables are created automatically by the backend on startup,
-- but you can run this manually if needed.

-- 1. Broadcast Messages Table
CREATE TABLE IF NOT EXISTS broadcast_messages (
    id SERIAL PRIMARY KEY,
    club_id INTEGER REFERENCES clubs(id) NOT NULL,
    sender_email VARCHAR(255) REFERENCES users(email) NOT NULL,
    message_type VARCHAR(50) DEFAULT 'text',    -- 'text', 'announcement', 'reminder', 'update'
    content TEXT,
    image_url TEXT,
    link_url TEXT,
    is_urgent BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Broadcast Subscriptions Table
CREATE TABLE IF NOT EXISTS broadcast_subscriptions (
    id SERIAL PRIMARY KEY,
    user_email VARCHAR(255) REFERENCES users(email) ON DELETE CASCADE NOT NULL,
    club_id INTEGER REFERENCES clubs(id) ON DELETE CASCADE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_email, club_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_broadcast_messages_club_id ON broadcast_messages(club_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_messages_created_at ON broadcast_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_broadcast_subscriptions_user ON broadcast_subscriptions(user_email);
CREATE INDEX IF NOT EXISTS idx_broadcast_subscriptions_club ON broadcast_subscriptions(club_id);
