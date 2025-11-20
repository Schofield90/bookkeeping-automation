/**
 * Supabase Client Configuration
 * Handles authentication and storage operations
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

/**
 * Upload a bank statement file to Supabase Storage
 */
export async function uploadBankStatement(
  file: File,
  organizationId: string
): Promise<{ path: string; error?: string }> {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')

  // Generate unique filename
  const timestamp = Date.now()
  const fileName = `${timestamp}_${file.name}`
  const filePath = `${organizationId}/${year}/${month}/${fileName}`

  try {
    const { data, error } = await supabase.storage
      .from('bookkeeping-financial-docs')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      })

    if (error) {
      return { path: '', error: error.message }
    }

    return { path: data.path }
  } catch (error) {
    return { path: '', error: String(error) }
  }
}

/**
 * Get a signed URL for a private file
 */
export async function getSignedUrl(filePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from('bookkeeping-financial-docs')
    .createSignedUrl(filePath, 3600) // 1 hour expiry

  if (error) {
    console.error('Error getting signed URL:', error)
    return null
  }

  return data.signedUrl
}
