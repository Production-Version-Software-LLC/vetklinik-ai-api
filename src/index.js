export default {
  async fetch(request, env, ctx) {
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    };

    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 200, headers: corsHeaders });
    }

    // Test endpoint
    if (request.method === 'GET') {
      return new Response(JSON.stringify({
        message: 'VetKlinik AI API çalışıyor! 🐾 (FIXED)',
        status: 'OK',
        timestamp: new Date().toISOString(),
        version: '1.0.2'
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Main AI endpoint
    if (request.method === 'POST') {
      try {
        const body = await request.json();
        const { notes, petInfo } = body;

        if (!notes || !petInfo) {
          return new Response(JSON.stringify({
            error: 'Missing required fields: notes, petInfo'
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Basitleştirilmiş veteriner prompt
        const prompt = `Sen veteriner hekimsin. Bu hasta hakkında kısa analiz yap:

HASTA: ${petInfo.name} (${petInfo.species}, ${petInfo.breed || 'Belirtilmemiş'})
Yaş: ${petInfo.age || 'Belirtilmemiş'}, Ağırlık: ${petInfo.weight || 'Belirtilmemiş'}kg

GÖZLEMLER:
${notes}

Lütfen kısa analiz yap (maksimum 200 kelime):

🔍 BULGULAR:
[Önemli bulgular]

📊 DEĞERLENDIRME:
[Genel durum değerlendirmesi]

💡 ÖNERİLER:
[Kısa öneriler]

UYARI: Bu eğitim amaçlıdır, kesin teşhis değildir.`;

        // Düzeltilmiş Gemini API çağrısı
        const geminiResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${env.GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      text: prompt
                    }
                  ]
                }
              ],
              generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 512,
                topP: 0.8,
                topK: 40
              },
              safetySettings: [
                {
                  category: 'HARM_CATEGORY_HARASSMENT',
                  threshold: 'BLOCK_MEDIUM_AND_ABOVE'
                },
                {
                  category: 'HARM_CATEGORY_HATE_SPEECH',
                  threshold: 'BLOCK_MEDIUM_AND_ABOVE'
                },
                {
                  category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
                  threshold: 'BLOCK_MEDIUM_AND_ABOVE'
                },
                {
                  category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
                  threshold: 'BLOCK_MEDIUM_AND_ABOVE'
                }
              ]
            })
          }
        );

        if (!geminiResponse.ok) {
          const errorText = await geminiResponse.text();
          console.error(`Gemini API error: ${geminiResponse.status} - ${errorText}`);
          throw new Error(`Gemini API error: ${geminiResponse.status}`);
        }

        const geminiData = await geminiResponse.json();
        
        if (!geminiData.candidates || !geminiData.candidates[0] || !geminiData.candidates[0].content) {
          console.error('Unexpected Gemini response:', JSON.stringify(geminiData));
          throw new Error('Invalid response from Gemini API');
        }

        const analysis = geminiData.candidates[0].content.parts[0].text || 'Analiz yapılamadı';

        // Log successful request
        console.log(`AI Analysis completed for pet: ${petInfo.name} (${petInfo.species})`);

        return new Response(JSON.stringify({
          success: true,
          analysis: analysis,
          timestamp: new Date().toISOString(),
          petName: petInfo.name
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      } catch (error) {
        console.error('AI Analysis Error:', error);
        
        let userFriendlyError = 'AI analizi sırasında hata oluştu';
        if (error.message.includes('API error: 429')) {
          userFriendlyError = 'Çok fazla istek gönderildi, lütfen bekleyin';
        } else if (error.message.includes('API error: 403')) {
          userFriendlyError = 'API erişim hatası';
        } else if (error.message.includes('API error: 400')) {
          userFriendlyError = 'İstek formatında hata';
        }

        return new Response(JSON.stringify({
          success: false,
          error: userFriendlyError,
          details: error.message
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }
};
