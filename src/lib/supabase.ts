import { createClient } from '@supabase/supabase-js';

import { env } from './env';

export const supabase =
  env.supabaseUrl && env.supabaseAnonKey
    ? createClient(env.supabaseUrl, env.supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      })
    : null;

/**
 * Dynamically generates the next sequence code for a given prefix and table.
 * It first attempts to call the database RPC function `get_next_code` (which is
 * RLS-safe and concurrency-safe). If that fails, it falls back to the client-side
 * scan of existing records.
 */
export async function getNextCode(
  prefix: string,
  tableName: string,
  columnName: string = 'code',
  padLength: number = 3
): Promise<string> {
  const year = new Date().getFullYear();
  const searchPattern = `${prefix}-${year}-`;
  
  if (!supabase) {
    return `${searchPattern}${'1'.padStart(padLength, '0')}`;
  }

  try {
    // 1. Try calling the RLS-safe database RPC sequence generator
    const { data, error } = await supabase.rpc('get_next_code', {
      p_prefix: prefix,
      p_year: year
    });

    if (!error && typeof data === 'string') {
      return data;
    }
    
    console.warn(`RPC get_next_code failed or not found for prefix "${prefix}", falling back to client-side generation:`, error?.message);
  } catch (err) {
    console.warn(`Exception calling get_next_code RPC for prefix "${prefix}":`, err);
  }

  // 2. Client-side fallback (fallback if RPC fails, subject to RLS limitations)
  try {
    const { data, error } = await supabase
      .from(tableName)
      .select(columnName)
      .like(columnName, `${searchPattern}%`);
      
    if (error) {
      console.error(`Error fetching next code (fallback) for ${prefix}:`, error);
      return `${searchPattern}${'1'.padStart(padLength, '0')}`;
    }
    
    let maxSuffix = 0;
    if (data && data.length > 0) {
      for (const row of data) {
        const val = (row as any)[columnName];
        if (typeof val === 'string') {
          const parts = val.split('-');
          const lastPart = parts[parts.length - 1];
          const suffixNum = parseInt(lastPart, 10);
          if (!isNaN(suffixNum) && suffixNum > maxSuffix) {
            maxSuffix = suffixNum;
          }
        }
      }
    }
    
    const nextNum = maxSuffix + 1;
    return `${prefix}-${year}-${nextNum.toString().padStart(padLength, '0')}`;
  } catch (err) {
    console.error(`Error in getNextCode fallback for ${prefix}:`, err);
    return `${searchPattern}${'1'.padStart(padLength, '0')}`;
  }
}


