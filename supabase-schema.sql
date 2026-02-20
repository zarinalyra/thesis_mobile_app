-- Add farm_id column if it doesn't exist
ALTER TABLE geotags ADD COLUMN IF NOT EXISTS farm_id TEXT;

-- Enable RLS on existing tables
ALTER TABLE images ENABLE ROW LEVEL SECURITY;
ALTER TABLE geotags ENABLE ROW LEVEL SECURITY;

-- Create policies to allow all operations
CREATE POLICY "Allow all operations on images" ON images
FOR ALL USING (true);

CREATE POLICY "Allow all operations on geotags" ON geotags
FOR ALL USING (true);

-- Storage policies for leafImages bucket
CREATE POLICY "Allow public uploads" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'leafImages');

CREATE POLICY "Allow public access" ON storage.objects
FOR SELECT USING (bucket_id = 'leafImages');
