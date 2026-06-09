-- Create custom_translations table for automated runtime translation caching
CREATE TABLE IF NOT EXISTS public.custom_translations (
    key text PRIMARY KEY,
    fr text NOT NULL,
    en text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.custom_translations ENABLE ROW LEVEL SECURITY;

-- Policy to allow all authenticated users to select translations
CREATE POLICY "Allow select for authenticated users" ON public.custom_translations
    FOR SELECT TO authenticated USING (true);

-- Policy to allow all authenticated users to insert or update translations
CREATE POLICY "Allow upsert for authenticated users" ON public.custom_translations
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
