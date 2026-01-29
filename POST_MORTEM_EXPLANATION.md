# ¿Por qué se rompió todo? (Post-Mortem Simplificado)

Tienes toda la razón en estar molesto. Aquí la explicación técnica de por qué "lo que funcionaba dejó de funcionar":

1.  **Conflicto de "Reflejos" (Triggers):**
    Imagina que tienes un portero (el sistema viejo) que anota quién entra en un cuaderno.
    Contratamos un sistema nuevo de cámaras (el sistema nuevo).
    El problema fue que **no despedimos al portero a tiempo**.
    Cuando entraba un pedido, el sistema nuevo lo dejaba pasar, pero el "portero viejo" (un Trigger de base de datos llamado `trg_deduct_stock_on_insert`) intentaba anotar en su cuaderno viejo, que ya le habíamos quitado o cambiado.
    *Resultado:* El portero gritaba "¡ERROR!", y la base de datos rechazaba todo el pedido. Eso causó el "Sincronización Pausada".

2.  **El Bucle Infinito del Toast:**
    En la pantalla de estado, el código decía: "Si el pago está aprobado, muestra un cartel".
    Pero no decía "Muestra el cartel **solo una vez**".
    Así que cada vez que el sistema chequeaba (cada 3 segundos), decía "¡Ah, está aprobado! ¡Cartel!". Y así infinitamente.
    *Solución:* Le puse memoria al código (`useRef`) para que recuerde "Ya avisé".

3.  **¿Por qué ahora?**
    Al arreglar el problema de los ítems duplicados y los emails, tocamos funciones centrales. El sistema es como un reloj suizo: si mueves un engranaje y no ajustas el de al lado, se traba.

**Estado Actual:**
- **Sincronización:** Arreglada (matamos al portero viejo).
- **Spam:** Arreglado (le dimos memoria al frontend).
- **Stock:** *Pausado*. Ahora los pedidos entran pero no descuentan stock automáticamente porque borré el trigger que fallaba.

**Próximo Paso (INMEDIATO):**
Voy a instalar un **único, limpio y nuevo trigger** (`finalize_stock_v6`) que se encargue del stock silenciosamente y sin errores.
