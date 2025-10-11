'use client'

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import supabase from "@/lib/supabase";
import { useUser } from "@clerk/nextjs";
import { Save, Sparkles, Check, Loader2, Play, Code, FileText, X, PlayCircle, FolderOpen, Eye } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useCallback, useMemo } from "react";
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

type ProjectPhase = 'planning' | 'coding' | 'completed';

interface ProjectState {
  phase: ProjectPhase;
  isLoading: boolean;
  showPlans: boolean;
  generatedPlan: AIPlan | null;
  editableInstructions: string;
  showPlanApproval: boolean;
  generatedCode: { [key: string]: string };
}

const INITIAL_PROJECT_STATE: ProjectState = {
  phase: 'planning',
  isLoading: false,
  showPlans: true,
  generatedPlan: null,
  editableInstructions: '',
  showPlanApproval: false,
  generatedCode: initialFiles
};

export default function Home() {
  const [showProjects, setShowProjects] = useState(false);
  const [magicSheet, setMagicSheet] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [newAppName, setNewAppName] = useState('');
  const [formError, setFormError] = useState('');
  const [projects, setProjects] = useState<any[]>([]);
  
  const [projectState, setProjectState] = useState<ProjectState>(INITIAL_PROJECT_STATE);
  const { user } = useUser();

  // Memoized project state values
  const { 
    phase, isLoading, showPlans, generatedPlan, 
    editableInstructions, showPlanApproval, generatedCode 
  } = projectState;

  // Fetch projects with useCallback to prevent unnecessary re-renders
  const fetchProjects = useCallback(async () => {
    if (!user) return;
    
    try {
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
    } catch (error) {
      console.error('Error in fetchProjects:', error);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchProjects();
    }
  }, [user, fetchProjects]);

  // Reset project state
  const resetProjectState = useCallback(() => {
    setProjectState(INITIAL_PROJECT_STATE);
    setNewAppName('');
    setPrompt('');
    setFormError('');
  }, []);

  // Validate form inputs
  const validateForm = useCallback(() => {
    if (!newAppName.trim()) {
      setFormError('Project name is required');
      return false;
    }
    if (!prompt.trim()) {
      setFormError('Project description is required');
      return false;
    }
    setFormError('');
    return true;
  }, [newAppName, prompt]);

  // Generate AI plan
  const plan = useCallback(async (projectName: string, userPrompt: string) => {
    const systemPrompt = `You are an expert UX/UI designer and product architect. Your job is to understand the user's request and provide EXTREMELY SPECIFIC implementation instructions.

USER REQUEST: ${userPrompt}
PROJECT NAME: ${projectName}

# PRECISE IMPLEMENTATION INSTRUCTIONS

## WHAT THE USER WANTS
[Interpret the user's request clearly and specifically]

## SPECIFIC CHANGES REQUIRED

### Visual/UI Changes:
- Be specific about colors (use hex codes), sizes (use px/rem), spacing (exact values)
- Example: "Make the button background color #3B82F6, text white, with 8px border-radius"

### Functional Changes:
- Describe exactly what should happen step by step
- Example: "When button is clicked, show a success message in green text"

### Content Changes:
- Provide exact text to use
- Specify images/icons and their placement

### Styling Details:
- Colors: Use exact hex codes (e.g., #3B82F6)
- Spacing: Use exact values (e.g., "24px padding")
- Sizes: Use exact measurements (e.g., "48px height")

CRITICAL RULES:
1. DO NOT mention file names or file paths
2. DO NOT write actual code
3. BE EXTREMELY SPECIFIC - no vague terms
4. Replace ALL vague requests with precise specifications

Return ONLY the precise instructions.`;

    try {
      const response = await fetch('/api/generate-plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectName,
          userPrompt,
          systemPrompt
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }

      const data = await response.json();

      setProjectState(prev => ({
        ...prev,
        generatedPlan: {
          instructions: data.instructions,
          files_to_modify: [],
          summary: 'Precise implementation instructions generated'
        },
        editableInstructions: data.instructions,
        showPlanApproval: true,
        isLoading: false
      }));

      toast.success('Plan generated successfully!');

    } catch (error) {
      console.error('Error generating plan:', error);
      toast.error('Failed to generate plan');
      setProjectState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  // Handle generate button click
  const handleGenerate = useCallback(() => {
    if (!validateForm()) return;

    setProjectState(prev => ({
      ...prev,
      isLoading: true,
      phase: 'planning',
      showPlans: true
    }));

    plan(newAppName, prompt);
  }, [newAppName, prompt, validateForm, plan]);

  // Generate code from instructions
  const code = useCallback(async () => {
    setProjectState(prev => ({
      ...prev,
      showPlans: false,
      showPlanApproval: false,
      isLoading: true,
      phase: 'coding'
    }));

    const executionPrompt = `You are a precise code implementation AI. Implement these instructions EXACTLY:

PRECISE INSTRUCTIONS:
${editableInstructions}

CURRENT CODEBASE:
${Object.entries(initialFiles).map(([path, content]) => `=== ${path} ===\n${content}\n`).join('\n')}

CRITICAL REACT RULES:
- Use functional components: function App() { return (...) }
- Export components as: export default App
- Use proper JSX syntax with className
- Import React hooks if needed

Return ONLY valid JSON in this exact format:
{
  "updated_files": {
    "src/App.tsx": "complete file content with changes",
    "src/index.css": "complete file content with changes"
  },
  "execution_summary": "Brief description of changes"
}`;

    try {
      const response = await fetch('/api/generate-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          instructions: editableInstructions,
          currentFiles: initialFiles,
          executionPrompt
        }),
      });

      if (!response.ok) {
        throw new Error(`Code generation error: ${response.statusText}`);
      }

      const data = await response.json();

      setProjectState(prev => ({
        ...prev,
        generatedCode: {
          ...initialFiles,
          ...data.updated_files
        },
        phase: 'completed',
        isLoading: false
      }));

      toast.success('Code generated successfully!');
    } catch (error) {
      console.error('Error generating code:', error);
      toast.error('Error generating code');
      setProjectState(prev => ({ ...prev, isLoading: false }));
    }
  }, [editableInstructions]);

  // Handle plan rejection
  const handleRejectPlan = useCallback(() => {
    setProjectState(prev => ({
      ...prev,
      showPlanApproval: false,
      generatedPlan: null,
      editableInstructions: ''
    }));
    toast.info('Plan rejected. Feel free to try again.');
  }, []);

  // Save project to database
  const handleSaveProject = useCallback(async () => {
    if (!user) {
      toast.error('You must be logged in to save a project');
      return;
    }
    if (!newAppName || !prompt) {
      toast.error('Missing project data');
      return;
    }

    try {
      const { error } = await supabase.from('projects').insert([{
        user_id: user.id,
        name: newAppName,
        description: prompt,
        code: generatedCode
      }]);

      if (error) throw error;

      toast.success('Project saved successfully!');
      await fetchProjects();
      setMagicSheet(false);
      resetProjectState();
    } catch (error) {
      console.error('Error saving project:', error);
      toast.error('Error saving project');
    }
  }, [user, newAppName, prompt, generatedCode, fetchProjects, resetProjectState]);

  // Memoized preview HTML
  const previewHTML = useMemo(() => {
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
  }, [generatedCode, newAppName]);

  // File tabs configuration
  const fileTabs = useMemo(() => [
    { value: 'app', label: 'App.tsx', content: generatedCode['src/App.tsx'] },
    { value: 'css', label: 'index.css', content: generatedCode['src/index.css'] },
    { value: 'config', label: 'Config', content: generatedCode['package.json'] }
  ], [generatedCode]);

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
            <FolderOpen className="w-4 h-4" />
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

              {isLoading && (
                <div className="flex items-center gap-3 p-4 border rounded-lg bg-muted/50">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <p className="font-medium">
                    {phase === 'planning' ? 'Generating plan...' : 'Generating code...'}
                  </p>
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
                        <Eye className="w-4 h-4" />
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
                            {fileTabs.map(tab => (
                              <TabsTrigger key={tab.value} value={tab.value}>
                                {tab.label}
                              </TabsTrigger>
                            ))}
                          </TabsList>
                          {fileTabs.map(tab => (
                            <TabsContent key={tab.value} value={tab.value}>
                              <Textarea
                                value={tab.content}
                                onChange={(e) => setProjectState(prev => ({
                                  ...prev,
                                  generatedCode: {
                                    ...prev.generatedCode,
                                    [tab.value === 'app' ? 'src/App.tsx' : 
                                     tab.value === 'css' ? 'src/index.css' : 'package.json']: e.target.value
                                  }
                                }))}
                                className="font-mono text-sm resize-none h-[500px]"
                                readOnly={tab.value === 'config'}
                              />
                            </TabsContent>
                          ))}
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
                            srcDoc={previewHTML}
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
                    onClick={resetProjectState}
                  >
                    <Sparkles className="mr-2" />
                    New Project
                  </Button>
                  <Button
                    className="flex-1 h-12"
                    onClick={handleSaveProject}
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
                    onChange={(e) => setProjectState(prev => ({
                      ...prev,
                      editableInstructions: e.target.value
                    }))}
                    className="min-h-[500px] font-mono text-sm leading-relaxed border-2"
                    placeholder="Implementation instructions will appear here..."
                  />
                </div>

                <div className="border-2 rounded-lg p-4 bg-muted/50">
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Note: The AI will decide which files to modify based on these instructions
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    You've provided precise specifications. The executor will determine the best files to modify to implement these changes.
                  </p>
                </div>
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