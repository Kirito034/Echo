-- Create the connection_requests table
CREATE TABLE IF NOT EXISTS "connection_requests" (
  "id" SERIAL PRIMARY KEY,
  "sender_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "receiver_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "message" TEXT,
  "created_at" TIMESTAMP DEFAULT NOW(),
  "updated_at" TIMESTAMP DEFAULT NOW()
);

-- Add indexes for faster queries
CREATE INDEX IF NOT EXISTS "connection_requests_sender_id_idx" ON "connection_requests" ("sender_id");
CREATE INDEX IF NOT EXISTS "connection_requests_receiver_id_idx" ON "connection_requests" ("receiver_id");
CREATE INDEX IF NOT EXISTS "connection_requests_status_idx" ON "connection_requests" ("status");