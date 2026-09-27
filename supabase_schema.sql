-- ================================================================
-- AL Map & Event Logger — Supabase Cloud Database & RLS Schema
-- ================================================================

-- 1. Create Locations Table
CREATE TABLE IF NOT EXISTS public.locations (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  name TEXT NOT NULL,
  category TEXT DEFAULT 'Other',
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS) on Locations
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own locations"
  ON public.locations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own locations"
  ON public.locations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own locations"
  ON public.locations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own locations"
  ON public.locations FOR DELETE
  USING (auth.uid() = user_id);

-- 2. Create Events Table
CREATE TABLE IF NOT EXISTS public.events (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  location_id TEXT REFERENCES public.locations(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  date TEXT NOT NULL,
  description TEXT,
  score NUMERIC NOT NULL DEFAULT 5.0,
  photo_url TEXT,
  audio_url TEXT,
  favorite INTEGER DEFAULT 0,
  tags TEXT,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS) on Events
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own events"
  ON public.events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own events"
  ON public.events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own events"
  ON public.events FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own events"
  ON public.events FOR DELETE
  USING (auth.uid() = user_id);

-- 3. Create Storage Bucket for Photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('photos', 'photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public view photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'photos');

CREATE POLICY "Authenticated users upload photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'photos' AND auth.role() = 'authenticated');
