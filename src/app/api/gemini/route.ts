// app/api/gemini/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { prompt, model = 'deepseek-reasoner' } = await request.json();

    if (!process.env.AIML_API_KEY) {
      return NextResponse.json(
        { error: 'AIMLAPI key not configured' },
        { status: 500 }
      );
    }

    const response = await fetch(
      'https://api.aimlapi.com/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.AIML_API_KEY}`,
        },
        body: JSON.stringify({
          model: model,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7,
          top_p: 0.95,
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error('AIMLAPI error:', errorData);
      return NextResponse.json(
        { error: `AIMLAPI error: ${response.status} ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    if (!data.choices?.[0]?.message?.content) {
      throw new Error('Invalid response format from AIMLAPI');
    }

    const responseText = data.choices[0].message.content;
    return NextResponse.json({ response: responseText });

  } catch (error) {
    console.error('AIMLAPI error:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}