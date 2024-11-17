import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js'
import { Database } from './database.types'

dotenv.config();

const supabaseUrl = process.env.NODE_ENV === 'development'
    ? process.env.LOCAL_SUPABASE_URL
    : process.env.SUPABASE_URL
const supabaseKey = process.env.NODE_ENV === 'development'
    ? process.env.LOCAL_SUPABASE_KEY
    : process.env.SUPABASE_KEY

if (process.env.NODE_ENV === 'development') {
  if (!process.env.LOCAL_SUPABASE_URL || !process.env.LOCAL_SUPABASE_KEY) {
    throw new Error('Missing Supabase URL or Key')
  }
} else {
  if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase URL or Key')
  }
}

export const supabase = createClient<Database>(
    supabaseUrl!,
    supabaseKey!
)
