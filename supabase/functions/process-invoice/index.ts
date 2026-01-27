// supabase/functions/process-invoice/index.ts
// Edge Function para procesar facturas con Gemini AI

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { GoogleGenerativeAI } from 'https://esm.sh/@google/generative-ai@0.21.0'
import { initMonitoring, captureException } from '../_shared/monitoring.ts'

const FUNCTION_NAME = 'process-invoice'
initMonitoring(FUNCTION_NAME)

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { invoice_id, image_url } = await req.json()

        if (!invoice_id || !image_url) {
            return new Response(
                JSON.stringify({ error: 'Missing invoice_id or image_url' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Initialize Supabase client
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        // Update status to processing
        await supabase
            .from('invoices')
            .update({ status: 'processing' })
            .eq('id', invoice_id)

        // Download image from storage using service role
        // Extract path from URL: https://xxx.supabase.co/storage/v1/object/public/invoices-files/store_id/filename.ext
        let imagePath = ''
        if (image_url.includes('/object/public/')) {
            // Public URL format
            imagePath = image_url.split('/object/public/invoices-files/')[1]
        } else if (image_url.includes('/object/')) {
            // Authenticated URL format
            imagePath = image_url.split('/object/invoices-files/')[1]
        }

        console.log('Downloading image from path:', imagePath)

        let imageData: Uint8Array
        let mimeType = 'image/jpeg'

        if (imagePath) {
            // Download using Supabase Storage API (works for private buckets)
            const { data: downloadData, error: downloadError } = await supabase.storage
                .from('invoices-files')
                .download(imagePath)

            if (downloadError) {
                console.error('Storage download error:', downloadError)
                throw new Error(`Failed to download image: ${downloadError.message}`)
            }

            const arrayBuffer = await downloadData.arrayBuffer()
            imageData = new Uint8Array(arrayBuffer)
            mimeType = downloadData.type || 'image/jpeg'
        } else {
            // Fallback to direct fetch for external URLs
            const imageResponse = await fetch(image_url)
            if (!imageResponse.ok) {
                throw new Error('Failed to download image from URL')
            }
            const imageBlob = await imageResponse.blob()
            const arrayBuffer = await imageBlob.arrayBuffer()
            imageData = new Uint8Array(arrayBuffer)
            mimeType = imageBlob.type || 'image/jpeg'
        }

        const base64Image = btoa(
            imageData.reduce((data, byte) => data + String.fromCharCode(byte), '')
        )

        // Initialize Gemini
        const geminiApiKey = Deno.env.get('GEMINI_API_KEY')
        if (!geminiApiKey) {
            throw new Error('GEMINI_API_KEY not configured')
        }

        const genAI = new GoogleGenerativeAI(geminiApiKey)
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' })

        // System prompt for Argentine invoice extraction (Spanish is required for the model context)
        const systemPrompt = `Eres un experto contable argentino especializado en OCR de facturas. 
        
        // --- INICIO DE PROMPT PARA IA (NO MODIFICAR TEXTO) ---
TAREA: Extrae todos los datos de esta factura y devuélvelos en formato JSON.

IMPORTANTE - FORMATO DE NÚMEROS ARGENTINOS:
- En Argentina usamos el punto (.) como separador de MILES
- En Argentina usamos la coma (,) como separador DECIMAL
- Ejemplo: "1.234,56" significa mil doscientos treinta y cuatro con 56 centavos
- AL GENERAR EL JSON: Convierte TODOS los números al formato estándar (punto como decimal, sin separador de miles)
- Ejemplo de conversión: "1.234,56" → 1234.56

ESTRUCTURA JSON REQUERIDA:
{
  "proveedor": "Nombre del proveedor/razón social",
  "fecha": "YYYY-MM-DD",
  "nro_factura": "Número de factura completo",
  "subtotal": 0.00,
  "iva": 0.00,
  "total": 0.00,
  "items": [
    {
      "descripcion": "Nombre del producto",
      "cantidad": 0,
      "unidad": "kg/lt/un/etc",
      "precio_unitario": 0.00,
      "bonificacion": 0,
      "total_linea": 0.00
    }
  ]
}

NOTAS:
- Si no puedes leer un campo, usa null
- bonificacion es el porcentaje de descuento (0 si no hay)
- Asegúrate de que la suma de los items coincida aproximadamente con el subtotal
- Devuelve SOLO el JSON, sin markdown ni explicaciones adicionales`

        // Call Gemini with image
        const result = await model.generateContent([
            systemPrompt,
            {
                inlineData: {
                    mimeType: mimeType,
                    data: base64Image
                }
            }
        ])

        const responseText = result.response.text()

        // Parse JSON from response (handle potential markdown wrapping)
        let extractedData
        try {
            // Remove markdown code blocks if present
            let cleanJson = responseText
                .replace(/```json\n?/g, '')
                .replace(/```\n?/g, '')
                .trim()

            extractedData = JSON.parse(cleanJson)
        } catch (parseError) {
            console.error('JSON parse error:', responseText)
            throw new Error('Failed to parse Gemini response as JSON')
        }

        // Update invoice with extracted data
        const { error: updateError } = await supabase
            .from('invoices')
            .update({
                proveedor: extractedData.proveedor || null,
                fecha_factura: extractedData.fecha || null,
                nro_factura: extractedData.nro_factura || null,
                subtotal: extractedData.subtotal || 0,
                iva_total: extractedData.iva || 0,
                total: extractedData.total || 0,
                status: 'extracted',
                raw_extraction: extractedData
            })
            .eq('id', invoice_id)

        if (updateError) {
            throw new Error(`Failed to update invoice: ${updateError.message}`)
        }

        // Insert invoice items
        if (extractedData.items && Array.isArray(extractedData.items)) {
            const itemsToInsert = extractedData.items.map((item: any) => ({
                invoice_id: invoice_id,
                name: item.descripcion || 'Item sin nombre',
                quantity: item.cantidad || 0,
                unit: item.unidad || 'un',
                unit_price: item.precio_unitario || 0,
                bonification: item.bonificacion || 0,
                tax_amount: 0, // Will be calculated if needed
                total_line: item.total_linea || 0,
                is_new_item: false,
                matched_inventory_id: null
            }))

            const { error: itemsError } = await supabase
                .from('invoice_items')
                .insert(itemsToInsert)

            if (itemsError) {
                console.error('Error inserting items:', itemsError)
                // Don't fail the whole operation, just log
            }
        }

        return new Response(
            JSON.stringify({
                success: true,
                message: 'Invoice processed successfully',
                data: extractedData
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        console.error('Process invoice error:', error)
        await captureException(error, req, FUNCTION_NAME)

        // Try to update status to error if we have invoice_id
        try {
            const { invoice_id } = await req.json()
            if (invoice_id) {
                const supabaseUrl = Deno.env.get('SUPABASE_URL')!
                const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
                const supabase = createClient(supabaseUrl, supabaseServiceKey)

                await supabase
                    .from('invoices')
                    .update({ status: 'error' })
                    .eq('id', invoice_id)
            }
        } catch {
            // Ignore cleanup errors
        }

        return new Response(
            JSON.stringify({ error: error.message || 'Unknown error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
