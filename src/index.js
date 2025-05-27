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
        message: 'VetKlinik AI API çalışıyor! 🐾 (UPDATED)',
        status: 'OK',
        timestamp: new Date().toISOString(),
        version: '1.0.3'
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Main AI endpoint
    if (request.method === 'POST') {
      try {
        const body = await request.json();
        const { notes, petInfo, action } = body;

        if (!notes || !petInfo) {
          return new Response(JSON.stringify({
            error: 'Missing required fields: notes, petInfo'
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Sadece ilaç tespiti ve açıklama prompt'u
        const prompt = `Bu veteriner notlarındaki ilaç isimlerini tespit et ve her ilaç adından sonra iki nokta üst üste koyarak ne işe yaradığını yaz. Başka hiçbir cümle kurma:

${notes}`;
        
        const maxTokens = 200;

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
                maxOutputTokens: maxTokens,
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
        const actionText = action === 'summarize' ? 'Summarization' : 'Analysis';
        console.log(`AI ${actionText} completed for pet: ${petInfo.name} (${petInfo.species})`);

        return new Response(JSON.stringify({
          success: true,
          analysis: analysis,
          timestamp: new Date().toISOString(),
          petName: petInfo.name,
          action: action || 'analysis'
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      } catch (error) {
        console.error('AI Processing Error:', error);
        
        let userFriendlyError = 'AI işlemi sırasında hata oluştu';
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
