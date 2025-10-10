'use client';

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import supabase from "@/lib/supabase";
import { useUser } from "@clerk/nextjs";
import { SendHorizonal, FileCode, FolderTree, Play, Loader2, CheckCircle2, FileText, Folder, ChevronRight, ChevronDown, Code2, Sparkles, MessageSquare, X, PlayCircle, Square, Eye, Code, RefreshCw } from "lucide-react";
import { useParams } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";

// Mock file system for demo
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

// Types
interface AIPlan {
    instructions: string;
    files_to_modify: string[];
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
    const [previewKey, setPreviewKey] = useState<number>(0); // Add this key to force iframe refresh
    const chatEndRef = useRef<HTMLDivElement>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);

    const { user } = useUser();

    // Add this function to update Supabase
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

    // Also update the initial file loading to use stored code if available
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
            // Use stored code if available, otherwise use initial files
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

    // Generate HTML content for preview - UPDATED to use current files
    // Simple bundler approach
    // Generate HTML content for preview - FIXED VERSION that removes ALL imports
    // Generate HTML content for preview - COMPLETE IMPORT RESOLUTION
    const generatePreviewHTML = () => {
        const appCode = files['src/App.tsx'] || files['src/App.jsx'] || files['src/App.js'] || initialFiles['src/App.tsx'];
        const cssCode = files['src/index.css'] || initialFiles['src/index.css'];

        // Map of external CDN URLs for common libraries
        const cdnMap: Record<string, string> = {
            'react': 'https://unpkg.com/react@18/umd/react.development.js',
            'react-dom': 'https://unpkg.com/react-dom@18/umd/react-dom.development.js',
            'react-dom/client': 'https://unpkg.com/react-dom@18/umd/react-dom.development.js',
            'react/jsx-runtime': 'https://unpkg.com/react@18/umd/react.development.js',
            '@types/react': 'https://unpkg.com/react@18/umd/react.development.js'
        };

        // Extract all imports and convert them
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

            // Replace imports with global variables or inline code
            let processedCode = code;

            imports.forEach(({ name, source, isDefault }) => {
                if (cdnMap[source]) {
                    // External library - replace with global
                    const globalName = source === 'react-dom/client' ? 'ReactDOM' :
                        source === 'react/jsx-runtime' ? 'React' :
                            name === 'React' ? 'React' : name;

                    processedCode = processedCode.replace(
                        new RegExp(`import\\s+${name}\\s+from\\s+['"]${source}['"];?`, 'g'),
                        `const ${name} = window.${globalName};`
                    );
                } else if (source.startsWith('.') || source.startsWith('/')) {
                    // Local file - inline the content
                    const resolvedPath = resolveImportPath(source, currentFile);
                    const fileContent = files[resolvedPath];

                    if (fileContent) {
                        // Process the imported file recursively
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
                    // CSS imports - already handled in style tag
                    processedCode = processedCode.replace(
                        new RegExp(`import\\s+.*?from\\s+['"]${source}['"];?`, 'g'),
                        ''
                    );
                }
            });

            return processedCode;
        };

        // Helper to resolve relative paths
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

                // Add file extension if missing
                if (!resolved.match(/\.(js|jsx|ts|tsx)$/)) {
                    resolved += '.tsx';
                }

                return resolved;
            }
            return importPath;
        };

        // Process the main app code
        const processedCode = processImports(appCode)
            .replace(/export\s+default\s+App;?/g, '')
            .replace(/export\s+default\s+function\s+App/g, 'function App')
            .replace(/export\s+default\s+App/g, 'const App');

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Preview - VibeCoding</title>
    <!-- External Libraries -->
    <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
    <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    <script src="https://cdn.tailwindcss.com"></script>
    
    <style>
        ${cssCode.replace(/@tailwind base;?\n?/g, '')
                .replace(/@tailwind components;?\n?/g, '')
                .replace(/@tailwind utilities;?\n?/g, '')}
        
        /* Include all CSS files */
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
        // Make React available globally
        window.React = React;
        window.ReactDOM = ReactDOM;
        
        try {
            ${processedCode}
            
            // Find and render the App component
            let AppComponent = typeof App !== 'undefined' ? App : 
                function() {
                    return React.createElement('div', { 
                        className: 'min-h-screen p-8'
                    }, 
                    React.createElement('h1', { className: 'text-4xl font-bold mb-4' }, 'Hello VibeCoding!'),
                    React.createElement('p', null, 'All imports working!')
                    );
                };
            
            const root = ReactDOM.createRoot(document.getElementById('root'));
            root.render(React.createElement(AppComponent));
            
        } catch (error) {
            document.getElementById('root').innerHTML = 
                '<div class="error"><strong>Preview Error:</strong><br/>' + error.message + '<br/><br/>' + error.stack + '</div>';
            console.error('Preview error:', error);
        }
    </script>
</body>
</html>`;
    };

    // WebContainers Preview Function - UPDATED to refresh when files change
    const startPreview = async () => {
        if (isPreviewRunning) {
            // Stop preview
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

            // Clean up previous URL if it exists
            if (previewUrl) {
                URL.revokeObjectURL(previewUrl);
            }

            setPreviewUrl(url);
            setIsPreviewRunning(true);
            setPreviewKey(prev => prev + 1); // Force iframe refresh

        } catch (error) {
            console.error('Preview error:', error);
            toast.error('Failed to start preview');
        } finally {
            setPreviewLoading(false);
        }
    };

    // NEW: Refresh preview with current files
    const refreshPreview = () => {
        if (!isPreviewRunning) return;

        const htmlContent = generatePreviewHTML();
        const blob = new Blob([htmlContent], { type: 'text/html' });
        const url = URL.createObjectURL(blob);

        // Clean up previous URL
        if (previewUrl) {
            URL.revokeObjectURL(previewUrl);
        }

        setPreviewUrl(url);
        setPreviewKey(prev => prev + 1); // Force iframe refresh
        toast.success('Preview refreshed');
    };

    // Gemini API Call for generating detailed instructions
    const generateDetailedInstructions = async (userPrompt: string, currentFiles: typeof files): Promise<AIPlan> => {
        const systemPrompt = `You are an expert software architect. Analyze the user's request and current codebase, then create EXACT, PRECISE implementation instructions.

CURRENT FILES:
${Object.entries(currentFiles).map(([path, content]) => `=== ${path} ===\n${content}\n`).join('\n')}

USER REQUEST: ${userPrompt}

Generate EXACT implementation instructions in this EXACT format:

# EXACT IMPLEMENTATION INSTRUCTIONS

## CURRENT STATE ANALYSIS
- What currently exists in the codebase
- What needs to be changed
- What needs to be added

## FILE-BY-FILE MODIFICATIONS

### File: [exact_file_path]
**Action:** [MODIFY/CREATE/DELETE]
**Current State:** [Brief description of current content]
**Required Changes:** [EXACT step-by-step instructions]
- Step 1: [Specific action]
- Step 2: [Specific action]
- Step 3: [Specific action]
**Expected Outcome:** [What the file should contain after changes]

### File: [exact_file_path]
**Action:** [MODIFY/CREATE/DELETE]
**Current State:** [Brief description of current content]
**Required Changes:** [EXACT step-by-step instructions]
- Step 1: [Specific action]
- Step 2: [Specific action]
- Step 3: [Specific action]
**Expected Outcome:** [What the file should contain after changes]

## IMPLEMENTATION LOGIC
- Data flow changes needed
- State management requirements
- Component interactions
- API integrations if any

## DEPENDENCIES & IMPORTS
- What imports need to be added
- What dependencies need to be installed
- What existing code needs to be refactored

## VALIDATION REQUIREMENTS
- What needs to be tested
- Edge cases to handle
- Error conditions to manage

CRITICAL RULES:
1. DO NOT WRITE ACTUAL CODE - only instructions
2. BE EXTREMELY SPECIFIC about what to change
3. INCLUDE EXACT FILE PATHS
4. DESCRIBE EXACT CHANGES needed
5. FOCUS ON MODIFICATION INSTRUCTIONS, not code generation
6. CONSIDER CURRENT CODE STRUCTURE
7. BE PRECISE ABOUT IMPORTS AND DEPENDENCIES

Return ONLY the instructions in this exact format, no other text.`;

        try {
            const response = await fetch('/api/gemini', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    prompt: systemPrompt,
                    model: 'gemini-2.0-flash'
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to generate instructions');
            }

            const data = await response.json();

            // Extract files to modify from the instructions
            const filesToModify: string[] = [];
            const fileMatches = data.response.match(/### File:\s*([^\n]+)/g);
            if (fileMatches) {
                fileMatches.forEach((match: string) => {
                    const file = match.replace(/### File:\s*/, '').trim();
                    if (file && !filesToModify.includes(file)) {
                        filesToModify.push(file);
                    }
                });
            }

            return {
                instructions: data.response,
                files_to_modify: filesToModify,
                summary: 'Implementation instructions generated'
            };
        } catch (error) {
            console.error('Error generating instructions:', error);
            throw error;
        }
    };

    // Gemini API Call for executing the instructions
    const executeInstructions = async (instructions: string, currentFiles: typeof files): Promise<any> => {
        const executionPrompt = `You are a precise code implementation AI. Follow these EXACT instructions to modify the codebase.

IMPLEMENTATION INSTRUCTIONS:
${instructions}

CURRENT CODEBASE STATE:
${Object.entries(currentFiles).map(([path, content]) => `=== ${path} ===\n${content}\n`).join('\n')}

CRITICAL RULES FOR IMPLEMENTATION:
1. Follow the instructions EXACTLY as written
2. Only make changes specified in the instructions
3. Do NOT add any extra features or changes
4. Do NOT modify files not mentioned in the instructions
5. Return COMPLETE file content for modified files
6. Preserve existing code that isn't mentioned in the instructions
7. Follow the exact file paths specified

Apply the instructions step by step and return ONLY valid JSON in this exact format:

{
  "updated_files": {
    "exact_file_path_1": "complete new content following instructions exactly",
    "exact_file_path_2": "complete new content following instructions exactly"
  },
  "execution_summary": "Brief description of changes made according to instructions"
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
                    model: 'gemini-2.0-flash'
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to execute instructions');
            }

            const data = await response.json();

            // Extract JSON from response
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
            setCurrentAction('Analyzing your request and generating detailed instructions...');

            // Step 1: Generate detailed instructions
            const plan = await generateDetailedInstructions(prompt, files);
            setGeneratedPlan(plan);
            setEditableInstructions(plan.instructions);
            setShowPlanApproval(true);

            setMessages(prev => [...prev, {
                role: 'assistant',
                content: `I've created detailed instructions for your request. Please review and edit the instructions below, then approve to execute.`,
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

    // Call this function whenever files are updated
    const handleExecuteInstructions = async () => {
        if (!editableInstructions.trim()) return;

        setIsExecuting(true);
        setShowPlanApproval(false);

        try {
            setCurrentAction('Executing the instructions...');

            // Step 2: Execute the edited instructions
            const result = await executeInstructions(editableInstructions, files);

            // Update files with the changes
            if (result.updated_files) {
                const updatedFiles = {
                    ...files,
                    ...result.updated_files
                };
                setFiles(updatedFiles);

                // Update Supabase with new code
                await updateProjectCode(projectId as string, updatedFiles);

                // AUTO-REFRESH PREVIEW if it's running
                if (isPreviewRunning) {
                    setTimeout(() => {
                        refreshPreview();
                    }, 500);
                }
            }

            setMessages(prev => [...prev, {
                role: 'assistant',
                content: `Instructions executed successfully! ${result.execution_summary || 'Changes have been applied to your project.'}`,
                type: 'execution_result',
                actions: Object.entries(result.updated_files || {}).map(([file]) => ({
                    type: 'file_edit',
                    file: file,
                    description: 'Updated file content'
                }))
            }]);

            toast.success('Instructions executed successfully!');

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
            content: 'Instructions rejected. Feel free to modify your request and try again.'
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
                        className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors ${selectedFile === node.path ? 'border-l-2' : ''
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
                        className="flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors"
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

    // Clean up blob URLs on unmount
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
                <Loader2 className="w-8 h-8 animate-spin" />
                <span className="ml-3">Loading project...</span>
            </div>
        );
    }

    return (
        <div className="h-screen flex flex-col">
            {/* Header */}
            <div className="border-b px-6 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg">
                        <Code2 className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="font-semibold">{project.name}</div>
                        <div className="text-xs">{project.id}</div>
                    </div>
                </div>
                <div className="flex gap-2">
                    {isPreviewRunning && (
                        <Button
                            onClick={refreshPreview}
                            variant="outline"
                            size="sm"
                            className="gap-2"
                        >
                            <RefreshCw className="w-4 h-4" />
                            Refresh Preview
                        </Button>
                    )}
                    <Button
                        onClick={startPreview}
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        disabled={previewLoading}
                    >
                        {previewLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : isPreviewRunning ? (
                            <Square className="w-4 h-4" />
                        ) : (
                            <Play className="w-4 h-4" />
                        )}
                        {isPreviewRunning ? 'Stop Preview' : 'Run Preview'}
                    </Button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex overflow-hidden p-5 gap-5">
                {/* Left Side - Code Editor & Preview */}
                <div className="w-1/2 flex flex-col border rounded-lg">
                    {/* Tabs */}
                    <div className="border-b">
                        <div className="flex">
                            <button
                                onClick={() => setActiveTab('code')}
                                className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${activeTab === 'code' ? 'border-primary' : 'border-transparent'
                                    }`}
                            >
                                <Code className="w-4 h-4" />
                                <span className="text-sm font-medium">Code</span>
                            </button>
                            <button
                                onClick={() => setActiveTab('preview')}
                                className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${activeTab === 'preview' ? 'border-primary' : 'border-transparent'
                                    }`}
                            >
                                <Eye className="w-4 h-4" />
                                <span className="text-sm font-medium">Preview</span>
                            </button>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-auto">
                        {activeTab === 'code' && (
                            <div className="flex h-full overflow-y-scroll">
                                {/* File Explorer */}
                                <div className="w-1/3 border-r">
                                    <div className="p-3 border-b">
                                        <div className="flex items-center gap-2">
                                            <FolderTree className="w-4 h-4" />
                                            <span className="text-sm font-medium">Project Files</span>
                                        </div>
                                    </div>
                                    <div className="overflow-y-auto">
                                        {renderFileTree()}
                                    </div>
                                </div>

                                {/* Code Editor */}
                                <div className="w-2/3 flex flex-col">
                                    <div className="p-3 border-b flex items-center justify-between">
                                        <span className="text-xs font-mono">{selectedFile}</span>
                                        <FileCode className="w-4 h-4" />
                                    </div>
                                    <pre className="flex-1 p-4 text-sm font-mono leading-relaxed overflow-auto">
                                        <code>{files[selectedFile as keyof typeof files]}</code>
                                    </pre>
                                </div>
                            </div>
                        )}

                        {activeTab === 'preview' && (
                            <div className="h-full flex flex-col">
                                {isPreviewRunning && previewUrl ? (
                                    <>
                                        <div className="p-2 border-b flex items-center justify-between bg-muted/50">
                                            <span className="text-xs">Live Preview</span>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={refreshPreview}
                                                className="h-6 px-2 text-xs"
                                            >
                                                <RefreshCw className="w-3 h-3 mr-1" />
                                                Refresh
                                            </Button>
                                        </div>
                                        <iframe
                                            key={previewKey} // This forces re-render when key changes
                                            ref={iframeRef}
                                            src={previewUrl}
                                            className="w-full h-full border-0"
                                            title="Live Preview"
                                            sandbox="allow-scripts allow-same-origin"
                                        />
                                    </>
                                ) : (
                                    <div className="flex-1 flex items-center justify-center">
                                        <div className="text-center">
                                            <Eye className="w-12 h-12 mx-auto mb-4 opacity-50" />
                                            <p className="text-lg font-medium mb-2">Preview</p>
                                            <p className="text-sm opacity-70">Click "Run Preview" to see your application</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Side - Chat Interface */}
                <div className="w-1/2 flex flex-col">
                    {/* Messages Area */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {messages.length === 0 && (
                            <div className="text-center mt-12">
                                <div className="inline-block p-4 rounded-full mb-4">
                                    <MessageSquare className="w-8 h-8 opacity-50" />
                                </div>
                                <p className="text-lg mb-2 font-medium">Ready to build</p>
                                <p className="text-sm opacity-70">Describe what you want to create or modify</p>
                            </div>
                        )}

                        {messages.map((msg, idx) => (
                            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div
                                    className={`max-w-[85%] rounded-2xl px-4 py-3 ${msg.role === 'user'
                                        ? 'bg-primary text-primary-foreground'
                                        : 'bg-muted'
                                        }`}
                                >
                                    <p className="text-sm leading-relaxed">{msg.content}</p>

                                    {msg.actions && (
                                        <div className="mt-3 space-y-2 pt-3 border-t">
                                            {msg.actions.map((action: any, aidx: number) => (
                                                <div key={aidx} className="flex items-start gap-2 text-xs">
                                                    {action.type === 'file_edit' && (
                                                        <>
                                                            <FileCode className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                                            <div>
                                                                <p className="font-medium">{action.file}</p>
                                                                <p className="opacity-70 mt-0.5">{action.description}</p>
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
                            <div className="flex items-center gap-3 px-4 py-2 rounded-xl border w-fit">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span className="text-sm">{currentAction}</span>
                            </div>
                        )}

                        <div ref={chatEndRef} />
                    </div>

                    {/* Plan Approval Modal */}
                    {showPlanApproval && generatedPlan && (
                        <div className="absolute inset-0 bg-background/80 flex items-center justify-center p-6 z-50">
                            <div className="border rounded-2xl shadow-lg max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col bg-background">
                                <div className="flex items-center justify-between p-6 border-b">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 rounded-lg bg-muted">
                                            <FileCode className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-lg">Review Implementation Instructions</h3>
                                            <p className="text-sm opacity-70">Edit the instructions below, then approve to execute</p>
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
                                            <label className="text-sm font-medium mb-3 block">
                                                Implementation Instructions (Edit as needed)
                                            </label>
                                            <Textarea
                                                value={editableInstructions}
                                                onChange={(e) => setEditableInstructions(e.target.value)}
                                                className="min-h-[500px] font-mono text-sm leading-relaxed"
                                                placeholder="Implementation instructions will appear here..."
                                            />
                                        </div>

                                        {generatedPlan.files_to_modify.length > 0 && (
                                            <div className="border rounded-lg p-4">
                                                <h4 className="font-medium mb-3">Files to be modified:</h4>
                                                <div className="grid grid-cols-2 gap-2">
                                                    {generatedPlan.files_to_modify.map((file, index) => (
                                                        <div key={index} className="flex items-center gap-2 px-3 py-2 border rounded">
                                                            <FileText className="w-4 h-4" />
                                                            <span className="text-sm font-mono">{file}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="flex gap-3 p-6 border-t bg-muted/50">
                                    <Button
                                        onClick={handleRejectPlan}
                                        variant="outline"
                                        className="flex-1"
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        onClick={handleExecuteInstructions}
                                        className="flex-1 gap-2"
                                    >
                                        <PlayCircle className="w-4 h-4" />
                                        Execute Instructions
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Input Area */}
                    <div className="border p-4 fixed m-auto max-w-4xl bottom-0 right-0 left-0 bg-background">
                        <div className="flex gap-3">
                            <Textarea
                                value={prompt}
                                onChange={(e) => {
                                    setPrompt(e.target.value);
                                    setPromptWords(e.target.value.trim().split(/\s+/).length);
                                }}
                                onKeyDown={handleKeyDown}
                                placeholder="Describe what you want to build or modify..."
                                className={`flex-1 resize-none text-[16px] ${promptWords > 70 ? 'max-h-[700px]' : 'max-h-[360px]'
                                    }`}
                                rows={1}
                                disabled={isProcessing}
                            />
                            <Button
                                onClick={handleSend}
                                disabled={!prompt.trim() || isProcessing}
                                className="h-auto min-h-[80px]"
                            >
                                {isProcessing ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                    <SendHorizonal className="w-5 h-5" />
                                )}
                            </Button>
                        </div>
                        <div className="flex items-center justify-between mt-2">
                            <p className="text-xs opacity-70">
                                <kbd className="px-2 py-0.5 rounded border">Enter</kbd> to send
                            </p>
                            {promptWords > 0 && (
                                <p className="text-xs opacity-70">{promptWords} words</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Page;