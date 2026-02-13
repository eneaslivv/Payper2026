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

async function fixRemainingProfiles() {
  console.log('🔧 REPARANDO PERFILES RESTANTES CON PROBLEMAS DE FOREIGN KEY...\n');

  try {
    // Usuarios que fallaron con constraint
    const problematicEmails = ['payper2025@gmail.com', 'test@test.com'];
    
    for (const email of problematicEmails) {
      console.log(`🔍 Procesando ${email}...`);
      
      // Obtener usuario de auth
      const { data: authUsers } = await supabase.auth.admin.listUsers();
      const user = authUsers.users.find(u => u.email === email);
      
      if (!user) {
        console.log(`   ❌ Usuario no encontrado en auth`);
        continue;
      }

      // Crear perfil SIN store_id para evitar foreign key constraint
      const newProfile = {
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Usuario',
        role: 'customer', // Role seguro por defecto
        is_active: true,
        store_id: null, // NULL para evitar foreign key constraint
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        points_balance: 0
      };

      const { data, error } = await supabase
        .from('profiles')
        .insert(newProfile)
        .select()
        .single();

      if (error) {
        console.error(`   ❌ Error creando perfil para ${email}:`, error.message);
        
        // Intentar inserción más básica si falla
        const minimalProfile = {
          id: user.id,
          email: user.email,
          full_name: user.email?.split('@')[0] || 'Usuario',
          role: 'customer',
          is_active: true
        };

        console.log('   🔄 Intentando inserción mínima...');
        const { data: minData, error: minError } = await supabase
          .from('profiles')
          .insert(minimalProfile)
          .select()
          .single();

        if (minError) {
          console.error(`   ❌ Falló inserción mínima:`, minError.message);
        } else {
          console.log(`   ✅ Perfil mínimo creado exitosamente para ${email}`);
        }
      } else {
        console.log(`   ✅ Perfil completo creado exitosamente para ${email}`);
      }
    }

    // Verificación final
    console.log('\n📊 VERIFICACIÓN FINAL...');
    const { data: authUsers } = await supabase.auth.admin.listUsers();
    const { count: profileCount } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true });

    console.log(`✓ Usuarios en Auth: ${authUsers.users.length}`);
    console.log(`✓ Perfiles en BD: ${profileCount}`);
    console.log(`✓ Diferencia: ${authUsers.users.length - profileCount}`);

    if (authUsers.users.length === profileCount) {
      console.log('\n🎉 ¡TODOS LOS USUARIOS TIENEN PERFIL! Problema resuelto.');
    } else {
      console.log('\n⚠️  Aún hay usuarios sin perfil. Verificando...');
      
      for (const user of authUsers.users) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', user.id)
          .single();
        
        if (!profile) {
          console.log(`   - ${user.email} (${user.id.substring(0, 8)}...) SIN PERFIL`);
        }
      }
    }

  } catch (error) {
    console.error('💥 Error en reparación final:', error);
  }
}

fixRemainingProfiles().catch(console.error);