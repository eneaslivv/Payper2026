import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Store, Globe, DollarSign, Clock, Settings as SettingsIcon } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface StoreData {
  id: string;
  name: string;
  slug: string;
  currency: string;
  timezone: string;
  service_mode: string;
  business_hours?: any;
  menu_theme?: any;
  is_active: boolean;
}

const CURRENCIES = [
  { code: 'ARS', name: 'Peso Argentino', symbol: '$' },
  { code: 'USD', name: 'Dólar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'BRL', name: 'Real Brasileño', symbol: 'R$' },
  { code: 'MXN', name: 'Peso Mexicano', symbol: '$' },
  { code: 'CLP', name: 'Peso Chileno', symbol: '$' },
  { code: 'COP', name: 'Peso Colombiano', symbol: '$' },
  { code: 'PEN', name: 'Sol Peruano', symbol: 'S/' },
  { code: 'UYU', name: 'Peso Uruguayo', symbol: '$U' },
];

const TIMEZONES = [
  { value: 'America/Argentina/Buenos_Aires', label: 'Buenos Aires (GMT-3)' },
  { value: 'America/Sao_Paulo', label: 'São Paulo (GMT-3)' },
  { value: 'America/Santiago', label: 'Santiago (GMT-3/-4)' },
  { value: 'America/Bogota', label: 'Bogotá (GMT-5)' },
  { value: 'America/Lima', label: 'Lima (GMT-5)' },
  { value: 'America/Mexico_City', label: 'Ciudad de México (GMT-6)' },
  { value: 'America/Montevideo', label: 'Montevideo (GMT-3)' },
];

const SERVICE_MODES = [
  { value: 'pos_only', label: 'Solo POS (Punto de Venta)' },
  { value: 'qr_only', label: 'Solo QR (Pedidos por mesa)' },
  { value: 'hybrid', label: 'Híbrido (POS + QR)' },
];

export default function StoreSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [storeData, setStoreData] = useState<StoreData | null>(null);
  const { toast } = useToast();

  // Load store data
  useEffect(() => {
    loadStoreData();
  }, []);

  const loadStoreData = async () => {
    try {
      setLoading(true);

      // Get current user's store_id
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        toast({
          title: 'Error',
          description: 'Usuario no autenticado',
          variant: 'destructive'
        });
        return;
      }

      // Get profile to find store_id
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('store_id')
        .eq('id', user.id)
        .single();

      if (profileError || !profile?.store_id) {
        toast({
          title: 'Error',
          description: 'No tienes una tienda asignada',
          variant: 'destructive'
        });
        return;
      }

      // Get store data
      const { data: store, error: storeError } = await supabase
        .from('stores')
        .select('*')
        .eq('id', profile.store_id)
        .single();

      if (storeError) {
        console.error('Error loading store:', storeError);
        toast({
          title: 'Error',
          description: 'No se pudo cargar la configuración de la tienda',
          variant: 'destructive'
        });
        return;
      }

      setStoreData(store);

    } catch (error) {
      console.error('Error:', error);
      toast({
        title: 'Error',
        description: 'Error inesperado al cargar datos',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!storeData) return;

    try {
      setSaving(true);

      // Validate slug (only lowercase, numbers, hyphens)
      const slugRegex = /^[a-z0-9-]+$/;
      if (!slugRegex.test(storeData.slug)) {
        toast({
          title: 'Error de validación',
          description: 'El slug solo puede contener letras minúsculas, números y guiones',
          variant: 'destructive'
        });
        return;
      }

      // Update store
      const { error } = await supabase
        .from('stores')
        .update({
          name: storeData.name,
          slug: storeData.slug,
          currency: storeData.currency,
          timezone: storeData.timezone,
          service_mode: storeData.service_mode,
          updated_at: new Date().toISOString()
        })
        .eq('id', storeData.id);

      if (error) {
        // Check if it's a unique constraint violation (duplicate slug)
        if (error.code === '23505') {
          toast({
            title: 'Error',
            description: 'Este slug ya está en uso por otra tienda',
            variant: 'destructive'
          });
          return;
        }

        throw error;
      }

      toast({
        title: 'Guardado',
        description: 'Configuración actualizada correctamente',
      });

    } catch (error) {
      console.error('Error saving:', error);
      toast({
        title: 'Error',
        description: 'No se pudo guardar la configuración',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!storeData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Tienda no encontrada</CardTitle>
            <CardDescription>
              No se pudo cargar la configuración de tu tienda
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <SettingsIcon className="h-8 w-8" />
          Configuración de Tienda
        </h1>
        <p className="text-muted-foreground mt-2">
          Gestiona la información y configuración de tu local
        </p>
      </div>

      <div className="space-y-6">
        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Store className="h-5 w-5" />
              Información Básica
            </CardTitle>
            <CardDescription>
              Nombre y identificador de tu tienda
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre de la Tienda</Label>
              <Input
                id="name"
                value={storeData.name}
                onChange={(e) => setStoreData({ ...storeData, name: e.target.value })}
                placeholder="Mi Café"
              />
              <p className="text-xs text-muted-foreground">
                Este nombre se mostrará en menús, facturas y notificaciones
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="slug">Slug (URL amigable)</Label>
              <Input
                id="slug"
                value={storeData.slug}
                onChange={(e) => setStoreData({ ...storeData, slug: e.target.value.toLowerCase() })}
                placeholder="mi-cafe"
              />
              <p className="text-xs text-muted-foreground">
                Solo letras minúsculas, números y guiones. Se usa para QR: payper.app/{storeData.slug}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Regional Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Configuración Regional
            </CardTitle>
            <CardDescription>
              Moneda y zona horaria
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currency">
                <DollarSign className="h-4 w-4 inline mr-1" />
                Moneda
              </Label>
              <Select
                value={storeData.currency}
                onValueChange={(value) => setStoreData({ ...storeData, currency: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((curr) => (
                    <SelectItem key={curr.code} value={curr.code}>
                      {curr.symbol} {curr.name} ({curr.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="timezone">
                <Clock className="h-4 w-4 inline mr-1" />
                Zona Horaria
              </Label>
              <Select
                value={storeData.timezone}
                onValueChange={(value) => setStoreData({ ...storeData, timezone: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz.value} value={tz.value}>
                      {tz.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Service Mode */}
        <Card>
          <CardHeader>
            <CardTitle>Modo de Servicio</CardTitle>
            <CardDescription>
              Cómo operará tu tienda
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="service_mode">Modo de Operación</Label>
              <Select
                value={storeData.service_mode}
                onValueChange={(value) => setStoreData({ ...storeData, service_mode: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SERVICE_MODES.map((mode) => (
                    <SelectItem key={mode.value} value={mode.value}>
                      {mode.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {storeData.service_mode === 'pos_only' && 'Los meseros toman pedidos desde el POS'}
                {storeData.service_mode === 'qr_only' && 'Los clientes escanean QR y piden desde su celular'}
                {storeData.service_mode === 'hybrid' && 'Ambos métodos habilitados'}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-4">
          <Button
            variant="outline"
            onClick={loadStoreData}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Guardando...
              </>
            ) : (
              'Guardar Cambios'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
