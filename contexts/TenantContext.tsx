import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

/**
 * Tenant/Store branding configuration
 */
export interface TenantBranding {
    store_id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    cover_url: string | null;
    menu_theme: {
        primaryColor?: string;
        secondaryColor?: string;
        backgroundColor?: string;
        fontFamily?: string;
        accentColor?: string;
        [key: string]: any;
    };
    service_mode: string | null;
    business_hours: Record<string, any> | null;
}

interface TenantContextType {
    branding: TenantBranding | null;
    isLoading: boolean;
    error: string | null;
    refreshBranding: () => Promise<void>;
    // Computed theme values for easy access
    theme: {
        primaryColor: string;
        secondaryColor: string;
        backgroundColor: string;
        accentColor: string;
        fontFamily: string;
    };
}

// Default theme values
const DEFAULT_THEME = {
    primaryColor: '#6366f1',      // Indigo
    secondaryColor: '#8b5cf6',    // Purple  
    backgroundColor: '#0f172a',   // Slate-900
    accentColor: '#22d3ee',       // Cyan
    fontFamily: 'Inter, system-ui, sans-serif'
};

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export const TenantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { profile } = useAuth();
    const [branding, setBranding] = useState<TenantBranding | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchBranding = async (storeId: string) => {
        setIsLoading(true);
        setError(null);

        try {
            console.log('[TENANT] Fetching branding for store:', storeId);

            // Query store data - use select('*') as some columns may not be in generated types yet
            const { data, error: queryError } = await supabase
                .from('stores')
                .select('*')
                .eq('id', storeId)
                .single();

            // Type assertion for store data (cover_url may not be in supabaseTypes yet)
            const storeData = data as Record<string, any> | null;

            if (queryError) {
                console.error('[TENANT] Query Error:', queryError);
                throw queryError;
            }

            if (storeData) {
                console.log('[TENANT] Branding loaded:', storeData);
                const brandingData: TenantBranding = {
                    store_id: storeData.id,
                    name: storeData.name || '',
                    slug: storeData.slug || '',
                    logo_url: storeData.logo_url || null,
                    cover_url: storeData.cover_url || null,
                    menu_theme: (storeData.menu_theme as TenantBranding['menu_theme']) || {},
                    service_mode: storeData.service_mode || null,
                    business_hours: storeData.business_hours as Record<string, any> | null
                };
                setBranding(brandingData);
            } else {
                console.warn('[TENANT] No branding data returned for store:', storeId);
            }
        } catch (err: any) {
            console.error('[TENANT] Failed to fetch branding:', err.message);
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const refreshBranding = async () => {
        if (profile?.store_id) {
            await fetchBranding(profile.store_id);
        }
    };

    // Auto-fetch branding when profile.store_id changes
    useEffect(() => {
        if (profile?.store_id) {
            fetchBranding(profile.store_id);
        } else {
            // Clear branding if no store assigned
            setBranding(null);
        }
    }, [profile?.store_id]);

    // Compute theme values with fallbacks
    const theme = useMemo(() => {
        const menuTheme = branding?.menu_theme || {};
        return {
            primaryColor: menuTheme.primaryColor || DEFAULT_THEME.primaryColor,
            secondaryColor: menuTheme.secondaryColor || DEFAULT_THEME.secondaryColor,
            backgroundColor: menuTheme.backgroundColor || DEFAULT_THEME.backgroundColor,
            accentColor: menuTheme.accentColor || DEFAULT_THEME.accentColor,
            fontFamily: menuTheme.fontFamily || DEFAULT_THEME.fontFamily
        };
    }, [branding?.menu_theme]);

    // Apply CSS variables for global theming
    useEffect(() => {
        if (branding) {
            const root = document.documentElement;
            root.style.setProperty('--tenant-primary', theme.primaryColor);
            root.style.setProperty('--tenant-secondary', theme.secondaryColor);
            root.style.setProperty('--tenant-bg', theme.backgroundColor);
            root.style.setProperty('--tenant-accent', theme.accentColor);
            root.style.setProperty('--tenant-font', theme.fontFamily);
        }
    }, [branding, theme]);

    return (
        <TenantContext.Provider value={{
            branding,
            isLoading,
            error,
            refreshBranding,
            theme
        }}>
            {children}
        </TenantContext.Provider>
    );
};

export const useTenant = (): TenantContextType => {
    const context = useContext(TenantContext);
    if (context === undefined) {
        throw new Error('useTenant must be used within a TenantProvider');
    }
    return context;
};

/**
 * Hook to get just the theme values (convenience)
 */
export const useTenantTheme = () => {
    const { theme, branding } = useTenant();
    return {
        ...theme,
        logoUrl: branding?.logo_url,
        coverUrl: branding?.cover_url,
        storeName: branding?.name
    };
};
