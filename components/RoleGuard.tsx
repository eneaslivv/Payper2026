import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Navigate } from 'react-router-dom';

interface RoleGuardProps {
    children: React.ReactNode;
    allowedRoles?: string[]; // If empty, just checks auth
    fallbackPath?: string;
}

export const RoleGuard: React.FC<RoleGuardProps> = ({ children, allowedRoles = [], fallbackPath = '/dashboard' }) => {
    const { user, profile, isLoading, signOut } = useAuth();

    // 1. LOADING STATE - BLOCK EVERYTHING
    if (isLoading) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-black">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-neon"></div>
            </div>
        );
    }

    // 2. AUTH CHECK
    if (!user) {
        return <Navigate to="/login" replace />;
    }

    // 3. PROFILE CHECK (Strict Security)
    // If we have a user but no profile yet (and not loading), something is wrong.
    // However, AuthContext might have a fallback or we might be in strict mode.
    // If strict role check is needed, we need profile.
    if (allowedRoles.length > 0 && !profile) {
        console.error('[RoleGuard] User authenticated but no profile found. Access denied.');
        // Security decision: valid user but missing profile -> logout or redirect?
        // Safer to redirect to login or show error.
        return <Navigate to="/login" replace />;
    }

    // 4. ROLE CHECK
    if (allowedRoles.length > 0 && profile) {
        // Super Admin always passes (unless explicitly excluded, which is rare)
        if (profile.role === 'super_admin') {
            return <>{children}</>;
        }

        if (!allowedRoles.includes(profile.role)) {
            console.error(`[RoleGuard] Access Denied. Required: ${allowedRoles.join(', ')}. Has: ${profile.role}`);
            return <Navigate to={fallbackPath} replace />;
        }
    }

    return <>{children}</>;
};
