import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ArrowUp, ArrowDown, DollarSign, TrendingUp, AlertCircle } from 'lucide-react';

interface CashMovement {
  id: string;
  amount: number;
  type: 'withdrawal' | 'deposit' | 'adjustment_add' | 'adjustment_subtract';
  reason: string;
  order_id?: string;
  created_at: string;
}

interface CashSessionCompensationsProps {
  sessionId: string;
  showTitle?: boolean;
}

export const CashSessionCompensations: React.FC<CashSessionCompensationsProps> = ({
  sessionId,
  showTitle = true
}) => {
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({
    totalAdjustments: 0,
    adjustmentsAdd: 0,
    adjustmentsSubtract: 0,
    manualMovements: 0
  });

  useEffect(() => {
    const fetchMovements = async () => {
      setLoading(true);

      try {
        // Fetch all movements for this session
        const { data, error } = await supabase
          .from('cash_movements')
          .select('*')
          .eq('session_id', sessionId)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('[CashSessionCompensations] Error:', error);
          return;
        }

        const movementsData = (data as any) || [];
        setMovements(movementsData);

        // Calculate summary
        const adjustmentsAdd = movementsData
          .filter((m: CashMovement) => m.type === 'adjustment_add')
          .reduce((sum: number, m: CashMovement) => sum + m.amount, 0);

        const adjustmentsSubtract = movementsData
          .filter((m: CashMovement) => m.type === 'adjustment_subtract')
          .reduce((sum: number, m: CashMovement) => sum + Math.abs(m.amount), 0);

        const manualMovements = movementsData
          .filter((m: CashMovement) => m.type === 'withdrawal' || m.type === 'deposit')
          .reduce((sum: number, m: CashMovement) => sum + m.amount, 0);

        setSummary({
          totalAdjustments: adjustmentsAdd - adjustmentsSubtract,
          adjustmentsAdd,
          adjustmentsSubtract,
          manualMovements
        });
      } catch (err) {
        console.error('[CashSessionCompensations] Error fetching movements:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchMovements();
  }, [sessionId]);

  const getMovementIcon = (type: string) => {
    switch (type) {
      case 'adjustment_add':
        return <ArrowUp className="w-4 h-4 text-green-500" />;
      case 'adjustment_subtract':
        return <ArrowDown className="w-4 h-4 text-red-500" />;
      case 'deposit':
        return <TrendingUp className="w-4 h-4 text-blue-500" />;
      case 'withdrawal':
        return <DollarSign className="w-4 h-4 text-orange-500" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-500" />;
    }
  };

  const getMovementColor = (type: string) => {
    switch (type) {
      case 'adjustment_add':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'adjustment_subtract':
        return 'text-red-600 bg-red-50 border-red-200';
      case 'deposit':
        return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'withdrawal':
        return 'text-orange-600 bg-orange-50 border-orange-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getMovementLabel = (type: string) => {
    switch (type) {
      case 'adjustment_add':
        return 'Ajuste Positivo';
      case 'adjustment_subtract':
        return 'Ajuste Negativo';
      case 'deposit':
        return 'Depósito';
      case 'withdrawal':
        return 'Retiro';
      default:
        return 'Movimiento';
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-2">
        <div className="h-4 bg-gray-200 rounded w-1/3"></div>
        <div className="h-16 bg-gray-100 rounded"></div>
      </div>
    );
  }

  if (movements.length === 0) {
    return (
      <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
        <p className="text-sm text-gray-500 text-center">
          No hay compensaciones o movimientos en esta sesión
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {showTitle && (
        <h4 className="text-sm font-semibold text-gray-700">
          Compensaciones y Movimientos
        </h4>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
          <div className="text-xs text-blue-600 font-medium mb-1">
            Ajustes Neto
          </div>
          <div className={`text-lg font-bold ${summary.totalAdjustments >= 0 ? 'text-green-700' : 'text-red-700'}`}>
            ${summary.totalAdjustments.toFixed(2)}
          </div>
        </div>

        <div className="p-3 bg-green-50 rounded-lg border border-green-200">
          <div className="text-xs text-green-600 font-medium mb-1">
            Ajustes +
          </div>
          <div className="text-lg font-bold text-green-700">
            +${summary.adjustmentsAdd.toFixed(2)}
          </div>
        </div>

        <div className="p-3 bg-red-50 rounded-lg border border-red-200">
          <div className="text-xs text-red-600 font-medium mb-1">
            Ajustes -
          </div>
          <div className="text-lg font-bold text-red-700">
            -${summary.adjustmentsSubtract.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Movements List */}
      <div className="space-y-2 max-h-[300px] overflow-y-auto">
        {movements.map((movement) => (
          <div
            key={movement.id}
            className={`border rounded-lg p-3 ${getMovementColor(movement.type)}`}
          >
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                {getMovementIcon(movement.type)}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold">
                        {getMovementLabel(movement.type)}
                      </span>
                      <span className={`text-sm font-bold ${movement.amount >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                        {movement.amount >= 0 ? '+' : ''}${movement.amount.toFixed(2)}
                      </span>
                    </div>

                    <p className="text-xs text-gray-700">
                      {movement.reason}
                    </p>

                    {movement.order_id && (
                      <p className="text-xs text-gray-500 mt-1">
                        Orden: {movement.order_id.slice(0, 8)}
                      </p>
                    )}

                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(movement.created_at).toLocaleString('es-AR', {
                        hour: '2-digit',
                        minute: '2-digit',
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric'
                      })}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CashSessionCompensations;
