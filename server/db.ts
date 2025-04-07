import { drizzle } from "drizzle-orm/node-postgres";
import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();
const { Pool } = pkg;

// Create a PostgreSQL connection pool
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Create a Drizzle instance
export const db = drizzle(pool);