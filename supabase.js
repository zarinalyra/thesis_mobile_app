import { createClient } from "@supabase/supabase-js";

const supabaseConfig = {
  supabaseUrl: "https://qkxejsfhtrkcdokqzzrj.supabase.co",
  supabaseKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFreGVqc2ZodHJrY2Rva3F6enJqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1Nzg2NTcsImV4cCI6MjA5MjE1NDY1N30.RC-fOFcthBtavdOSC5DgCeiNV4_CLX9SEEa9siB296M",
};

export const supabase = createClient(
  supabaseConfig.supabaseUrl,
  supabaseConfig.supabaseKey,
);
