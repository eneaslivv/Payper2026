
import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import * as Sentry from '@sentry/react';
import { supabase } from '../lib/supabase';
import { Session, User } from '@supabase/supabase-js';
import { useToast } from '../components/ToastSystem';

import { Store, RolePermissions, SectionSlug } from '../types';

export type UserRole = 'super_admin' | 'store_owner' | 'staff' | 'customer';

const SENTRY_ENABLED = Boolean(import.meta.env.VITE_SENTRY_DSN);

export interface UserProfile {
    id: string;
    email: string;
    full_name: string;
    role: UserRole;
    is_active: boolean;
    store_id?: string;
    role_id?: string;
    balance?: number; // Added for wallet support
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

    const allowedRoles: UserRole[] = ['customer', 'store_owner', 'super_admin', 'staff'];

    const getSafeRole = (metadataRole?: UserRole | string) => {
        const roleCandidate = metadataRole as UserRole | undefined;
        return allowedRoles.includes(roleCandidate || 'customer')
            ? (roleCandidate as UserRole)
            : 'customer';
    };

    const buildEmergencyProfile = (currentUser: User): UserProfile => ({
        id: currentUser.id,
        email: currentUser.email || `user_${currentUser.id.slice(0, 8)}@temp.livv`,
        full_name: currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0] || 'Usuario',
        role: getSafeRole(currentUser.user_metadata?.role as UserRole | undefined),
        is_active: true,
        store_id: currentUser.user_metadata?.store_id
    });

    const applyEmergencyProfile = async (currentUser: User) => {
        const emergencyProfile = buildEmergencyProfile(currentUser);

        try {
            const { data, error } = await supabase
                .from('profiles')
                .upsert(emergencyProfile)
                .select()
                .single();

            if (!error && data) {
                setProfile(data as UserProfile);
            } else {
                setProfile(emergencyProfile);
            }
        } catch {
            setProfile(emergencyProfile);
        } finally {
            setPermissions(null);
        }
    };

    // FAILSAFE ABSOLUTO: Si pasan 8 segundos y sigue cargando, forzamos el render.
    useEffect(() => {
        const timer = setTimeout(() => {
            if (!isLoading) return;

            const currentUser = userRef.current;
            const currentProfile = profileRef.current;

            console.warn("AuthContext: Tiempo de espera agotado (8s). Forzando render.", {
                hasUser: Boolean(currentUser),
                hasProfile: Boolean(currentProfile),
                userId: currentUser?.id,
                email: currentUser?.email
            });
            setIsLoading(false);

            if (currentUser && !currentProfile) {
                void applyEmergencyProfile(currentUser);
            }
        }, 8000);
        return () => clearTimeout(timer);
    }, [isLoading]);

    const userIdRef = useRef<string | null>(null);
    const userRef = useRef<User | null>(null);
    const profileRef = useRef<UserProfile | null>(null);
    const fallbackUserIdRef = useRef<string | null>(null);

    useEffect(() => {
        if (user?.id) userIdRef.current = user.id;
        else userIdRef.current = null;

        if (!user?.id) fallbackUserIdRef.current = null;

        userRef.current = user;
        profileRef.current = profile;
    }, [user, profile]);

    useEffect(() => {
        if (isLoading) return;
        if (!user || profile) return;
        if (fallbackUserIdRef.current === user.id) return;

        fallbackUserIdRef.current = user.id;
        void applyEmergencyProfile(user);
    }, [isLoading, user, profile]);

    useEffect(() => {
        if (!SENTRY_ENABLED) return;
        if (user?.id) {
            Sentry.setUser({ id: user.id });
        } else {
            Sentry.setUser(null);
        }

        if (profile?.store_id) {
            Sentry.setTag('store_id', profile.store_id);
            Sentry.setTag('tenant_unassigned', 'false');
        } else {
            Sentry.setTag('store_id', 'unassigned');
            Sentry.setTag('tenant_unassigned', 'true');
        }

        if (profile?.role) {
            Sentry.setTag('role', profile.role);
        }
    }, [profile, user]);

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

            if (event === 'SIGNED_IN' && !initComplete) return;

            if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
                const newUserId = newSession?.user?.id;
                const currentUserId = userIdRef.current;

                if (newUserId && newUserId === currentUserId) {
                    setSession(newSession);
                    setUser(newSession.user);
                    return;
                }

                console.log('[AUTH] New User detected (or fresh login). Fetching profile...');
                setIsLoading(true);
                setIsRecovery(false);
                setProfile(null);
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
        if (profile && profile.id === userId) {
            setIsLoading(false);
            return;
        }

        try {
            console.log('[AUTH] 🔍 fetchProfile called with userId:', userId);

            let attempts = 0;
            const maxAttempts = 3;

            while (attempts < maxAttempts) {
                attempts++;
                try {
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
                        const userProfile = existingProfile as UserProfile;
                        const impersonatedStoreId = localStorage.getItem('impersonated_store_id');
                        if (impersonatedStoreId && (userProfile.role === 'super_admin' || userProfile.role === 'store_owner')) {
                            userProfile.store_id = impersonatedStoreId;
                        }

                        setProfile(userProfile);

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
                            setPermissions(null);
                        }
                        return;
                    }
                    if (attempts < maxAttempts) await new Promise(resolve => setTimeout(resolve, 1000));
                } catch (err: any) {
                    if (attempts < maxAttempts) await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            const userEmail = session?.user?.email || user?.email || emailArg;
            console.warn(`[AUTH] ⚠️ Profile missing for ${userEmail}. Initiating AUTO-HEALING...`);

            const autoHealProfile: any = {
                id: userId,
                email: userEmail || `user_${userId.substr(0, 8)}@temp.livv`,
                full_name: session?.user?.user_metadata?.full_name || 'Nuevo Usuario',
                role: 'customer',
                is_active: true,
                store_id: session?.user?.user_metadata?.store_id || undefined,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            try {
                const { data: newProfile, error: createError } = await supabase
                    .from('profiles')
                    .upsert(autoHealProfile)
                    .select()
                    .single();

                if (createError) throw createError;
                if (newProfile) {
                    console.log('[AUTH] ✅ Profile AUTO-HEALED successfully.');
                    setProfile(newProfile as UserProfile);
                    setPermissions(null);
                    return;
                }
            } catch (healError) {
                console.error('[AUTH] Critical Auto-Heal Error:', healError);
                const fallbackProfile: UserProfile = {
                    id: userId,
                    email: userEmail || `user_${userId.substr(0, 8)}@temp.livv`,
                    full_name: user?.user_metadata?.full_name || userEmail?.split('@')[0] || 'Usuario',
                    role: getSafeRole(user?.user_metadata?.role as UserRole | undefined),
                    is_active: true,
                    store_id: user?.user_metadata?.store_id
                };
                setProfile(fallbackProfile);
                setPermissions(null);
            }
        } finally {
            setIsLoading(false);
        }
    };

    const hasPermission = (slug: SectionSlug, action: 'view' | 'create' | 'edit' | 'delete' = 'view'): boolean => {
        if (isAdmin || profile?.role === 'store_owner') return true;
        if (!permissions) return false;
        const sectionPerms = permissions[slug];
        return sectionPerms ? sectionPerms[action] : false;
    };

    const refreshProfile = async () => {
        if (user) await fetchProfile(user.id);
    };

    const signOut = async () => {
        try {
            const keysToRemove = Object.keys(localStorage).filter(key =>
                key.startsWith('sb-') || key.includes('supabase') || key === 'impersonated_store_id'
            );
            keysToRemove.forEach(key => localStorage.removeItem(key));
            sessionStorage.clear();
            setProfile(null);
            setUser(null);
            setSession(null);
            await supabase.auth.signOut();
        } catch (e) {
            console.error(e);
        } finally {
            window.location.href = '#/';
            window.location.reload();
        }
    };

    const isAdmin = !!(user && profile && profile.id === user.id && profile.role === 'super_admin');

    return (
        <AuthContext.Provider value={{
            session, user, profile, permissions, isLoading, isAdmin, isRecovery,
            signOut, refreshProfile, hasPermission
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
    return context;
};
