import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js'
import { Database } from './database.types'

dotenv.config();

let supabaseUrl;
let supabaseKey;

if (process.env.NODE_ENV === 'development') {
  if (!process.env.LOCAL_SUPABASE_URL || !process.env.LOCAL_SUPABASE_KEY) {
    throw new Error('Missing Supabase URL or Key')
  }
  supabaseUrl = process.env.LOCAL_SUPABASE_URL;
  supabaseKey = process.env.LOCAL_SUPABASE_KEY;
} else if (process.env.NODE_ENV === 'production') {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    throw new Error('Missing Supabase URL or Key')
  }
  supabaseUrl = process.env.SUPABASE_URL;
  supabaseKey = process.env.SUPABASE_KEY;
} else {
  throw new Error('Invalid NODE_ENV')
}

export const supabase = createClient<Database>(
    supabaseUrl!,
    supabaseKey!
);
