
import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Session, User } from '@supabase/supabase-js';
import { useToast } from '../components/ToastSystem';

import { Store, RolePermissions, SectionSlug } from '../types';

export type UserRole = 'super_admin' | 'store_owner' | 'staff' | 'customer';

export interface UserProfile {
    id: string;
    email: string;
    full_name: string;
    role: UserRole;
    is_active: boolean;
    store_id?: string;
    role_id?: string;
}

interface AuthContextType {
    session: Session | null;
    user: User | null;
    profile: UserProfile | null;
    permissions: RolePermissions | null;
    isLoading: boolean;
    isAdmin: boolean;
    isRecovery: boolean;
    signOut: () => Promise<void>;
    refreshProfile: () => Promise<void>;
    hasPermission: (slug: SectionSlug, action?: 'view' | 'create' | 'edit' | 'delete') => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [session, setSession] = useState<Session | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [permissions, setPermissions] = useState<RolePermissions | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRecovery, setIsRecovery] = useState(false);
    const { addToast } = useToast();

    // FAILSAFE ABSOLUTO: Si pasan 8 segundos y sigue cargando, forzamos el render.
    // Esto evita que te quedes en negro para siempre si Supabase no responde un evento.
    useEffect(() => {
        const timer = setTimeout(() => {
            if (isLoading) {
                console.warn("AuthContext: Tiempo de espera agotado (8s). Forzando render.");
                setIsLoading(false);
            }
        }, 8000);
        return () => clearTimeout(timer);
    }, [isLoading]);

    // Use Ref to track current user ID to avoid stale closures in onAuthStateChange
    const userIdRef = useRef<string | null>(null);

    useEffect(() => {
        if (user?.id) userIdRef.current = user.id;
        else userIdRef.current = null;
    }, [user]);

    useEffect(() => {
        let mounted = true;
        let initComplete = false;

        const initStrictAuth = async () => {
            try {
                console.log("[AUTH] Starting Strict Initialization...");
                const { data: { session: initialSession }, error: sessionError } = await supabase.auth.getSession();

                if (sessionError) throw sessionError;

                if (mounted) {
                    setSession(initialSession);
                    setUser(initialSession?.user || null);
                    if (initialSession?.user) userIdRef.current = initialSession.user.id;

                    const isRec = window.location.hash.includes('type=recovery') ||
                        window.location.search.includes('type=recovery');
                    if (isRec) setIsRecovery(true);

                    if (initialSession?.user && !isRec && mounted) {
                        await fetchProfile(initialSession.user.id, initialSession.user.email);
                    }
                }
            } catch (error) {
                console.error('[AUTH] Init Error:', error);
                setSession(null);
                setUser(null);
                setProfile(null);
                userIdRef.current = null;
            } finally {
                if (mounted) {
                    console.log("[AUTH] Strict Initialization Complete.");
                    setIsLoading(false);
                    initComplete = true;
                }
            }
        };

        initStrictAuth();

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
            if (!mounted) return;
            // console.log("Supabase Auth Event:", event); // Reduced heavy logging

            // CRITICAL: Ignore initial events
            if (event === 'SIGNED_IN' && !initComplete) return;

            if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
                const newUserId = newSession?.user?.id;
                const currentUserId = userIdRef.current;

                // SMART CHECK: Only act if User ID CHANGED
                if (newUserId && newUserId === currentUserId) {
                    // Same user - just update session/token silently. DO NOT CLEAR PROFILE.
                    if (event !== 'TOKEN_REFRESHED') console.log('[AUTH] Re-auth for same user. Keeping profile.');
                    setSession(newSession);
                    setUser(newSession.user);
                    return;
                }

                // If different user (or first login), THEN fetch
                console.log('[AUTH] New User detected (or fresh login). Fetching profile...');
                setIsLoading(true); // Only lock for NEW users
                setIsRecovery(false);
                setProfile(null); // Clear old profile
                setSession(newSession);
                setUser(newSession?.user || null);
                userIdRef.current = newSession?.user?.id || null;

                if (newSession?.user) {
                    await fetchProfile(newSession.user.id, newSession.user.email);
                }
                setIsLoading(false);

            } else if (event === 'SIGNED_OUT') {
                setIsRecovery(false);
                setSession(null);
                setUser(null);
                setProfile(null);
                setPermissions(null);
                userIdRef.current = null;
            } else if (event === 'PASSWORD_RECOVERY') {
                setIsRecovery(true);
            }
        });

        return () => {
            mounted = false;
            subscription.unsubscribe();
        };
    }, []);

    const fetchProfile = async (userId: string, emailArg?: string) => {
        // 🚨 GOD MODE BYPASS: Via Environment Variable
        const currentUserEmail = emailArg || session?.user?.email || user?.email;
        const superAdminEmail = import.meta.env.VITE_SUPER_ADMIN_EMAIL;

        if (currentUserEmail && superAdminEmail && currentUserEmail === superAdminEmail) {
            console.log('👑 GOD MODE ACTIVATED: Bypassing database completely for', currentUserEmail);
            setProfile({
                id: userId,
                email: currentUserEmail,
                full_name: 'SUPER ADMIN',
                role: 'super_admin',
                is_active: true,
                store_id: undefined
            });
            setPermissions(null); // Full access
            setIsLoading(false);
            return; // 🛑 NEVER query DB for this user
        }

        // 🚨 STORE OWNER BYPASS: Via Environment Variables
        const ownerBypassEmail = import.meta.env.VITE_OWNER_BYPASS_EMAIL;
        const ownerBypassStoreId = import.meta.env.VITE_OWNER_BYPASS_STORE_ID;

        if (currentUserEmail && ownerBypassEmail && currentUserEmail === ownerBypassEmail && ownerBypassStoreId) {
            console.log('[AUTH] 👑 OWNER BYPASS ACTIVATED via env vars');

            setProfile({
                id: userId,
                email: currentUserEmail,
                full_name: 'Store Owner',
                role: 'store_owner',
                is_active: true,
                store_id: ownerBypassStoreId
            });
            setPermissions(null);
            setIsLoading(false);

            // Background DB sync
            supabase.from('profiles').upsert({
                id: userId,
                email: currentUserEmail,
                full_name: 'Store Owner',
                role: 'store_owner',
                is_active: true,
                store_id: ownerBypassStoreId
            }).then(({ error }) => {
                if (error) console.error('[AUTH] Background DB Repair failed:', error);
                else console.log('[AUTH] Background DB Repair SUCCESS');
            });
            return;
        }

        // SKIP if we already have a valid profile for this user
        if (profile && profile.id === userId) {
            console.log('[AUTH] Profile already loaded for this user. Skipping fetch.');
            return;
        }

        console.log('[AUTH] 🔍 fetchProfile called with userId:', userId);

        // STEP 1: Always try to fetch existing profile from database FIRST
        let attempts = 0;
        const maxAttempts = 3;

        while (attempts < maxAttempts) {
            attempts++;
            try {
                console.log(`[AUTH] Attempting to fetch profile from DB (Attempt ${attempts}/${maxAttempts})...`);

                // Add timeout to prevent infinite hang
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Profile fetch timeout after 5s')), 5000)
                );

                const fetchPromise = supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', userId)
                    .single();

                const result = await Promise.race([fetchPromise, timeoutPromise]) as any;
                const { data: existingProfile, error: profileError } = result;

                if (!profileError && existingProfile) {
                    console.log('[AUTH] ✅ Loaded existing profile from DB:', existingProfile.email, 'role:', existingProfile.role, 'store_id:', existingProfile.store_id);

                    const userProfile = existingProfile as UserProfile;

                    // Check for Impersonation (only for super_admin or store_owner)
                    const impersonatedStoreId = localStorage.getItem('impersonated_store_id');
                    if (impersonatedStoreId && (userProfile.role === 'super_admin' || userProfile.role === 'store_owner')) {
                        console.log('[AUTH] 🕵️ Impersonation Active. Target Store:', impersonatedStoreId);
                        userProfile.store_id = impersonatedStoreId;
                    }

                    setProfile(userProfile);

                    // Fetch Permissions if role_id exists (and not overridden by failsafe)
                    if (userProfile.role_id) {
                        const { data: permData } = await supabase
                            .from('cafe_role_permissions')
                            .select('section_slug, can_view, can_create, can_edit, can_delete')
                            .eq('role_id', userProfile.role_id);

                        if (permData) {
                            const permMap: RolePermissions = {};
                            permData.forEach((p: any) => {
                                permMap[p.section_slug] = {
                                    view: p.can_view,
                                    create: p.can_create,
                                    edit: p.can_edit,
                                    delete: p.can_delete
                                };
                            });
                            setPermissions(permMap);
                        }
                    } else if (userProfile.role === 'store_owner' || userProfile.role === 'super_admin') {
                        setPermissions(null); // Full access
                    }
                    return; // Done - profile loaded successfully
                }

                // If we got here, profile is null or error occurred.
                console.warn(`[AUTH] Profile fetch attempt ${attempts} failed or returned null.`);
                if (attempts < maxAttempts) {
                    console.log(`[AUTH] Retrying in 1000ms...`);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

            } catch (err: any) {
                console.log(`[AUTH] Profile fetch error on attempt ${attempts}:`, err.message);
                if (attempts < maxAttempts) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        }

        // STEP 2: Profile fetch failed - ONLY use hardcoded fallback for TRUE emergency admin
        // This is ONLY for when the database is completely unreachable and we need emergency access
        const userEmail = session?.user?.email || user?.email;
        console.log('[AUTH] DB fetch failed. Checking emergency fallback for:', userEmail);

        // EMERGENCY ADMIN ONLY - Via Environment Variable
        const emergencyAdminEmail = import.meta.env.VITE_SUPER_ADMIN_EMAIL;
        if (userEmail && emergencyAdminEmail && userEmail === emergencyAdminEmail) {
            console.log('[AUTH] 🚨 EMERGENCY GOD MODE ACTIVATED via env var');
            setProfile({
                id: session?.user?.id || 'emergency-id',
                email: userEmail,
                full_name: 'GOD MODE ADMIN',
                role: 'super_admin',
                is_active: true,
                store_id: undefined
            });
            setPermissions(null);
            setIsLoading(false);
            return;
        }


        // 🚨 AUTO-HEALING FOR STORE OWNER - Via Environment Variables
        if (userEmail && ownerBypassEmail && userEmail === ownerBypassEmail && ownerBypassStoreId) {
            console.log('[AUTH] 🩹 AUTO-HEALING Owner Profile via env vars');

            setProfile({
                id: userId,
                email: userEmail,
                full_name: 'Store Owner',
                role: 'store_owner',
                is_active: true,
                store_id: ownerBypassStoreId
            });
            setPermissions(null);
            setIsLoading(false);

            supabase.from('profiles').upsert({
                id: userId,
                email: userEmail,
                full_name: 'Store Owner',
                role: 'store_owner',
                is_active: true,
                store_id: ownerBypassStoreId
            }).then(({ error }) => {
                if (error) console.error('[AUTH] Background DB Repair failed:', error);
                else console.log('[AUTH] Background DB Repair SUCCESS');
            });
            return;
        }


        // STEP 3: Profile not found after retries -> AUTO-HEAL 🏳️
        // Instead of leaving the user in limbo, we create a basic profile row.
        console.warn(`[AUTH] ⚠️ Profile missing for ${userEmail}. Initiating AUTO-HEALING...`);

        const autoHealProfile: UserProfile = {
            id: userId,
            email: userEmail || `user_${userId.substr(0, 8)}@temp.livv`,
            full_name: session?.user?.user_metadata?.full_name || 'Nuevo Usuario',
            role: 'customer', // Default role
            is_active: true,
            store_id: session?.user?.user_metadata?.store_id || undefined
        };

        try {
            const { data: newProfile, error: createError } = await supabase
                .from('profiles')
                .upsert(autoHealProfile) // Upsert is safer than insert
                .select()
                .single();

            if (createError) {
                console.error('[AUTH] Auto-heal failed:', createError);
                throw createError;
            }

            if (newProfile) {
                console.log('[AUTH] ✅ Profile AUTO-HEALED successfully.');
                setProfile(newProfile as UserProfile);
                setPermissions(null); // Customers usually have no special permissions
                return;
            }
        } catch (healError) {
            console.error('[AUTH] Critical Auto-Heal Error:', healError);
            // NOW we fall through to the manual error screen if even auto-heal fails
        }
    };

    const hasPermission = (slug: SectionSlug, action: 'view' | 'create' | 'edit' | 'delete' = 'view'): boolean => {
        if (isAdmin || profile?.role === 'store_owner') return true;
        if (!permissions) return false;

        const sectionPerms = permissions[slug];
        if (!sectionPerms) return false;

        return sectionPerms[action];
    };

    const refreshProfile = async () => {
        if (user) await fetchProfile(user.id);
    };

    const signOut = async () => {
        console.log("AuthProvider: Iniciando proceso de cierre de sesión...");
        try {
            // Solo borramos datos de autenticación, preservando datos offline
            const keysToRemove = Object.keys(localStorage).filter(key =>
                key.startsWith('sb-') || key.includes('supabase') || key === 'impersonated_store_id'
            );
            keysToRemove.forEach(key => localStorage.removeItem(key));
            sessionStorage.clear();

            setProfile(null);
            setUser(null);
            setSession(null);

            await supabase.auth.signOut();
            console.log("AuthProvider: Supabase signOut completado.");
        } catch (e) {
            console.error("AuthProvider: Error en signOut:", e);
        } finally {
            window.location.href = '#/';
            window.location.reload();
        }
    };

    // --- SUPER ADMIN CHECK (STRICT - ROLE ONLY + GOD MODE via ENV) ---
    const superAdminEnv = import.meta.env.VITE_SUPER_ADMIN_EMAIL;
    const isGodMode = !!(superAdminEnv && user?.email === superAdminEnv);
    const isAdmin = isGodMode || !!(user && profile && profile.id === user.id && profile.role === 'super_admin');

    return (
        <AuthContext.Provider value={{
            session,
            user,
            profile,
            permissions,
            isLoading,
            isAdmin,
            isRecovery,
            signOut,
            refreshProfile,
            hasPermission
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
