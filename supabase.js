import { createClient } from "@supabase/supabase-js";

const supabaseConfig = {
  supabaseUrl: "https://dnosvgmnchutemcqkvrm.supabase.co",
  supabaseKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRub3N2Z21uY2h1dGVtY3FrdnJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1MTExMTksImV4cCI6MjA4NzA4NzExOX0.qIFiXQfyFm0bJ02lw0PSqHbUYhsGX0qCXLQcLzivxQI"
};

export const supabase = createClient(
  supabaseConfig.supabaseUrl,
  supabaseConfig.supabaseKey
);
