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

async function auditDatabase() {
  console.log('🔍 INICIANDO AUDITORÍA COMPLETA DE SUPABASE...\n');

  try {
    // 1. Verificar conexión
    console.log('1. Verificando conexión a Supabase...');
    const { data: healthCheck, error: healthError } = await supabase
      .from('profiles')
      .select('count', { count: 'exact', head: true });
    
    if (healthError) {
      console.error('❌ Error de conexión:', healthError.message);
      return;
    }
    console.log('✅ Conexión exitosa\n');

    // 2. Auditar tabla profiles
    console.log('2. Auditando tabla profiles...');
    
    // Verificar estructura
    const { data: tableInfo, error: tableError } = await supabase
      .rpc('get_table_info', { table_name: 'profiles' })
      .single();

    if (tableError) {
      console.log('⚠️  Usando consulta alternativa para estructura...');
      // Consulta alternativa
      const { data: sampleProfile } = await supabase
        .from('profiles')
        .select('*')
        .limit(1);
      
      console.log('📊 Estructura detectada (basada en muestra):');
      if (sampleProfile && sampleProfile.length > 0) {
        Object.keys(sampleProfile[0]).forEach(key => {
          console.log(`   - ${key}: ${typeof sampleProfile[0][key]}`);
        });
      }
    } else {
      console.log('📊 Información de tabla profiles:', tableInfo);
    }

    // Contar perfiles
    const { count: profileCount } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true });
    
    console.log(`📈 Total de perfiles: ${profileCount || 0}`);

    // 3. Verificar usuarios sin perfil
    console.log('\n3. Verificando usuarios sin perfil...');
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
    
    if (authError) {
      console.error('❌ Error obteniendo usuarios auth:', authError.message);
    } else {
      console.log(`👥 Total usuarios en auth: ${authUsers.users.length}`);
      
      // Verificar cuáles no tienen perfil
      const usersWithoutProfile = [];
      for (const user of authUsers.users) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', user.id)
          .single();
        
        if (!profile) {
          usersWithoutProfile.push({
            id: user.id,
            email: user.email,
            created_at: user.created_at
          });
        }
      }
      
      console.log(`🚨 Usuarios sin perfil: ${usersWithoutProfile.length}`);
      if (usersWithoutProfile.length > 0) {
        console.log('   Usuarios afectados:');
        usersWithoutProfile.forEach(user => {
          console.log(`   - ${user.email} (${user.id.substring(0, 8)}...)`);
        });
      }
    }

    // 4. Verificar políticas RLS
    console.log('\n4. Verificando políticas RLS...');
    const { data: policies, error: policiesError } = await supabase
      .rpc('get_table_policies', { table_name: 'profiles' });

    if (policiesError) {
      console.log('⚠️  No se pudieron obtener políticas RLS');
    } else {
      console.log(`🔒 Políticas RLS activas: ${policies?.length || 0}`);
    }

    // 5. Probar consulta típica que falla
    console.log('\n5. Probando consulta típica...');
    if (authUsers && authUsers.users.length > 0) {
      const testUserId = authUsers.users[0].id;
      const { data: testProfile, error: testError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', testUserId)
        .single();
      
      if (testError) {
        console.error('❌ Error en consulta típica:', testError.message);
        console.error('   Código:', testError.code);
        console.error('   Detalles:', testError.details);
      } else {
        console.log('✅ Consulta típica funciona correctamente');
      }
    }

    console.log('\n📝 RESUMEN DE AUDITORÍA:');
    console.log('=' .repeat(50));
    console.log(`✓ Conexión: OK`);
    console.log(`✓ Perfiles en BD: ${profileCount || 0}`);
    console.log(`✓ Usuarios en Auth: ${authUsers?.users?.length || 0}`);
    console.log(`⚠ Usuarios sin perfil: ${authUsers ? authUsers.users.length - (profileCount || 0) : 'N/A'}`);

  } catch (error) {
    console.error('💥 Error crítico en auditoría:', error);
  }
}

async function repairProfiles() {
  console.log('\n🔧 INICIANDO REPARACIÓN DE PERFILES...\n');

  try {
    // 1. Obtener usuarios sin perfil
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
    
    if (authError) {
      console.error('❌ Error obteniendo usuarios:', authError.message);
      return;
    }

    console.log('🔍 Identificando usuarios sin perfil...');
    const usersToRepair = [];
    
    for (const user of authUsers.users) {
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .single();
      
      if (!existingProfile) {
        usersToRepair.push(user);
      }
    }

    console.log(`📋 Usuarios que necesitan reparación: ${usersToRepair.length}`);

    if (usersToRepair.length === 0) {
      console.log('✅ No hay usuarios que requieran reparación');
      return;
    }

    // 2. Crear perfiles faltantes
    console.log('\n🛠️  Creando perfiles faltantes...');
    
    for (const user of usersToRepair) {
      const newProfile = {
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Usuario',
        role: user.user_metadata?.role || 'customer',
        is_active: true,
        store_id: user.user_metadata?.store_id || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      console.log(`   Creando perfil para: ${user.email}`);
      
      const { data, error } = await supabase
        .from('profiles')
        .insert(newProfile)
        .select()
        .single();

      if (error) {
        console.error(`   ❌ Error creando perfil para ${user.email}:`, error.message);
      } else {
        console.log(`   ✅ Perfil creado exitosamente para ${user.email}`);
      }
    }

    console.log('\n🎉 REPARACIÓN COMPLETADA');

  } catch (error) {
    console.error('💥 Error en reparación:', error);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'audit';

  if (command === 'audit') {
    await auditDatabase();
  } else if (command === 'repair') {
    await auditDatabase();
    await repairProfiles();
  } else {
    console.log('Uso: node supabase-audit.js [audit|repair]');
  }
}

main().catch(console.error);