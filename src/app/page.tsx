'use client'

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import supabase from "@/lib/supabase";
import { useUser } from "@clerk/nextjs";
import { Save, Sparkles, Check, Loader2, Play, Code, FileText, X, PlayCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

// Initial file structure matching the project page
const initialFiles: { [key: string]: string } = {
  'src/App.tsx': `import React from 'react';

function App() {
  return (
    <div className="min-h-screen p-8">
      <h1 className="text-4xl font-bold mb-4">Hello VibeCoding!</h1>
      <p>Start coding with AI assistance</p>
    </div>
  );
}

export default App;`,
  'src/index.css': `@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen';
}`,
  'package.json': `{
  "name": "vibecoding-project",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.0.0",
    "vite": "^4.4.0"
  }
}`,
  'index.html': `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>VibeCoding Project</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`,
  'vite.config.js': `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173
  }
})`,
  'src/main.tsx': `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)`
};

interface AIPlan {
  instructions: string;
  files_to_modify: string[];
  summary: string;
}

export default function Home() {
  const [showProjects, setShowProjects] = useState(false);
  const [magicSheet, setMagicSheet] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [newAppName, setNewAppName] = useState('');
  const { user } = useUser();

  const [phase, setPhase] = useState('planning'); // planning, coding, completed
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [showPlans, setShowPlans] = useState(true);

  const [generatedPlan, setGeneratedPlan] = useState<AIPlan | null>(null);
  const [editableInstructions, setEditableInstructions] = useState('');
  const [showPlanApproval, setShowPlanApproval] = useState(false);

  const [generatedCode, setGeneratedCode] = useState(initialFiles);
  const [projects, setProjects] = useState<any[]>([]);

  const fetchProjects = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching projects:', error);
      return;
    }
    setProjects(data || []);
  }

  useEffect(() => {
    if (user) {
      fetchProjects();
    }
  }, [user]);

  const handleGenerate = () => {
    if (!newAppName) {
      setFormError('Project name is required');
      return;
    }
    if (!prompt) {
      setFormError('Project description is required');
      return;
    }
    setFormError('');
    setIsLoading(true);
    setPhase('planning');
    setShowPlans(true);

    plan(newAppName, prompt);
  }

  const plan = async (projectName: string, userPrompt: string) => {
    const systemPrompt = `You are an expert UX/UI designer and product architect. Your job is to understand the user's request and provide EXTREMELY SPECIFIC implementation instructions WITHOUT deciding which files to modify.

USER REQUEST: ${userPrompt}
PROJECT NAME: ${projectName}

Your job is to be PRECISE about WHAT needs to change, not WHERE:

# PRECISE IMPLEMENTATION INSTRUCTIONS

## WHAT THE USER WANTS
[Interpret the user's request clearly and specifically]

## SPECIFIC CHANGES REQUIRED

### Visual/UI Changes:
- If they say "colorful button" → specify EXACTLY: "Make the button background color #3B82F6 (blue), text white, with rounded corners (8px radius)"
- If they say "bigger text" → specify: "Increase font size to 24px for headings, 16px for body text"
- If they say "nice layout" → specify: "Use a centered flex container with 32px gap between elements, max-width 800px"
- BE SPECIFIC about colors (use hex codes), sizes (use px/rem), spacing (exact values)

### Functional Changes:
- If they want a feature → describe EXACTLY what it should do step by step
- If they want interactivity → specify the exact behavior: "When button is clicked, show a message 'Success!' in green text below the button"
- If they want data handling → specify exact data structure and flow

### Content Changes:
- If they mention text changes → provide the EXACT text to use
- If they want images/icons → specify what should be displayed and how

### Styling Details:
- Colors: Use exact hex codes (e.g., #3B82F6, not "blue")
- Spacing: Use exact values (e.g., "24px padding", not "good spacing")
- Sizes: Use exact measurements (e.g., "48px height", not "tall button")
- Typography: Specify font sizes, weights, and families exactly

## IMPLEMENTATION REQUIREMENTS
- List any specific interactions or behaviors
- Specify animation/transition details if relevant (e.g., "0.3s ease-in-out transition")
- Describe responsive behavior if needed

CRITICAL RULES:
1. DO NOT mention file names or file paths
2. DO NOT write actual code
3. BE EXTREMELY SPECIFIC - no vague terms like "nice", "good", "better"
4. Replace ALL vague requests with precise specifications
5. Think like a designer giving pixel-perfect specifications to a developer
6. If the user's request is vague, YOU make the specific design decisions for them

Example Transformations:
❌ "Make the button colorful" 
✅ "Make the button background color #10B981 (emerald green), text color white (#FFFFFF), with a hover state that darkens to #059669"

❌ "Add some spacing"
✅ "Add 24px of padding inside the container and 16px margin between each element"

❌ "Make it look modern"
✅ "Use a clean design with: rounded corners (12px), subtle shadows (0 4px 6px rgba(0,0,0,0.1)), sans-serif font (Inter or system default), and a white (#FFFFFF) background with light gray (#F3F4F6) sections"

Return ONLY the precise instructions. Be the design decision maker.`;

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_GEMINI_API_URL}?key=${process.env.NEXT_PUBLIC_GEMINI_API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: systemPrompt
            }]
          }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 8000,
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.statusText}`);
      }

      const data = await response.json();
      const responseText = data.candidates[0].content.parts[0].text;

      // Don't extract files - just store the instructions
      setGeneratedPlan({
        instructions: responseText,
        files_to_modify: [], // Empty since planner doesn't decide files
        summary: 'Precise implementation instructions generated'
      });
      setEditableInstructions(responseText);
      setShowPlanApproval(true);
      setIsLoading(false);
      toast.success('Plan generated successfully!');

    } catch (error) {
      console.error('Error generating plan:', error);
      toast.error(`${error}`);
      setIsLoading(false);
      throw error;
    }
  }

  const code = async () => {
    setShowPlans(false);
    setShowPlanApproval(false);
    setIsLoading(true);
    setPhase('coding');

    const executionPrompt = `You are a precise code implementation AI. You will receive SPECIFIC design and functionality instructions. Your job is to implement them EXACTLY as described.

PRECISE INSTRUCTIONS:
${editableInstructions}

CURRENT CODEBASE:
${Object.entries(initialFiles).map(([path, content]) => `=== ${path} ===\n${content}\n`).join('\n')}

YOUR JOB:
1. Read the precise instructions carefully
2. Decide which files need to be modified to implement these instructions
3. Implement the changes EXACTLY as specified in the instructions
4. If instructions say "button background #3B82F6", use EXACTLY that color
5. If instructions say "24px padding", use EXACTLY that value
6. Follow every specification to the pixel

CRITICAL REACT RULES:
- ALWAYS use proper React component syntax
- Export components as: export default App (NOT export default App())
- Use functional components: function App() { return (...) }
- NEVER call the component as App() in exports
- Use proper JSX syntax with className for CSS classes
- Import React hooks if needed: import { useState, useEffect } from 'react'

CRITICAL IMPLEMENTATION RULES:
- YOU decide which files to modify based on what the instructions require
- Implement ALL specifications exactly as written (colors, sizes, spacing, etc.)
- Don't add features not mentioned in the instructions
- Don't make design decisions - the instructions already have all design decisions
- Return complete file contents for modified files only

CORRECT COMPONENT EXPORT:
✅ CORRECT:
function App() {
  return <div>Hello</div>;
}
export default App;

❌ WRONG:
export default App();

Return ONLY valid JSON in this exact format:

{
  "updated_files": {
    "src/App.tsx": "complete file content with changes",
    "src/index.css": "complete file content with changes"
  },
  "execution_summary": "Brief description of which files were modified and why"
}

Return ONLY the JSON, no other text.`;

    try {
      const codeResponse = await fetch(`${process.env.NEXT_PUBLIC_GEMINI_API_URL}?key=${process.env.NEXT_PUBLIC_GEMINI_API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: executionPrompt
            }]
          }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 8000,
          }
        })
      });

      if (!codeResponse.ok) {
        throw new Error(`Code generation error: ${codeResponse.statusText}`);
      }

      const codeData = await codeResponse.json();
      const codeText = codeData.candidates[0].content.parts[0].text;

      const jsonMatch = codeText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        setGeneratedCode({
          ...initialFiles,
          ...result.updated_files
        });
      }

      setPhase('completed');
      setIsLoading(false);
      toast.success('Code generated successfully!');
    } catch (error) {
      console.error('Error generating code:', error);
      toast.error('Error generating code');
      setIsLoading(false);
    }
  }

  const handleRejectPlan = () => {
    setShowPlanApproval(false);
    setGeneratedPlan(null);
    setEditableInstructions('');
    toast.info('Plan rejected. Feel free to try again.');
  };

  const getPreviewHTML = () => {
    const appCode = generatedCode['src/App.tsx'];
    const cssCode = generatedCode['src/index.css'];

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${newAppName}</title>
  <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    ${cssCode.replace(/@tailwind base;?\n?/g, '')
        .replace(/@tailwind components;?\n?/g, '')
        .replace(/@tailwind utilities;?\n?/g, '')}
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
    window.React = React;
    window.ReactDOM = ReactDOM;
    
    ${appCode.replace(/import.*?from.*?;/g, '')
        .replace(/export default App;?/g, '')}
    
    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(React.createElement(App));
  </script>
</body>
</html>
    `;
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="max-w-4xl mx-auto px-6 pt-20 pb-12">
        <div className={`transition-all duration-500 ${showProjects ? 'mb-8' : 'mb-16'}`}>
          <h1 className="text-6xl font-bold mb-6 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
            Build something <span className="font-black">Perfect</span>
          </h1>
          <div className="space-y-4">
            <Textarea
              placeholder="Describe your app idea and generate a plan and code with AI..."
              className="min-h-[120px] resize-none text-base border-2 focus:border-primary transition-colors"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
            <Button
              size="lg"
              className="w-full h-14 text-base font-medium gap-3 shadow-lg hover:shadow-xl transition-all"
              onClick={() => setMagicSheet(true)}
            >
              <Sparkles className="w-5 h-5" />
              {isLoading ? (
                phase === 'planning' ? 'Planning...' :
                  phase === 'coding' ? 'Coding...' : 'Completed!'
              ) : `Show magic to ${user?.firstName}`}
            </Button>
          </div>
        </div>

        {/* Projects Toggle */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-semibold">Your Projects</h2>
          <Button
            variant="outline"
            onClick={() => setShowProjects(!showProjects)}
            className="gap-2"
          >
            {showProjects ? 'Hide' : 'Show'} Projects
          </Button>
        </div>

        {/* Projects Grid */}
        {showProjects && (
          <div className="grid gap-4 sm:grid-cols-2">
            {projects.length === 0 ? (
              <div className="col-span-2 text-center py-16 border-2 border-dashed rounded-xl">
                <div className="inline-block p-4 rounded-full bg-muted mb-4">
                  <Code className="w-8 h-8 opacity-50" />
                </div>
                <p className="text-lg font-medium mb-2">No projects yet</p>
                <p className="text-sm text-muted-foreground">Create your first project to get started</p>
              </div>
            ) : (
              projects.map((proj: any) => (
                <Link href={`/projects/${proj.id}`} key={proj.id} className="group">
                  <Card className="h-full transition-all hover:shadow-lg hover:scale-[1.02] cursor-pointer border-2 hover:border-primary/50">
                    <CardHeader>
                      <CardTitle className="text-xl group-hover:text-primary transition-colors">
                        {proj.name}
                      </CardTitle>
                      <CardDescription className="line-clamp-2">
                        {proj.description}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              ))
            )}
          </div>
        )}
      </div>

      {/* Creation Sheet */}
      <Sheet open={magicSheet} onOpenChange={setMagicSheet}>
        <SheetContent className="overflow-hidden p-0 sm:max-w-[900px] flex flex-col">
          <SheetHeader className="p-6 border-b">
            <SheetTitle className="text-3xl font-bold">Create your project</SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-6">
            <div className="space-y-6">
              {phase === 'planning' && showPlans && (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Project Name</label>
                    <Input
                      placeholder="My Awesome App"
                      value={newAppName}
                      onChange={(e) => setNewAppName(e.target.value)}
                      className="h-12"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Project Description</label>
                    <Textarea
                      placeholder="Describe your app idea and generate a plan and code with AI..."
                      className="min-h-[120px] resize-none"
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                    />
                  </div>
                  <Button
                    size="lg"
                    className="w-full h-14 gap-3"
                    onClick={handleGenerate}
                    disabled={isLoading}
                  >
                    <Sparkles className="w-5 h-5" />
                    Generate Plan & Code
                  </Button>
                </div>
              )}

              {formError && (
                <div className="p-4 border-l-4 border-destructive bg-destructive/10 rounded">
                  <p className="text-sm text-destructive font-medium">{formError}</p>
                </div>
              )}

              {isLoading && phase === 'planning' && (
                <div className="flex items-center gap-3 p-4 border rounded-lg bg-muted/50">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <p className="font-medium">Generating plan...</p>
                </div>
              )}

              {isLoading && phase === 'coding' && (
                <div className="flex items-center gap-3 p-4 border rounded-lg bg-muted/50">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <p className="font-medium">Generating code...</p>
                </div>
              )}

              {!showPlans && phase !== 'planning' && (
                <Card className="border-2">
                  <Tabs defaultValue="code" className="w-full">
                    <TabsList className="grid w-full grid-cols-2 h-12">
                      <TabsTrigger value="code" className="gap-2">
                        <Code className="w-4 h-4" />
                        Code
                      </TabsTrigger>
                      <TabsTrigger value="preview" className="gap-2">
                        <Play className="w-4 h-4" />
                        Preview
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="code" className="mt-0">
                      <CardHeader>
                        <CardTitle>Generated Code</CardTitle>
                        <CardDescription>View and edit your generated files</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Tabs defaultValue="app" className="w-full">
                          <TabsList className="grid w-full grid-cols-3">
                            <TabsTrigger value="app">App.tsx</TabsTrigger>
                            <TabsTrigger value="css">index.css</TabsTrigger>
                            <TabsTrigger value="config">Config</TabsTrigger>
                          </TabsList>
                          <TabsContent value="app">
                            <Textarea
                              value={generatedCode['src/App.tsx']}
                              onChange={(e) => setGeneratedCode({ ...generatedCode, 'src/App.tsx': e.target.value })}
                              className="font-mono text-sm resize-none h-[500px]"
                            />
                          </TabsContent>
                          <TabsContent value="css">
                            <Textarea
                              value={generatedCode['src/index.css']}
                              onChange={(e) => setGeneratedCode({ ...generatedCode, 'src/index.css': e.target.value })}
                              className="font-mono text-sm resize-none h-[500px]"
                            />
                          </TabsContent>
                          <TabsContent value="config">
                            <Textarea
                              value={generatedCode['package.json']}
                              readOnly
                              className="font-mono text-sm resize-none h-[500px] opacity-75"
                            />
                          </TabsContent>
                        </Tabs>
                      </CardContent>
                    </TabsContent>

                    <TabsContent value="preview" className="mt-0">
                      <CardHeader>
                        <CardTitle>Live Preview</CardTitle>
                        <CardDescription>Preview your generated application</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="border-2 rounded-lg overflow-hidden bg-white">
                          <iframe
                            srcDoc={getPreviewHTML()}
                            className="w-full h-[500px]"
                            title="App Preview"
                            sandbox="allow-scripts"
                          />
                        </div>
                      </CardContent>
                    </TabsContent>
                  </Tabs>
                </Card>
              )}

              {phase === 'completed' && (
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1 h-12"
                    onClick={() => {
                      setPhase('planning');
                      setShowPlans(true);
                      setGeneratedCode(initialFiles);
                      setGeneratedPlan(null);
                      setEditableInstructions('');
                      setNewAppName('');
                      setPrompt('');
                    }}
                  >
                    <Sparkles className="mr-2" />
                    New Project
                  </Button>
                  <Button
                    className="flex-1 h-12"
                    onClick={async () => {
                      if (!user) {
                        toast.error('You must be logged in to save a project');
                        return;
                      }
                      if (!newAppName || !prompt) {
                        toast.error('Missing project data');
                        return;
                      }
                      const { error } = await supabase.from('projects').insert([{
                        user_id: user.id,
                        name: newAppName,
                        description: prompt,
                        code: generatedCode
                      }]);
                      if (error) {
                        console.error('Error saving project:', error);
                        toast.error('Error saving project');
                      } else {
                        toast.success('Project saved successfully!');
                        await fetchProjects();
                        setMagicSheet(false);
                      }
                    }}
                  >
                    <Save className="mr-2" />
                    Save Project
                  </Button>
                </div>
              )}
            </div>
          </div>

          <SheetFooter className="p-6 border-t bg-muted/30">
            <p className="text-xs text-muted-foreground">
              By using this feature, you agree to our Terms of Service and Privacy Policy.
            </p>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Plan Approval Modal */}
      {showPlanApproval && generatedPlan && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center p-6 z-50">
          <div className="border-2 rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col bg-background">
            <div className="flex items-center justify-between p-6 border-b bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <FileText className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-bold text-xl">Review Implementation Instructions</h3>
                  <p className="text-sm text-muted-foreground">Edit the instructions below, then approve to execute</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRejectPlan}
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-6">
                <div>
                  <label className="text-sm font-semibold mb-3 block">
                    Implementation Instructions (Edit as needed)
                  </label>
                  <Textarea
                    value={editableInstructions}
                    onChange={(e) => setEditableInstructions(e.target.value)}
                    className="min-h-[500px] font-mono text-sm leading-relaxed border-2"
                    placeholder="Implementation instructions will appear here..."
                  />
                </div>

                {generatedPlan.files_to_modify.length > 0 && (
                  <div className="border-2 rounded-lg p-4 bg-muted/50">
                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      Note: The AI will decide which files to modify based on these instructions
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      You've provided precise specifications. The executor will determine the best files to modify to implement these changes.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 p-6 border-t bg-muted/30">
              <Button
                onClick={handleRejectPlan}
                variant="outline"
                className="flex-1 h-12"
              >
                Cancel
              </Button>
              <Button
                onClick={code}
                className="flex-1 h-12 gap-2"
              >
                <PlayCircle className="w-4 h-4" />
                Execute Instructions
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}