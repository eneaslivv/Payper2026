/**
 * Encrypted Secrets Helper
 * Provides functions to securely retrieve encrypted tokens from store_secrets table
 * Replaces direct access to plaintext mp_access_token / mp_refresh_token columns
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface MPTokens {
  access_token: string;
  refresh_token?: string;
}

/**
 * Get MercadoPago access token for a store (decrypted)
 * Falls back to plaintext column if mp_tokens_encrypted = false (migration period)
 */
export async function getMPAccessToken(
  supabase: SupabaseClient,
  storeId: string
): Promise<string | null> {
  try {
    // Check if store uses encrypted tokens
    const { data: store, error: storeError } = await supabase
      .from('stores')
      .select('mp_tokens_encrypted, mp_access_token')
      .eq('id', storeId)
      .single();

    if (storeError || !store) {
      console.error('[getMPAccessToken] Store not found:', storeError);
      return null;
    }

    // If tokens are encrypted, use RPC to decrypt
    if (store.mp_tokens_encrypted) {
      const { data: decrypted, error: decryptError } = await supabase
        .rpc('store_secret_decrypt', {
          p_store_id: storeId,
          p_secret_type: 'mp_access_token'
        });

      if (decryptError) {
        console.error('[getMPAccessToken] Decryption failed:', decryptError);
        return null;
      }

      return decrypted as string;
    }

    // Fallback to plaintext (during migration)
    console.warn('[getMPAccessToken] Using plaintext token (not encrypted yet)');
    return store.mp_access_token || null;

  } catch (error) {
    console.error('[getMPAccessToken] Unexpected error:', error);
    return null;
  }
}

/**
 * Get MercadoPago refresh token for a store (decrypted)
 */
export async function getMPRefreshToken(
  supabase: SupabaseClient,
  storeId: string
): Promise<string | null> {
  try {
    const { data: store, error: storeError } = await supabase
      .from('stores')
      .select('mp_tokens_encrypted, mp_refresh_token')
      .eq('id', storeId)
      .single();

    if (storeError || !store) {
      console.error('[getMPRefreshToken] Store not found:', storeError);
      return null;
    }

    if (store.mp_tokens_encrypted) {
      const { data: decrypted, error: decryptError } = await supabase
        .rpc('store_secret_decrypt', {
          p_store_id: storeId,
          p_secret_type: 'mp_refresh_token'
        });

      if (decryptError) {
        console.error('[getMPRefreshToken] Decryption failed:', decryptError);
        return null;
      }

      return decrypted as string;
    }

    console.warn('[getMPRefreshToken] Using plaintext token (not encrypted yet)');
    return store.mp_refresh_token || null;

  } catch (error) {
    console.error('[getMPRefreshToken] Unexpected error:', error);
    return null;
  }
}

/**
 * Get both MP tokens at once
 */
export async function getMPTokens(
  supabase: SupabaseClient,
  storeId: string
): Promise<MPTokens | null> {
  try {
    const [accessToken, refreshToken] = await Promise.all([
      getMPAccessToken(supabase, storeId),
      getMPRefreshToken(supabase, storeId)
    ]);

    if (!accessToken) {
      return null;
    }

    return {
      access_token: accessToken,
      refresh_token: refreshToken || undefined
    };
  } catch (error) {
    console.error('[getMPTokens] Error:', error);
    return null;
  }
}

/**
 * Store encrypted MP tokens (used after OAuth)
 */
export async function storeMPTokens(
  supabase: SupabaseClient,
  storeId: string,
  accessToken: string,
  refreshToken?: string,
  expiresIn?: number
): Promise<boolean> {
  try {
    // Store access token
    const { error: accessError } = await supabase.rpc('store_secret_encrypt', {
      p_store_id: storeId,
      p_secret_type: 'mp_access_token',
      p_plaintext_value: accessToken,
      p_expires_at: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null
    });

    if (accessError) {
      console.error('[storeMPTokens] Failed to store access token:', accessError);
      return false;
    }

    // Store refresh token if provided
    if (refreshToken) {
      const { error: refreshError } = await supabase.rpc('store_secret_encrypt', {
        p_store_id: storeId,
        p_secret_type: 'mp_refresh_token',
        p_plaintext_value: refreshToken,
        p_expires_at: null // Refresh tokens don't expire
      });

      if (refreshError) {
        console.error('[storeMPTokens] Failed to store refresh token:', refreshError);
        return false;
      }
    }

    // Mark store as using encrypted tokens
    await supabase
      .from('stores')
      .update({ mp_tokens_encrypted: true })
      .eq('id', storeId);

    console.log('[storeMPTokens] Successfully stored encrypted tokens for store:', storeId);
    return true;

  } catch (error) {
    console.error('[storeMPTokens] Unexpected error:', error);
    return false;
  }
}

/**
 * Refresh MP access token using refresh token
 * Automatically stores the new tokens encrypted
 */
export async function refreshMPAccessToken(
  supabase: SupabaseClient,
  storeId: string
): Promise<string | null> {
  try {
    const refreshToken = await getMPRefreshToken(supabase, storeId);

    if (!refreshToken) {
      console.error('[refreshMPAccessToken] No refresh token available');
      return null;
    }

    // Call MP OAuth token endpoint
    const response = await fetch('https://api.mercadopago.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: Deno.env.get('MP_CLIENT_ID') || '',
        client_secret: Deno.env.get('MP_CLIENT_SECRET') || '',
        refresh_token: refreshToken
      })
    });

    if (!response.ok) {
      console.error('[refreshMPAccessToken] MP API error:', await response.text());
      return null;
    }

    const data = await response.json();

    // Store new tokens encrypted
    await storeMPTokens(
      supabase,
      storeId,
      data.access_token,
      data.refresh_token,
      data.expires_in
    );

    return data.access_token;

  } catch (error) {
    console.error('[refreshMPAccessToken] Error:', error);
    return null;
  }
}
