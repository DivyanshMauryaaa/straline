'use client';

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import supabase from "@/lib/supabase";
import { useUser } from "@clerk/nextjs";
import { SendHorizonal, FileCode, FolderTree, Play, Loader2, FileText, Folder, ChevronRight, ChevronDown, Code2, MessageSquare, X, PlayCircle, Square, Eye, Code, RefreshCw, Download } from "lucide-react";
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { useParams } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";

// Mock file system for demo
const initialFiles: { [key: string]: string } = {
    'src/App.tsx': `import React from 'react';

function App() {
  return (
    <div className="min-h-screen p-8">
      <h1 className="text-4xl font-bold mb-4">Hello {user?.firstName}</h1>
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

// Types
interface AIPlan {
    instructions: string;
    summary: string;
}

const Page = () => {
    const { projectId } = useParams();
    const [project, setProject] = useState<any>(null);
    const [prompt, setPrompt] = useState<string>('');
    const [promptWords, setPromptWords] = useState<number>(0);
    const [messages, setMessages] = useState<any[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [files, setFiles] = useState(initialFiles);
    const [selectedFile, setSelectedFile] = useState('src/App.tsx');
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['src']));
    const [currentAction, setCurrentAction] = useState<string | null>(null);
    const [generatedPlan, setGeneratedPlan] = useState<AIPlan | null>(null);
    const [showPlanApproval, setShowPlanApproval] = useState(false);
    const [isExecuting, setIsExecuting] = useState(false);
    const [isPreviewRunning, setIsPreviewRunning] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'preview' | 'code'>('code');
    const [editableInstructions, setEditableInstructions] = useState<string>('');
    const [previewKey, setPreviewKey] = useState<number>(0);
    const chatEndRef = useRef<HTMLDivElement>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);

    const { user } = useUser();

    const updateProjectCode = async (projectId: string, files: typeof initialFiles) => {
        try {
            const { error } = await supabase
                .from('projects')
                .update({
                    code: files,
                    updated_at: new Date().toISOString()
                })
                .eq('id', projectId);

            if (error) {
                console.error('Error updating project code:', error);
                toast.error('Failed to save project');
            } else {
                console.log('Project code updated successfully');
            }
        } catch (error) {
            console.error('Error updating project:', error);
        }
    };

    const initialVerification = async () => {
        const { data, error } = await supabase.from('projects')
            .select('*')
            .eq('id', projectId)
            .single();

        if (error) {
            toast.error('Error fetching project: ' + error.message);
            return;
        }

        if (user?.id === data.user_id) {
            setProject(data);
            if (data.code) {
                setFiles(data.code);
            }
        } else {
            toast.error('Error fetching project: Unauthorized access');
        }
    }

    useEffect(() => {
        if (user && projectId) {
            initialVerification();
        }
    }, [user, projectId]);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const generatePreviewHTML = () => {
        const appCode = files['src/App.tsx'] || files['src/App.jsx'] || files['src/App.js'] || initialFiles['src/App.tsx'];
        const cssCode = files['src/index.css'] || initialFiles['src/index.css'];

        const cdnMap: Record<string, string> = {
            'react': 'https://unpkg.com/react@18/umd/react.development.js',
            'react-dom': 'https://unpkg.com/react-dom@18/umd/react-dom.development.js',
            'react-dom/client': 'https://unpkg.com/react-dom@18/umd/react-dom.development.js',
            'react/jsx-runtime': 'https://unpkg.com/react@18/umd/react.development.js',
            '@types/react': 'https://unpkg.com/react@18/umd/react.development.js'
        };

        const processImports = (code: string, currentFile: string = 'src/App.tsx') => {
            const importRegex = /import\s+(?:\*\s+as\s+)?(\w+)?\s*(?:\{([^}]*)\})?\s*from\s+['"]([^'"]+)['"];?/g;
            const imports: Array<{ name: string, source: string, isDefault: boolean }> = [];

            let match;
            while ((match = importRegex.exec(code)) !== null) {
                const [, defaultImport, namedImports, source] = match;

                if (defaultImport) {
                    imports.push({ name: defaultImport, source, isDefault: true });
                }

                if (namedImports) {
                    namedImports.split(',').forEach(imp => {
                        const name = imp.trim().replace(/^(\w+).*$/, '$1');
                        if (name) imports.push({ name, source, isDefault: false });
                    });
                }
            }

            let processedCode = code;

            imports.forEach(({ name, source, isDefault }) => {
                if (cdnMap[source]) {
                    const globalName = source === 'react-dom/client' ? 'ReactDOM' :
                        source === 'react/jsx-runtime' ? 'React' :
                            name === 'React' ? 'React' : name;

                    processedCode = processedCode.replace(
                        new RegExp(`import\\s+${name}\\s+from\\s+['"]${source}['"];?`, 'g'),
                        `const ${name} = window.${globalName};`
                    );
                } else if (source.startsWith('.') || source.startsWith('/')) {
                    const resolvedPath = resolveImportPath(source, currentFile);
                    const fileContent = files[resolvedPath];

                    if (fileContent) {
                        const importedCode = processImports(fileContent, resolvedPath)
                            .replace(/export\s+default\s+(\w+)/g, `const ${name} = $1`)
                            .replace(/export\s+const\s+(\w+)/g, `const $1`)
                            .replace(/export\s+function\s+(\w+)/g, `function $1`);

                        processedCode = importedCode + '\n\n' + processedCode.replace(
                            new RegExp(`import\\s+.*?from\\s+['"]${source}['"];?`, 'g'),
                            ''
                        );
                    }
                } else if (source === './index.css' || source.endsWith('.css')) {
                    processedCode = processedCode.replace(
                        new RegExp(`import\\s+.*?from\\s+['"]${source}['"];?`, 'g'),
                        ''
                    );
                }
            });

            return processedCode;
        };

        const resolveImportPath = (importPath: string, currentFile: string) => {
            if (importPath.startsWith('.')) {
                const currentDir = currentFile.split('/').slice(0, -1).join('/');
                let resolved = importPath;

                if (importPath.startsWith('./')) {
                    resolved = `${currentDir}/${importPath.slice(2)}`;
                } else if (importPath.startsWith('../')) {
                    const upLevels = importPath.split('../').length - 1;
                    const pathParts = currentDir.split('/');
                    resolved = pathParts.slice(0, -upLevels).join('/') + '/' + importPath.replace(/\.\.\//g, '');
                }

                if (!resolved.match(/\.(js|jsx|ts|tsx)$/)) {
                    resolved += '.tsx';
                }

                return resolved;
            }
            return importPath;
        };

        // Remove all import statements and export statements
        const processedCode = appCode
            .replace(/import\s+.*?from\s+['"].*?['"];?\n?/g, '')
            .replace(/export\s+default\s+/g, '')
            .replace(/export\s+/g, '');

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Preview - VibeCoding</title>
    <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    <script src="https://cdn.tailwindcss.com"></script>
    
    <style>
        ${cssCode.replace(/@tailwind base;?\n?/g, '')
                .replace(/@tailwind components;?\n?/g, '')
                .replace(/@tailwind utilities;?\n?/g, '')}
        
        ${Object.entries(files)
                .filter(([path]) => path.endsWith('.css'))
                .map(([path, content]) => content)
                .join('\n\n')}
            
        body { 
            margin: 0; 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
        #root { 
            min-height: 100vh; 
        }
        .error { 
            color: red; 
            padding: 20px; 
            font-family: monospace; 
            white-space: pre-wrap;
            background: #fee;
            border-left: 4px solid red;
            margin: 20px;
        }
    </style>
</head>
<body>
    <div id="root">
        <div style="padding: 20px; text-align: center;">
            <p>Loading preview...</p>
        </div>
    </div>

    <script type="text/babel">
        // Make React hooks available
        const { useState, useEffect, useRef, useCallback, useMemo, useReducer, useContext, createContext } = React;
        
        try {
            ${processedCode}
            
            // Render the App component
            const root = ReactDOM.createRoot(document.getElementById('root'));
            root.render(<App />);
            
        } catch (error) {
            document.getElementById('root').innerHTML = 
                '<div class="error"><strong>Preview Error:</strong><br/>' + 
                error.message + '<br/><br/>' + 
                error.stack + '</div>';
            console.error('Preview error:', error);
        }
    </script>
</body>
</html>`;
    };

    const startPreview = async () => {
        if (isPreviewRunning) {
            setIsPreviewRunning(false);
            setPreviewUrl(null);
            if (previewUrl) {
                URL.revokeObjectURL(previewUrl);
            }
            return;
        }

        setPreviewLoading(true);

        try {
            const htmlContent = generatePreviewHTML();
            const blob = new Blob([htmlContent], { type: 'text/html' });
            const url = URL.createObjectURL(blob);

            if (previewUrl) {
                URL.revokeObjectURL(previewUrl);
            }

            setPreviewUrl(url);
            setIsPreviewRunning(true);
            setPreviewKey(prev => prev + 1);

        } catch (error) {
            console.error('Preview error:', error);
            toast.error('Failed to start preview');
        } finally {
            setPreviewLoading(false);
        }
    };

    const refreshPreview = () => {
        if (!isPreviewRunning) return;

        const htmlContent = generatePreviewHTML();
        const blob = new Blob([htmlContent], { type: 'text/html' });
        const url = URL.createObjectURL(blob);

        if (previewUrl) {
            URL.revokeObjectURL(previewUrl);
        }

        setPreviewUrl(url);
        setPreviewKey(prev => prev + 1);
        toast.success('Preview refreshed');
    };

    const generateDetailedInstructions = async (userPrompt: string, currentFiles: typeof files): Promise<AIPlan> => {
        const systemPrompt = `You are an expert UX/UI designer and product architect. Your job is to understand the user's request and provide EXTREMELY SPECIFIC implementation instructions WITHOUT deciding which files to modify.

CURRENT CODEBASE:
${Object.entries(currentFiles).map(([path, content]) => `=== ${path} ===\n${content}\n`).join('\n')}

USER REQUEST: ${userPrompt}

Your job is to be PRECISE about WHAT needs to change, not WHERE:

# PRECISE IMPLEMENTATION INSTRUCTIONS

## WHAT THE USER WANTS
[Interpret the user's request clearly and specifically]

## CURRENT STATE ANALYSIS
- What currently exists in the codebase that's relevant
- What needs to be changed or added

## SPECIFIC CHANGES REQUIRED

### Visual/UI Changes:
- If they say "colorful button" → specify EXACTLY: "Make the button background color #3B82F6 (blue), text white (#FFFFFF), with rounded corners (8px radius) and a hover state that darkens to #2563EB"
- If they say "bigger text" → specify: "Increase heading font size to 32px (2rem) with font-weight 700, body text to 16px with font-weight 400"
- If they say "nice layout" → specify: "Create a centered flex container with 32px gap between elements, max-width 1200px, padding 48px on all sides"
- BE SPECIFIC about colors (use hex codes), sizes (use px/rem), spacing (exact values), transitions (duration and easing)

### Functional Changes:
- If they want a feature → describe EXACTLY what it should do step by step
- If they want interactivity → specify the exact behavior: "When the 'Submit' button is clicked, validate the input, then show a success message 'Form submitted!' in a green (#10B981) banner with white text that appears with a 0.3s fade-in animation"
- If they want state management → specify exact state variables needed: "Create a state variable 'count' initialized to 0, increment it when button is clicked"
- If they want data handling → specify exact data structure: "Store user data as an array of objects with properties: {id: number, name: string, email: string}"

### Content Changes:
- If they mention text changes → provide the EXACT text to use, including capitalization and punctuation
- If they want images/icons → specify what should be displayed, size (e.g., "24px x 24px"), and positioning

### Styling Details:
- Colors: Use exact hex codes (e.g., #3B82F6, not "blue")
- Spacing: Use exact values (e.g., "padding: 24px 32px", not "good padding")
- Sizes: Use exact measurements (e.g., "width: 400px, height: 48px", not "tall button")
- Typography: Specify font sizes, weights, line heights (e.g., "font-size: 18px, font-weight: 600, line-height: 1.5")
- Borders: Specify thickness, style, color (e.g., "border: 2px solid #E5E7EB")
- Shadows: Provide exact values (e.g., "box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1)")
- Transitions: Specify duration and easing (e.g., "transition: all 0.3s ease-in-out")

### Interaction Behaviors:
- Specify hover states: "On hover, background changes to #2563EB, shadow increases to 0 8px 12px rgba(0, 0, 0, 0.15)"
- Specify click behaviors: "On click, scale to 0.95 with a 0.1s transition"
- Specify animations: "Fade in over 0.5s with ease-out timing"

### Responsive Behavior:
- If needed, specify breakpoints and changes: "On screens below 768px, reduce padding to 16px, font-size to 14px"

### Component Structure:
- Describe component hierarchy: "Create a container div, inside place a header with title and subtitle, below add a grid of 3 cards"
- Specify props if creating new components: "Pass 'title' (string) and 'onClick' (function) as props"

## IMPLEMENTATION REQUIREMENTS
- List any specific React hooks needed (useState, useEffect, etc.)
- Specify event handlers and their exact behavior
- Describe any conditional rendering logic
- List any derived/computed values needed

CRITICAL RULES:
1. DO NOT mention file names or file paths
2. DO NOT write actual code
3. BE EXTREMELY SPECIFIC - no vague terms like "nice", "good", "better", "modern"
4. Replace ALL vague requests with precise specifications
5. Think like a designer giving pixel-perfect specifications to a developer
6. If the user's request is vague, YOU make the specific design decisions for them
7. Consider the CURRENT CODE when making specifications - reference what already exists

Example Transformations:
❌ "Make the button colorful" 
✅ "Change the existing button's background color to #10B981 (emerald green), text color to white (#FFFFFF), add padding of 12px 24px, border-radius of 8px, and a hover state that darkens the background to #059669 with a 0.2s ease transition"

❌ "Add some spacing"
✅ "Add 32px of padding to the main container, 24px margin-bottom between each section, and 16px gap between inline elements"

❌ "Make it look modern"
✅ "Apply these modern design elements: rounded corners of 12px on all cards, subtle shadow of 0 4px 6px rgba(0,0,0,0.1), use a sans-serif font family (Inter or -apple-system), white (#FFFFFF) background with light gray (#F3F4F6) section dividers, and smooth transitions of 0.3s ease-in-out on all interactive elements"

❌ "Add a form"
✅ "Create a form with these exact elements: 
- Input field for name: height 48px, padding 12px 16px, border 2px solid #E5E7EB, border-radius 8px, font-size 16px
- Input field for email: same styling as name field
- Submit button: background #3B82F6, text white, height 48px, width 100%, border-radius 8px, font-size 16px font-weight 600
- On submit, validate that both fields are filled, if valid show success message 'Thank you!' in green (#10B981) text below the form"

Return ONLY the precise instructions. Be the design decision maker. Reference current code when relevant.`;

        try {
            const response = await fetch('/api/gemini', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    prompt: systemPrompt,
                    model: 'deepseek-reasoner'
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to generate instructions');
            }

            const data = await response.json();

            return {
                instructions: data.response,
                summary: 'Precise implementation instructions generated'
            };
        } catch (error) {
            console.error('Error generating instructions:', error);
            throw error;
        }
    };

    const executeInstructions = async (instructions: string, currentFiles: typeof files): Promise<any> => {
        const executionPrompt = `You are a precise code implementation AI. You will receive SPECIFIC design and functionality instructions. Your job is to implement them EXACTLY as described.

PRECISE INSTRUCTIONS:
${instructions}

CURRENT CODEBASE STATE:
${Object.entries(currentFiles).map(([path, content]) => `=== ${path} ===\n${content}\n`).join('\n')}

YOUR JOB:
1. Read the precise instructions carefully
2. Analyze the current codebase to understand what exists
3. Decide which files need to be modified to implement these instructions
4. Implement the changes EXACTLY as specified in the instructions
5. If instructions say "button background #3B82F6", use EXACTLY that color
6. If instructions say "padding: 24px 32px", use EXACTLY those values
7. If instructions specify hover states, transitions, or animations, implement them exactly
8. Follow every specification to the pixel

CRITICAL RULES FOR IMPLEMENTATION:
- YOU decide which files to modify based on what the instructions require
- Implement ALL specifications exactly as written (colors, sizes, spacing, transitions, etc.)
- Don't add features not mentioned in the instructions
- Don't make design decisions - the instructions already have all design decisions
- Preserve existing code that isn't mentioned in the instructions
- Return COMPLETE file content for modified files only
- If creating new components, place them appropriately
- Ensure all React imports and syntax are correct

EXAMPLE:
If instructions say "Make the heading text 32px with font-weight 700 in color #1F2937", you write:
<h1 className="text-[32px] font-bold text-[#1F2937]">...

If instructions say "Add a button with background #3B82F6, padding 12px 24px, that shows an alert on click", you write:
<button onClick={() => alert('...')} className="bg-[#3B82F6] px-6 py-3">...

Return ONLY valid JSON in this exact format:

{
  "updated_files": {
    "src/App.tsx": "complete file content with all changes implemented exactly as specified",
    "src/index.css": "complete file content if CSS changes were needed"
  },
  "execution_summary": "Brief description of which files were modified and what changes were made"
}

Return ONLY the JSON, no other text or explanations.`;

        try {
            const response = await fetch('/api/gemini', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    prompt: executionPrompt,
                    model: 'deepseek-reasoner'
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to execute instructions');
            }

            const data = await response.json();

            try {
                const jsonMatch = data.response.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    return JSON.parse(jsonMatch[0]);
                }
                return JSON.parse(data.response);
            } catch (parseError) {
                throw new Error('Invalid JSON response from AI');
            }
        } catch (error) {
            console.error('Error executing instructions:', error);
            throw error;
        }
    };

    const handleSend = async () => {
        if (!prompt.trim() || isProcessing) return;

        setIsProcessing(true);
        setMessages(prev => [...prev, { role: 'user', content: prompt }]);

        try {
            setCurrentAction('Analyzing your request and generating precise specifications...');

            const plan = await generateDetailedInstructions(prompt, files);
            setGeneratedPlan(plan);
            setEditableInstructions(plan.instructions);
            setShowPlanApproval(true);

            setMessages(prev => [...prev, {
                role: 'assistant',
                content: `I've created precise specifications for your request. Please review and edit the instructions below, then approve to execute.`,
                type: 'instructions'
            }]);

        } catch (error) {
            toast.error('Failed to generate instructions: ' + (error instanceof Error ? error.message : 'Unknown error'));
            console.error('Error:', error);
        } finally {
            setIsProcessing(false);
            setCurrentAction(null);
            setPrompt('');
            setPromptWords(0);
        }
    };

    const handleExecuteInstructions = async () => {
        if (!editableInstructions.trim()) return;

        setIsExecuting(true);
        setShowPlanApproval(false);

        try {
            setCurrentAction('Executing the specifications...');

            const result = await executeInstructions(editableInstructions, files);

            if (result.updated_files) {
                const updatedFiles = {
                    ...files,
                    ...result.updated_files
                };
                setFiles(updatedFiles);

                await updateProjectCode(projectId as string, updatedFiles);

                if (isPreviewRunning) {
                    setTimeout(() => {
                        refreshPreview();
                    }, 500);
                }
            }

            setMessages(prev => [...prev, {
                role: 'assistant',
                content: `✅ Changes applied successfully! ${result.execution_summary || 'Your specifications have been implemented.'}`,
                type: 'execution_result',
                actions: Object.entries(result.updated_files || {}).map(([file]) => ({
                    type: 'file_edit',
                    file: file,
                    description: 'Updated based on specifications'
                }))
            }]);

            toast.success('Changes applied successfully!');

        } catch (error) {
            toast.error('Failed to execute instructions: ' + (error instanceof Error ? error.message : 'Unknown error'));
            console.error('Error:', error);
        } finally {
            setIsExecuting(false);
            setCurrentAction(null);
            setGeneratedPlan(null);
            setEditableInstructions('');
        }
    };

    const handleRejectPlan = () => {
        setShowPlanApproval(false);
        setGeneratedPlan(null);
        setEditableInstructions('');
        setMessages(prev => [...prev, {
            role: 'assistant',
            content: 'Specifications rejected. Feel free to modify your request and try again.'
        }]);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const toggleFolder = (folder: string) => {
        setExpandedFolders(prev => {
            const newSet = new Set(prev);
            if (newSet.has(folder)) {
                newSet.delete(folder);
            } else {
                newSet.add(folder);
            }
            return newSet;
        });
    };

    const renderFileTree = () => {
        const tree: any = {};

        Object.keys(files).forEach(path => {
            const parts = path.split('/');
            let current = tree;

            parts.forEach((part, idx) => {
                if (idx === parts.length - 1) {
                    current[part] = { type: 'file', path };
                } else {
                    if (!current[part]) {
                        current[part] = { type: 'folder', children: {} };
                    }
                    current = current[part].children;
                }
            });
        });

        const renderNode = (name: string, node: any, level = 0) => {
            if (node.type === 'file') {
                return (
                    <div
                        key={node.path}
                        onClick={() => setSelectedFile(node.path)}
                        className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors rounded ${selectedFile === node.path ? 'bg-primary/10 border-l-2 border-primary' : 'hover:bg-muted'
                            }`}
                        style={{ paddingLeft: `${level * 16 + 12}px` }}
                    >
                        <FileText className="w-4 h-4" />
                        <span className="text-sm">{name}</span>
                    </div>
                );
            }

            const isExpanded = expandedFolders.has(name);
            return (
                <div key={name}>
                    <div
                        onClick={() => toggleFolder(name)}
                        className="flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors hover:bg-muted rounded"
                        style={{ paddingLeft: `${level * 16 + 12}px` }}
                    >
                        {isExpanded ? (
                            <ChevronDown className="w-4 h-4" />
                        ) : (
                            <ChevronRight className="w-4 h-4" />
                        )}
                        <Folder className="w-4 h-4" />
                        <span className="text-sm font-medium">{name}</span>
                    </div>
                    {isExpanded && (
                        <div>
                            {Object.entries(node.children).map(([childName, childNode]) =>
                                renderNode(childName, childNode, level + 1)
                            )}
                        </div>
                    )}
                </div>
            );
        };

        return Object.entries(tree).map(([name, node]) => renderNode(name, node));
    };

    useEffect(() => {
        return () => {
            if (previewUrl) {
                URL.revokeObjectURL(previewUrl);
            }
        };
    }, [previewUrl]);

    if (!project) {
        return (
            <div className="flex items-center justify-center h-screen">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <span className="ml-3 text-lg">Loading project...</span>
            </div>
        );
    }

    return (
        <div className="h-screen flex flex-col bg-background">
            {/* Header */}
            <div className="border-b px-6 py-4 flex items-center justify-between bg-background shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                        <Code2 className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <div className="font-bold text-lg">{project.name}</div>
                        <div className="text-xs text-muted-foreground font-mono">{project.id}</div>
                    </div>
                </div>
                <div className="flex gap-2">
                    {isPreviewRunning && (
                        <Button
                            onClick={refreshPreview}
                            variant="outline"
                            size="sm"
                            className="gap-2 h-10"
                        >
                            <RefreshCw className="w-4 h-4" />
                            Refresh
                        </Button>
                    )}
                    <Button
                        onClick={startPreview}
                        variant={isPreviewRunning ? "destructive" : "default"}
                        size="sm"
                        className="gap-2 h-10 min-w-[120px]"
                        disabled={previewLoading}
                    >
                        {previewLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : isPreviewRunning ? (
                            <>
                                <Square className="w-4 h-4" />
                                Stop
                            </>
                        ) : (
                            <>
                                <Play className="w-4 h-4" />
                                Run Preview
                            </>
                        )}
                    </Button>
                    <Button
                        onClick={async () => {
                            try {
                                const zip = new JSZip();
                                Object.entries(files).forEach(([path, content]) => {
                                    zip.file(path, content);
                                });
                                const blob = await zip.generateAsync({ type: 'blob' });
                                saveAs(blob, `${project.name || 'project'}.zip`);
                            } catch (error) {
                                console.error('Failed to create zip:', error);
                                toast.error('Failed to create zip');
                            }
                        }}
                        variant="outline"
                        size="sm"
                        className="gap-2 h-10"
                    >
                        <Download className="w-4 h-4" />
                        Download ZIP
                    </Button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex overflow-hidden p-5 gap-5">
                {/* Left Side - Code Editor & Preview */}
                <div className="w-1/2 flex flex-col border-2 rounded-xl shadow-lg overflow-hidden bg-background">
                    {/* Tabs */}
                    <div className="border-b bg-muted/30">
                        <div className="flex">
                            <button
                                onClick={() => setActiveTab('code')}
                                className={`flex items-center gap-2 px-6 py-3 border-b-2 transition-all font-medium ${activeTab === 'code'
                                    ? 'border-primary text-primary bg-background'
                                    : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
                                    }`}
                            >
                                <Code className="w-4 h-4" />
                                <span className="text-sm">Code Editor</span>
                            </button>
                            <button
                                onClick={() => setActiveTab('preview')}
                                className={`flex items-center gap-2 px-6 py-3 border-b-2 transition-all font-medium ${activeTab === 'preview'
                                    ? 'border-primary text-primary bg-background'
                                    : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
                                    }`}
                            >
                                <Eye className="w-4 h-4" />
                                <span className="text-sm">Live Preview</span>
                            </button>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-auto bg-background">
                        {activeTab === 'code' && (
                            <div className="flex h-full">
                                {/* File Explorer */}
                                <div className="w-1/3 border-r bg-muted/20">
                                    <div className="p-3 border-b bg-muted/30 sticky top-0">
                                        <div className="flex items-center gap-2">
                                            <FolderTree className="w-4 h-4 text-primary" />
                                            <span className="text-sm font-semibold">Files</span>
                                        </div>
                                    </div>
                                    <div className="overflow-y-auto p-2">
                                        {renderFileTree()}
                                    </div>
                                </div>

                                {/* Code Editor */}
                                <div className="w-2/3 flex flex-col bg-background">
                                    <div className="p-3 border-b flex items-center justify-between bg-muted/20 sticky top-0">
                                        <span className="text-xs font-mono text-muted-foreground">{selectedFile}</span>
                                        <FileCode className="w-4 h-4 text-primary" />
                                    </div>
                                    <pre className="flex-1 p-4 text-sm font-mono leading-relaxed overflow-auto">
                                        <code className="text-foreground">{files[selectedFile as keyof typeof files]}</code>
                                    </pre>
                                </div>
                            </div>
                        )}

                        {activeTab === 'preview' && (
                            <div className="h-full flex flex-col">
                                {isPreviewRunning && previewUrl ? (
                                    <>
                                        <div className="p-3 border-b flex items-center justify-between bg-muted/20">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                                                <span className="text-xs font-medium">Live Preview Running</span>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={refreshPreview}
                                                className="h-7 px-3 text-xs gap-2"
                                            >
                                                <RefreshCw className="w-3 h-3" />
                                                Refresh
                                            </Button>
                                        </div>
                                        <iframe
                                            key={previewKey}
                                            ref={iframeRef}
                                            src={previewUrl}
                                            className="w-full h-full border-0 bg-white"
                                            title="Live Preview"
                                            sandbox="allow-scripts allow-same-origin"
                                        />
                                    </>
                                ) : (
                                    <div className="flex-1 flex items-center justify-center bg-muted/10">
                                        <div className="text-center p-8">
                                            <div className="inline-block p-4 rounded-full bg-muted/50 mb-4">
                                                <Eye className="w-12 h-12 text-muted-foreground" />
                                            </div>
                                            <p className="text-xl font-semibold mb-2">Preview Not Running</p>
                                            <p className="text-sm text-muted-foreground mb-4">Click "Run Preview" to see your application</p>
                                            <Button onClick={startPreview} className="gap-2">
                                                <Play className="w-4 h-4" />
                                                Start Preview
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Side - Chat Interface */}
                <div className="w-1/2 flex flex-col border-2 rounded-xl shadow-lg overflow-hidden bg-background">
                    {/* Chat Header */}
                    <div className="border-b p-4 bg-muted/30">
                        <div className="flex items-center gap-2">
                            <MessageSquare className="w-5 h-5 text-primary" />
                            <h3 className="font-bold text-lg">AI Assistant</h3>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Describe changes with precision</p>
                    </div>

                    {/* Messages Area */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {messages.length === 0 && (
                            <div className="text-center mt-16">
                                <div className="inline-block p-4 rounded-full bg-primary/10 mb-4">
                                    <MessageSquare className="w-8 h-8 text-primary" />
                                </div>
                                <p className="text-xl font-semibold mb-2">Ready to Build</p>
                                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                                    Describe what you want to create or modify. I'll provide precise specifications for implementation.
                                </p>
                            </div>
                        )}

                        {messages.map((msg, idx) => (
                            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div
                                    className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${msg.role === 'user'
                                        ? 'bg-primary text-primary-foreground'
                                        : 'bg-muted border'
                                        }`}
                                >
                                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>

                                    {msg.actions && (
                                        <div className="mt-3 space-y-2 pt-3 border-t border-primary-foreground/20">
                                            {msg.actions.map((action: any, aidx: number) => (
                                                <div key={aidx} className="flex items-start gap-2 text-xs opacity-90">
                                                    {action.type === 'file_edit' && (
                                                        <>
                                                            <FileCode className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                                            <div>
                                                                <p className="font-semibold">{action.file}</p>
                                                                <p className="mt-0.5 opacity-80">{action.description}</p>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}

                        {(isProcessing || isExecuting) && currentAction && (
                            <div className="flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-primary/20 bg-primary/5 w-fit">
                                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                                <span className="text-sm font-medium">{currentAction}</span>
                            </div>
                        )}

                        <div ref={chatEndRef} />
                    </div>

                    {/* Input Area */}
                    <div className="border-t p-4 bg-muted/20 m-auto fixed bottom-0 left-0 right-0 max-w-6xl">
                        <div className="flex gap-3">
                            <Textarea
                                value={prompt}
                                onChange={(e) => {
                                    setPrompt(e.target.value);
                                    setPromptWords(e.target.value.trim().split(/\s+/).length);
                                }}
                                onKeyDown={handleKeyDown}
                                placeholder="Describe what you want to build or modify..."
                                className={`flex-1 resize-none text-[16px] border-2 bg-background focus:border-primary ${promptWords > 70 ? 'max-h-[700px]' : 'max-h-[360px]'
                                    }`}
                                rows={1}
                                disabled={isProcessing}
                            />
                            <Button
                                onClick={handleSend}
                                disabled={!prompt.trim() || isProcessing}
                                className="h-auto min-h-[80px] px-6"
                            >
                                {isProcessing ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                    <SendHorizonal className="w-5 h-5" />
                                )}
                            </Button>
                        </div>
                        <div className="flex items-center justify-between mt-2">
                            <p className="text-xs text-muted-foreground">
                                <kbd className="px-2 py-0.5 rounded border text-[10px]">Enter</kbd> to send
                            </p>
                            {promptWords > 0 && (
                                <p className="text-xs text-muted-foreground font-medium">{promptWords} words</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Plan Approval Modal */}
            {showPlanApproval && generatedPlan && (
                <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center p-6 z-50 animate-in fade-in duration-200">
                    <div className="border-2 rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col bg-background">
                        <div className="flex items-center justify-between p-6 border-b bg-muted/30">
                            <div className="flex items-center gap-3">
                                <div className="p-3 rounded-xl bg-primary/10">
                                    <FileText className="w-6 h-6 text-primary" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-2xl">Review Precise Specifications</h3>
                                    <p className="text-sm text-muted-foreground mt-1">Edit the specifications below, then approve to implement</p>
                                </div>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleRejectPlan}
                                className="h-10 w-10 p-0"
                            >
                                <X className="w-5 h-5" />
                            </Button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6">
                            <div className="space-y-6">
                                <div>
                                    <label className="text-sm font-bold mb-3 block flex items-center gap-2">
                                        <Code2 className="w-4 h-4" />
                                        Implementation Specifications (Edit as needed)
                                    </label>
                                    <Textarea
                                        value={editableInstructions}
                                        onChange={(e) => setEditableInstructions(e.target.value)}
                                        className="min-h-[500px] font-mono text-sm leading-relaxed border-2 focus:border-primary"
                                        placeholder="Precise specifications will appear here..."
                                    />
                                </div>

                                <div className="border-2 rounded-lg p-4 bg-primary/5">
                                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                                        <FileText className="w-4 h-4 text-primary" />
                                        How it works:
                                    </h4>
                                    <p className="text-sm text-muted-foreground">
                                        These are <strong>precise specifications</strong> (WHAT to change). The AI executor will determine which files to modify (WHERE to change) and implement these exact specifications.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-3 p-6 border-t bg-muted/30">
                            <Button
                                onClick={handleRejectPlan}
                                variant="outline"
                                className="flex-1 h-12 font-medium"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleExecuteInstructions}
                                className="flex-1 h-12 gap-2 font-medium"
                                disabled={isExecuting}
                            >
                                {isExecuting ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Implementing...
                                    </>
                                ) : (
                                    <>
                                        <PlayCircle className="w-4 h-4" />
                                        Execute Specifications
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Page;