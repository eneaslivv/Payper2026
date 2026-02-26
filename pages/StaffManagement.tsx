
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { CustomRole, SectionSlug, RolePermissions } from '../types';

const SECTIONS: { slug: SectionSlug; label: string; icon: string }[] = [
  { slug: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { slug: 'orders', label: 'Despacho', icon: 'receipt_long' },
  { slug: 'inventory', label: 'Stock', icon: 'inventory_2' },
  { slug: 'recipes', label: 'Recetas', icon: 'menu_book' },
  { slug: 'finance', label: 'Finanzas', icon: 'account_balance' },
  { slug: 'tables', label: 'Mesas / QR', icon: 'table_restaurant' },
  { slug: 'clients', label: 'Clientes', icon: 'group' },
  { slug: 'loyalty', label: 'Fidelización', icon: 'loyalty' },
  { slug: 'design', label: 'Menú', icon: 'palette' },
  { slug: 'staff', label: 'Staff', icon: 'badge' },
  { slug: 'audit', label: 'Auditoría', icon: 'history' },
];

const ACTIONS = ['view', 'create', 'edit', 'delete'] as const;
const ACTION_LABELS: Record<string, string> = { view: 'Ver', create: 'Crear', edit: 'Editar', delete: 'Borrar' };

interface StaffProfile {
  id: string;
  email: string;
  full_name: string;
  role: string;
  role_id: string | null;
  is_active: boolean;
  created_at: string;
}

const emptyPermissions = (): RolePermissions =>
  SECTIONS.reduce((acc, s) => ({
    ...acc,
    [s.slug]: { view: false, create: false, edit: false, delete: false }
  }), {} as RolePermissions);

const StaffManagement: React.FC = () => {
  const { profile } = useAuth();
  const storeId = profile?.store_id;

  const [activeTab, setActiveTab] = useState<'members' | 'roles'>('roles');

  // Roles state
  const [roles, setRoles] = useState<CustomRole[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);

  // Staff state
  const [staff, setStaff] = useState<StaffProfile[]>([]);
  const [staffLoading, setStaffLoading] = useState(true);

  // Modal state
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [roleForm, setRoleForm] = useState<Partial<CustomRole>>({ name: '', description: '', permissions: emptyPermissions() });
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Assign role modal
  const [assignModal, setAssignModal] = useState<{ staffId: string; currentRoleId: string | null } | null>(null);

  // ---------- FETCH ROLES ----------
  const fetchRoles = useCallback(async () => {
    if (!storeId) return;
    setRolesLoading(true);
    try {
      const { data: rolesData, error } = await supabase
        .from('store_roles')
        .select('*')
        .eq('store_id', storeId)
        .order('is_system', { ascending: false })
        .order('name');

      if (error) throw error;

      // Fetch permissions for all roles
      const roleIds = (rolesData || []).map((r: any) => r.id);
      let permsMap: Record<string, RolePermissions> = {};

      if (roleIds.length > 0) {
        const { data: permsData } = await supabase
          .from('store_role_permissions')
          .select('role_id, section_slug, can_view, can_create, can_edit, can_delete')
          .in('role_id', roleIds);

        if (permsData) {
          permsData.forEach((p: any) => {
            if (!permsMap[p.role_id]) permsMap[p.role_id] = emptyPermissions();
            permsMap[p.role_id][p.section_slug] = {
              view: p.can_view ?? false,
              create: p.can_create ?? false,
              edit: p.can_edit ?? false,
              delete: p.can_delete ?? false,
            };
          });
        }
      }

      const enriched: CustomRole[] = (rolesData || []).map((r: any) => ({
        id: r.id,
        name: r.name,
        description: r.description || '',
        is_system: r.is_system,
        permissions: permsMap[r.id] || emptyPermissions(),
      }));

      setRoles(enriched);
    } catch (e) {
      console.error('Error fetching roles:', e);
    } finally {
      setRolesLoading(false);
    }
  }, [storeId]);

  // ---------- FETCH STAFF ----------
  const fetchStaff = useCallback(async () => {
    if (!storeId) return;
    setStaffLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name, role, role_id, is_active, created_at')
        .eq('store_id', storeId)
        .in('role', ['store_owner', 'staff'])
        .order('role')
        .order('full_name');

      if (error) throw error;
      setStaff(data || []);
    } catch (e) {
      console.error('Error fetching staff:', e);
    } finally {
      setStaffLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    fetchRoles();
    fetchStaff();
  }, [fetchRoles, fetchStaff]);

  // ---------- SAVE ROLE ----------
  const saveRole = async () => {
    if (!roleForm.name || !storeId) return;
    setSaving(true);
    try {
      let roleId = selectedRoleId;

      if (roleId) {
        // Update existing role
        const { error } = await supabase
          .from('store_roles')
          .update({ name: roleForm.name, description: roleForm.description || '', updated_at: new Date().toISOString() })
          .eq('id', roleId);
        if (error) throw error;
      } else {
        // Create new role
        const { data, error } = await supabase
          .from('store_roles')
          .insert({ name: roleForm.name, description: roleForm.description || '', store_id: storeId })
          .select('id')
          .single();
        if (error) throw error;
        roleId = data.id;
      }

      // Upsert permissions — delete existing, then insert fresh
      await supabase.from('store_role_permissions').delete().eq('role_id', roleId!);

      const permRows = SECTIONS.map(s => {
        const p = (roleForm.permissions?.[s.slug] as any) || {};
        return {
          role_id: roleId!,
          section_slug: s.slug,
          can_view: p.view ?? false,
          can_create: p.create ?? false,
          can_edit: p.edit ?? false,
          can_delete: p.delete ?? false,
        };
      });

      const { error: permError } = await supabase.from('store_role_permissions').insert(permRows);
      if (permError) throw permError;

      setShowRoleModal(false);
      setSelectedRoleId(null);
      await fetchRoles();
    } catch (e) {
      console.error('Error saving role:', e);
    } finally {
      setSaving(false);
    }
  };

  // ---------- DELETE ROLE ----------
  const deleteRole = async (roleId: string) => {
    try {
      await supabase.from('store_role_permissions').delete().eq('role_id', roleId);
      await supabase.from('store_roles').delete().eq('id', roleId);
      setDeleteConfirm(null);
      await fetchRoles();
    } catch (e) {
      console.error('Error deleting role:', e);
    }
  };

  // ---------- ASSIGN ROLE ----------
  const assignRole = async (staffId: string, roleId: string | null) => {
    try {
      await supabase.from('profiles').update({ role_id: roleId }).eq('id', staffId);
      setAssignModal(null);
      await fetchStaff();
    } catch (e) {
      console.error('Error assigning role:', e);
    }
  };

  // ---------- TOGGLE STAFF STATUS ----------
  const toggleStaffStatus = async (s: StaffProfile) => {
    try {
      await supabase.from('profiles').update({ is_active: !s.is_active }).eq('id', s.id);
      await fetchStaff();
    } catch (e) {
      console.error('Error toggling status:', e);
    }
  };

  // ---------- PERMISSION TOGGLE ----------
  const togglePermission = (slug: string, action: string) => {
    const currentPerms = roleForm.permissions || {};
    const sectionPerms = (currentPerms[slug] as any) || { view: false, create: false, edit: false, delete: false };
    setRoleForm({
      ...roleForm,
      permissions: {
        ...currentPerms,
        [slug]: { ...sectionPerms, [action]: !sectionPerms[action] }
      }
    });
  };

  // ---------- BULK TOGGLE ----------
  const toggleAllForSection = (slug: string) => {
    const currentPerms = roleForm.permissions || {};
    const sectionPerms = (currentPerms[slug] as any) || { view: false, create: false, edit: false, delete: false };
    const allOn = sectionPerms.view && sectionPerms.create && sectionPerms.edit && sectionPerms.delete;
    const newVal = !allOn;
    setRoleForm({
      ...roleForm,
      permissions: {
        ...currentPerms,
        [slug]: { view: newVal, create: newVal, edit: newVal, delete: newVal }
      }
    });
  };

  const toggleAllForAction = (action: string) => {
    const currentPerms = roleForm.permissions || {};
    const allOn = SECTIONS.every(s => ((currentPerms[s.slug] as any) || {})[action]);
    const newVal = !allOn;
    const updated = { ...currentPerms };
    SECTIONS.forEach(s => {
      const sp = (updated[s.slug] as any) || { view: false, create: false, edit: false, delete: false };
      updated[s.slug] = { ...sp, [action]: newVal };
    });
    setRoleForm({ ...roleForm, permissions: updated });
  };

  const handleEditRole = (role: CustomRole) => {
    setRoleForm(JSON.parse(JSON.stringify(role)));
    setSelectedRoleId(role.id);
    setShowRoleModal(true);
  };

  const handleNewRole = () => {
    setRoleForm({ name: '', description: '', permissions: emptyPermissions() });
    setSelectedRoleId(null);
    setShowRoleModal(true);
  };

  const countActivePerms = (perms: RolePermissions): number => {
    let count = 0;
    Object.values(perms).forEach((sp: any) => {
      if (sp.view) count++;
      if (sp.create) count++;
      if (sp.edit) count++;
      if (sp.delete) count++;
    });
    return count;
  };

  return (
    <div className="p-6 md:p-10 space-y-6 max-w-[1400px] mx-auto animate-in fade-in duration-700 pb-32">
      {/* HEADER */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl italic-black tracking-tighter text-text-main dark:text-white uppercase leading-none">
            Staff y <span className="text-neon">Roles</span>
          </h1>
          <p className="text-text-secondary text-[10px] font-bold uppercase tracking-widest mt-1 opacity-50">Control de acceso y privilegios</p>
        </div>
        <div className="flex gap-2">
          {(['members', 'roles'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2 rounded-xl border font-bold text-[9px] uppercase tracking-widest transition-all ${
                activeTab === tab
                  ? 'bg-white dark:bg-white/10 text-neon border-neon/20'
                  : 'border-black/[0.04] dark:border-white/[0.04] text-text-secondary hover:text-text-main dark:hover:text-white'
              }`}
            >
              {tab === 'members' ? 'Staff' : 'Roles'}
            </button>
          ))}
        </div>
      </header>

      {/* ── STAFF MEMBERS TAB ── */}
      {activeTab === 'members' && (
        <div className="animate-in slide-in-from-left-4">
          {staffLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 rounded-full border-2 border-neon/30 border-t-neon animate-spin" />
            </div>
          ) : staff.length === 0 ? (
            <div className="text-center py-20 space-y-3">
              <span className="material-symbols-outlined text-4xl text-text-secondary/20">group_off</span>
              <p className="text-text-secondary text-xs font-bold uppercase tracking-widest opacity-50">Sin staff registrado</p>
            </div>
          ) : (
            <div className="bg-white dark:bg-surface-dark rounded-2xl border border-border-color/30 dark:border-white/5 overflow-hidden shadow-soft">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-black/[0.03] dark:border-white/[0.03]">
                    <th className="px-6 py-4 text-[8px] font-black uppercase text-text-secondary tracking-widest">Persona</th>
                    <th className="px-4 py-4 text-[8px] font-black uppercase text-text-secondary tracking-widest">Rol</th>
                    <th className="px-4 py-4 text-[8px] font-black uppercase text-text-secondary tracking-widest text-center">Estado</th>
                    <th className="px-4 py-4 text-[8px] font-black uppercase text-text-secondary tracking-widest text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.02] dark:divide-white/[0.02]">
                  {staff.map(s => {
                    const assignedRole = roles.find(r => r.id === s.role_id);
                    return (
                      <tr key={s.id} className="hover:bg-black/[0.005] dark:hover:bg-white/[0.005] transition-colors">
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-3">
                            <div className="size-9 rounded-xl bg-neon/10 text-neon flex items-center justify-center font-black text-xs italic border border-neon/5 uppercase shrink-0">
                              {s.full_name?.charAt(0) || '?'}
                            </div>
                            <div className="min-w-0">
                              <p className="text-[11px] font-black dark:text-white uppercase italic tracking-tight truncate">{s.full_name}</p>
                              <p className="text-[9px] text-text-secondary font-bold opacity-40 truncate">{s.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => setAssignModal({ staffId: s.id, currentRoleId: s.role_id })}
                            className="text-[9px] font-black bg-black/5 dark:bg-white/5 px-3 py-1.5 rounded-lg text-text-main dark:text-white uppercase tracking-widest border border-border-color/30 dark:border-white/5 hover:border-neon/30 hover:text-neon transition-all cursor-pointer"
                          >
                            {s.role === 'store_owner' ? 'DUEÑO' : assignedRole?.name || 'Sin Rol'}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest border ${
                            s.is_active
                              ? 'bg-neon/5 text-neon border-neon/10'
                              : 'bg-red-500/5 text-red-500 border-red-500/10'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${s.is_active ? 'bg-neon' : 'bg-red-500'}`} />
                            {s.is_active ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {s.role !== 'store_owner' && (
                            <button
                              onClick={() => toggleStaffStatus(s)}
                              className={`size-8 rounded-lg flex items-center justify-center transition-all ml-auto ${
                                s.is_active
                                  ? 'bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white'
                                  : 'bg-neon/10 text-neon hover:bg-neon hover:text-black'
                              }`}
                            >
                              <span className="material-symbols-outlined text-sm">{s.is_active ? 'block' : 'check'}</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── ROLES TAB ── */}
      {activeTab === 'roles' && (
        <div className="animate-in slide-in-from-right-4">
          {rolesLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 rounded-full border-2 border-neon/30 border-t-neon animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {/* New role button */}
              <button
                onClick={handleNewRole}
                className="min-h-[140px] rounded-2xl border border-dashed border-border-color dark:border-white/10 flex flex-col items-center justify-center gap-3 group hover:border-neon/40 hover:bg-neon/[0.02] transition-all"
              >
                <div className="size-12 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center text-text-secondary/30 group-hover:text-neon group-hover:scale-110 transition-all">
                  <span className="material-symbols-outlined text-2xl">add</span>
                </div>
                <p className="text-[9px] font-black uppercase tracking-[0.15em] text-text-secondary/40 group-hover:text-neon transition-colors">Nuevo Rol</p>
              </button>

              {/* Role cards */}
              {roles.map(role => {
                const activeCount = countActivePerms(role.permissions);
                const totalCount = SECTIONS.length * 4;
                return (
                  <div
                    key={role.id}
                    className="bg-white dark:bg-surface-dark p-6 rounded-2xl border border-border-color/30 dark:border-white/5 flex flex-col group hover:border-border-color dark:hover:border-white/10 transition-all shadow-soft relative"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-3">
                        <div className="size-10 rounded-xl bg-neon/10 flex items-center justify-center">
                          <span className="material-symbols-outlined text-neon text-lg">security</span>
                        </div>
                        <div>
                          <h3 className="text-sm font-black italic-black uppercase tracking-tight dark:text-white leading-tight">{role.name}</h3>
                          {role.is_system && (
                            <span className="text-[7px] text-text-secondary/50 font-black uppercase tracking-widest">Sistema</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {role.description && (
                      <p className="text-[10px] text-text-secondary font-medium leading-relaxed opacity-50 line-clamp-2 mb-4">{role.description}</p>
                    )}

                    {/* Mini permission bar */}
                    <div className="mt-auto pt-3 border-t border-border-color/20 dark:border-white/5">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[8px] font-bold text-text-secondary/40 uppercase tracking-widest">{activeCount}/{totalCount} permisos</span>
                        <div className="w-20 h-1.5 rounded-full bg-black/5 dark:bg-white/5 overflow-hidden">
                          <div className="h-full rounded-full bg-neon transition-all" style={{ width: `${(activeCount / totalCount) * 100}%` }} />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEditRole(role)}
                          className="flex-1 py-2 rounded-xl bg-black/5 dark:bg-white/5 text-text-main dark:text-white font-black text-[9px] uppercase tracking-widest hover:bg-neon hover:text-black transition-all"
                        >
                          Editar
                        </button>
                        {!role.is_system && (
                          deleteConfirm === role.id ? (
                            <div className="flex gap-1">
                              <button
                                onClick={() => deleteRole(role.id)}
                                className="px-3 py-2 rounded-xl bg-red-500 text-white font-black text-[9px] uppercase tracking-widest hover:bg-red-600 transition-all"
                              >
                                Sí
                              </button>
                              <button
                                onClick={() => setDeleteConfirm(null)}
                                className="px-3 py-2 rounded-xl bg-black/5 dark:bg-white/5 text-text-secondary font-black text-[9px] uppercase tracking-widest hover:bg-black/10 dark:hover:bg-white/10 transition-all"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDeleteConfirm(role.id)}
                              className="px-3 py-2 rounded-xl bg-red-500/5 text-red-500/60 font-black text-[9px] uppercase tracking-widest hover:bg-red-500/10 hover:text-red-500 transition-all"
                            >
                              <span className="material-symbols-outlined text-sm">delete</span>
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── MODAL: PERMISSION MATRIX ── */}
      {showRoleModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={() => setShowRoleModal(false)} />
          <div className="relative bg-white dark:bg-[#0D0F0D] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-border-color dark:border-white/10 animate-in zoom-in-95 overflow-hidden">

            {/* Modal Header — compact */}
            <div className="px-6 py-5 border-b border-border-color/30 dark:border-white/5 shrink-0 bg-gray-50 dark:bg-[#111311]">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-black italic-black uppercase tracking-tight text-text-main dark:text-white">
                  {selectedRoleId ? 'Editar' : 'Nuevo'} <span className="text-neon">Rol</span>
                </h3>
                <button onClick={() => setShowRoleModal(false)} className="size-9 rounded-xl bg-black/5 dark:bg-white/5 flex items-center justify-center text-text-secondary dark:text-white/40 hover:text-text-main dark:hover:text-white transition-all">
                  <span className="material-symbols-outlined text-lg">close</span>
                </button>
              </div>
              <div className="flex gap-3">
                <input
                  value={roleForm.name || ''}
                  onChange={e => setRoleForm({ ...roleForm, name: e.target.value })}
                  className="flex-1 h-10 px-4 rounded-xl bg-white dark:bg-white/5 border border-border-color dark:border-white/10 font-bold text-xs text-text-main dark:text-white uppercase outline-none focus:ring-1 focus:ring-neon/30 placeholder:text-text-secondary/30"
                  placeholder="Nombre del rol"
                />
                <input
                  value={roleForm.description || ''}
                  onChange={e => setRoleForm({ ...roleForm, description: e.target.value })}
                  className="flex-1 h-10 px-4 rounded-xl bg-white dark:bg-white/5 border border-border-color dark:border-white/10 font-medium text-[11px] text-text-main dark:text-white outline-none focus:ring-1 focus:ring-neon/30 placeholder:text-text-secondary/30"
                  placeholder="Descripción (opcional)"
                />
              </div>
            </div>

            {/* Permission Matrix — compact */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <table className="w-full border-collapse">
                <thead className="sticky top-0 bg-white dark:bg-[#0D0F0D] z-10">
                  <tr>
                    <th className="text-left py-2 pr-2">
                      <span className="text-[8px] font-black uppercase text-text-secondary/40 tracking-widest">Módulo</span>
                    </th>
                    {ACTIONS.map(a => (
                      <th key={a} className="py-2 w-16 text-center">
                        <button
                          onClick={() => toggleAllForAction(a)}
                          className={`text-[8px] font-black uppercase tracking-widest transition-colors hover:text-neon ${
                            a === 'delete' ? 'text-red-400/40 hover:text-red-400' : 'text-text-secondary/40'
                          }`}
                        >
                          {ACTION_LABELS[a]}
                        </button>
                      </th>
                    ))}
                    <th className="py-2 w-10 text-center">
                      <span className="text-[8px] font-black uppercase text-text-secondary/20 tracking-widest">All</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {SECTIONS.map(s => {
                    const perms = (roleForm.permissions?.[s.slug] as any) || {};
                    const allOn = perms.view && perms.create && perms.edit && perms.delete;
                    return (
                      <tr key={s.slug} className="group border-b border-border-color/10 dark:border-white/[0.03] last:border-0">
                        <td className="py-2.5 pr-2">
                          <div className="flex items-center gap-2.5">
                            <span className="material-symbols-outlined text-[16px] text-text-secondary/30 dark:text-white/15 group-hover:text-neon/60 transition-colors">{s.icon}</span>
                            <span className="text-[11px] font-bold text-text-main dark:text-white/80 uppercase tracking-tight">{s.label}</span>
                          </div>
                        </td>
                        {ACTIONS.map(a => (
                          <td key={a} className="py-2.5 text-center">
                            <button
                              onClick={() => togglePermission(s.slug, a)}
                              className={`size-8 rounded-lg border transition-all flex items-center justify-center mx-auto ${
                                perms[a]
                                  ? a === 'delete'
                                    ? 'bg-red-500 text-white border-red-600 shadow-sm shadow-red-500/20'
                                    : 'bg-neon text-black border-neon shadow-sm shadow-neon/20'
                                  : 'bg-black/[0.03] dark:bg-white/[0.03] border-border-color/20 dark:border-white/5 text-text-secondary/15 dark:text-white/10 hover:border-border-color/40 dark:hover:border-white/15'
                              }`}
                            >
                              <span className="material-symbols-outlined text-[14px] font-bold">
                                {perms[a] ? 'check' : ''}
                              </span>
                            </button>
                          </td>
                        ))}
                        <td className="py-2.5 text-center">
                          <button
                            onClick={() => toggleAllForSection(s.slug)}
                            className={`size-6 rounded-md border transition-all flex items-center justify-center mx-auto ${
                              allOn
                                ? 'bg-neon/20 border-neon/30 text-neon'
                                : 'bg-transparent border-border-color/15 dark:border-white/5 text-text-secondary/15 dark:text-white/10 hover:border-neon/30'
                            }`}
                          >
                            <span className="material-symbols-outlined text-[11px]">{allOn ? 'done_all' : 'select_all'}</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-border-color/30 dark:border-white/5 bg-gray-50 dark:bg-[#111311] flex justify-end gap-3 shrink-0">
              <button
                onClick={() => setShowRoleModal(false)}
                className="px-6 py-3 rounded-xl border border-border-color dark:border-white/10 font-black text-[10px] uppercase text-text-secondary dark:text-white/40 hover:text-text-main dark:hover:text-white transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={saveRole}
                disabled={saving || !roleForm.name}
                className="px-8 py-3 bg-neon text-black rounded-xl font-black text-[10px] uppercase tracking-widest shadow-[0_0_15px_rgba(74,222,128,0.2)] hover:scale-105 active:scale-95 transition-all disabled:opacity-40"
              >
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: ASSIGN ROLE ── */}
      {assignModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={() => setAssignModal(null)} />
          <div className="relative bg-white dark:bg-[#0D0F0D] rounded-2xl shadow-2xl w-full max-w-sm border border-border-color dark:border-white/10 animate-in zoom-in-95 overflow-hidden">
            <div className="px-6 py-5 border-b border-border-color/30 dark:border-white/5">
              <h3 className="text-sm font-black italic-black uppercase tracking-tight text-text-main dark:text-white">Asignar <span className="text-neon">Rol</span></h3>
            </div>
            <div className="p-4 space-y-2 max-h-[50vh] overflow-y-auto">
              <button
                onClick={() => assignRole(assignModal.staffId, null)}
                className={`w-full text-left px-4 py-3 rounded-xl border transition-all text-[11px] font-bold uppercase tracking-wide ${
                  !assignModal.currentRoleId
                    ? 'border-neon/30 bg-neon/5 text-neon'
                    : 'border-border-color/20 dark:border-white/5 text-text-secondary hover:border-border-color/40 dark:hover:border-white/15'
                }`}
              >
                Sin rol asignado
              </button>
              {roles.map(r => (
                <button
                  key={r.id}
                  onClick={() => assignRole(assignModal.staffId, r.id)}
                  className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
                    assignModal.currentRoleId === r.id
                      ? 'border-neon/30 bg-neon/5'
                      : 'border-border-color/20 dark:border-white/5 hover:border-border-color/40 dark:hover:border-white/15'
                  }`}
                >
                  <p className={`text-[11px] font-black uppercase tracking-tight ${assignModal.currentRoleId === r.id ? 'text-neon' : 'dark:text-white'}`}>{r.name}</p>
                  {r.description && <p className="text-[9px] text-text-secondary/50 mt-0.5">{r.description}</p>}
                </button>
              ))}
            </div>
            <div className="px-6 py-4 border-t border-border-color/30 dark:border-white/5 flex justify-end">
              <button onClick={() => setAssignModal(null)} className="px-5 py-2.5 rounded-xl border border-border-color dark:border-white/10 font-black text-[10px] uppercase text-text-secondary dark:text-white/40 hover:text-text-main dark:hover:text-white transition-all">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StaffManagement;
