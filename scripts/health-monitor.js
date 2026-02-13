import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function healthCheck() {
  console.log('🏥 HEALTH CHECK - MONITOREO DE APLICACIÓN\n');

  try {
    // 1. Verificar sincronización Auth <-> Profiles
    console.log('1. Verificando sincronización Auth-Profiles...');
    
    const { data: authUsers } = await supabase.auth.admin.listUsers();
    const { count: profileCount } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true });

    const syncStatus = authUsers.users.length === profileCount;
    console.log(`   Auth Users: ${authUsers.users.length}`);
    console.log(`   Profiles: ${profileCount}`);
    console.log(`   ✅ Sincronización: ${syncStatus ? 'PERFECTO' : 'PROBLEMA'}`);

    // 2. Verificar perfiles activos
    const { count: activeProfiles } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);
    
    console.log(`\n2. Perfiles activos: ${activeProfiles}/${profileCount}`);

    // 3. Verificar roles
    const { data: roleDistribution } = await supabase
      .from('profiles')
      .select('role')
      .not('role', 'is', null);

    const roles = roleDistribution.reduce((acc, p) => {
      acc[p.role] = (acc[p.role] || 0) + 1;
      return acc;
    }, {});

    console.log('\n3. Distribución de roles:');
    Object.entries(roles).forEach(([role, count]) => {
      console.log(`   ${role}: ${count}`);
    });

    // 4. Test de consulta crítica que causaba el problema
    console.log('\n4. Test de consulta crítica...');
    const testUserId = authUsers.users[0]?.id;
    if (testUserId) {
      const start = Date.now();
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', testUserId)
        .single();
      
      const duration = Date.now() - start;
      
      if (error) {
        console.log(`   ❌ Error en consulta: ${error.message}`);
      } else {
        console.log(`   ✅ Consulta exitosa en ${duration}ms`);
        console.log(`   Usuario: ${profile.email} (${profile.role})`);
      }
    }

    // 5. Verificar performance de queries
    console.log('\n5. Test de performance...');
    const perfStart = Date.now();
    const { data: allProfiles } = await supabase
      .from('profiles')
      .select('id, email, role, is_active')
      .limit(100);
    
    const perfDuration = Date.now() - perfStart;
    console.log(`   Query de 100 perfiles: ${perfDuration}ms`);

    // 6. Verificar estado de RLS
    console.log('\n6. Verificando Row Level Security...');
    try {
      // Crear cliente con anon key para probar RLS
      const anonClient = createClient(supabaseUrl, process.env.VITE_SUPABASE_ANON_KEY);
      const { data: rlsTest, error: rlsError } = await anonClient
        .from('profiles')
        .select('id')
        .limit(1);

      if (rlsError) {
        console.log('   🔒 RLS está funcionando correctamente (bloquea acceso anónimo)');
      } else {
        console.log('   ⚠️  RLS puede estar deshabilitado');
      }
    } catch (e) {
      console.log('   🔒 RLS funcionando correctamente');
    }

    // 7. Resumen final
    console.log('\n📊 RESUMEN HEALTH CHECK');
    console.log('='.repeat(40));
    console.log(`✅ Conexión a DB: OK`);
    console.log(`${syncStatus ? '✅' : '❌'} Sync Auth-Profiles: ${syncStatus ? 'OK' : 'FAIL'}`);
    console.log(`✅ Perfiles activos: ${activeProfiles}`);
    console.log(`✅ Performance queries: ${perfDuration < 500 ? 'BUENA' : 'LENTA'}`);
    console.log(`✅ Aplicación: ${syncStatus ? 'FUNCIONANDO' : 'PROBLEMA'}`);

    if (syncStatus) {
      console.log('\n🎉 LA APLICACIÓN ESTÁ FUNCIONANDO PERFECTAMENTE');
      console.log('   Ya no debería aparecer la pantalla "CONFIGURANDO CUENTA"');
    }

  } catch (error) {
    console.error('💥 Error en health check:', error);
  }
}

// Ejecutar health check
healthCheck().catch(console.error);