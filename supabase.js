import { createClient } from "@supabase/supabase-js";

// Prefer environment-provided values, but fall back to the project's
// known Supabase defaults so the app doesn't crash when a local `.env`
// file is not present during development on a device.
const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  "https://qkxejsfhtrkcdokqzzrj.supabase.co";
const supabaseKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFreGVqc2ZodHJrY2Rva3F6enJqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1Nzg2NTcsImV4cCI6MjA5MjE1NDY1N30.RC-fOFcthBtavdOSC5DgCeiNV4_CLX9SEEa9siB296M";

export const supabase = createClient(supabaseUrl, supabaseKey);
