
import React, { useState, useMemo, useEffect } from 'react';
import { AuditLogEntry, AuditCategory } from '../types';
import DateRangeSelector from '../components/DateRangeSelector';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

// Mapeo de tabla a categoría de auditoría
const TABLE_CATEGORY_MAP: Record<string, AuditCategory> = {
  'products': 'stock',
  'inventory_items': 'stock',
  'product_recipes': 'stock',
  'orders': 'orders',
  'profiles': 'staff',
  'stores': 'system',
};

// Mapeo de operación a acción legible
const OPERATION_ACTION_MAP: Record<string, string> = {
  'INSERT': 'Creación',
  'UPDATE': 'Modificación',
  'DELETE': 'Eliminación',
};

// Mapeo de tabla a entidad legible
const TABLE_ENTITY_MAP: Record<string, string> = {
  'products': 'Producto',
  'inventory_items': 'Inventario',
  'product_recipes': 'Receta',
  'orders': 'Pedido',
  'profiles': 'Usuario',
  'stores': 'Tienda',
};

const CATEGORIES: { slug: AuditCategory | 'all', label: string, icon: string }[] = [
  { slug: 'all', label: 'Todo', icon: 'apps' },
  { slug: 'stock', label: 'Stock', icon: 'package_2' },
  { slug: 'orders', label: 'Pedidos', icon: 'list_alt' },
  { slug: 'finance', label: 'Finanzas', icon: 'payments' },
  { slug: 'staff', label: 'Staff', icon: 'badge' },
  { slug: 'system', label: 'Sistema', icon: 'settings' },
];

// Interfaz para los datos crudos de la BD
interface AuditLogRow {
  id: string;
  created_at: string;
  store_id: string | null;
  user_id: string | null;
  table_name: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  old_data: Record<string, any> | null;
  new_data: Record<string, any> | null;
}

// Genera un detalle legible del cambio
const generateDetail = (row: AuditLogRow): string => {
  const { operation, old_data, new_data, table_name } = row;

  if (operation === 'INSERT' && new_data) {
    const name = new_data.name || new_data.full_name || new_data.customer_name || 'elemento';
    return `Nuevo: "${name}"`;
  }

  if (operation === 'DELETE' && old_data) {
    const name = old_data.name || old_data.full_name || old_data.customer_name || 'elemento';
    return `Eliminado: "${name}"`;
  }

  if (operation === 'UPDATE' && old_data && new_data) {
    const changes: string[] = [];

    // Detectar cambios específicos importantes
    if (table_name === 'products' || table_name === 'inventory_items') {
      if (old_data.price !== new_data.price) {
        changes.push(`Precio: $${old_data.price} → $${new_data.price}`);
      }
      if (old_data.cost !== new_data.cost) {
        changes.push(`Costo: $${old_data.cost} → $${new_data.cost}`);
      }
      if (old_data.current_stock !== new_data.current_stock) {
        changes.push(`Stock: ${old_data.current_stock} → ${new_data.current_stock}`);
      }
      if (old_data.available !== new_data.available) {
        changes.push(`Disponible: ${old_data.available ? 'Sí' : 'No'} → ${new_data.available ? 'Sí' : 'No'}`);
      }
    }

    if (table_name === 'profiles') {
      if (old_data.role !== new_data.role) {
        changes.push(`Rol: ${old_data.role} → ${new_data.role}`);
      }
      if (old_data.is_active !== new_data.is_active) {
        changes.push(`Activo: ${old_data.is_active ? 'Sí' : 'No'} → ${new_data.is_active ? 'Sí' : 'No'}`);
      }
    }

    if (table_name === 'orders') {
      if (old_data.status !== new_data.status) {
        changes.push(`Estado: ${old_data.status} → ${new_data.status}`);
      }
      if (old_data.total_amount !== new_data.total_amount) {
        changes.push(`Total: $${old_data.total_amount} → $${new_data.total_amount}`);
      }
    }

    if (changes.length > 0) {
      return changes.join(' | ');
    }

    // Fallback genérico
    const name = new_data.name || new_data.full_name || 'elemento';
    return `Actualizado: "${name}"`;
  }

  return 'Cambio registrado';
};

// Determina el impacto visual del cambio
const determineImpact = (row: AuditLogRow): string => {
  const { operation, old_data, new_data, table_name } = row;

  if (operation === 'DELETE') return 'negative';

  if (operation === 'UPDATE' && old_data && new_data) {
    // Cambios de precio son críticos
    if ((table_name === 'products' || table_name === 'inventory_items') && old_data.price !== new_data.price) {
      return 'critical';
    }
    // Cambios de stock grandes son críticos
    if (table_name === 'inventory_items') {
      const stockDiff = Math.abs((new_data.current_stock || 0) - (old_data.current_stock || 0));
      if (stockDiff > 100) return 'critical';
    }
    // Cambios de rol son críticos
    if (table_name === 'profiles' && old_data.role !== new_data.role) {
      return 'critical';
    }
  }

  if (operation === 'INSERT') return 'positive';

  return 'neutral';
};

const AuditLog: React.FC = () => {
  const { profile } = useAuth();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<AuditCategory | 'all'>('all');
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState({ start: new Date(), end: new Date() });

  // Cache de nombres de usuario
  const [userNames, setUserNames] = useState<Record<string, string>>({});

  // Fetch audit logs desde Supabase
  useEffect(() => {
    const fetchAuditLogs = async () => {
      if (!profile?.store_id) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const { data, error: fetchError } = await supabase
          .from('audit_logs')
          .select('*')
          .eq('store_id', profile.store_id)
          .order('created_at', { ascending: false })
          .limit(200);

        if (fetchError) {
          throw fetchError;
        }

        if (!data) {
          setLogs([]);
          return;
        }

        // Obtener IDs de usuarios únicos para buscar nombres
        const userIds = [...new Set(data.map(row => row.user_id).filter(Boolean))] as string[];

        // Fetch nombres de usuarios si hay IDs
        if (userIds.length > 0) {
          const { data: profilesData } = await supabase
            .from('profiles')
            .select('id, full_name, email')
            .in('id', userIds);

          if (profilesData) {
            const namesMap: Record<string, string> = {};
            profilesData.forEach(p => {
              namesMap[p.id] = p.full_name || p.email || 'Usuario';
            });
            setUserNames(namesMap);
          }
        }

        // Transformar datos a AuditLogEntry
        const transformedLogs: AuditLogEntry[] = data.map((row: AuditLogRow) => {
          const date = new Date(row.created_at);
          const formattedDate = date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
          const formattedTime = date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

          return {
            id: row.id,
            userName: userNames[row.user_id || ''] || 'Sistema',
            userRole: 'staff', // Se podría expandir para obtener el rol real
            category: TABLE_CATEGORY_MAP[row.table_name] || 'system',
            action: OPERATION_ACTION_MAP[row.operation] || row.operation,
            entity: TABLE_ENTITY_MAP[row.table_name] || row.table_name,
            detail: generateDetail(row),
            timestamp: `${formattedDate} ${formattedTime}`,
            impact: determineImpact(row),
          };
        });

        setLogs(transformedLogs);
      } catch (err) {
        console.error('Error fetching audit logs:', err);
        setError('Error al cargar los logs de auditoría');
      } finally {
        setLoading(false);
      }
    };

    fetchAuditLogs();
  }, [profile?.store_id]);

  // Actualizar nombres de usuario cuando cambian
  useEffect(() => {
    if (Object.keys(userNames).length > 0 && logs.length > 0) {
      setLogs(prevLogs => prevLogs.map(log => ({
        ...log,
        userName: userNames[log.id] || log.userName,
      })));
    }
  }, [userNames]);

  const filteredLogs = useMemo(() => {
    return logs.filter(l => {
      const matchesCat = filter === 'all' || l.category === filter;
      const searchLower = search.toLowerCase();
      const matchesSearch = l.userName.toLowerCase().includes(searchLower) ||
        l.action.toLowerCase().includes(searchLower) ||
        l.entity.toLowerCase().includes(searchLower) ||
        l.detail.toLowerCase().includes(searchLower);
      return matchesCat && matchesSearch;
    });
  }, [logs, filter, search]);

  const stats = useMemo(() => ({
    today: filteredLogs.length,
    critical: filteredLogs.filter(l => l.impact === 'critical').length,
    ops: filteredLogs.filter(l => l.category === 'stock' || l.category === 'orders').length
  }), [filteredLogs]);

  return (
    <div className="p-6 md:p-10 space-y-10 max-w-[1400px] mx-auto animate-in fade-in duration-700">
      <header className="flex flex-col xl:flex-row justify-between items-start xl:items-end gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-neon/60 font-bold text-[10px] uppercase tracking-[0.3em]">
            <span className="size-1 rounded-full bg-neon shadow-neon-soft"></span>
            Operational Intelligence Engine
          </div>
          <h1 className="text-4xl italic-black tracking-tighter text-text-main dark:text-white uppercase leading-none">
            Audit <span className="text-neon/80">Master Log</span>
          </h1>
          <p className="text-text-secondary text-[10px] font-bold uppercase tracking-widest mt-2 opacity-50">Registro inmutable de la fuerza operativa</p>
        </div>
        <div className="flex gap-4 items-end">
          <DateRangeSelector onRangeChange={(start, end) => setDateRange({ start, end })} />
          <button className="px-6 py-2.5 rounded-xl bg-white dark:bg-white/5 border border-black/[0.05] dark:border-white/[0.05] text-text-secondary font-bold text-[10px] uppercase tracking-widest shadow-soft flex items-center gap-2 hover:text-neon transition-colors h-[42px]">
            <span className="material-symbols-outlined text-lg">download</span>
            Exportar Historial
          </button>
        </div>
      </header>

      {/* KPI Audit Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <AuditKpi label="Eventos Filtrados" value={stats.today} icon="history" color="text-neon" />
        <AuditKpi label="Acciones Críticas" value={stats.critical} icon="report_problem" color="text-orange-500" />
        <AuditKpi label="Eventos Operativos" value={stats.ops} icon="bolt" color="text-accent" />
      </div>

      <div className="flex flex-col xl:flex-row justify-between gap-6 items-center">
        <div className="flex bg-white dark:bg-surface-dark p-1 rounded-xl border border-black/[0.04] dark:border-white/[0.04] shadow-soft w-full xl:w-auto overflow-x-auto no-scrollbar">
          {CATEGORIES.map(cat => (
            <button
              key={cat.slug}
              onClick={() => setFilter(cat.slug)}
              className={`px-6 py-2.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-2.5 whitespace-nowrap ${filter === cat.slug ? 'bg-primary dark:bg-white/10 text-white shadow-soft' : 'text-text-secondary hover:text-primary dark:hover:text-neon'}`}
            >
              <span className="material-symbols-outlined text-lg">{cat.icon}</span>
              {cat.label}
            </button>
          ))}
        </div>
        <div className="relative w-full max-w-md group">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary opacity-40 text-lg group-focus-within:text-neon transition-colors">search</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-11 pl-11 pr-5 rounded-xl border border-black/[0.04] dark:border-white/[0.04] bg-white dark:bg-surface-dark outline-none focus:ring-2 focus:ring-neon/10 text-[10px] font-bold uppercase tracking-widest shadow-soft transition-all placeholder:text-white/10"
            placeholder="OPERADOR, ACCIÓN O ENTIDAD..."
          />
        </div>
      </div>

      <div className="bg-white dark:bg-surface-dark rounded-[2.5rem] border border-black/[0.04] dark:border-white/[0.04] shadow-soft overflow-hidden">
        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-32">
            <div className="flex flex-col items-center gap-4">
              <div className="size-8 border-2 border-neon/20 border-t-neon rounded-full animate-spin"></div>
              <p className="text-[10px] font-black uppercase text-white/40 tracking-[0.4em]">Cargando Logs...</p>
            </div>
          </div>
        )}

        {/* Error State */}
        {!loading && error && (
          <div className="flex items-center justify-center py-32">
            <div className="flex flex-col items-center gap-4">
              <span className="material-symbols-outlined text-6xl text-red-500/40">error</span>
              <p className="text-[10px] font-black uppercase text-red-500/60 tracking-[0.2em]">{error}</p>
            </div>
          </div>
        )}

        {/* Table */}
        {!loading && !error && (
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-black/[0.01] dark:bg-white/[0.01] border-b border-black/[0.02] dark:border-white/[0.02]">
                  <th className="px-8 py-5 text-[9px] font-bold uppercase text-text-secondary tracking-widest">Tiempo</th>
                  <th className="px-8 py-5 text-[9px] font-bold uppercase text-text-secondary tracking-widest">Operador</th>
                  <th className="px-8 py-5 text-[9px] font-bold uppercase text-text-secondary tracking-widest">Acción / Entidad</th>
                  <th className="px-8 py-5 text-[9px] font-bold uppercase text-text-secondary tracking-widest">Detalle</th>
                  <th className="px-8 py-5 text-[9px] font-bold uppercase text-text-secondary tracking-widest text-right">Impacto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.02] dark:divide-white/[0.02]">
                {filteredLogs.map(log => (
                  <tr key={log.id} className="hover:bg-black/[0.01] dark:hover:bg-white/[0.01] transition-all group">
                    <td className="px-8 py-5">
                      <p className="text-[11px] font-bold dark:text-white/80 uppercase mb-1">{log.timestamp.split(' ')[1]}</p>
                      <p className="text-[9px] text-text-secondary font-semibold uppercase opacity-40">{log.timestamp.split(' ')[0]}</p>
                    </td>
                    <td className="px-8 py-5">
                      <p className="text-[11px] font-bold dark:text-white uppercase italic-black mb-1">{log.userName}</p>
                      <p className="text-[9px] text-text-secondary font-black uppercase tracking-widest opacity-40">{log.userRole}</p>
                    </td>
                    <td className="px-8 py-5">
                      <p className="text-[11px] font-black uppercase dark:text-white tracking-tight mb-1">{log.action}</p>
                      <p className="text-[9px] text-neon font-bold uppercase italic tracking-tighter">{log.entity}</p>
                    </td>
                    <td className="px-8 py-5">
                      <p className="text-[10px] font-medium text-text-secondary leading-relaxed uppercase tracking-tight max-w-xs opacity-70 group-hover:opacity-100 transition-opacity">{log.detail}</p>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <div className={`size-2 ml-auto rounded-full ${getImpactColor(log.impact)}`}></div>
                    </td>
                  </tr>
                ))}
                {filteredLogs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-8 py-32 text-center">
                      <span className="material-symbols-outlined text-6xl text-white/5 mb-4 block">history_edu</span>
                      <p className="text-[10px] font-black uppercase text-white/20 tracking-[0.4em]">
                        {logs.length === 0 ? 'Sin Eventos Registrados' : 'Sin Resultados para el Filtro'}
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

const AuditKpi: React.FC<{ label: string, value: number, icon: string, color: string }> = ({ label, value, icon, color }) => (
  <div className="bg-white dark:bg-surface-dark p-6 rounded-[2rem] border border-black/[0.04] dark:border-white/[0.04] shadow-soft flex items-center gap-6">
    <div className={`size-11 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-black/[0.04] dark:border-white/[0.04] flex items-center justify-center`}>
      <span className={`material-symbols-outlined text-xl ${color}`}>{icon}</span>
    </div>
    <div>
      <p className="text-[9px] font-bold text-text-secondary uppercase tracking-[0.2em] mb-1 opacity-50">{label}</p>
      <h3 className="text-2xl font-black italic-black dark:text-white tracking-tighter leading-none uppercase">{value}</h3>
    </div>
  </div>
);

const getImpactColor = (impact: string) => {
  switch (impact) {
    case 'positive': return 'bg-neon shadow-neon-soft';
    case 'negative': return 'bg-primary shadow-[0_0_8px_rgba(59,77,53,0.3)]';
    case 'critical': return 'bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.4)] animate-pulse';
    default: return 'bg-text-secondary opacity-20';
  }
};

export default AuditLog;
