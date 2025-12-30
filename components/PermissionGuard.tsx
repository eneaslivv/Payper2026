import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { SectionSlug } from '../types';

interface PermissionGuardProps {
    slug?: SectionSlug;
    section?: SectionSlug; // Alias for slug
    action?: 'view' | 'create' | 'edit' | 'delete';
    children: React.ReactNode;
    fallback?: React.ReactNode;
}

/**
 * PermissionGuard
 * 
 * Conditionally renders children if the logged-in user has the required permission.
 * Owners and Super Admins always have full access.
 */
export const PermissionGuard: React.FC<PermissionGuardProps> = ({
    slug,
    section,
    action = 'view',
    children,
    fallback = null
}) => {
    const { hasPermission, profile } = useAuth();
    const sectionSlug = slug || section;

    // FAILSAFE: Owners and Super Admins ALWAYS have full access
    // This bypasses any potential "permissions" state lag or misconfiguration
    if (profile?.role === 'store_owner' || profile?.role === 'super_admin') {
        return <>{children}</>;
    }

    if (!sectionSlug || hasPermission(sectionSlug, action)) {
        return <>{children}</>;
    }

    return <>{fallback}</>;
};

export default PermissionGuard;
