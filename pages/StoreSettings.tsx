import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/ToastSystem';
import { Store, StaffMember, CustomRole, SectionSlug, AuditLogEntry, AuditCategory, AIConfig } from '../types';
import { MOCK_STAFF, MOCK_ROLES, MOCK_AUDIT_LOG, DEFAULT_AI_CONFIG } from '../constants';

const SECTIONS: { slug: SectionSlug, label: string }[] = [
    { slug: 'dashboard', label: 'Dashboard Principal' },
    { slug: 'orders', label: 'Tablero de Despacho' },
    { slug: 'inventory', label: 'Stock e Insumos' },
    { slug: 'recipes', label: 'Recetario (BOM)' },
    { slug: 'finance', label: 'Finanzas y Caja' },
    { slug: 'tables', label: 'Mesas y QR' },
    { slug: 'clients', label: 'Directorio Clientes' },
    { slug: 'loyalty', label: 'Fidelización' },
    { slug: 'design', label: 'Diseño de Menú' },
    { slug: 'staff', label: 'Staff y Roles' },
    { slug: 'audit', label: 'Auditoría' },
];

const AUDIT_CATEGORIES: { slug: AuditCategory | 'all', label: string, icon: string }[] = [
    { slug: 'all', label: 'Todo', icon: 'apps' },
    { slug: 'stock', label: 'Stock', icon: 'package_2' },
    { slug: 'orders', label: 'Pedidos', icon: 'list_alt' },
    { slug: 'finance', label: 'Finanzas', icon: 'payments' },
    { slug: 'staff', label: 'Staff', icon: 'badge' },
    { slug: 'system', label: 'Sistema', icon: 'settings' },
];

const StoreSettings: React.FC = () => {
    const { profile, refreshProfile, isAdmin } = useAuth();
    const { addToast } = useToast();
    const [isFetching, setIsFetching] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [activeTab, setActiveTab] = useState<'negocio' | 'staff' | 'audit' | 'ai' | 'payment'>('negocio');
    const [store, setStore] = useState<Partial<Store>>({
        name: '',
        address: '',
        tax_info: '',
        logo_url: ''
    });

    // --- RBAC & STAFF STATE ---
    const [members, setMembers] = useState<StaffMember[]>([]);
    const [roles, setRoles] = useState<CustomRole[]>([]);
    const [staffSubTab, setStaffSubTab] = useState<'members' | 'roles'>('roles');
    const [showRoleModal, setShowRoleModal] = useState(false);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
    const [roleForm, setRoleForm] = useState<Partial<CustomRole>>({
        name: '',
        description: '',
        permissions: SECTIONS.reduce((acc, s) => ({ ...acc, [s.slug]: { view: false, create: false, edit: false, delete: false } }), {})
    });
    const [inviteForm, setInviteForm] = useState({ email: '', fullName: '', roleId: '' });

    // --- AUDIT STATE ---
    const [logs] = useState<AuditLogEntry[]>(MOCK_AUDIT_LOG);
    const [auditFilter, setAuditFilter] = useState<AuditCategory | 'all'>('all');
    const [auditSearch, setAuditSearch] = useState('');

    // --- AI & PAYMENT STATE ---
    const [aiConfig, setAiConfig] = useState<AIConfig>(DEFAULT_AI_CONFIG);
    const [mpConnected, setMpConnected] = useState(false);

    // --- AUDIT LOGIC ---
    const filteredLogs = useMemo(() => {
        return logs.filter(log => {
            const matchesCategory = auditFilter === 'all' || log.category === auditFilter;
            const searchLower = auditSearch.toLowerCase();
            const matchesSearch = log.userName.toLowerCase().includes(searchLower) ||
                log.action.toLowerCase().includes(searchLower) ||
                log.entity.toLowerCase().includes(searchLower) ||
                log.detail.toLowerCase().includes(searchLower);
            return matchesCategory && matchesSearch;
        });
    }, [logs, auditFilter, auditSearch]);

    // --- STAFF LOGIC ---
    const toggleStatus = async (id: string, currentStatus: string) => {
        const newStatus = currentStatus === 'active' ? 'suspended' : 'active';
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ status: newStatus })
                .eq('id', id);

            if (error) throw error;
            setMembers(prev => prev.map(m => m.id === id ? { ...m, status: newStatus as any } : m));
            addToast('Éxito', 'success', `Usuario ${newStatus === 'active' ? 'activado' : 'suspendido'}`);
        } catch (error: any) {
            addToast('Error', 'error', error.message);
        }
    };

    const handleEditRole = (role: CustomRole) => {
        setRoleForm(JSON.parse(JSON.stringify(role))); // Deep copy
        setSelectedRoleId(role.id);
        setShowRoleModal(true);
    };

    const handleNewRole = () => {
        setRoleForm({
            name: '',
            description: '',
            permissions: SECTIONS.reduce((acc, s) => ({
                ...acc,
                [s.slug]: { view: false, create: false, edit: false, delete: false }
            }), {})
        });
        setSelectedRoleId(null);
        setShowRoleModal(true);
    };

    const fetchRoles = async () => {
        if (!profile?.store_id) return;
        try {
            const { data: rolesData, error: rolesError } = await supabase
                .from('cafe_roles')
                .select('*, cafe_role_permissions(*)')
                .eq('store_id', profile.store_id);

            if (rolesError) throw rolesError;

            const mappedRoles: CustomRole[] = rolesData.map((r: any) => ({
                id: r.id,
                name: r.name,
                description: r.description,
                is_system: r.is_system,
                permissions: r.cafe_role_permissions.reduce((acc: any, p: any) => ({
                    ...acc,
                    [p.section_slug]: {
                        view: p.can_view,
                        create: p.can_create,
                        edit: p.can_edit,
                        delete: p.can_delete
                    }
                }), {})
            }));
            setRoles(mappedRoles);
        } catch (error: any) {
            console.error('Error fetching roles:', error);
        }
    };

    const fetchStaff = async () => {
        if (!profile?.store_id) return;
        try {
            // Fetch existing staff from profiles
            const { data: staffData, error: staffError } = await supabase
                .from('profiles')
                .select('*')
                .eq('store_id', profile.store_id);

            if (staffError) throw staffError;

            const staffMembers = staffData.map((m: any) => ({
                id: m.id,
                name: m.full_name || 'Sin Nombre',
                email: m.email,
                roleId: m.role_id,
                status: m.status as any,
                avatar: '',
                joinDate: m.created_at
            }));

            // Fetch pending invitations
            const { data: inviteData, error: inviteError } = await supabase
                .from('team_invitations' as any)
                .select('*')
                .eq('store_id', profile.store_id)
                .eq('status', 'pending');

            if (!inviteError && inviteData) {
                const pendingMembers = inviteData
                    .filter((inv: any) => !staffMembers.some((m: any) => m.email === inv.email))
                    .map((inv: any) => ({
                        id: `invite-${inv.id}`,
                        name: inv.email.split('@')[0],
                        email: inv.email,
                        roleId: inv.role,
                        status: 'pending' as any,
                        avatar: '',
                        joinDate: inv.created_at
                    }));
                setMembers([...staffMembers, ...pendingMembers]);
            } else {
                setMembers(staffMembers);
            }
        } catch (error: any) {
            console.error('Error fetching staff:', error);
        }
    };

    const saveRole = async () => {
        if (!roleForm.name || !profile?.store_id) return;

        setIsSaving(true);
        try {
            let roleId = selectedRoleId;

            if (!roleId) {
                const { data, error } = await supabase
                    .from('cafe_roles')
                    .insert({
                        store_id: profile.store_id,
                        name: roleForm.name,
                        description: roleForm.description,
                        is_system: false
                    })
                    .select()
                    .single();

                if (error) throw error;
                roleId = data.id;
            } else {
                const { error } = await supabase
                    .from('cafe_roles')
                    .update({
                        name: roleForm.name,
                        description: roleForm.description
                    })
                    .eq('id', roleId);

                if (error) throw error;
            }

            // Save Permissions
            const permissionEntries = Object.entries(roleForm.permissions || {}).map(([slug, p]: [string, any]) => ({
                role_id: roleId,
                section_slug: slug,
                can_view: p.view,
                can_create: p.create,
                can_edit: p.edit,
                can_delete: p.delete
            }));

            const { error: permError } = await supabase
                .from('cafe_role_permissions')
                .upsert(permissionEntries, { onConflict: 'role_id,section_slug' });

            if (permError) throw permError;

            addToast('Éxito', 'success', 'Rol guardado correctamente');
            fetchRoles();
            setShowRoleModal(false);
            setSelectedRoleId(null);
        } catch (error: any) {
            addToast('Error', 'error', error.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleInvite = async () => {
        console.log('[INVITE] Form values:', inviteForm, 'store_id:', profile?.store_id);

        if (!inviteForm.email || !profile?.store_id) {
            addToast('Campos Requeridos', 'warning', 'Completa el email');
            return;
        }

        setIsSaving(true);
        try {
            const { data, error } = await supabase.functions.invoke('invite-member', {
                body: {
                    email: inviteForm.email,
                    fullName: inviteForm.fullName,
                    roleId: inviteForm.roleId,
                    storeId: profile.store_id,
                    storeName: store.name
                }
            });

            if (error) throw error;

            addToast('Invitación Enviada', 'success', `Se ha invitado a ${inviteForm.email}`);
            setShowInviteModal(false);
            setInviteForm({ email: '', fullName: '', roleId: '' });
            fetchStaff();
        } catch (error: any) {
            addToast('Error', 'error', error.message);
        } finally {
            setIsSaving(false);
        }
    };

    const togglePermission = (slug: string, action: string) => {
        const currentPerms = roleForm.permissions || {};
        const sectionPerms = currentPerms[slug] || { view: false, create: false, edit: false, delete: false };

        setRoleForm(prev => ({
            ...prev,
            permissions: {
                ...currentPerms,
                [slug]: { ...sectionPerms, [action]: !(sectionPerms as any)[action] }
            }
        }));
    };

    useEffect(() => {
        if (profile?.store_id) {
            fetchStore(profile.store_id);
            fetchStaff();
            fetchRoles();
        } else if (profile?.role === 'store_owner' || isAdmin) {
            // Attempt to auto-initialize or show setup
            console.log("No store_id found for owner/admin. Needs initialization.");
        }
    }, [profile?.store_id]);

    const handleInitializeStore = async () => {
        setIsSaving(true);
        try {
            // 1. Create Store
            const { data: newStore, error: storeError } = await supabase
                .from('stores')
                .insert({
                    name: 'Mi Local SQUAD',
                    slug: `local-${Math.random().toString(36).substring(7)}`,
                    onboarding_status: 'COMPLETED'
                })
                .select()
                .single();

            if (storeError) throw storeError;

            // 2. Upsert Profile with store_id
            const { error: profileError } = await supabase
                .from('profiles')
                .upsert({
                    id: profile?.id,
                    email: profile?.email,
                    full_name: profile?.full_name || 'Owner',
                    role: 'store_owner',
                    store_id: newStore.id,
                    status: 'active',
                    is_active: true
                });

            if (profileError) throw profileError;

            // 3. Create Default Admin Role
            const { data: newRole, error: roleError } = await supabase
                .from('cafe_roles')
                .insert({
                    store_id: newStore.id,
                    name: 'Administrador Senior',
                    description: 'Acceso total al sistema (Demo Ref)',
                    is_system: true
                })
                .select()
                .single();

            if (roleError) throw roleError;

            // 4. Create Role Permissions for the new role
            const permissionEntries = SECTIONS.map(s => ({
                role_id: newRole.id,
                section_slug: s.slug,
                can_view: true,
                can_create: true,
                can_edit: true,
                can_delete: true
            }));

            const { error: permsError } = await supabase
                .from('cafe_role_permissions')
                .insert(permissionEntries);

            if (permsError) throw permsError;

            addToast('Nodo Inicializado', 'success', 'Base de datos preparada correctamente');
            refreshProfile(); // This will trigger the useEffect to fetch data
        } catch (error: any) {
            addToast('Error al inicializar', 'error', error.message);
        } finally {
            setIsSaving(false);
        }
    };

    const fetchStore = async (storeId: string) => {
        setIsFetching(true);
        try {
            const { data, error } = await supabase
                .from('stores')
                .select('*')
                .eq('id', storeId)
                .single();

            if (error) throw error;
            setStore(data);
        } catch (error: any) {
            addToast('Error', 'error', 'No se pudo cargar la configuración del local');
        } finally {
            setIsFetching(false);
        }
    };

    const handleSave = async () => {
        if (!profile?.store_id) return;

        setIsSaving(true);
        try {
            const { error } = await supabase
                .from('stores')
                .update({
                    name: store.name,
                    address: store.address,
                    tax_info: store.tax_info,
                    logo_url: store.logo_url,
                    onboarding_status: 'COMPLETED',
                    updated_at: new Date().toISOString()
                })
                .eq('id', profile.store_id);

            if (error) throw error;

            if (newPassword) {
                if (newPassword.length < 6) {
                    addToast('Seguridad', 'warning', 'La contraseña debe tener al menos 6 caracteres.');
                } else {
                    const { error: passError } = await supabase.auth.updateUser({ password: newPassword });
                    if (passError) throw passError;
                    addToast('Seguridad', 'success', 'Contraseña actualizada');
                    setNewPassword('');
                }
            }

            addToast('Éxito', 'success', 'Sincronización completada');
            refreshProfile();
        } catch (error: any) {
            addToast('Error', 'error', error.message);
        } finally {
            setIsSaving(false);
        }
    };

    if (isFetching && !store.name) {
        return (
            <div className="flex h-screen items-center justify-center bg-[#050605]">
                <div className="size-12 border-4 border-neon/20 border-t-neon rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="p-10 space-y-12 max-w-[1400px] mx-auto animate-in fade-in duration-700 relative z-10">
            {/* AMBIENT GLOWS */}
            <div className="absolute top-0 left-1/4 size-96 bg-neon/5 blur-[120px] rounded-full pointer-events-none"></div>

            <header className="flex justify-between items-end">
                <div className="space-y-3">
                    <div className="flex items-center gap-2 text-neon/60 font-black text-[10px] uppercase tracking-[0.4em]">
                        <span className="size-1.5 rounded-full bg-neon shadow-neon-soft animate-pulse"></span>
                        Global Config Hub
                    </div>
                    <h1 className="text-6xl font-black italic text-white uppercase leading-none tracking-tighter">
                        Panel de <span className="text-neon/80">Configuración</span>
                    </h1>
                    <p className="text-white/30 text-[11px] font-bold uppercase tracking-[0.4em] mt-2">Mando centralizado de negocio, equipo y seguridad</p>
                </div>
            </header>

            {/* MAIN TABS NAVBAR */}
            <nav className="flex gap-4 p-2 bg-white/[0.02] border border-white/5 rounded-[2.5rem] w-fit backdrop-blur-xl">
                {[
                    { id: 'negocio', label: 'NEGOCIO', icon: 'storefront' },
                    { id: 'staff', label: 'STAFF & ROLES', icon: 'badge' },
                    { id: 'audit', label: 'AUDITORÍA', icon: 'analytics' },
                    { id: 'ai', label: 'SQUADAI', icon: 'auto_awesome' },
                    { id: 'payment', label: 'PASARELA', icon: 'payments' },
                ].map(t => (
                    <button
                        key={t.id}
                        onClick={() => setActiveTab(t.id as any)}
                        className={`flex items-center gap-3 px-8 py-4 rounded-[1.8rem] text-[11px] font-black tracking-widest transition-all ${activeTab === t.id ? 'bg-neon/10 text-neon border border-neon/20 shadow-neon-soft' : 'text-white/30 hover:text-white/60'}`}
                    >
                        <span className="material-symbols-outlined text-xl">{t.icon}</span>
                        {t.label}
                    </button>
                ))}
            </nav>

            <div className="flex gap-12">
                {/* INITIALIZATION PROMPT IF NO STORE */}
                {!profile?.store_id && (profile?.role === 'store_owner' || isAdmin) && (
                    <div className="absolute inset-0 z-[100] bg-black/80 backdrop-blur-xl flex items-center justify-center p-10">
                        <div className="max-w-md w-full bg-[#0A0C0A] border border-neon/20 rounded-[3rem] p-12 text-center space-y-8 animate-in zoom-in-95 duration-500 shadow-neon-glow">
                            <div className="size-20 rounded-full bg-neon/10 flex items-center justify-center text-neon mx-auto">
                                <span className="material-symbols-outlined text-4xl">database_off</span>
                            </div>
                            <div className="space-y-3">
                                <h3 className="text-2xl font-black italic text-white uppercase tracking-tighter">Nodo no Inicializado</h3>
                                <p className="text-[11px] font-medium text-white/40 uppercase leading-relaxed">
                                    Hemos migrado a una base de datos real. Para comenzar a operar y configurar tus roles, necesitamos inicializar tu espacio de trabajo.
                                </p>
                            </div>
                            <button
                                onClick={handleInitializeStore}
                                disabled={isSaving}
                                className="w-full py-6 bg-neon text-black rounded-2xl font-black text-[12px] uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-neon-soft disabled:opacity-50"
                            >
                                {isSaving ? 'INICIALIZANDO...' : 'INICIALIZAR MI LOCAL'}
                            </button>
                            <p className="text-[9px] font-bold text-white/10 uppercase italic">Esto creará tu estructura de datos y roles básicos.</p>
                        </div>
                    </div>
                )}

                {/* CONTENT AREA */}
                <div className="flex-1 space-y-10">
                    {activeTab === 'negocio' && (
                        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            {/* Logo & Basic Info Section */}
                            <div className="bg-white/[0.02] border border-white/5 rounded-[3rem] p-10 overflow-hidden relative">
                                <div className="absolute top-0 right-0 p-8 opacity-5">
                                    <span className="material-symbols-outlined text-8xl">verified_user</span>
                                </div>

                                <div className="flex items-center gap-10 mb-12">
                                    <div className="relative group shrink-0">
                                        <div className="size-32 rounded-[2.5rem] bg-black border-2 border-dashed border-white/10 flex items-center justify-center overflow-hidden transition-all group-hover:border-neon/40 shadow-2xl">
                                            {store.logo_url ? <img src={store.logo_url} className="w-full h-full object-cover" /> : <span className="material-symbols-outlined text-3xl text-white/5">add_photo_alternate</span>}
                                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all cursor-pointer"><span className="text-[8px] font-black text-white uppercase tracking-widest">Cambiar</span></div>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <h4 className="text-2xl font-black text-white italic uppercase tracking-tighter">Identidad del Nodo</h4>
                                        <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest">Personaliza el ADN visual de tu local</p>
                                        <input
                                            value={store.logo_url || ''}
                                            onChange={e => setStore({ ...store, logo_url: e.target.value })}
                                            className="mt-4 w-full h-10 px-5 rounded-xl bg-white/5 border border-white/10 text-[9px] text-white/40 font-bold focus:border-neon/30 outline-none transition-all placeholder:text-white/5"
                                            placeholder="URL DEL LOGOTIPO EXTERNO..."
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-8">
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em] ml-2">Nombre Comercial</label>
                                        <input
                                            value={store.name || ''}
                                            onChange={e => setStore({ ...store, name: e.target.value })}
                                            className="w-full h-16 bg-white/[0.03] border border-white/10 rounded-[1.2rem] px-6 text-white text-xs font-bold focus:border-neon outline-none uppercase transition-all shadow-inner"
                                        />
                                    </div>
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em] ml-2">Identificador Slug (Fijo)</label>
                                        <div className="w-full h-16 bg-black/40 border border-white/5 rounded-[1.2rem] px-6 text-white/20 text-xs font-bold flex items-center">
                                            {store.slug || 'autoselect-slug'}
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em] ml-2">Dirección Operativa</label>
                                        <input
                                            value={store.address || ''}
                                            onChange={e => setStore({ ...store, address: e.target.value })}
                                            className="w-full h-16 bg-white/[0.03] border border-white/10 rounded-[1.2rem] px-6 text-white text-xs font-bold focus:border-neon outline-none uppercase transition-all shadow-inner"
                                        />
                                    </div>
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em] ml-2">Info Fiscal (CUIT/NIT)</label>
                                        <input
                                            value={store.tax_info || ''}
                                            onChange={e => setStore({ ...store, tax_info: e.target.value })}
                                            className="w-full h-16 bg-white/[0.03] border border-white/10 rounded-[1.2rem] px-6 text-white text-xs font-bold focus:border-neon outline-none uppercase transition-all shadow-inner"
                                        />
                                    </div>
                                </div>

                                <div className="mt-12 p-8 rounded-[2rem] bg-neon/5 border border-neon/10 space-y-6">
                                    <div className="flex items-center gap-3">
                                        <span className="material-symbols-outlined text-neon text-xl">security</span>
                                        <h5 className="text-[10px] font-black text-neon uppercase tracking-widest pt-0.5 whitespace-nowrap">Gestión de Seguridad</h5>
                                        <div className="w-full h-px bg-neon/10"></div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-8 items-end">
                                        <div className="space-y-3">
                                            <p className="text-[9px] font-black text-white/20 uppercase tracking-widest ml-2">Cambiar Contraseña Maestra</p>
                                            <input
                                                type="password"
                                                value={newPassword}
                                                onChange={e => setNewPassword(e.target.value)}
                                                className="w-full h-14 bg-black border border-white/5 rounded-xl px-6 text-white text-xs font-bold focus:border-neon outline-none transition-all placeholder:text-white/5"
                                                placeholder="DEJAR EN BLANCO PARA MANTENER LA ACTUAL"
                                            />
                                        </div>
                                        <p className="text-[9px] text-white/20 font-medium leading-relaxed italic border-l border-white/5 pl-6 pb-2">
                                            La contraseña maestra permite el acceso total al nodo. Recomendamos usar al menos 12 caracteres y rotarla cada 90 días.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'staff' && (
                        <div className="space-y-10 animate-in fade-in slide-in-from-right-4 duration-500">
                            {/* Sub-Header para Staff */}
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-xl italic font-black uppercase tracking-tighter text-white">Equipo y <span className="text-neon">Permisos</span></h3>
                                <div className="flex bg-white/[0.02] p-1 rounded-xl border border-white/5 shadow-soft">
                                    <button onClick={() => setStaffSubTab('members')} className={`px-5 py-2 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all ${staffSubTab === 'members' ? 'bg-white/10 text-neon' : 'text-white/30 hover:text-white'}`}>Directorio Staff</button>
                                    <button onClick={() => setStaffSubTab('roles')} className={`px-5 py-2 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all ${staffSubTab === 'roles' ? 'bg-white/10 text-neon' : 'text-white/30 hover:text-white'}`}>Definición Roles</button>
                                </div>
                            </div>

                            <div className="min-h-[500px]">
                                {staffSubTab === 'members' && (
                                    <div className="space-y-6 animate-in slide-in-from-left-4">
                                        <div className="flex justify-end">
                                            <button
                                                onClick={() => setShowInviteModal(true)}
                                                className="px-8 py-4 rounded-2xl bg-neon text-black font-black text-[12px] uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-neon-soft flex items-center gap-3"
                                            >
                                                <span className="material-symbols-outlined font-black">person_add</span>
                                                Invitar al Equipo
                                            </button>
                                        </div>
                                        <div className="bg-white/[0.02] border border-white/5 rounded-[2.5rem] overflow-hidden shadow-soft">
                                            <table className="w-full text-left border-collapse">
                                                <thead>
                                                    <tr className="bg-white/[0.01] border-b border-white/[0.02]">
                                                        <th className="px-8 py-5 text-[9px] font-black uppercase text-white/30 tracking-widest">Operador</th>
                                                        <th className="px-8 py-5 text-[9px] font-black uppercase text-white/30 tracking-widest">Rango</th>
                                                        <th className="px-8 py-5 text-[9px] font-black uppercase text-white/30 tracking-widest text-center">Estatus</th>
                                                        <th className="px-8 py-5 text-[9px] font-black uppercase text-white/30 tracking-widest text-right">Acciones</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-white/[0.02]">
                                                    {members.map(m => (
                                                        <tr key={m.id} className="hover:bg-white/[0.01] transition-colors">
                                                            <td className="px-8 py-5">
                                                                <div className="flex items-center gap-4">
                                                                    <div className="size-10 rounded-xl bg-neon/10 text-neon flex items-center justify-center font-black italic uppercase">{m.name.charAt(0)}</div>
                                                                    <div>
                                                                        <p className="text-[12px] font-black text-white uppercase italic">{m.name}</p>
                                                                        <p className="text-[10px] text-white/30 font-bold opacity-40 uppercase">{m.email}</p>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="px-8 py-5">
                                                                <span className="text-[10px] font-black bg-white/5 px-2 py-1 rounded text-white/60 uppercase tracking-widest italic">{roles.find(r => r.id === m.roleId)?.name || 'Sin Rol'}</span>
                                                            </td>
                                                            <td className="px-8 py-5 text-center">
                                                                <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase border ${m.status === 'active' ? 'bg-neon/5 text-neon border-neon/10' : m.status === 'pending' ? 'bg-amber-500/5 text-amber-500 border-amber-500/10' : 'bg-red-500/5 text-red-500 border-red-500/10'}`}>
                                                                    {m.status === 'active' ? 'READY' : m.status === 'pending' ? 'PENDIENTE' : 'SUSPENDIDO'}
                                                                </span>
                                                            </td>
                                                            <td className="px-8 py-5 text-right">
                                                                <button onClick={() => toggleStatus(m.id, m.status)} className={`size-8 rounded-lg flex items-center justify-center transition-all ${m.status === 'active' ? 'bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white' : 'bg-neon/10 text-neon hover:bg-neon hover:text-black'} ml-auto`}>
                                                                    <span className="material-symbols-outlined text-base">{m.status === 'active' ? 'block' : 'check'}</span>
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                    {members.length === 0 && (
                                                        <tr><td colSpan={4} className="px-8 py-20 text-center text-white/10 font-black uppercase tracking-widest italic text-xs">No hay operarios registrados</td></tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}

                                {staffSubTab === 'roles' && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 gap-8 animate-in slide-in-from-right-4">
                                        <button onClick={handleNewRole} className="min-h-[220px] rounded-[3rem] border border-dashed border-white/10 flex flex-col items-center justify-center gap-4 group hover:border-neon/40 hover:bg-neon/[0.02] transition-all">
                                            <div className="size-16 rounded-full bg-white/5 flex items-center justify-center text-white/20 group-hover:text-neon group-hover:scale-110 transition-all">
                                                <span className="material-symbols-outlined text-3xl">add</span>
                                            </div>
                                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 group-hover:text-neon transition-colors">Crear Nueva Jerarquía</p>
                                        </button>

                                        {roles.map(role => (
                                            <div key={role.id} className="bg-white/[0.02] p-10 rounded-[3rem] border border-white/5 flex flex-col justify-between group hover:border-white/10 transition-all shadow-soft overflow-hidden relative">
                                                <div>
                                                    <div className="flex justify-between items-start mb-8">
                                                        <div className="size-14 rounded-2xl bg-white/5 flex items-center justify-center text-white/30 group-hover:text-white transition-colors">
                                                            <span className="material-symbols-outlined text-2xl">security</span>
                                                        </div>
                                                        {role.is_system && <span className="text-[8px] bg-white/5 text-white/40 px-3 py-1.5 rounded-xl font-black uppercase tracking-widest border border-white/5">System Locked</span>}
                                                    </div>
                                                    <h3 className="text-2xl font-black italic uppercase tracking-tight text-white mb-2">{role.name}</h3>
                                                    <p className="text-[10px] text-white/40 font-medium leading-relaxed opacity-60 line-clamp-2">{role.description}</p>
                                                </div>

                                                <div className="mt-10 pt-8 border-t border-white/5 flex items-center justify-between">
                                                    <span className="text-[9px] font-black text-white/10 uppercase tracking-widest">Permisos Configurados</span>
                                                    <button onClick={() => handleEditRole(role)} className="px-6 py-3 rounded-2xl bg-white/5 text-white font-black text-[9px] uppercase tracking-widest hover:bg-neon hover:text-black transition-all">
                                                        Editar Matriz
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'audit' && (
                        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="flex flex-col xl:flex-row justify-between gap-6 items-center">
                                <div className="flex bg-white/[0.02] p-1 rounded-[1.5rem] border border-white/5 shadow-soft overflow-x-auto no-scrollbar backdrop-blur-xl">
                                    {AUDIT_CATEGORIES.map(cat => (
                                        <button
                                            key={cat.slug}
                                            onClick={() => setAuditFilter(cat.slug)}
                                            className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-3 whitespace-nowrap ${auditFilter === cat.slug ? 'bg-neon/10 text-neon shadow-neon-soft' : 'text-white/30 hover:text-neon'}`}
                                        >
                                            <span className="material-symbols-outlined text-lg">{cat.icon}</span>
                                            {cat.label}
                                        </button>
                                    ))}
                                </div>
                                <div className="relative flex-1 xl:w-80 group">
                                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-white/20 text-sm">search</span>
                                    <input
                                        value={auditSearch}
                                        onChange={(e) => setAuditSearch(e.target.value)}
                                        placeholder="BUSCAR EVENTO OPERATIVO..."
                                        className="h-12 w-full pl-11 pr-5 rounded-2xl border border-white/5 bg-white/5 outline-none focus:ring-1 focus:ring-neon/20 text-[10px] font-black uppercase tracking-[0.2em] text-white placeholder:text-white/10 transition-all"
                                    />
                                </div>
                            </div>

                            <div className="bg-white/[0.02] rounded-[3rem] border border-white/5 shadow-soft overflow-hidden">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-white/[0.01] border-b border-white/[0.02]">
                                            <th className="px-8 py-6 text-[9px] font-black uppercase text-white/30 tracking-widest">Tiempo</th>
                                            <th className="px-8 py-6 text-[9px] font-black uppercase text-white/30 tracking-widest">Operador</th>
                                            <th className="px-8 py-6 text-[9px] font-black uppercase text-white/30 tracking-widest">Acción / Entidad</th>
                                            <th className="px-8 py-6 text-[9px] font-black uppercase text-white/30 tracking-widest">Detalle Táctico</th>
                                            <th className="px-8 py-6 text-[9px] font-black uppercase text-white/30 tracking-widest text-right">Impacto</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/[0.02]">
                                        {filteredLogs.map(log => (
                                            <tr key={log.id} className="hover:bg-white/[0.01] transition-all group">
                                                <td className="px-8 py-6">
                                                    <p className="text-[12px] font-black text-white uppercase italic leading-none mb-1.5">{log.timestamp.split(' ')[1]}</p>
                                                    <p className="text-[9px] text-white/30 font-bold uppercase tracking-widest opacity-40">{log.timestamp.split(' ')[0]}</p>
                                                </td>
                                                <td className="px-8 py-6">
                                                    <p className="text-[12px] font-black text-white uppercase italic leading-none mb-1.5">{log.userName}</p>
                                                    <p className="text-[9px] text-white/30 font-black uppercase opacity-40">{log.userRole}</p>
                                                </td>
                                                <td className="px-8 py-6">
                                                    <p className="text-[12px] font-black uppercase text-white tracking-tight leading-none mb-1.5">{log.action}</p>
                                                    <p className="text-[10px] text-neon font-black uppercase italic tracking-tighter">{log.entity}</p>
                                                </td>
                                                <td className="px-8 py-6">
                                                    <p className="text-[11px] font-medium text-white/50 leading-relaxed uppercase tracking-tight max-w-xs opacity-70 group-hover:opacity-100 transition-opacity">{log.detail}</p>
                                                </td>
                                                <td className="px-8 py-6 text-right">
                                                    <div className={`size-3 ml-auto rounded-full ${log.impact === 'critical' ? 'bg-orange-500 animate-pulse shadow-[0_0_12px_rgba(249,115,22,0.6)]' : log.impact === 'positive' ? 'bg-neon shadow-neon-soft' : 'bg-white/10'}`}></div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {activeTab === 'ai' && (
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 animate-in fade-in slide-in-from-right-4 duration-500">
                            <div className="lg:col-span-8 space-y-10">
                                <Section title="Configuración de Inteligencia" icon="auto_awesome">
                                    <div className="space-y-10">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                            <div className="p-8 rounded-[2.5rem] bg-black/40 border border-white/5 space-y-6">
                                                <h4 className="text-[11px] font-black uppercase text-neon tracking-[0.2em] italic leading-none">Modo Operativo</h4>
                                                <div className="flex bg-black/60 p-1.5 rounded-[1.2rem] border border-white/5">
                                                    <button onClick={() => setAiConfig({ ...aiConfig, activeMode: 'assistant' })} className={`flex-1 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${aiConfig.activeMode === 'assistant' ? 'bg-white/10 text-white shadow-xl' : 'text-white/20 hover:text-white/40'}`}>Asistente</button>
                                                    <button onClick={() => setAiConfig({ ...aiConfig, activeMode: 'agent' })} className={`flex-1 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${aiConfig.activeMode === 'agent' ? 'bg-white/10 text-white shadow-xl' : 'text-white/20 hover:text-white/40'}`}>Agente</button>
                                                </div>
                                                <p className="text-[9px] text-white/30 uppercase font-bold tracking-tight leading-relaxed italic">
                                                    El modo Agente permite a la IA realizar acciones directas como autorizar correcciones de stock o ajustes de precios.
                                                </p>
                                            </div>
                                            <div className="p-8 rounded-[2.5rem] bg-black/40 border border-white/5 space-y-6">
                                                <h4 className="text-[11px] font-black uppercase text-white/40 tracking-[0.2em] italic leading-none">Capacidades del Enlace</h4>
                                                <div className="space-y-3">
                                                    <LogicRow title="Insights Predictivos" desc="Detección de tendencias de venta" active={aiConfig.capabilities.analysis} onToggle={() => setAiConfig({ ...aiConfig, capabilities: { ...aiConfig.capabilities, analysis: !aiConfig.capabilities.analysis } })} />
                                                    <LogicRow title="Soporte Táctico" desc="Chat interactivo para operadores" active={aiConfig.capabilities.help} onToggle={() => setAiConfig({ ...aiConfig, capabilities: { ...aiConfig.capabilities, help: !aiConfig.capabilities.help } })} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </Section>
                            </div>
                            <div className="lg:col-span-4 space-y-10">
                                <Section title="Consumo de Créditos" icon="bolt">
                                    <div className="space-y-8">
                                        <div className="flex justify-between items-end">
                                            <div>
                                                <p className="text-5xl font-black italic text-white leading-none tracking-tighter">{(aiConfig.usageStats.current / 1000).toFixed(1)}k</p>
                                                <p className="text-[10px] font-black text-white/20 uppercase tracking-widest mt-2">Tokens este mes</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-xl font-black text-neon leading-none italic">{(aiConfig.usageStats.limit / 1000).toFixed(0)}k</p>
                                                <p className="text-[10px] font-black text-white/20 uppercase tracking-widest mt-2">Límite Pro</p>
                                            </div>
                                        </div>
                                        <div className="w-full h-3 bg-white/5 rounded-full overflow-hidden border border-white/5">
                                            <div className="h-full bg-neon shadow-neon-soft transition-all duration-1000" style={{ width: `${(aiConfig.usageStats.current / aiConfig.usageStats.limit) * 100}%` }}></div>
                                        </div>
                                        <button className="w-full py-5 rounded-[1.5rem] bg-white text-black text-[11px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl">
                                            Ampificar Plan IA
                                        </button>
                                    </div>
                                </Section>
                            </div>
                        </div>
                    )}

                    {activeTab === 'payment' && (
                        <div className="max-w-4xl space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <Section title="Integración de Cobros" icon="account_balance_wallet">
                                <div className="space-y-10">
                                    <div className="flex flex-col md:flex-row gap-10 items-start">
                                        <div className="size-28 rounded-[2.5rem] bg-[#009EE3] flex items-center justify-center shrink-0 shadow-[0_20px_40px_rgba(0,158,227,0.3)] border-2 border-white/20">
                                            <span className="text-white font-black text-4xl italic uppercase leading-none tracking-tighter">MP</span>
                                        </div>
                                        <div className="flex-1 space-y-3">
                                            <div className="flex items-center gap-3">
                                                <h4 className="text-2xl font-black italic text-white uppercase tracking-tighter leading-none">Mercado Pago</h4>
                                                <span className="px-3 py-1 rounded-lg bg-neon/10 text-neon text-[9px] font-black uppercase tracking-widest border border-neon/20">ACTIVO</span>
                                            </div>
                                            <p className="text-[11px] font-medium text-white/50 uppercase tracking-widest leading-relaxed">
                                                Pasarela principal para pagos QR en mesa y ventas online. Sincronización automática con el centro de finanzas.
                                            </p>
                                            <div className="flex items-center gap-3 pt-2">
                                                <span className="size-2 rounded-full bg-neon animate-pulse shadow-neon-soft"></span>
                                                <span className="text-[10px] font-black text-neon uppercase tracking-widest italic">Webhooks en Línea (Canal Seguro)</span>
                                            </div>
                                        </div>
                                        <button onClick={() => setMpConnected(!mpConnected)} className="px-10 py-4 rounded-2xl border border-white/10 bg-white/5 text-[11px] font-black uppercase tracking-widest text-white/40 hover:text-red-500 hover:border-red-500/30 transition-all">
                                            Desconectar
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-10 border-t border-white/5">
                                        <div className="space-y-4">
                                            <label className="text-[10px] font-black uppercase text-white/20 tracking-[0.3em] ml-2">App Access Token</label>
                                            <div className="relative group">
                                                <input type="password" value="APP_USR-72819201928374-021018-b2a..." readOnly className="w-full h-14 px-6 rounded-2xl bg-black/60 border border-white/10 text-white text-[11px] font-mono outline-none group-hover:border-white/20 transition-all" />
                                                <button className="absolute right-5 top-1/2 -translate-y-1/2 text-white/10 hover:text-neon transition-colors"><span className="material-symbols-outlined text-lg">content_copy</span></button>
                                            </div>
                                        </div>
                                        <div className="space-y-4">
                                            <label className="text-[10px] font-black uppercase text-white/20 tracking-[0.3em] ml-2">Public Client ID</label>
                                            <div className="relative group">
                                                <input type="text" value="827364152431" readOnly className="w-full h-14 px-6 rounded-2xl bg-black/60 border border-white/10 text-white text-[11px] font-mono outline-none group-hover:border-white/20 transition-all" />
                                                <button className="absolute right-5 top-1/2 -translate-y-1/2 text-white/10 hover:text-neon transition-colors"><span className="material-symbols-outlined text-lg">visibility</span></button>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-8 rounded-[2.5rem] bg-amber-500/5 border border-amber-500/20 flex items-center gap-8 backdrop-blur-md">
                                        <div className="size-16 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500 shrink-0">
                                            <span className="material-symbols-outlined text-3xl">developer_mode</span>
                                        </div>
                                        <div>
                                            <h5 className="text-[11px] font-black uppercase text-amber-500 tracking-widest italic mb-1.5 leading-none">Entorno de Pruebas (SandBox)</h5>
                                            <p className="text-[10px] font-bold text-white/30 uppercase tracking-tight">Habilita esta opción para realizar testeos de flujos sin afectar la caja real del nodo.</p>
                                        </div>
                                        <div className="ml-auto">
                                            <Toggle active={false} onToggle={() => { }} />
                                        </div>
                                    </div>
                                </div>
                            </Section>
                        </div>
                    )}
                </div>

                {/* SIDEBAR STATUS */}
                <div className="w-96 space-y-8">
                    <div className="p-10 rounded-[3rem] bg-white/[0.02] border border-white/10 space-y-8 backdrop-blur-xl">
                        <div className="flex items-center gap-4 pb-6 border-b border-white/5">
                            <div className="size-12 rounded-2xl bg-neon/10 flex items-center justify-center text-neon">
                                <span className="material-symbols-outlined text-2xl">monitor_heart</span>
                            </div>
                            <h4 className="text-xs font-black text-white uppercase tracking-[0.3em]">Estado del Sistema</h4>
                        </div>

                        <div className="space-y-8">
                            <div className="p-6 rounded-2xl bg-black/40 border border-white/5 flex items-center justify-between group hover:border-neon/20 transition-all">
                                <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Servidores Operativos</span>
                                <div className="size-2.5 bg-neon rounded-full shadow-[0_0_15px_rgba(74,222,128,0.5)] animate-pulse"></div>
                            </div>

                            <div className="space-y-3 px-2">
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-white/20 text-lg">sync</span>
                                    <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em]">Ultima Sincronización</p>
                                </div>
                                <p className="text-white font-black italic text-base">Hace 2 minutos <span className="text-neon/60">(Nodo Alpha)</span></p>
                            </div>

                            <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/5 flex flex-col gap-4">
                                <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest">
                                    <span className="text-white/30">Nivel de Latencia</span>
                                    <span className="text-neon">12ms - EXCELLENT</span>
                                </div>
                                <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                                    <div className="h-full bg-neon w-[95%]"></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="w-full py-8 bg-white text-black rounded-[2.5rem] font-black text-[14px] uppercase tracking-[0.4em] hover:scale-[1.03] active:scale-95 transition-all shadow-2xl flex items-center justify-center gap-4 disabled:opacity-50"
                    >
                        {isSaving ? (
                            <div className="size-5 border-2 border-black/20 border-t-black rounded-full animate-spin"></div>
                        ) : (
                            <span className="material-symbols-outlined font-black">save_as</span>
                        )}
                        {isSaving ? 'Sincronizando...' : 'Actualizar Configuración'}
                    </button>

                    <button className="w-full py-6 text-white/20 text-[10px] font-black uppercase tracking-[0.3em] hover:text-red-500 transition-all italic underline decoration-white/5">
                        Restaurar Valores por Defecto
                    </button>
                </div>
            </div>

            <RoleModal
                isOpen={showRoleModal}
                onClose={() => setShowRoleModal(false)}
                roleForm={roleForm}
                setRoleForm={setRoleForm}
                onSave={saveRole}
                onTogglePermission={togglePermission}
                isSaving={isSaving}
            />

            <InviteModal
                isOpen={showInviteModal}
                onClose={() => setShowInviteModal(false)}
                inviteForm={inviteForm}
                setInviteForm={setInviteForm}
                roles={roles}
                onInvite={handleInvite}
                isSaving={isSaving}
            />
        </div>
    );
};

// --- HELPER COMPONENTS ---

const Section: React.FC<{ title: string, icon: string, children: React.ReactNode }> = ({ title, icon, children }) => (
    <div className="bg-white/[0.02] p-10 rounded-[3rem] border border-white/5 space-y-10 backdrop-blur-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-10 opacity-[0.02] pointer-events-none">
            <span className="material-symbols-outlined text-8xl">{icon}</span>
        </div>
        <h3 className="text-[11px] font-black uppercase tracking-[0.3em] border-b border-white/5 pb-8 text-white flex items-center gap-4 italic leading-none">
            <span className="material-symbols-outlined text-neon text-xl">{icon}</span>
            {title}
        </h3>
        <div className="relative z-10">
            {children}
        </div>
    </div>
);

const LogicRow: React.FC<{ title: string, desc: string, active: boolean, onToggle: () => void }> = ({ title, desc, active, onToggle }) => (
    <div className="flex items-center justify-between p-5 rounded-2xl bg-white/[0.01] border border-white/5 hover:bg-white/[0.02] transition-colors">
        <div>
            <p className="text-[11px] font-black text-white uppercase italic tracking-tight">{title}</p>
            <p className="text-[9px] text-white/30 uppercase mt-1 font-bold tracking-widest">{desc}</p>
        </div>
        <Toggle active={active} onToggle={onToggle} />
    </div>
);

const Toggle: React.FC<{ active: boolean, onToggle: () => void }> = ({ active, onToggle }) => (
    <button
        onClick={onToggle}
        className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-all duration-300 ${active ? 'bg-neon shadow-[0_0_15px_rgba(74,222,128,0.4)]' : 'bg-white/10'}`}
    >
        <span className={`flex items-center justify-center h-6 w-6 transform rounded-full bg-white dark:bg-[#0d0f0d] transition duration-300 ${active ? 'translate-x-5' : 'translate-x-0'} shadow-xl`}>
            <div className={`w-[1px] h-3 transition-colors ${active ? 'bg-neon' : 'bg-white/20'}`}></div>
        </span>
    </button>
);

const RoleModal: React.FC<{
    isOpen: boolean,
    onClose: () => void,
    roleForm: Partial<CustomRole>,
    setRoleForm: (form: any) => void,
    onSave: () => void,
    onTogglePermission: (slug: string, action: string) => void,
    isSaving: boolean
}> = ({ isOpen, onClose, roleForm, setRoleForm, onSave, onTogglePermission, isSaving }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <div className="absolute inset-0 bg-black/95 backdrop-blur-xl" onClick={onClose}></div>
            <div className="relative bg-[#080908] rounded-[4rem] shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col border border-white/10 animate-in zoom-in-95 overflow-hidden">
                <div className="px-12 py-10 border-b border-white/5 flex justify-between items-start shrink-0 bg-white/[0.02]">
                    <div className="space-y-2">
                        <h3 className="text-4xl font-black italic uppercase tracking-tighter text-white">Configuración de <span className="text-neon">Accesos</span></h3>
                        <p className="text-white/30 text-[11px] font-bold uppercase tracking-[0.4em]">Matriz de privilegios por módulo operativo</p>
                    </div>
                    <button onClick={onClose} className="size-14 rounded-full bg-white/5 flex items-center justify-center text-white/30 hover:text-white hover:bg-white/10 transition-all border border-white/5">
                        <span className="material-symbols-outlined text-2xl">close</span>
                    </button>
                </div>

                <div className="flex-1 flex overflow-hidden">
                    <div className="w-96 p-12 border-r border-white/5 bg-black/40 overflow-y-auto shrink-0 space-y-10">
                        <div className="space-y-4">
                            <label className="text-[10px] font-black uppercase text-white/20 tracking-[0.3em] ml-2">Nombre del Rol</label>
                            <input
                                value={roleForm.name || ''}
                                onChange={e => setRoleForm({ ...roleForm, name: e.target.value })}
                                className="w-full h-14 px-6 rounded-2xl bg-white/5 border border-white/10 font-bold text-xs text-white uppercase outline-none focus:border-neon/30 placeholder:text-white/10"
                                placeholder="EJ: SUPERVISOR NOCTURNO"
                            />
                        </div>
                        <div className="space-y-4">
                            <label className="text-[10px] font-black uppercase text-white/20 tracking-[0.3em] ml-2">Descripción Funcional</label>
                            <textarea
                                value={roleForm.description || ''}
                                onChange={e => setRoleForm({ ...roleForm, description: e.target.value })}
                                className="w-full h-40 p-6 rounded-[2rem] bg-white/5 border border-white/10 font-bold text-[11px] text-white/60 outline-none focus:border-neon/30 placeholder:text-white/10 resize-none leading-relaxed"
                                placeholder="Describe el alcance del rol..."
                            />
                        </div>
                        <div className="p-8 rounded-[2.5rem] bg-neon/5 border border-neon/10 space-y-4">
                            <div className="flex gap-4">
                                <span className="material-symbols-outlined text-neon text-2xl">info</span>
                                <p className="text-[10px] font-black text-neon uppercase tracking-widest pt-1 leading-none">Protocolo de Seguridad</p>
                            </div>
                            <p className="text-[10px] font-medium text-white/40 leading-relaxed italic">
                                La matriz de roles es jerárquica. Asegúrate de que los privilegios de "Borrado" estén limitados a personal de confianza.
                            </p>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto bg-black p-12">
                        <div className="rounded-[3rem] border border-white/5 overflow-hidden">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-white/[0.02]">
                                    <tr className="border-b border-white/5">
                                        <th className="px-10 py-6 text-[10px] font-black uppercase text-white/30 tracking-widest italic">Módulo Operativo</th>
                                        <th className="px-4 py-6 text-center text-[10px] font-black uppercase text-white/30 tracking-widest w-28">Ver</th>
                                        <th className="px-4 py-6 text-center text-[10px] font-black uppercase text-white/30 tracking-widest w-28">Crear</th>
                                        <th className="px-4 py-6 text-center text-[10px] font-black uppercase text-white/30 tracking-widest w-28">Editar</th>
                                        <th className="px-4 py-6 text-center text-[10px] font-black uppercase text-white/30 tracking-widest w-28">Borrar</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {SECTIONS.map(s => {
                                        const perms = (roleForm.permissions?.[s.slug] as any) || { view: false, create: false, edit: false, delete: false };
                                        return (
                                            <tr key={s.slug} className="hover:bg-white/[0.01] transition-colors group">
                                                <td className="px-10 py-5">
                                                    <p className="text-xs font-black text-white uppercase italic tracking-tighter">{s.label}</p>
                                                </td>
                                                {['view', 'create', 'edit', 'delete'].map(action => (
                                                    <td key={action} className="px-4 py-5 text-center">
                                                        <button
                                                            onClick={() => onTogglePermission(s.slug, action)}
                                                            className={`size-11 rounded-2xl border transition-all flex items-center justify-center mx-auto ${perms[action]
                                                                ? action === 'delete' ? 'bg-red-500 text-white border-red-600 shadow-[0_0_15px_rgba(239,68,68,0.3)]' : 'bg-neon text-black border-neon shadow-[0_0_15px_rgba(74,222,128,0.3)]'
                                                                : 'bg-white/5 border-white/5 text-white/10 hover:border-white/20'
                                                                }`}
                                                        >
                                                            <span className="material-symbols-outlined text-xl font-black">
                                                                {perms[action] ? 'check' : 'remove'}
                                                            </span>
                                                        </button>
                                                    </td>
                                                ))}
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div className="p-10 border-t border-white/5 bg-white/[0.01] flex justify-end gap-6 shrink-0">
                    <button onClick={onClose} className="px-10 py-5 rounded-[1.5rem] border border-white/10 font-black text-[11px] uppercase text-white/30 hover:text-white hover:bg-white/5 transition-all">Cancelar</button>
                    <button onClick={onSave} disabled={isSaving} className="px-14 py-5 bg-neon text-black rounded-[1.5rem] font-black text-[11px] uppercase tracking-[0.2em] shadow-neon-soft hover:scale-105 active:scale-95 transition-all disabled:opacity-50">
                        {isSaving ? 'Sincronizando...' : 'Sincronizar Jerarquía'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const InviteModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    inviteForm: { email: string; fullName: string; roleId: string };
    setInviteForm: (form: any) => void;
    roles: CustomRole[];
    onInvite: () => void;
    isSaving: boolean;
}> = ({ isOpen, onClose, inviteForm, setInviteForm, roles, onInvite, isSaving }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={onClose}></div>
            <div className="relative bg-[#0D0F0D] rounded-[2.5rem] border border-white/10 p-10 w-full max-w-lg space-y-8 animate-in zoom-in-95">
                <div className="space-y-2">
                    <h3 className="text-3xl font-black italic uppercase tracking-tighter text-white">Invitar al <span className="text-neon">Equipo</span></h3>
                    <p className="text-white/30 text-[10px] font-bold uppercase tracking-[0.2em]">Envía un link de acceso seguro al nuevo operador</p>
                </div>

                <div className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-white/20 tracking-widest ml-2">Email del Operador</label>
                        <input
                            value={inviteForm.email}
                            onChange={e => setInviteForm({ ...inviteForm, email: e.target.value })}
                            className="w-full h-14 px-6 rounded-2xl bg-white/5 border border-white/10 font-bold text-xs text-white outline-none focus:border-neon/40"
                            placeholder="ejemplo@squad.com"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-white/20 tracking-widest ml-2">Nombre Completo</label>
                        <input
                            value={inviteForm.fullName}
                            onChange={e => setInviteForm({ ...inviteForm, fullName: e.target.value })}
                            className="w-full h-14 px-6 rounded-2xl bg-white/5 border border-white/10 font-bold text-xs text-white outline-none focus:border-neon/40"
                            placeholder="Nombre y Apellido"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-white/20 tracking-widest ml-2">Rol Operativo</label>
                        <select
                            value={inviteForm.roleId}
                            onChange={e => setInviteForm({ ...inviteForm, roleId: e.target.value })}
                            className="w-full h-14 px-6 rounded-2xl bg-white/5 border border-white/10 font-bold text-xs text-white outline-none focus:border-neon/40 appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2020%2020%22%3E%3Cpath%20stroke%3D%22%23ffffff44%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-width%3D%221.5%22%20d%3D%22m6%208%204%204%204-4%22%2F%3E%3C%2Fsvg%3E')] bg-[length:1.25rem_1.25rem] bg-[right_1.5rem_center] bg-no-repeat"
                        >
                            <option value="" className="bg-[#0D0F0D]">Seleccionar Rango...</option>
                            {roles.map(r => (
                                <option key={r.id} value={r.id} className="bg-[#0D0F0D]">{r.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="pt-4 flex gap-4">
                    <button onClick={onClose} className="flex-1 py-4 text-[11px] font-black uppercase tracking-widest text-white/30 hover:text-white transition-all">Cancelar</button>
                    <button
                        onClick={onInvite}
                        disabled={isSaving}
                        className="flex-[2] py-4 rounded-xl bg-neon text-black font-black text-[12px] uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-neon-soft disabled:opacity-50"
                    >
                        {isSaving ? 'Enviando Protocolo...' : 'Enviar Invitación'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default StoreSettings;
