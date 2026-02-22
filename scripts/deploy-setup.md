# 🚀 DEPLOY EN VERCEL - GUÍA COMPLETA

## 📋 PRE-REQUISITOS

✅ **Correcciones Críticas Aplicadas:**
- Rate limiting implementado
- Validación MP signatures
- Auto-refresh daily_sales_summary  
- Logs sensibles corregidos

## 🔧 PASOS DE DEPLOY

### 1. **Login en Vercel**
```bash
vercel login
# Sigue las instrucciones para autenticarte
```

### 2. **Deploy Inicial**
```bash
vercel --prod
```

### 3. **Configurar Variables de Entorno**

En el dashboard de Vercel (https://vercel.com/dashboard), ve a tu proyecto y configura:

#### **Variables Críticas:**
```
VITE_SUPABASE_URL = https://yjxjyxhksedwfeueduwl.supabase.co
VITE_SUPABASE_ANON_KEY = [tu-anon-key]
SUPABASE_SERVICE_ROLE_KEY = [tu-service-role-key]
VITE_GEMINI_API_KEY = [tu-gemini-key]
VITE_RESEND_API_KEY = [tu-resend-key]
NODE_ENV = production
ENVIRONMENT = production
```

#### **Variables Opcionales (Recomendadas):**
```
VITE_SENTRY_DSN = [tu-sentry-dsn]
UPSTASH_REDIS_REST_URL = [opcional-para-rate-limiting]
UPSTASH_REDIS_REST_TOKEN = [opcional-para-rate-limiting]
```

### 4. **Verificar Deploy**

#### **Health Check de APIs:**
```bash
curl https://tu-app.vercel.app/api/test-payment-config
```

#### **Rate Limiting Verification:**
```bash
# Verificar headers de rate limit
curl -I https://tu-app.vercel.app/api/verify-payment
```

#### **Expected Response Headers:**
```
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 9
X-RateLimit-Reset: [timestamp]
```

### 5. **Testing Post-Deploy**

#### **Frontend Test:**
1. Navegar a: `https://tu-app.vercel.app`
2. Login funcionando ✅
3. Dashboard carga ✅
4. No pantalla "CONFIGURANDO CUENTA" ✅

#### **API Tests:**
```bash
# Test payment config
curl https://tu-app.vercel.app/api/test-payment-config

# Test rate limiting (should succeed)
curl -X POST https://tu-app.vercel.app/api/verify-payment \
  -H "Content-Type: application/json" \
  -d '{"order_id":"test"}'

# Test rate limiting (11th request should fail with 429)
for i in {1..12}; do
  curl -s -w "%{http_code}\n" \
    -X POST https://tu-app.vercel.app/api/verify-payment \
    -H "Content-Type: application/json" \
    -d '{"order_id":"test"}'
done
```

## 📊 MONITORING POST-DEPLOY

### **Dashboard de Vercel:**
- Functions usage
- Error rates  
- Response times
- Deployment logs

### **Supabase Dashboard:**
- Connection counts
- Query performance
- Error logs
- RLS policies

### **Rate Limiting Monitoring:**
```bash
# Check current rate limit status
curl -I https://tu-app.vercel.app/api/verify-payment
```

## 🚨 ROLLBACK PLAN

Si algo sale mal:

```bash
# Ver deploys anteriores
vercel ls

# Rollback a version anterior
vercel rollback [deployment-url]
```

## 🎯 TESTING CHECKLIST

Después del deploy, verificar:

### **Frontend:**
- [ ] Homepage carga correctamente
- [ ] Login/registro funcionan
- [ ] Dashboard accesible
- [ ] Menú de cliente funcional
- [ ] Checkout process operativo

### **Backend:**
- [ ] APIs responden correctamente
- [ ] Rate limiting activo
- [ ] Logs no exponen tokens
- [ ] Webhook MP signature validation
- [ ] Base de datos sincronizada

### **Seguridad:**
- [ ] Headers de seguridad presentes
- [ ] CORS configurado correctamente
- [ ] RLS funcionando en Supabase
- [ ] MP signatures validándose

### **Performance:**
- [ ] Tiempo de respuesta < 2s
- [ ] Rate limits funcionando
- [ ] No errors 500 en logs
- [ ] Métricas de sales actualizadas

## 🔧 COMANDOS ÚTILES

### **Re-deploy:**
```bash
vercel --prod
```

### **Deploy a staging:**
```bash
vercel
```

### **Ver logs en tiempo real:**
```bash
vercel logs [deployment-url] --follow
```

### **Configurar dominio custom:**
```bash
vercel domains add tu-dominio.com
```

## 📈 MÉTRICAS DE ÉXITO

El deploy es exitoso si:

- ✅ **Frontend:** Carga < 3 segundos
- ✅ **APIs:** Response time < 500ms  
- ✅ **Rate Limiting:** 429 errors en spam
- ✅ **Security:** Headers corrrectos
- ✅ **DB:** Sin errors de conexión
- ✅ **Payment Flow:** Test sandbox funcional

## ⚡ PRÓXIMOS PASOS

Después del deploy exitoso:

1. **Configurar MP Sandbox:**
   - Conectar cuenta test
   - Probar flujo completo

2. **Setup Monitoring:**
   - Alertas de Sentry
   - Dashboards de métricas

3. **Performance Optimization:**
   - Redis para rate limiting
   - CDN para assets

4. **Security Hardening:**
   - IP whitelisting
   - Additional headers

El proyecto está listo para **DEPLOY EN PRODUCCIÓN** 🚀