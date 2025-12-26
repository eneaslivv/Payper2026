
import React, { useState } from 'react';
import { MOCK_STAFF, MOCK_ROLES } from '../constants';
import { StaffMember, CustomRole, SectionSlug } from '../types';

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

const StaffManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'members' | 'roles'>('roles');
  const [members, setMembers] = useState<StaffMember[]>(MOCK_STAFF);
  const [roles, setRoles] = useState<CustomRole[]>(MOCK_ROLES);
  
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [showRoleModal, setShowRoleModal] = useState(false);
  
  // Role Form State
  const [roleForm, setRoleForm] = useState<Partial<CustomRole>>({
    name: '',
    description: '',
    permissions: SECTIONS.reduce((acc, s) => ({
      ...acc,
      [s.slug]: { view: false, create: false, edit: false, delete: false }
    }), {})
  });

  const toggleStatus = (id: string) => {
    setMembers(prev => prev.map(m => {
      if (m.id === id) {
        return { ...m, status: m.status === 'active' ? 'suspended' : 'active' };
      }
      return m;
    }));
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

  const saveRole = () => {
    if (roleForm.name) {
      if (selectedRoleId) {
        setRoles(prev => prev.map(r => r.id === selectedRoleId ? { ...r, ...roleForm } as CustomRole : r));
      } else {
        const newRole = { ...roleForm, id: `role-${Date.now()}` } as CustomRole;
        setRoles(prev => [...prev, newRole]);
      }
      setShowRoleModal(false);
      setSelectedRoleId(null);
    }
  };

  const togglePermission = (slug: string, action: string) => {
      const currentPerms = roleForm.permissions || {};
      const sectionPerms = currentPerms[slug] || {view:false, create:false, edit:false, delete:false};
      
      setRoleForm({
        ...roleForm,
        permissions: {
          ...currentPerms,
          [slug]: { ...sectionPerms, [action]: !(sectionPerms as any)[action] }
        }
      });
  };

  return (
    <div className="p-6 md:p-10 space-y-8 max-w-[1400px] mx-auto animate-in fade-in duration-700 pb-32">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div className="space-y-1">
          <h1 className="text-4xl italic-black tracking-tighter text-text-main dark:text-white uppercase leading-none">
            Staff y <span className="text-neon">Jerarquía</span>
          </h1>
          <p className="text-text-secondary text-[10px] font-bold uppercase tracking-widest mt-2 opacity-50">Control de acceso y privilegios operativos</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setActiveTab('members')} className={`px-6 py-2.5 rounded-xl border border-black/[0.04] dark:border-white/[0.04] font-bold text-[9px] uppercase tracking-widest transition-all ${activeTab === 'members' ? 'bg-white dark:bg-white/10 text-neon' : 'text-text-secondary hover:text-white'}`}>
            Directorio Staff
          </button>
          <button onClick={() => setActiveTab('roles')} className={`px-6 py-2.5 rounded-xl border border-black/[0.04] dark:border-white/[0.04] font-bold text-[9px] uppercase tracking-widest transition-all ${activeTab === 'roles' ? 'bg-white dark:bg-white/10 text-neon' : 'text-text-secondary hover:text-white'}`}>
            Definición Roles
          </button>
        </div>
      </header>

      <div className="min-h-[600px]">
        {activeTab === 'members' && (
          <div className="bg-white dark:bg-surface-dark rounded-3xl border border-white/5 overflow-hidden shadow-soft animate-in slide-in-from-left-4">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-black/[0.01] dark:bg-white/[0.01] border-b border-black/[0.02] dark:border-white/[0.02]">
                  <th className="px-8 py-6 text-[9px] font-black uppercase text-text-secondary tracking-widest">Identidad</th>
                  <th className="px-8 py-6 text-[9px] font-black uppercase text-text-secondary tracking-widest">Rol Asignado</th>
                  <th className="px-8 py-6 text-[9px] font-black uppercase text-text-secondary tracking-widest">Actividad</th>
                  <th className="px-8 py-6 text-[9px] font-black uppercase text-text-secondary tracking-widest text-center">Estado</th>
                  <th className="px-8 py-6 text-[9px] font-black uppercase text-text-secondary tracking-widest text-right">Control</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.02] dark:divide-white/[0.02]">
                {members.map(member => (
                  <tr key={member.id} className="hover:bg-black/[0.005] dark:hover:bg-white/[0.005] transition-colors">
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-4">
                        <div className="size-10 rounded-xl bg-neon/10 text-neon flex items-center justify-center font-black text-sm italic border border-neon/5 uppercase">
                          {member.name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-[11px] font-black dark:text-white uppercase italic tracking-tight">{member.name}</p>
                          <p className="text-[9px] text-text-secondary font-bold uppercase opacity-40">{member.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <span className="text-[9px] font-black bg-white/5 px-2 py-1 rounded text-white uppercase tracking-widest border border-white/5">{roles.find(r => r.id === member.roleId)?.name}</span>
                    </td>
                    <td className="px-8 py-5 text-[9px] font-bold dark:text-white/40 uppercase tracking-widest">{member.lastActivity}</td>
                    <td className="px-8 py-5 text-center">
                      <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest border ${member.status === 'active' ? 'bg-neon/5 text-neon border-neon/10' : 'bg-primary/5 text-primary border-primary/10'}`}>
                        {member.status === 'active' ? 'ACTIVO' : 'SUSPENDIDO'}
                      </span>
                    </td>
                    <td className="px-8 py-5 text-right">
                       <button onClick={() => toggleStatus(member.id)} className={`size-8 rounded-lg flex items-center justify-center transition-all ${member.status === 'active' ? 'bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white' : 'bg-neon/10 text-neon hover:bg-neon hover:text-black'} ml-auto`}>
                           <span className="material-symbols-outlined text-base">{member.status === 'active' ? 'block' : 'check'}</span>
                       </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'roles' && (
          <div className="space-y-8 animate-in slide-in-from-right-4">
             <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                <button onClick={handleNewRole} className="min-h-[200px] rounded-[2.5rem] border border-dashed border-white/10 flex flex-col items-center justify-center gap-4 group hover:border-neon/40 hover:bg-neon/[0.02] transition-all">
                   <div className="size-16 rounded-full bg-white/5 flex items-center justify-center text-white/20 group-hover:text-neon group-hover:scale-110 transition-all">
                      <span className="material-symbols-outlined text-3xl">add</span>
                   </div>
                   <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 group-hover:text-neon transition-colors">Crear Nueva Jerarquía</p>
                </button>

                {roles.map(role => (
                  <div key={role.id} className="bg-white dark:bg-surface-dark p-8 rounded-[2.5rem] border border-white/5 flex flex-col justify-between group hover:border-white/10 transition-all shadow-soft">
                    <div>
                      <div className="flex justify-between items-start mb-6">
                        <div className="size-12 rounded-2xl bg-white/5 flex items-center justify-center text-white/30 group-hover:text-white transition-colors">
                            <span className="material-symbols-outlined text-2xl">security</span>
                        </div>
                        {role.is_system && <span className="text-[7px] bg-white/5 text-white/40 px-2 py-1 rounded-lg font-black uppercase tracking-widest border border-white/5">System Locked</span>}
                      </div>
                      <h3 className="text-xl font-black italic-black uppercase tracking-tight dark:text-white mb-2">{role.name}</h3>
                      <p className="text-[10px] text-text-secondary font-medium leading-relaxed opacity-60 line-clamp-3">{role.description}</p>
                    </div>
                    
                    <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-between">
                       <span className="text-[9px] font-bold text-white/20 uppercase tracking-widest">Permisos Configurados</span>
                       <button onClick={() => handleEditRole(role)} className="px-5 py-2 rounded-xl bg-white/5 text-white font-black text-[9px] uppercase tracking-widest hover:bg-neon hover:text-black transition-all">
                          Editar Matriz
                       </button>
                    </div>
                  </div>
                ))}
             </div>
          </div>
        )}
      </div>

      {/* MODAL: EDITOR DE MATRIZ DE PERMISOS (REDISENADO) */}
      {showRoleModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/95 backdrop-blur-md" onClick={() => setShowRoleModal(false)}></div>
          <div className="relative bg-[#0D0F0D] rounded-[3rem] shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col border border-white/10 animate-in zoom-in-95 overflow-hidden">
             
             {/* Header Modal */}
             <div className="px-10 py-8 border-b border-white/5 flex justify-between items-start shrink-0 bg-[#111311]">
                <div className="space-y-1">
                   <h3 className="text-3xl font-black italic-black uppercase tracking-tighter text-white">Configuración de <span className="text-neon">Accesos</span></h3>
                   <p className="text-text-secondary text-[10px] font-bold uppercase tracking-widest opacity-60">Matriz de privilegios por módulo operativo</p>
                </div>
                <button onClick={() => setShowRoleModal(false)} className="size-12 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all">
                   <span className="material-symbols-outlined text-xl">close</span>
                </button>
             </div>

             {/* Body Modal */}
             <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                {/* Sidebar del Formulario */}
                <div className="w-full md:w-80 p-8 border-r border-white/5 bg-[#0D0F0D] overflow-y-auto shrink-0 space-y-6">
                    <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase text-text-secondary tracking-widest ml-1">Nombre del Rol</label>
                        <input 
                          value={roleForm.name}
                          onChange={e => setRoleForm({...roleForm, name: e.target.value})}
                          className="w-full h-12 px-5 rounded-2xl bg-white/5 border border-white/10 font-bold text-xs text-white uppercase outline-none focus:ring-1 focus:ring-neon/30 placeholder:text-white/20" 
                          placeholder="EJ: SUPERVISOR NOCTURNO"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase text-text-secondary tracking-widest ml-1">Descripción</label>
                        <textarea 
                          value={roleForm.description}
                          onChange={e => setRoleForm({...roleForm, description: e.target.value})}
                          className="w-full h-32 p-5 rounded-2xl bg-white/5 border border-white/10 font-bold text-[10px] text-white outline-none focus:ring-1 focus:ring-neon/30 placeholder:text-white/20 resize-none leading-relaxed" 
                          placeholder="Describe las responsabilidades..."
                        />
                    </div>
                    <div className="p-5 rounded-2xl bg-neon/5 border border-neon/10">
                        <div className="flex gap-3 mb-2">
                            <span className="material-symbols-outlined text-neon text-lg">info</span>
                            <p className="text-[10px] font-black text-neon uppercase tracking-widest pt-0.5">Nota Táctica</p>
                        </div>
                        <p className="text-[9px] font-medium text-white/60 leading-relaxed">
                            Los cambios en la matriz de seguridad se aplican inmediatamente. Asegúrate de revisar los privilegios de "Borrar".
                        </p>
                    </div>
                </div>

                {/* La Matriz */}
                <div className="flex-1 overflow-y-auto bg-[#0A0C0A] p-8">
                   <div className="rounded-3xl border border-white/5 overflow-hidden">
                       <table className="w-full text-left border-collapse">
                          <thead className="bg-white/[0.02]">
                             <tr className="border-b border-white/5">
                                <th className="px-6 py-4 text-[9px] font-black uppercase text-white/30 tracking-widest">Módulo</th>
                                <th className="px-2 py-4 text-center text-[9px] font-black uppercase text-white/30 tracking-widest w-24">Lectura</th>
                                <th className="px-2 py-4 text-center text-[9px] font-black uppercase text-white/30 tracking-widest w-24">Escritura</th>
                                <th className="px-2 py-4 text-center text-[9px] font-black uppercase text-white/30 tracking-widest w-24">Edición</th>
                                <th className="px-2 py-4 text-center text-[9px] font-black uppercase text-white/30 tracking-widest w-24">Eliminar</th>
                             </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {SECTIONS.map(s => {
                                const perms = (roleForm.permissions?.[s.slug] as any) || {};
                                return (
                                  <tr key={s.slug} className="hover:bg-white/[0.01] transition-colors group">
                                    <td className="px-6 py-4">
                                       <p className="text-[11px] font-black text-white uppercase italic tracking-tight">{s.label}</p>
                                    </td>
                                    {['view', 'create', 'edit', 'delete'].map(action => (
                                      <td key={action} className="px-2 py-4 text-center">
                                        <button 
                                          onClick={() => togglePermission(s.slug, action)}
                                          className={`size-10 rounded-xl border transition-all flex items-center justify-center mx-auto ${
                                              perms[action] 
                                              ? action === 'delete' ? 'bg-red-500 text-white border-red-600' : 'bg-neon text-black border-neon'
                                              : 'bg-white/5 border-white/5 text-white/10 hover:border-white/20'
                                          }`}
                                        >
                                          <span className="material-symbols-outlined text-lg font-black">
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

             {/* Footer Actions */}
             <div className="p-6 border-t border-white/5 bg-[#111311] flex justify-end gap-4 shrink-0">
                <button onClick={() => setShowRoleModal(false)} className="px-8 py-4 rounded-2xl border border-white/10 font-black text-[10px] uppercase text-white/40 hover:text-white hover:bg-white/5 transition-all">Cancelar</button>
                <button onClick={saveRole} className="px-10 py-4 bg-neon text-black rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-[0_0_20px_rgba(74,222,128,0.3)] hover:scale-105 active:scale-95 transition-all">Guardar Configuración</button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StaffManagement;
