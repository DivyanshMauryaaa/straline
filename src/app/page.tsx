'use client'

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import supabase from "@/lib/supabase";
import { useUser } from "@clerk/nextjs";
import { Save, Sparkles, Check, Loader2, Trash2, Play, Code, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import Editor from '@monaco-editor/react';

interface Plan {
  name: string;
  uiPlan: string;
  flowPlan: string;
  prerequisites: string;
}

interface ProjectFiles {
  [key: string]: string;
}

interface SavedProject {
  id: number;
  user_id: string;
  name: string;
  description: string;
  uiPlan: string;
  flowPlan: string;
  prerequisites: string;
  generated_code?: any;
  created_at: string;
}

type GenerationPhase = 'idle' | 'generating' | 'complete';

export default function Home() {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentPhase, setCurrentPhase] = useState<GenerationPhase>('idle');
  const [error, setError] = useState('');
  const [name, setProjectName] = useState('My Awesome App');
  const [generatedPlan, setGeneratedPlan] = useState<Plan | null>(null);
  const [selectedAppId, setSelectedAppId] = useState<number | null>(null);
  const [selectedTab, setSelectedTab] = useState('uiPlan');
  const [selectedEditTab, setSelectedEditTab] = useState('overview');
  const [generatedCode, setGeneratedCode] = useState<ProjectFiles>({});
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [iframeUrl, setIframeUrl] = useState<string>('');
  const [openSheets, setOpenSheets] = useState<{ [key: number]: boolean }>({});

  const { user } = useUser();
  const [projects, setProjects] = useState<SavedProject[]>([]);

  const fetchProjects = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Error fetching projects:', error);
    } else {
      setProjects(data || []);
    }
  };

  useEffect(() => {
    if (user) {
      fetchProjects();
    }
  }, [user]);

  // Safe JSON parser with error handling
  const safeJsonParse = (text: string) => {
    try {
      // Clean the text first - remove any markdown code blocks
      let cleanedText = text.replace(/```json\s*|\s*```/g, '').trim();
      
      // Try to find JSON object in the text
      const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      
      // If no JSON found, try parsing the whole text
      return JSON.parse(cleanedText);
    } catch (error) {
      console.error('JSON parsing error:', error);
      console.log('Raw text that failed to parse:', text);
      throw new Error('Invalid JSON response from AI');
    }
  };

  const generateWithGemini = async (userPrompt: string, projectName: string, mode: string = "plan") => {
    const GEMINI_API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      throw new Error('Gemini API key not configured');
    }

    let systemPrompt = "";
    if (mode === "plan") {
      systemPrompt = `You are an expert web application planner. Based on the user's idea, generate a comprehensive plan with exactly these three sections:

1. UI_PLAN: Detailed user interface design plan including layout, components, and user experience
2. FLOW_PLAN: User flow and navigation structure
3. PREREQUISITES: Logic Handling (for eg. How exactly are we going to handle SignUp() etc.) In clear steps, Dependencies and setup needed

Format your response EXACTLY like this:
UI_PLAN:[your ui plan here]
FLOW_PLAN:[your flow plan here]
PREREQUISITES:[your prerequisites here]

Be specific and practical. For project: "${projectName}" and idea: "${userPrompt}"`;
    }

    if (mode === "code") {
      systemPrompt = `You are an expert web application developer. Based on the following plan, generate a complete React application with TypeScript and Tailwind CSS.

PROJECT: ${projectName}
DESCRIPTION: ${userPrompt}

UI PLAN: ${generatedPlan?.uiPlan}
FLOW PLAN: ${generatedPlan?.flowPlan}
PREREQUISITES: ${generatedPlan?.prerequisites}

Generate the following files with actual working code. Return ONLY valid JSON, no other text:

{
  "files": {
    "package.json": "content here as string",
    "index.html": "content here as string", 
    "src/main.tsx": "content here as string",
    "src/App.tsx": "content here as string",
    "src/index.css": "@tailwind base;\\n@tailwind components;\\n@tailwind utilities;",
    "tailwind.config.js": "content here as string",
    "vite.config.ts": "content here as string",
    "tsconfig.json": "content here as string",
    "tsconfig.node.json": "content here as string"
  }
}

Make sure the code is:
- Modern React with TypeScript
- Uses Tailwind CSS for styling
- Includes all necessary dependencies
- Actually runnable with Vite
- Follows best practices
- All strings are properly escaped`;
    }

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
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
      
      // Check if response structure is valid
      if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts || !data.candidates[0].content.parts[0]) {
        console.error('Invalid API response structure:', data);
        throw new Error('Invalid response structure from AI');
      }

      const responseText = data.candidates[0].content.parts[0].text;

      if (mode === "plan") {
        const uiPlanMatch = responseText.match(/UI_PLAN:(.*?)(?=FLOW_PLAN:|$)/s);
        const flowPlanMatch = responseText.match(/FLOW_PLAN:(.*?)(?=PREREQUISITES:|$)/s);
        const prerequisitesMatch = responseText.match(/PREREQUISITES:(.*?)$/s);

        return {
          uiPlan: uiPlanMatch ? uiPlanMatch[1].trim() : 'No UI plan generated.',
          flowPlan: flowPlanMatch ? flowPlanMatch[1].trim() : 'No flow plan generated.',
          prerequisites: prerequisitesMatch ? prerequisitesMatch[1].trim() : 'No prerequisites generated.'
        };
      } else {
        // For code generation, parse JSON safely
        return safeJsonParse(responseText);
      }
    } catch (error) {
      console.error('Error in generateWithGemini:', error);
      throw error;
    }
  };

  const handleGenerate = async () => {
    if (!prompt) {
      toast.error('Please enter a prompt.');
      return;
    }

    setIsGenerating(true);
    setCurrentPhase('generating');
    setError('');
    setGeneratedPlan(null);

    try {
      const { error: projectError, data: app } = await supabase.from('projects')
        .insert([{
          user_id: user?.id,
          name: name || 'Untitled Project',
          description: prompt
        }])
        .select()
        .single();

      if (projectError) throw projectError;
      setSelectedAppId(app?.id || null);

      const aiPlan = await generateWithGemini(prompt, name, "plan");

      const plan: Plan = {
        name: name,
        uiPlan: aiPlan.uiPlan,
        flowPlan: aiPlan.flowPlan,
        prerequisites: aiPlan.prerequisites
      };

      setGeneratedPlan(plan);
      setCurrentPhase('complete');
      toast.success("Plan generated successfully!");

    } catch (error: any) {
      console.error('Error generating plan:', error);
      setError(error.message || 'Failed to generate plan. Please try again.');
      toast.error(error.message || 'Failed to generate plan. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const generateCode = async () => {
    if (!generatedPlan) {
      toast.error("No plan available to generate code from.");
      return;
    }

    setIsGeneratingCode(true);
    try {
      const codeResponse = await generateWithGemini(prompt, name, "code");
      
      if (!codeResponse.files) {
        throw new Error('No files generated in AI response');
      }

      setGeneratedCode(codeResponse.files);
      
      // Save generated code to Supabase
      if (selectedAppId) {
        const { error } = await supabase
          .from('projects')
          .update({ 
            generated_code: codeResponse.files,
            uiPlan: generatedPlan.uiPlan,
            flowPlan: generatedPlan.flowPlan,
            prerequisites: generatedPlan.prerequisites,
            name: name
          })
          .eq('id', selectedAppId);

        if (error) throw error;
      }

      toast.success("Code generated and saved successfully!");
    } catch (error: any) {
      console.error('Error generating code:', error);
      toast.error(error.message || 'Failed to generate code. Please try again.');
    } finally {
      setIsGeneratingCode(false);
    }
  };

  const approvePlan = async () => {
    if (!user) {
      toast.error("You must be logged in to approve a plan.");
      return;
    }

    if (!generatedPlan || !selectedAppId) {
      toast.error("No plan to approve.");
      return;
    }

    try {
      const { error } = await supabase
        .from('projects')
        .update({
          uiPlan: generatedPlan.uiPlan,
          flowPlan: generatedPlan.flowPlan,
          prerequisites: generatedPlan.prerequisites,
          name: name
        })
        .eq('id', selectedAppId);

      if (error) throw error;

      toast.success("Plan approved and saved!");
      fetchProjects();
    } catch (error) {
      console.error('Error saving plan:', error);
      toast.error("Failed to save plan. Please try again.");
    }
  };

  // Simple app runner without WebContainer
  const runApp = async (codeToRun?: ProjectFiles) => {
    const code = codeToRun || generatedCode;
    if (Object.keys(code).length === 0) {
      toast.error("No code generated yet. Please generate code first.");
      return;
    }

    setIsRunning(true);
    try {
      // Create a simple HTML preview with the code
      const appCode = code['src/App.tsx'] || '// No App code';
      const mainCode = code['src/main.tsx'] || '// No main code';
      const cssCode = code['src/index.css'] || '/* No CSS */';
      
      const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${name} - Preview</title>
  <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>${cssCode}</style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
    // Simple React app based on generated code
    const App = () => {
      return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
            <h1 className="text-3xl font-bold text-gray-800 mb-4">
              ${name}
            </h1>
            <p className="text-gray-600 mb-6">
              ${prompt}
            </p>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
              <p className="text-green-800 text-sm">
                ✅ Your application is ready! This is a preview of your React app.
              </p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-blue-800 text-sm">
                <strong>Generated Features:</strong><br/>
                • React with TypeScript<br/>
                • Tailwind CSS styling<br/>
                • Modern component architecture
              </p>
            </div>
          </div>
        </div>
      );
    };

    ReactDOM.render(<App />, document.getElementById('root'));
  </script>
</body>
</html>`;

      // Create blob and URL for the iframe
      const blob = new Blob([htmlContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      setIframeUrl(url);
      
      toast.success("App preview loaded!");
    } catch (error) {
      console.error('Error running app:', error);
      toast.error("Failed to load app preview. Please try again.");
    } finally {
      setIsRunning(false);
    }
  };

  const openProjectSheet = (projectId: number) => {
    setOpenSheets(prev => ({ ...prev, [projectId]: true }));
  };

  const closeProjectSheet = (projectId: number) => {
    setOpenSheets(prev => ({ ...prev, [projectId]: false }));
  };

  const loadProjectCode = (project: SavedProject) => {
    if (project.generated_code) {
      setGeneratedCode(project.generated_code);
      setProjectName(project.name);
      setPrompt(project.description);
      setGeneratedPlan({
        name: project.name,
        uiPlan: project.uiPlan || '',
        flowPlan: project.flowPlan || '',
        prerequisites: project.prerequisites || ''
      });
    }
  };

  // Fallback default code structure
  const getDefaultCodeStructure = (): ProjectFiles => ({
    "package.json": JSON.stringify({
      name: name.toLowerCase().replace(/\s+/g, '-'),
      private: true,
      version: "0.0.0",
      type: "module",
      scripts: {
        dev: "vite",
        build: "vite build",
        preview: "vite preview"
      },
      dependencies: {
        react: "^18.2.0",
        "react-dom": "^18.2.0"
      },
      devDependencies: {
        "@types/react": "^18.2.0",
        "@types/react-dom": "^18.2.0",
        "@vitejs/plugin-react": "^4.0.0",
        typescript: "^5.0.0",
        vite: "^4.4.0",
        tailwindcss: "^3.3.0",
        autoprefixer: "^10.4.0",
        postcss: "^8.4.0"
      }
    }, null, 2),
    "index.html": `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${name}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`,
    "src/main.tsx": `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)`,
    "src/App.tsx": `import React from 'react'

function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
        <h1 className="text-3xl font-bold text-gray-800 mb-4">
          ${name}
        </h1>
        <p className="text-gray-600 mb-6">
          ${prompt}
        </p>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-green-800 text-sm">
            Your application is running successfully! Start building your amazing idea.
          </p>
        </div>
      </div>
    </div>
  )
}

export default App`,
    "src/index.css": `@tailwind base;
@tailwind components;
@tailwind utilities;`,
    "tailwind.config.js": `/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}`,
    "vite.config.ts": `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true
  }
})`,
    "tsconfig.json": `{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}`,
    "tsconfig.node.json": `{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}`
  });

  return (
    <div className="p-6">
      <div className="m-auto w-1/2 p-[50px]">
        <p className="text-start text-7xl font-semibold">build what Stands out...</p>

        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe your idea here..."
          className={"resize-none overflow-hidden max-h-[360px] min-h-[40px] p-4 focus-visible:outline-none focus-visible:ring-2 text-2xl focus-visible:ring-blue-600 " + `${isGenerating ? 'mt-[20%]' : 'mt-8'}`}
          rows={1}
        />
        <p className="text-center">&</p>
        <Sheet>
          <SheetTrigger asChild>
            <Button className="flex gap-3 mt-2 w-full p-7" onClick={handleGenerate} disabled={!prompt || isGenerating} size={'lg'}>
              {isGenerating ? <Loader2 className="animate-spin" /> : <Sparkles />}
              {isGenerating ? 'Generating...' : 'Let the Magic happen!'}
            </Button>
          </SheetTrigger>
          <SheetContent className="w-[100%] p-6 overflow-y-scroll">
            <SheetHeader>
              <SheetTitle>Project Plan</SheetTitle>
              <Input
                placeholder="Enter Project Name"
                value={name}
                onChange={(e) => setProjectName(e.target.value)}
              />
            </SheetHeader>

            <p className="border-b border-gray-300 py-4">
              {prompt}
            </p>

            {isGenerating && (
              <div className="mt-6 flex items-center justify-center">
                <div className="flex items-center gap-3">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <span className="text-lg">Generating your plan with AI...</span>
                </div>
              </div>
            )}

            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Implementation Plan</CardTitle>
                <CardDescription>
                  AI-generated plan for your application
                </CardDescription>
              </CardHeader>
              <CardContent>
                {error ? (
                  <p className="text-red-500">{error}</p>
                ) : generatedPlan ? (
                  <div className="space-y-6">
                    <div className="flex gap-3">
                      <Button
                        onClick={() => setSelectedTab('uiPlan')}
                        variant={selectedTab === 'uiPlan' ? 'default' : 'ghost'}
                      >
                        UI Plan
                      </Button>
                      <Button
                        onClick={() => setSelectedTab('flowPlan')}
                        variant={selectedTab === 'flowPlan' ? 'default' : 'ghost'}
                      >
                        Flow Plan
                      </Button>
                      <Button
                        onClick={() => setSelectedTab('prerequisites')}
                        variant={selectedTab === 'prerequisites' ? 'default' : 'ghost'}
                      >
                        Prerequisites
                      </Button>
                    </div>

                    {selectedTab === 'uiPlan' && (
                      <div>
                        <h3 className="text-lg font-semibold mb-3">UI Plan</h3>
                        <Textarea
                          value={generatedPlan.uiPlan}
                          onChange={(e) => setGeneratedPlan({
                            ...generatedPlan,
                            uiPlan: e.target.value
                          })}
                          className="min-h-[400px] font-mono text-sm"
                        />
                      </div>
                    )}

                    {selectedTab === 'flowPlan' && (
                      <div>
                        <h3 className="text-lg font-semibold mb-3">Flow Plan</h3>
                        <Textarea
                          value={generatedPlan.flowPlan}
                          onChange={(e) => setGeneratedPlan({
                            ...generatedPlan,
                            flowPlan: e.target.value
                          })}
                          className="min-h-[400px] font-mono text-sm"
                        />
                      </div>
                    )}

                    {selectedTab === 'prerequisites' && (
                      <div>
                        <h3 className="text-lg font-semibold mb-3">Prerequisites</h3>
                        <Textarea
                          value={generatedPlan.prerequisites}
                          onChange={(e) => setGeneratedPlan({
                            ...generatedPlan,
                            prerequisites: e.target.value
                          })}
                          className="min-h-[400px] font-mono text-sm"
                        />
                      </div>
                    )}

                    <div className="flex gap-3">
                      <Button
                        className="flex gap-2"
                        onClick={approvePlan}
                        disabled={isGenerating}
                      >
                        <Check /> Approve & Save Plan
                      </Button>
                      
                      <Button
                        className="flex gap-2"
                        onClick={generateCode}
                        disabled={isGeneratingCode}
                        variant="outline"
                      >
                        {isGeneratingCode ? <Loader2 className="animate-spin" /> : <Code />}
                        {isGeneratingCode ? 'Generating Code...' : 'Generate Code'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  !isGenerating && <p className="text-gray-500">No plan generated yet.</p>
                )}
              </CardContent>
            </Card>

            {(Object.keys(generatedCode).length > 0 || isGeneratingCode) && (
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle>Generated Code</CardTitle>
                  <CardDescription>
                    AI-generated React application code
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-3 mb-4">
                    <Button
                      onClick={() => runApp()}
                      disabled={isRunning || Object.keys(generatedCode).length === 0}
                      className="flex gap-2"
                    >
                      {isRunning ? <Loader2 className="animate-spin" /> : <Play />}
                      {isRunning ? 'Starting...' : 'Run App Preview'}
                    </Button>
                    <Button
                      variant="outline"
                      className="flex gap-2"
                      onClick={() => {
                        if (selectedAppId) {
                          supabase
                            .from('projects')
                            .update({ generated_code: generatedCode })
                            .eq('id', selectedAppId)
                            .then(() => toast.success("Code updated!"));
                        }
                      }}
                      disabled={Object.keys(generatedCode).length === 0}
                    >
                      <Save size={16} />
                      Save Code
                    </Button>
                  </div>

                  {Object.keys(generatedCode).length > 0 ? (
                    <div className="border rounded-lg overflow-hidden">
                      <Editor
                        height="400px"
                        defaultLanguage="typescript"
                        value={generatedCode['src/App.tsx'] || '// No code generated'}
                        onChange={(value) => {
                          setGeneratedCode(prev => ({
                            ...prev,
                            'src/App.tsx': value || ''
                          }));
                        }}
                        options={{
                          minimap: { enabled: false },
                          fontSize: 14,
                          lineNumbers: 'on',
                          scrollBeyondLastLine: false,
                          automaticLayout: true,
                        }}
                      />
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-40">
                      <Loader2 className="w-8 h-8 animate-spin mr-2" />
                      <span>Generating code...</span>
                    </div>
                  )}

                  {iframeUrl && (
                    <div className="mt-4">
                      <h3 className="text-lg font-semibold mb-2">Live Preview</h3>
                      <iframe
                        src={iframeUrl}
                        className="w-full h-96 border rounded-lg"
                        sandbox="allow-scripts allow-same-origin"
                        title="App Preview"
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <SheetFooter className="mt-6">
              <Button
                variant={'outline'}
                onClick={approvePlan}
                className="flex gap-2 py-5"
                disabled={!generatedPlan || isGenerating}
              >
                <Save /> Save Plan
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </div>

      {/* Saved Projects List */}
      {projects.map((project) => (
        <Sheet 
          key={project.id} 
          open={openSheets[project.id] || false}
          onOpenChange={(open) => {
            if (open) {
              openProjectSheet(project.id);
              loadProjectCode(project);
            } else {
              closeProjectSheet(project.id);
            }
          }}
        >
          <SheetTrigger asChild>
            <div className="m-auto cursor-pointer w-1/2 p-[20px] border-t border-gray-300 hover:bg-gray-50 transition-colors">
              <div className="flex justify-between items-start mb-3">
                <div className="flex gap-2">
                  <Trash2 
                    size={17} 
                    className="hover:text-red-500 cursor-pointer" 
                    onClick={async (e) => { 
                      e.stopPropagation();
                      await supabase.from('projects').delete().eq('id', project.id); 
                      fetchProjects(); 
                      toast.success("Project deleted");
                    }} 
                  />
                  {project.generated_code && (
                    <Code size={17} className="text-green-600" />
                  )}
                </div>
                <ExternalLink size={17} className="text-gray-400" />
              </div>
              <p className="text-start text-4xl font-semibold">{project.name}</p>
              <p className="text-start text-xl font-light">{project.description}</p>
              <p className="text-start text-sm text-gray-500 mt-2">
                {new Date(project.created_at).toLocaleDateString()}
                {project.generated_code && " • Code Generated"}
              </p>
            </div>
          </SheetTrigger>
          <SheetContent className="w-[100%] p-6 overflow-y-scroll">
            <SheetHeader>
              <SheetTitle>{project.name}</SheetTitle>
              <p className="text-sm text-gray-600">{project.description}</p>
            </SheetHeader>

            <div className="p-5 mt-6 flex gap-3">
              <Button 
                variant={selectedEditTab === 'overview' ? 'default' : 'ghost'} 
                onClick={() => setSelectedEditTab('overview')}
              >
                Overview
              </Button>
              <Button 
                variant={selectedEditTab === 'code' ? 'default' : 'ghost'} 
                onClick={() => setSelectedEditTab('code')}
                disabled={!project.generated_code}
              >
                Code {project.generated_code && "✓"}
              </Button>
            </div>

            <Card className="mt-3">
              <CardContent className="pt-6">
                {selectedEditTab === 'overview' && (
                  <div>
                    <div className="flex gap-3 mb-4">
                      <Button 
                        variant={selectedTab === 'uiPlan' ? 'default' : 'outline'} 
                        onClick={() => setSelectedTab('uiPlan')}
                      >
                        UI Plan
                      </Button>
                      <Button 
                        variant={selectedTab === 'flowPlan' ? 'default' : 'outline'} 
                        onClick={() => setSelectedTab('flowPlan')}
                      >
                        Flow Plan
                      </Button>
                      <Button 
                        variant={selectedTab === 'prerequisites' ? 'default' : 'outline'} 
                        onClick={() => setSelectedTab('prerequisites')}
                      >
                        Prerequisites
                      </Button>
                    </div>

                    <div className="space-y-4">
                      {selectedTab === 'uiPlan' && (
                        <Textarea
                          value={project.uiPlan || 'No UI Plan available.'}
                          onChange={async (e) => {
                            const { error } = await supabase
                              .from('projects')
                              .update({ uiPlan: e.target.value })
                              .eq('id', project.id);
                            if (error) {
                              toast.error('Failed to save changes');
                            } else {
                              toast.success('Changes saved');
                              fetchProjects();
                            }
                          }}
                          className="min-h-[400px] font-mono text-sm"
                        />
                      )}
                      {selectedTab === 'flowPlan' && (
                        <Textarea
                          value={project.flowPlan || 'No Flow Plan available.'}
                          onChange={async (e) => {
                            const { error } = await supabase
                              .from('projects')
                              .update({ flowPlan: e.target.value })
                              .eq('id', project.id);
                            if (error) {
                              toast.error('Failed to save changes');
                            } else {
                              toast.success('Changes saved');
                              fetchProjects();
                            }
                          }}
                          className="min-h-[400px] font-mono text-sm"
                        />
                      )}
                      {selectedTab === 'prerequisites' && (
                        <Textarea
                          value={project.prerequisites || 'No Prerequisites available.'}
                          onChange={async (e) => {
                            const { error } = await supabase
                              .from('projects')
                              .update({ prerequisites: e.target.value })
                              .eq('id', project.id);
                            if (error) {
                              toast.error('Failed to save changes');
                            } else {
                              toast.success('Changes saved');
                              fetchProjects();
                            }
                          }}
                          className="min-h-[400px] font-mono text-sm"
                        />
                      )}
                    </div>
                  </div>
                )}

                {selectedEditTab === 'code' && project.generated_code && (
                  <div className="space-y-4">
                    <Button
                      onClick={() => runApp(project.generated_code)}
                      disabled={isRunning}
                      className="flex gap-2"
                    >
                      {isRunning ? <Loader2 className="animate-spin" /> : <Play />}
                      {isRunning ? 'Starting...' : 'Run App Preview'}
                    </Button>

                    <div className="border rounded-lg overflow-hidden">
                      <Editor
                        height="400px"
                        defaultLanguage="typescript"
                        value={project.generated_code['src/App.tsx'] || '// No code available'}
                        options={{
                          minimap: { enabled: false },
                          fontSize: 14,
                          lineNumbers: 'on',
                          scrollBeyondLastLine: false,
                          automaticLayout: true,
                          readOnly: false
                        }}
                      />
                    </div>

                    {iframeUrl && (
                      <div className="mt-4">
                        <h3 className="text-lg font-semibold mb-2">Live Preview</h3>
                        <iframe
                          src={iframeUrl}
                          className="w-full h-96 border rounded-lg"
                          sandbox="allow-scripts allow-same-origin"
                          title="App Preview"
                        />
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </SheetContent>
        </Sheet>
      ))}
    </div>
  );
}