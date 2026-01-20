
import React, { useState, useMemo, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/ToastSystem';
import { sendEmailNotification } from '../lib/notifications';
import { MOCK_STAFF, MOCK_ROLES, MOCK_AUDIT_LOG, DEFAULT_AI_CONFIG } from '../constants';
import { StaffMember, CustomRole, SectionSlug, AuditLogEntry, AuditCategory, AIConfig } from '../types';

type SettingsTab = 'general' | 'staff' | 'audit' | 'pagos' | 'ai';

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
  { slug: 'all', label: 'Todos', icon: 'apps' },
  { slug: 'stock', label: 'Stock', icon: 'package_2' },
  { slug: 'orders', label: 'Pedidos', icon: 'list_alt' },
  { slug: 'finance', label: 'Finanzas', icon: 'payments' },
  { slug: 'staff', label: 'Staff', icon: 'badge' },
  { slug: 'system', label: 'Sistema', icon: 'settings' },
];

// --- HELPER COMPONENTS (Moved to top for hoisting) ---
const TabButton: React.FC<{ active: boolean, onClick: () => void, label: string, icon: string, saas?: boolean }> = ({ active, onClick, label, icon, saas }) => (
  <button
    onClick={onClick}
    className={`px-5 py-2 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all flex items-center gap-2.5 shrink-0 ${active
      ? saas ? 'bg-accent/20 text-accent border border-accent/20 shadow-soft' : 'bg-primary dark:bg-neon/10 text-white dark:text-neon border border-primary dark:border-neon/20 shadow-soft'
      : 'text-text-secondary hover:text-primary dark:hover:text-neon'
      }`}
  >
    <span className="material-symbols-outlined text-[18px]">{icon}</span>
    {label}
  </button>
);

const Section: React.FC<{ title: string, icon: string, children: React.ReactNode }> = ({ title, icon, children }) => (
  <div className="bg-white dark:bg-surface-dark p-5 md:p-6 rounded-2xl border border-black/[0.04] dark:border-white/[0.04] shadow-soft space-y-6">
    <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] border-b border-black/[0.03] dark:border-white/[0.03] pb-4 dark:text-white flex items-center gap-2 italic leading-none">
      <span className="material-symbols-outlined text-neon/80 text-[16px]">{icon}</span>
      {title}
    </h3>
    {children}
  </div>
);

const Input: React.FC<{ label: string, placeholder: string }> = ({ label, placeholder }) => (
  <div className="space-y-2 flex flex-col">
    <label className="text-[9px] font-black text-text-secondary ml-1 uppercase tracking-[0.2em] opacity-60">{label}</label>
    <input className="px-6 py-3.5 rounded-xl border border-black/[0.05] dark:border-white/[0.05] bg-black/[0.01] dark:bg-white/[0.01] text-[11px] font-bold dark:text-white focus:ring-2 focus:ring-neon/10 outline-none transition-all placeholder:text-text-secondary/30 tracking-tight uppercase" placeholder={placeholder} />
  </div>
);

const LogicRow: React.FC<{ title: string, desc: string, active: boolean, onToggle: () => void }> = ({ title, desc, active, onToggle }) => (
  <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/5">
    <div>
      <p className="text-[10px] font-black text-white uppercase italic tracking-tight">{title}</p>
      <p className="text-[8px] text-text-secondary uppercase mt-1 tracking-widest opacity-60">{desc}</p>
    </div>
    <Toggle active={active} onToggle={onToggle} />
  </div>
);

const Toggle: React.FC<{ active: boolean, onToggle: () => void }> = ({ active, onToggle }) => (
  <button
    onClick={onToggle}
    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-all duration-300 ${active ? 'bg-neon shadow-neon-soft' : 'bg-black/10 dark:bg-white/10'}`}
  >
    <span className={`flex items-center justify-center h-5 w-5 transform rounded-full bg-white dark:bg-[#0d0f0d] transition duration-300 ${active ? 'translate-x-5' : 'translate-x-0'} shadow-sm`}>
      <div className={`w-[1px] h-2.5 transition-colors ${active ? 'bg-neon' : 'bg-text-secondary/30'}`}></div>
    </span>
  </button>
);

const Settings: React.FC = () => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [members, setMembers] = useState<StaffMember[]>(MOCK_STAFF);
  const [roles, setRoles] = useState<CustomRole[]>([]);
  const [logs] = useState<AuditLogEntry[]>(MOCK_AUDIT_LOG);
  const [aiConfig, setAiConfig] = useState<AIConfig>(DEFAULT_AI_CONFIG);

  // Staff Sub-tabs
  const [staffSubTab, setStaffSubTab] = useState<'members' | 'roles'>('roles');

  // Audit States
  const [auditFilter, setAuditFilter] = useState<AuditCategory | 'all'>('all');
  const [auditSearch, setAuditSearch] = useState('');

  // Modals & Forms
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [roleForm, setRoleForm] = useState<Partial<CustomRole>>({
    name: '',
    description: '',
    permissions: SECTIONS.reduce((acc, s) => ({ ...acc, [s.slug]: { view: false, create: false, edit: false, delete: false } }), {})
  });

  const [mpConnected, setMpConnected] = useState(false);

  // INVITATION SYSTEM STATE
  const { profile } = useAuth();
  const { addToast } = useToast();
  const [invitations, setInvitations] = useState<any[]>([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', role: 'barista' });
  const [isInviting, setIsInviting] = useState(false);

  // STORE SETTINGS STATE
  const [storeForm, setStoreForm] = useState({
    name: '',
    slug: '',
    logo_url: '',
    address: '',
    contact_email: '',
    tax_info: ''
  });
  const [isUploading, setIsUploading] = useState(false);
  const [isSavingStore, setIsSavingStore] = useState(false);

  // Load Store Data
  useEffect(() => {
    if (activeTab === 'general' && profile?.store_id) {
      fetchStoreData();
    }
  }, [activeTab, profile?.store_id]);

  const fetchStoreData = async () => {
    if (!profile?.store_id) return;
    const { data } = await supabase.from('stores').select('*').eq('id', profile.store_id).single();
    if (data) {
      setStoreForm({
        name: data.name || '',
        slug: data.slug || '',
        logo_url: data.logo_url || '',
        address: data.address || '',
        contact_email: (data as any).owner_email || profile.email || '',
        tax_info: data.tax_info || ''
      });
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;

    const file = e.target.files[0];
    const fileExt = file.name.split('.').pop();
    const fileName = `${profile?.store_id}-${Date.now()}.${fileExt}`;
    const filePath = `${fileName}`;

    setIsUploading(true);

    try {
      const { error: uploadError } = await supabase.storage
        .from('logos')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('logos')
        .getPublicUrl(filePath);

      setStoreForm(prev => ({ ...prev, logo_url: publicUrl }));
      addToast('Logo subido exitosamente', 'success');
    } catch (error: any) {
      console.error('Upload error:', error);
      addToast('Error al subir logo: ' + error.message, 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveStore = async () => {
    if (!profile?.store_id) return;
    setIsSavingStore(true);
    try {
      const { error } = await supabase
        .from('stores' as any)
        .update({
          name: storeForm.name,
          logo_url: storeForm.logo_url,
          address: storeForm.address,
          tax_info: storeForm.tax_info,
          owner_email: storeForm.contact_email
        })
        .eq('id', profile.store_id);

      if (error) throw error;

      addToast('Configuración de negocio actualizada', 'success');
      // Dispatch event for App.tsx to pickup
      window.dispatchEvent(new Event('store_updated'));

    } catch (error: any) {
      console.error('Save store error:', error);
      addToast('Error al guardar: ' + error.message, 'error');
    } finally {
      setIsSavingStore(false);
    }
  };

  // Load Invitations on Tab Change
  useEffect(() => {
    if (activeTab === 'staff' && profile?.store_id) {
      loadInvitations();
    }
  }, [activeTab, profile?.store_id]);

  const loadInvitations = async () => {
    const { data } = await supabase
      .from('team_invitations' as any)
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    setInvitations(data || []);
  };

  // Load Members
  useEffect(() => {
    if (activeTab === 'staff' && profile?.store_id) {
      fetchMembers();
    }
  }, [activeTab, profile?.store_id]);

  const fetchMembers = async () => {
    if (!profile?.store_id) return;

    try {
      // 1. Get Profiles associated with this store
      // We perform a loose query for now as we transition from mock data
      const { data: profilesData, error } = await supabase
        .from('profiles' as any)
        .select('*')
        .eq('store_id', profile.store_id);

      if (error) throw error;

      // 2. Map to StaffMember (using correct DB columns: full_name, role, is_active)
      let mappedMembers: StaffMember[] = (profilesData || []).map((p: any) => ({
        id: p.id,
        name: p.full_name || p.email || 'Sin Nombre',
        email: p.email,
        roleId: p.role || '', // DB uses 'role' not 'role_id'
        status: p.is_active === false ? 'suspended' : 'active',
        avatar: '',
        joinDate: p.created_at ? new Date(p.created_at).toLocaleDateString() : 'N/A',
        lastActivity: 'Reciente'
      }));

      // 3. OWNER OVERRIDE (Fixes "SIN ROL/SUSPENDIDO")
      const ownerEmail = storeForm.contact_email || profile.email;
      const ownerIndex = mappedMembers.findIndex(m => m.email === ownerEmail);

      if (ownerIndex >= 0) {
        // Force Owner Status
        mappedMembers[ownerIndex] = {
          ...mappedMembers[ownerIndex],
          roleId: 'OWNER_GOD_MODE', // Special ID
          status: 'active'
        };
      } else if (ownerEmail) {
        // Inject Owner if missing
        mappedMembers.unshift({
          id: profile.id || 'owner_virtual',
          name: 'Administrador (Dueño)',
          email: ownerEmail,
          roleId: 'OWNER_GOD_MODE',
          status: 'active',
          avatar: '',
          joinDate: new Date().toLocaleDateString()
        });
      }

      setMembers(mappedMembers);
    } catch (err) {
      console.error("Error fetching members:", err);
      // Fallback to avoid empty table if fetch fails
      setMembers(MOCK_STAFF);
    }
  };

  const handleSendInvite = async () => {
    if (!inviteForm.email) return;
    setIsInviting(true);
    try {
      // 1. Create Invite in DB via Edge Function
      const { data, error } = await supabase.functions.invoke('invite-user', {
        body: { email: inviteForm.email, role: inviteForm.role }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      // 2. Send Email via Resend (New System)
      const emailRes = await sendEmailNotification({
        to: inviteForm.email,
        subject: 'Te han invitado a unirte al Equipo - CoffeeSquad',
        html: `
          <div style="font-family: sans-serif; background: #111; color: white; padding: 20px; border-radius: 10px;">
            <h2 style="color: #00ff9d; margin-top: 0;">CoffeeSquad</h2>
            <p>Has sido invitado para unirte al equipo.</p>
            <p><strong>Rol:</strong> ${inviteForm.role}</p>
            <br/>
            <a href="${data.link}" style="background:#00ff9d; color:black; padding:12px 24px; text-decoration:none; border-radius:6px; font-weight:bold; display: inline-block;">ACEPTAR INVITACIÓN</a>
            <br/><br/>
            <p style="font-size: 12px; color: #666;">Si no esperabas esto, ignora este correo.</p>
          </div>
        `
      });

      if (!emailRes.success) {
        addToast('Invitación creada, pero falló el envío del email.', 'warning');
        console.error('Email sending failed:', emailRes.error);
      } else {
        addToast('Invitación enviada por correo exitosamente', 'success');
      }

      console.log('Invite Link:', data.link);

      setShowInviteModal(false);
      setInviteForm({ email: '', role: 'barista' });
      loadInvitations();
    } catch (e: any) {
      console.error('Invite Error:', e);
      addToast(e.message || 'Error al enviar invitación', 'error');
    } finally {
      setIsInviting(false);
    }
  };

  const cancelInvitation = async (id: string) => {
    const { error } = await supabase.from('team_invitations' as any).delete().eq('id', id);
    if (!error) {
      addToast('Invitación revocada', 'success');
      loadInvitations();
    }
  };

  // Filtered Logs logic
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

  const toggleStatus = (id: string) => {
    setMembers(prev => prev.map(m => m.id === id ? { ...m, status: m.status === 'active' ? 'suspended' : 'active' } : m));
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

  const togglePermission = (slug: string, action: string) => {
    const currentPerms = roleForm.permissions || {};
    const sectionPerms = currentPerms[slug] || { view: false, create: false, edit: false, delete: false };

    setRoleForm({
      ...roleForm,
      permissions: {
        ...currentPerms,
        [slug]: { ...sectionPerms, [action]: !(sectionPerms as any)[action] }
      }
    });
  };

  // Fetch Roles
  useEffect(() => {
    if (activeTab === 'staff' && profile?.store_id) {
      fetchRoles();
    }
  }, [activeTab, profile?.store_id, staffSubTab]);

  const fetchRoles = async () => {
    if (!profile?.store_id) return;
    const { data: rolesData, error } = await supabase
      .from('cafe_roles' as any)
      .select('*')
      .eq('store_id', profile.store_id)
      .order('is_system', { ascending: false });

    if (error) {
      console.error('Error fetching roles:', error);
      return;
    }

    if (rolesData) {
      // Fetch permissions for each role
      const rolesWithPerms = await Promise.all(rolesData.map(async (role: any) => {
        const { data: perms } = await supabase
          .from('cafe_role_permissions' as any)
          .select('*')
          .eq('role_id', role.id);

        const permissionsMap: any = {};
        // Initialize defaults
        SECTIONS.forEach(s => {
          permissionsMap[s.slug] = { view: false, create: false, edit: false, delete: false };
        });

        if (perms) {
          perms.forEach((p: any) => {
            permissionsMap[p.section_slug] = {
              view: p.can_view,
              create: p.can_create,
              edit: p.can_edit,
              delete: p.can_delete
            };
          });
        }

        return {
          id: role.id,
          name: role.name,
          description: role.description,
          is_system: role.is_system,
          permissions: permissionsMap
        };
      }));
      setRoles(rolesWithPerms);
    }
  };

  const saveRole = async () => {
    // Validation handled by caller
    if (!profile?.store_id) throw new Error("No store ID");

    try {
      let roleId = selectedRoleId;

      // 1. Create or Update Role
      if (roleId) {
        const { error } = await supabase
          .from('cafe_roles' as any)
          .update({ name: roleForm.name, description: roleForm.description })
          .eq('id', roleId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('cafe_roles' as any)
          .insert({
            store_id: profile.store_id,
            name: roleForm.name,
            description: roleForm.description,
            is_system: false
          })
          .select()
          .single();
        if (error) throw error;
        // @ts-ignore
        roleId = data.id;
      }

      // 2. Update Permissions (Delete all and re-insert is easiest strategy for full matrix)
      // First, delete existing
      await supabase.from('cafe_role_permissions' as any).delete().eq('role_id', roleId);

      // Prepare inserts
      const permsToInsert = Object.entries(roleForm.permissions || {}).map(([slug, p]: [string, any]) => ({
        role_id: roleId,
        section_slug: slug,
        can_view: p.view,
        can_create: p.create,
        can_edit: p.edit,
        can_delete: p.delete
      }));

      if (permsToInsert.length > 0) {
        const { error: permError } = await supabase.from('cafe_role_permissions' as any).insert(permsToInsert);
        if (permError) throw permError;
      }

      addToast('Rol guardado exitosamente', 'success');
      setShowRoleModal(false);
      setSelectedRoleId(null);
      fetchRoles();

    } catch (error: any) {
      console.error('Error saving role:', error);
      addToast('Error al guardar rol: ' + error.message, 'error');
      throw error;
    }
  };

  const handleDeleteRole = async (roleId: string, isSystem: boolean) => {
    if (isSystem) {
      addToast('No se pueden eliminar roles de sistema', 'error');
      return;
    }
    if (!confirm('¿Estás seguro de eliminar este rol? Esta acción no se puede deshacer.')) return;

    try {
      const { error } = await supabase.from('cafe_roles' as any).delete().eq('id', roleId);
      if (error) throw error;
      addToast('Rol eliminado', 'success');
      fetchRoles();
    } catch (error: any) {
      console.error('Error deleting role:', error);
      addToast(error.message, 'error');
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto animate-in fade-in duration-700 pb-20">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-neon/60 font-bold text-[9px] uppercase tracking-[0.3em]">
            <span className="size-1 rounded-full bg-neon shadow-neon-soft"></span>
            Global Config Hub
          </div>
          <h1 className="text-2xl md:text-3xl italic-black tracking-tighter text-text-main dark:text-white uppercase leading-none">
            Panel de <span className="text-neon/80">Configuración</span>
          </h1>
          <p className="text-text-secondary text-[9px] font-bold uppercase tracking-widest mt-1 opacity-50">Mando centralizado de negocio, equipo y seguridad</p>
        </div>
      </header>

      {/* Tabs Tácticos Principal */}
      <div className="flex bg-white dark:bg-surface-dark p-1 rounded-xl border border-black/[0.04] dark:border-white/[0.04] shadow-soft max-w-fit overflow-x-auto no-scrollbar">
        <TabButton active={activeTab === 'general'} onClick={() => setActiveTab('general')} label="Negocio" icon="storefront" />
        <TabButton active={activeTab === 'staff'} onClick={() => setActiveTab('staff')} label="Staff & Roles" icon="badge" />
        <TabButton active={activeTab === 'audit'} onClick={() => setActiveTab('audit')} label="Auditoría" icon="history_edu" />
        <TabButton active={activeTab === 'ai'} onClick={() => setActiveTab('ai')} label="SquadAI" icon="auto_awesome" />
        <TabButton active={activeTab === 'pagos'} onClick={() => setActiveTab('pagos')} label="Pasarela" icon="payments" />
      </div>

      <div className="min-h-[600px]">
        {activeTab === 'general' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 animate-in slide-in-from-left-4 duration-500">
            <div className="lg:col-span-2 space-y-8">
              <Section title="Información Operativa" icon="info">
                <div className="space-y-6">
                  {/* LOGO UPLOAD */}
                  <div className="flex items-center gap-6 p-4 bg-white/[0.02] border border-white/5 rounded-xl">
                    <div className="size-20 rounded-2xl bg-black border border-white/10 flex items-center justify-center overflow-hidden relative group">
                      {storeForm.logo_url ? (
                        <img src={storeForm.logo_url} alt="Logo" className="w-full h-full object-cover" />
                      ) : (
                        <span className="material-symbols-outlined text-white/20 text-3xl">add_photo_alternate</span>
                      )}
                      <label className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                        <span className="material-symbols-outlined text-white text-xl">upload</span>
                        <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} disabled={isUploading} />
                      </label>
                      {isUploading && <div className="absolute inset-0 bg-black/80 flex items-center justify-center"><span className="size-4 border-2 border-neon border-t-transparent rounded-full animate-spin"></span></div>}
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-[10px] font-black uppercase text-white tracking-widest">Identidad del Nodo</h4>
                      <p className="text-[9px] text-text-secondary w-40">Sube tu logo (PNG/JPG). Se actualizará en todo el sistema.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2 flex flex-col">
                      <label className="text-[9px] font-black text-text-secondary ml-1 uppercase tracking-[0.2em] opacity-60">Nombre Comercial</label>
                      <input
                        value={storeForm.name}
                        onChange={e => setStoreForm({ ...storeForm, name: e.target.value })}
                        className="px-6 py-3.5 rounded-xl border border-black/[0.05] dark:border-white/[0.05] bg-black/[0.01] dark:bg-white/[0.01] text-[11px] font-bold dark:text-white focus:ring-2 focus:ring-neon/10 outline-none transition-all placeholder:text-text-secondary/30 tracking-tight uppercase"
                        placeholder="NOMBRE DE TU LOCAL"
                      />
                    </div>
                    <div className="space-y-2 flex flex-col">
                      <label className="text-[9px] font-black text-text-secondary ml-1 uppercase tracking-[0.2em] opacity-60">Identificador Slug (Fijo)</label>
                      <input
                        value={storeForm.slug}
                        disabled
                        className="px-6 py-3.5 rounded-xl border border-black/[0.05] dark:border-white/[0.05] bg-black/20 text-[11px] font-bold text-white/30 uppercase cursor-not-allowed"
                      />
                    </div>
                    <div className="space-y-2 flex flex-col">
                      <label className="text-[9px] font-black text-text-secondary ml-1 uppercase tracking-[0.2em] opacity-60">Dirección Operativa</label>
                      <input
                        value={storeForm.address}
                        onChange={e => setStoreForm({ ...storeForm, address: e.target.value })}
                        className="px-6 py-3.5 rounded-xl border border-black/[0.05] dark:border-white/[0.05] bg-black/[0.01] dark:bg-white/[0.01] text-[11px] font-bold dark:text-white focus:ring-2 focus:ring-neon/10 outline-none transition-all placeholder:text-text-secondary/30 tracking-tight uppercase"
                        placeholder="CALLE, NÚMERO, CIUDAD"
                      />
                    </div>
                    <div className="space-y-2 flex flex-col">
                      <label className="text-[9px] font-black text-text-secondary ml-1 uppercase tracking-[0.2em] opacity-60">Info Fiscal (CUIT/NIT)</label>
                      <input
                        value={storeForm.tax_info}
                        onChange={e => setStoreForm({ ...storeForm, tax_info: e.target.value })}
                        className="px-6 py-3.5 rounded-xl border border-black/[0.05] dark:border-white/[0.05] bg-black/[0.01] dark:bg-white/[0.01] text-[11px] font-bold dark:text-white focus:ring-2 focus:ring-neon/10 outline-none transition-all placeholder:text-text-secondary/30 tracking-tight uppercase"
                        placeholder="IDENTIFICACIÓN TRIBUTARIA"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-4">
                    <button
                      onClick={handleSaveStore}
                      disabled={isSavingStore}
                      className="px-8 py-3 bg-neon text-black rounded-xl font-black text-[10px] uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-neon-soft disabled:opacity-50"
                    >
                      {isSavingStore ? 'Guardando...' : 'Guardar Cambios'}
                    </button>
                  </div>
                </div>
              </Section>
            </div>
            <Section title="Estado del Sistema" icon="monitor_heart">
              <div className="p-6 bg-neon/5 border border-neon/10 rounded-2xl flex items-center justify-between mb-4">
                <span className="text-[10px] font-black uppercase text-neon tracking-widest">Servidores Operativos</span>
                <span className="size-2 rounded-full bg-neon animate-pulse shadow-neon-soft"></span>
              </div>
              <p className="text-[9px] text-text-secondary uppercase font-bold tracking-widest mb-2 opacity-50">Ultima Sincronización</p>
              <p className="text-[11px] font-bold dark:text-white">Hace 2 minutos (Nodo Alpha)</p>
            </Section>
          </div>
        )}

        {activeTab === 'audit' && (
          <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col xl:flex-row justify-between gap-6 items-center">
              <div className="flex bg-white dark:bg-surface-dark p-1 rounded-xl border border-black/[0.04] dark:border-white/[0.04] shadow-soft overflow-x-auto no-scrollbar">
                {AUDIT_CATEGORIES.map(cat => (
                  <button
                    key={cat.slug}
                    onClick={() => setAuditFilter(cat.slug)}
                    className={`px-6 py-2.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-2.5 whitespace-nowrap ${auditFilter === cat.slug ? 'bg-primary dark:bg-white/10 text-white shadow-soft' : 'text-text-secondary hover:text-primary dark:hover:text-neon'}`}
                  >
                    <span className="material-symbols-outlined text-lg">{cat.icon}</span>
                    {cat.label}
                  </button>
                ))}
              </div>
              <div className="relative flex-1 xl:w-64 group">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary opacity-40 text-sm">search</span>
                <input value={auditSearch} onChange={(e) => setAuditSearch(e.target.value)} placeholder="BUSCAR EVENTO..." className="h-10 w-full pl-9 pr-3 rounded-xl border border-white/5 bg-white/5 outline-none focus:ring-1 focus:ring-neon/20 text-[9px] font-bold uppercase tracking-widest text-white placeholder:text-white/20 transition-all" />
              </div>
            </div>
            <div className="bg-white dark:bg-surface-dark rounded-[2rem] border border-black/[0.04] dark:border-white/[0.04] shadow-soft overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-black/[0.01] dark:bg-white/[0.01] border-b border-black/[0.02] dark:border-white/[0.02]">
                    <th className="px-4 py-3 text-[8px] font-bold uppercase text-text-secondary tracking-widest">Tiempo</th>
                    <th className="px-4 py-3 text-[8px] font-bold uppercase text-text-secondary tracking-widest">Operador</th>
                    <th className="px-4 py-3 text-[8px] font-bold uppercase text-text-secondary tracking-widest">Acción / Entidad</th>
                    <th className="px-4 py-3 text-[8px] font-bold uppercase text-text-secondary tracking-widest">Detalle</th>
                    <th className="px-4 py-3 text-[8px] font-bold uppercase text-text-secondary tracking-widest text-right">Impacto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.02] dark:divide-white/[0.02]">
                  {filteredLogs.map(log => (
                    <tr key={log.id} className="hover:bg-black/[0.01] dark:hover:bg-white/[0.01] transition-all group">
                      <td className="px-4 py-3">
                        <p className="text-[10px] font-bold dark:text-white uppercase mb-1">{log.timestamp.split(' ')[1]}</p>
                        <p className="text-[8px] text-text-secondary font-semibold uppercase opacity-40">{log.timestamp.split(' ')[0]}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-[10px] font-bold dark:text-white uppercase italic-black">{log.userName}</p>
                        <p className="text-[8px] text-text-secondary font-black uppercase opacity-40">{log.userRole}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-[10px] font-black uppercase dark:text-white tracking-tight leading-none mb-1">{log.action}</p>
                        <p className="text-[8px] text-neon font-bold uppercase italic tracking-tighter">{log.entity}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-[9px] font-medium text-text-secondary leading-relaxed uppercase tracking-tight max-w-xs opacity-70 group-hover:opacity-100 transition-opacity">{log.detail}</p>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className={`size-2 ml-auto rounded-full ${log.impact === 'critical' ? 'bg-orange-500 animate-pulse shadow-[0_0_8px_rgba(249,115,22,0.4)]' : log.impact === 'positive' ? 'bg-neon shadow-neon-soft' : 'bg-text-secondary/20'}`}></div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* --- STAFF & ROLES: DISEÑO AVANZADO --- */}
        {activeTab === 'staff' && (
          <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">

            {/* Sub-Header para Staff */}
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl italic-black uppercase tracking-tighter dark:text-white">Equipo y <span className="text-neon">Permisos</span></h3>
              <div className="flex bg-white dark:bg-surface-dark p-1 rounded-xl border border-black/[0.04] dark:border-white/[0.04] shadow-soft">
                <button onClick={() => setStaffSubTab('members')} className={`px-5 py-2 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all ${staffSubTab === 'members' ? 'bg-white dark:bg-white/10 text-neon' : 'text-text-secondary hover:text-white'}`}>Directorio Staff</button>
                <button onClick={() => setStaffSubTab('roles')} className={`px-5 py-2 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all ${staffSubTab === 'roles' ? 'bg-white dark:bg-white/10 text-neon' : 'text-text-secondary hover:text-white'}`}>Definición Roles</button>
              </div>
              {staffSubTab === 'members' && (
                <button onClick={() => setShowInviteModal(true)} className="ml-4 px-5 py-2 rounded-lg bg-neon text-black text-[9px] font-black uppercase tracking-widest hover:bg-white transition-all shadow-neon-soft">
                  + Invitar Miembro
                </button>
              )}
            </div>

            <div className="min-h-[500px] space-y-8">
              {staffSubTab === 'members' && (
                <>
                  {/* PENDING INVITATIONS */}
                  {invitations.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-[10px] font-black uppercase text-neon tracking-widest ml-1">Invitaciones Pendientes</h4>
                      <div className="bg-white/5 rounded-2xl border border-dashed border-white/10 overflow-hidden">
                        {invitations.map(inv => (
                          <div key={inv.id} className="flex items-center justify-between p-4 border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors">
                            <div className="flex items-center gap-3">
                              <div className="size-8 rounded-full bg-white/10 flex items-center justify-center text-white/40">
                                <span className="material-symbols-outlined text-sm">mail</span>
                              </div>
                              <div>
                                <p className="text-[11px] font-bold text-white uppercase italic-black">{inv.email}</p>
                                <p className="text-[9px] text-text-secondary font-bold uppercase tracking-wide">Rol Sugerido: <span className="text-neon">{inv.role}</span></p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-[8px] font-bold bg-yellow-500/10 text-yellow-500 px-2 py-1 rounded uppercase tracking-widest">Pendiente</span>
                              <button onClick={() => cancelInvitation(inv.id)} className="size-8 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white flex items-center justify-center transition-all">
                                <span className="material-symbols-outlined text-sm">close</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="bg-white dark:bg-surface-dark rounded-2xl border border-white/5 overflow-hidden shadow-soft animate-in slide-in-from-left-4">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-black/[0.01] dark:bg-white/[0.01] border-b border-black/[0.02] dark:border-white/[0.02]">
                          <th className="px-4 py-3 text-[8px] font-bold uppercase text-text-secondary tracking-widest">Operador</th>
                          <th className="px-4 py-3 text-[8px] font-bold uppercase text-text-secondary tracking-widest">Rango</th>
                          <th className="px-4 py-3 text-[8px] font-bold uppercase text-text-secondary tracking-widest text-center">Estatus</th>
                          <th className="px-4 py-3 text-[8px] font-bold uppercase text-text-secondary tracking-widest text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/[0.02] dark:divide-white/[0.02]">
                        {members.map(m => (
                          <tr key={m.id} className="hover:bg-black/[0.01] dark:hover:bg-white/[0.01] transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className="size-8 rounded-lg bg-neon/10 text-neon flex items-center justify-center font-black italic uppercase text-xs">{m.name.charAt(0)}</div>
                                <div>
                                  <p className="text-[11px] font-bold dark:text-white uppercase italic-black">{m.name}</p>
                                  <p className="text-[9px] text-text-secondary font-semibold opacity-40 uppercase">{m.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-[9px] font-bold px-2 py-1 rounded uppercase tracking-widest italic ${m.roleId === 'OWNER_GOD_MODE' ? 'bg-neon/10 text-neon border border-neon/20' : 'bg-white/5 dark:text-white/60'}`}>
                                {m.roleId === 'OWNER_GOD_MODE' ? 'DUEÑO (ADMIN)' : (roles.find(r => r.id === m.roleId)?.name || 'SIN ROL')}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`px-2 py-0.5 rounded-md text-[8px] font-bold uppercase border ${m.status === 'active' ? 'bg-neon/5 text-neon border-neon/10' : 'bg-primary/5 text-primary border-primary/10'}`}>{m.status === 'active' ? 'READY' : 'SUSPENDED'}</span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button onClick={() => toggleStatus(m.id)} className="text-text-secondary hover:text-primary transition-colors"><span className="material-symbols-outlined text-base">{m.status === 'active' ? 'block' : 'check_circle'}</span></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {staffSubTab === 'roles' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-in slide-in-from-right-4">
                  <button onClick={handleNewRole} className="min-h-[160px] rounded-2xl border border-dashed border-white/10 flex flex-col items-center justify-center gap-3 group hover:border-neon/40 hover:bg-neon/[0.02] transition-all">
                    <div className="size-12 rounded-full bg-white/5 flex items-center justify-center text-white/20 group-hover:text-neon group-hover:scale-110 transition-all">
                      <span className="material-symbols-outlined text-2xl">add</span>
                    </div>
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40 group-hover:text-neon transition-colors">Crear Nueva Jerarquía</p>
                  </button>

                  {roles.map(role => (
                    <div key={role.id} className="bg-white dark:bg-surface-dark p-5 rounded-2xl border border-white/5 flex flex-col justify-between group hover:border-white/10 transition-all shadow-soft">
                      <div>
                        <div className="flex justify-between items-start mb-4">
                          <div className="size-10 rounded-xl bg-white/5 flex items-center justify-center text-white/30 group-hover:text-white transition-colors">
                            <span className="material-symbols-outlined text-xl">security</span>
                          </div>
                          {role.is_system && <span className="text-[7px] bg-white/5 text-white/40 px-2 py-1 rounded-lg font-black uppercase tracking-widest border border-white/5">System Locked</span>}
                        </div>
                        <h3 className="text-lg font-black italic-black uppercase tracking-tight dark:text-white mb-1.5">{role.name}</h3>
                        <p className="text-[9px] text-text-secondary font-medium leading-relaxed opacity-60 line-clamp-3">{role.description}</p>
                      </div>

                      <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between">
                        <span className="text-[8px] font-bold text-white/20 uppercase tracking-widest">Permisos Configurados</span>
                        <div className="flex items-center gap-2">
                          {!role.is_system && (
                            <button onClick={() => handleDeleteRole(role.id, role.is_system)} className="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-500 font-black text-[12px] hover:bg-red-500 hover:text-white transition-all">
                              <span className="material-symbols-outlined text-sm">delete</span>
                            </button>
                          )}
                          <button onClick={() => handleEditRole(role)} className="px-4 py-1.5 rounded-lg bg-white/5 text-white font-black text-[8px] uppercase tracking-widest hover:bg-neon hover:text-black transition-all">
                            Editar Matriz
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* RESTAURADO: CONTENIDO SQUADAI */}
        {activeTab === 'ai' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in slide-in-from-right-4">
            <div className="lg:col-span-8 space-y-8">
              <Section title="Configuración de Inteligencia" icon="auto_awesome">
                <div className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="p-6 rounded-[2rem] bg-black/[0.02] dark:bg-white/[0.02] border border-white/5 space-y-4">
                      <h4 className="text-[10px] font-black uppercase text-neon tracking-widest italic leading-none">Modo Operativo</h4>
                      <div className="flex bg-black/40 p-1 rounded-xl">
                        <button onClick={() => setAiConfig({ ...aiConfig, activeMode: 'assistant' })} className={`flex-1 py-3 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${aiConfig.activeMode === 'assistant' ? 'bg-white/10 text-white shadow-sm' : 'text-white/20'}`}>Asistente</button>
                        <button onClick={() => setAiConfig({ ...aiConfig, activeMode: 'agent' })} className={`flex-1 py-3 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${aiConfig.activeMode === 'agent' ? 'bg-white/10 text-white shadow-sm' : 'text-white/20'}`}>Agente</button>
                      </div>
                      <p className="text-[8px] text-text-secondary uppercase font-bold tracking-tight opacity-40">El modo Agente permite a la IA realizar acciones directas como ajustes de stock.</p>
                    </div>
                    <div className="p-6 rounded-[2rem] bg-black/[0.02] dark:bg-white/[0.02] border border-white/5 space-y-4">
                      <h4 className="text-[10px] font-black uppercase text-accent tracking-widest italic leading-none">Capacidades del Enlace</h4>
                      <div className="space-y-2">
                        <LogicRow title="Insights Predictivos" desc="Detección de tendencias de venta" active={aiConfig.capabilities.analysis} onToggle={() => setAiConfig({ ...aiConfig, capabilities: { ...aiConfig.capabilities, analysis: !aiConfig.capabilities.analysis } })} />
                        <LogicRow title="Soporte Táctico" desc="Chat interactivo para operadores" active={aiConfig.capabilities.help} onToggle={() => setAiConfig({ ...aiConfig, capabilities: { ...aiConfig.capabilities, help: !aiConfig.capabilities.help } })} />
                      </div>
                    </div>
                  </div>
                </div>
              </Section>
            </div>
            <div className="lg:col-span-4 space-y-8">
              <Section title="Consumo de Créditos" icon="bolt">
                <div className="space-y-6">
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-4xl font-black italic-black text-white leading-none">{(aiConfig.usageStats.current / 1000).toFixed(1)}k</p>
                      <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mt-1">Utilizados este mes</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-black text-neon leading-none">{(aiConfig.usageStats.limit / 1000).toFixed(0)}k</p>
                      <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mt-1">Límite Pro</p>
                    </div>
                  </div>
                  <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-neon shadow-neon-soft transition-all duration-1000" style={{ width: `${(aiConfig.usageStats.current / aiConfig.usageStats.limit) * 100}%` }}></div>
                  </div>
                  <button className="w-full py-4 rounded-2xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-neon hover:bg-neon hover:text-black transition-all">Mejorar Plan AI</button>
                </div>
              </Section>
            </div>
          </div>
        )}

        {/* RESTAURADO: CONTENIDO PASARELA (PAGOS) */}
        {activeTab === 'pagos' && (
          <div className="max-w-4xl animate-in slide-in-from-bottom-4 duration-500">
            <Section title="Integración de Cobros" icon="account_balance_wallet">
              <div className="space-y-8">
                <div className="flex flex-col md:flex-row gap-8 items-start">
                  <div className="size-24 rounded-[2rem] bg-[#009EE3] flex items-center justify-center shrink-0 shadow-lg">
                    <span className="text-white font-black text-3xl italic-black uppercase leading-none tracking-tighter">MP</span>
                  </div>
                  <div className="flex-1 space-y-2">
                    <h4 className="text-xl font-black italic-black text-white uppercase tracking-tighter">Mercado Pago <span className="text-neon text-sm ml-2">CONECTADO</span></h4>
                    <p className="text-[10px] font-medium text-text-secondary uppercase tracking-widest leading-relaxed">Pasarela principal para pagos QR en mesa y ventas online. Sincronización automática de estados de cobro.</p>
                    <div className="flex items-center gap-3 pt-2">
                      <span className="size-1.5 rounded-full bg-neon animate-pulse"></span>
                      <span className="text-[9px] font-black text-neon uppercase tracking-widest">Webhooks Activos (Terminal Alpha)</span>
                    </div>
                  </div>
                  <button onClick={() => setMpConnected(!mpConnected)} className="px-8 py-3 rounded-xl border border-white/10 bg-white/5 text-[10px] font-black uppercase tracking-widest hover:text-primary transition-all">Desconectar</button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-white/5">
                  <div className="space-y-4">
                    <label className="text-[9px] font-black uppercase text-white/30 tracking-widest ml-1">Access Token (Public)</label>
                    <div className="relative">
                      <input type="password" value="APP_USR-72819201928374-021018-b2a..." readOnly className="w-full h-12 px-5 rounded-2xl bg-black/40 border border-white/10 text-white text-[10px] font-mono outline-none" />
                      <button className="absolute right-4 top-1/2 -translate-y-1/2 text-white/20 hover:text-neon transition-colors"><span className="material-symbols-outlined text-base">content_copy</span></button>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <label className="text-[9px] font-black uppercase text-white/30 tracking-widest ml-1">Client ID</label>
                    <div className="relative">
                      <input type="text" value="827364152431" readOnly className="w-full h-12 px-5 rounded-2xl bg-black/40 border border-white/10 text-white text-[10px] font-mono outline-none" />
                      <button className="absolute right-4 top-1/2 -translate-y-1/2 text-white/20 hover:text-neon transition-colors"><span className="material-symbols-outlined text-base">visibility_off</span></button>
                    </div>
                  </div>
                </div>

                <div className="p-6 rounded-[2rem] bg-accent/5 border border-accent/20 flex items-center gap-6">
                  <span className="material-symbols-outlined text-accent text-3xl">terminal</span>
                  <div>
                    <h5 className="text-[10px] font-black uppercase text-accent tracking-widest italic mb-1">Entorno de Pruebas (SandBox)</h5>
                    <p className="text-[9px] font-bold text-white/40 uppercase tracking-tighter">Habilita esta opción para realizar testeos de flujos sin afectar la caja real.</p>
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

      {/* MODAL: Editor de Matriz de Permisos (ROBUSTO) */}
      {showRoleModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/95 backdrop-blur-md" onClick={() => setShowRoleModal(false)}></div>

          {/* MODAL REFACTORIZADO: Columna Única (Ancho Controlado) */}
          <div className="relative bg-[#0D0F0D] rounded-xl shadow-2xl flex flex-col border border-white/10 overflow-hidden w-full max-w-lg max-h-[90vh]">

            {/* Header */}
            <div className="px-5 py-4 border-b border-white/5 flex justify-between items-center shrink-0 bg-[#111311]">
              <h3 className="text-base font-black italic-black uppercase tracking-tighter text-white">Configurar <span className="text-neon">Rol</span></h3>
              <button onClick={() => setShowRoleModal(false)} className="size-8 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all">
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </div>

            {/* Body: Scrollable Vertical Stack */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">

              {/* Sección 1: Datos Básicos */}
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-text-secondary tracking-widest ml-1">Nombre del Rol</label>
                  <input
                    value={roleForm.name}
                    onChange={e => setRoleForm({ ...roleForm, name: e.target.value })}
                    className="w-full h-10 px-4 rounded-lg bg-white/5 border border-white/10 font-bold text-[10px] text-white uppercase outline-none focus:ring-1 focus:ring-neon/30 placeholder:text-white/20"
                    placeholder="EJ: SUPERVISOR"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-text-secondary tracking-widest ml-1">Descripción</label>
                  <textarea
                    value={roleForm.description}
                    onChange={e => setRoleForm({ ...roleForm, description: e.target.value })}
                    className="w-full h-20 p-3 rounded-xl bg-white/5 border border-white/10 font-bold text-[10px] text-white outline-none focus:ring-1 focus:ring-neon/30 placeholder:text-white/20 resize-none leading-relaxed"
                    placeholder="Describe las responsabilidades..."
                  />
                </div>
              </div>

              {/* Sección 2: Matriz Compacta */}
              <div className="space-y-2">
                <label className="text-[9px] font-black uppercase text-text-secondary tracking-widest ml-1">Permisos Operativos</label>
                <div className="rounded-xl border border-white/5 overflow-hidden bg-[#0A0C0A]">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-white/[0.02]">
                      <tr className="border-b border-white/5">
                        <th className="px-3 py-2 text-[8px] font-black uppercase text-white/30 tracking-widest">Módulo</th>
                        <th className="px-1 py-2 text-center text-[7px] font-black uppercase text-white/30 tracking-widest w-10">Ver</th>
                        <th className="px-1 py-2 text-center text-[7px] font-black uppercase text-white/30 tracking-widest w-10">Crear</th>
                        <th className="px-1 py-2 text-center text-[7px] font-black uppercase text-white/30 tracking-widest w-10">Edit</th>
                        <th className="px-1 py-2 text-center text-[7px] font-black uppercase text-white/30 tracking-widest w-10">Del</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {SECTIONS.map(s => {
                        const perms = (roleForm.permissions?.[s.slug] as any) || {};
                        return (
                          <tr key={s.slug} className="hover:bg-white/[0.01] transition-colors group">
                            <td className="px-3 py-2">
                              <p className="text-[9px] font-black text-white uppercase italic tracking-tight">{s.label}</p>
                            </td>
                            {['view', 'create', 'edit', 'delete'].map(action => (
                              <td key={action} className="px-1 py-2 text-center">
                                <button
                                  onClick={() => togglePermission(s.slug, action)}
                                  className={`size-6 rounded border transition-all flex items-center justify-center mx-auto ${perms[action]
                                    ? action === 'delete' ? 'bg-red-500 text-white border-red-600' : 'bg-neon text-black border-neon'
                                    : 'bg-white/5 border-white/5 text-white/10 hover:border-white/20'
                                    }`}
                                >
                                  <span className="material-symbols-outlined text-[10px] font-black">
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

            {/* Footer */}
            <div className="p-4 border-t border-white/5 bg-[#111311] flex justify-end gap-3 shrink-0">
              <button
                onClick={() => setShowRoleModal(false)}
                className="px-5 py-3 rounded-xl border border-white/10 font-black text-[9px] uppercase text-white/40 hover:text-white hover:bg-white/5 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  const debugInfo = profile ? `ID: ${profile.id}, Store: ${profile.store_id || 'N/A'}` : 'SIN PERFIL';
                  alert("DEBUG SISTEMA:\n" + debugInfo);

                  if (!roleForm.name) {
                    alert('⚠️ Faltan datos: Escribe un nombre para el rol');
                    return;
                  }
                  if (!profile?.store_id) {
                    alert('⛔ ERROR CRÍTICO: No se detecta la tienda (store_id) en tu perfil. Recarga la página.');
                    return;
                  }

                  try {
                    await saveRole();
                  } catch (e: any) {
                    alert('Error al guardar: ' + e.message);
                  }
                }}
                className="px-6 py-3 bg-neon text-black rounded-xl font-black text-[9px] uppercase tracking-widest shadow-neon-soft hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-base">save</span>
                GUARDAR JERARQUÍA
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};



export default Settings;
