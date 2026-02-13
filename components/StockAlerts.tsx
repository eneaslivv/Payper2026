import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from './ToastSystem';
import { AlertTriangle, CheckCircle, Package, XCircle } from 'lucide-react';

interface StockAlert {
  id: string;
  inventory_item_id: string;
  alert_type: 'negative_stock' | 'low_stock' | 'offline_conflict';
  stock_level: number;
  expected_stock?: number;
  message: string;
  order_id?: string;
  acknowledged: boolean;
  created_at: string;
  item_name?: string;
  sku?: string;
}

interface StockAlertsProps {
  showOnlyUnacknowledged?: boolean;
  maxAlerts?: number;
}

export const StockAlerts: React.FC<StockAlertsProps> = ({
  showOnlyUnacknowledged = true,
  maxAlerts = 10
}) => {
  const { profile } = useAuth();
  const { addToast } = useToast();
  const [alerts, setAlerts] = useState<StockAlert[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch alerts
  const fetchAlerts = async () => {
    if (!profile?.store_id) return;

    const query = supabase
      .from('unacknowledged_stock_alerts')
      .select('*')
      .eq('store_id', profile.store_id)
      .order('created_at', { ascending: false })
      .limit(maxAlerts);

    const { data, error } = await query;

    if (error) {
      console.error('[StockAlerts] Error fetching alerts:', error);
      return;
    }

    setAlerts((data as any) || []);
    setLoading(false);
  };

  // Acknowledge alert
  const acknowledgeAlert = async (alertId: string) => {
    if (!profile?.id) return;

    const { error } = await supabase.rpc('acknowledge_stock_alert', {
      p_alert_id: alertId,
      p_staff_id: profile.id
    });

    if (error) {
      addToast('Error al reconocer alerta', 'error');
      console.error('[StockAlerts] Error acknowledging:', error);
      return;
    }

    // Remove from list
    setAlerts(prev => prev.filter(a => a.id !== alertId));
    addToast('Alerta reconocida', 'success');
  };

  // Subscribe to real-time alerts
  useEffect(() => {
    if (!profile?.store_id) return;

    // Initial fetch
    fetchAlerts();

    // Subscribe to pg_notify channel
    const channel = supabase
      .channel('stock_alerts_channel')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'stock_alerts',
          filter: `store_id=eq.${profile.store_id}`
        },
        (payload) => {
          const newAlert = payload.new as any;

          // Only show if unacknowledged
          if (!newAlert.acknowledged) {
            setAlerts(prev => [newAlert, ...prev].slice(0, maxAlerts));

            // Show toast notification
            const alertTypeMap = {
              'negative_stock': '⚠️ Stock Negativo',
              'low_stock': '📦 Stock Bajo',
              'offline_conflict': '🔄 Conflicto Offline'
            };

            addToast(
              alertTypeMap[newAlert.alert_type as keyof typeof alertTypeMap] || 'Alerta de Stock',
              newAlert.alert_type === 'negative_stock' ? 'error' : 'warning',
              newAlert.message
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.store_id]);

  if (loading) {
    return (
      <div className="p-4 bg-white rounded-lg shadow">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
          <div className="space-y-2">
            <div className="h-12 bg-gray-100 rounded"></div>
            <div className="h-12 bg-gray-100 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (alerts.length === 0) {
    return (
      <div className="p-4 bg-white rounded-lg shadow">
        <div className="flex items-center gap-2 text-green-600">
          <CheckCircle className="w-5 h-5" />
          <span className="font-medium">Sin alertas de stock</span>
        </div>
      </div>
    );
  }

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'negative_stock':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'low_stock':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case 'offline_conflict':
        return <Package className="w-5 h-5 text-orange-500" />;
      default:
        return <AlertTriangle className="w-5 h-5 text-gray-500" />;
    }
  };

  const getAlertColor = (type: string) => {
    switch (type) {
      case 'negative_stock':
        return 'border-red-200 bg-red-50';
      case 'low_stock':
        return 'border-yellow-200 bg-yellow-50';
      case 'offline_conflict':
        return 'border-orange-200 bg-orange-50';
      default:
        return 'border-gray-200 bg-gray-50';
    }
  };

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-700 px-1">
        Alertas de Stock ({alerts.length})
      </h3>

      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className={`border rounded-lg p-3 ${getAlertColor(alert.alert_type)}`}
          >
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                {getAlertIcon(alert.alert_type)}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <p className="font-medium text-sm text-gray-900">
                      {alert.item_name || 'Producto'}
                      {alert.sku && (
                        <span className="ml-2 text-xs text-gray-500">
                          ({alert.sku})
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-gray-700 mt-1">
                      {alert.message}
                    </p>

                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-600">
                      <span>Stock: {alert.stock_level}</span>
                      {alert.expected_stock !== null && alert.expected_stock !== undefined && (
                        <span>Esperado: {alert.expected_stock}</span>
                      )}
                      <span>
                        {new Date(alert.created_at).toLocaleString('es-AR', {
                          hour: '2-digit',
                          minute: '2-digit',
                          day: '2-digit',
                          month: '2-digit'
                        })}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => acknowledgeAlert(alert.id)}
                    className="flex-shrink-0 px-3 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                  >
                    Reconocer
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default StockAlerts;
