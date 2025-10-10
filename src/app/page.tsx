'use client'

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import supabase from "@/lib/supabase";
import { useUser } from "@clerk/nextjs";
import { Save, Sparkles, Check, Loader2, Trash2, Play, Code, ExternalLink, FileText } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

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

  const [generatedUIPlan, setGeneratedUIPlan] = useState('');
  const [generatedFlowPlan, setGeneratedFlowPlan] = useState('');
  const [generatedLogicPlan, setGeneratedLogicPlan] = useState('');
  const [generatedCode, setGeneratedCode] = useState({
    html: '',
    css: '',
    js: ''
  });

  const [projects, setProjects] = useState<any[]>([]);

  const fetchProjects = async () => {
    if (!user) return;
    const { data, error } = await supabase.from('projects').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    if (error) {
      console.error('Error fetching projects:', error);
      return;
    }
    setProjects(data);
  }

  useEffect(() => {
    const loadProjects = async () => {
      if (!user) return;
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching projects:', error);
        toast.error('Failed to load projects');
        return;
      }
      setProjects(data || []);
    };

    loadProjects();
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

    //Plan the new app
    plan(newAppName, prompt);
  }

  const plan = async (projectName: string, userPrompt: string) => {
    let systemPrompt = `You are an expert web application planner. Based on the user's idea, generate a comprehensive plan with exactly these three sections:

1. UI_PLAN: Detailed user interface design plan including layout, components, and user experience
2. FLOW_PLAN: User flow and navigation structure
3. PREREQUISITES: Logic Handling (for eg. How exactly are we going to handle SignUp() etc.) In clear steps, Dependencies and setup needed

Format your response EXACTLY like this:
UI_PLAN:[your ui plan here]
FLOW_PLAN:[your flow plan here]
PREREQUISITES:[your prerequisites here]

Be specific and practical. For project: "${projectName}" and idea: "${userPrompt}"`;

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

      if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts || !data.candidates[0].content.parts[0]) {
        console.error('Invalid API response structure:', data);
        throw new Error('Invalid response structure from AI');
      }

      const responseText = data.candidates[0].content.parts[0].text;

      const uiPlanMatch = responseText.match(/UI_PLAN:(.*?)(?=FLOW_PLAN:|$)/s);
      const flowPlanMatch = responseText.match(/FLOW_PLAN:(.*?)(?=PREREQUISITES:|$)/s);
      const prerequisitesMatch = responseText.match(/PREREQUISITES:(.*?)$/s);

      setGeneratedUIPlan(uiPlanMatch ? uiPlanMatch[1].trim() : 'No UI Plan found');
      setGeneratedFlowPlan(flowPlanMatch ? flowPlanMatch[1].trim() : 'No Flow Plan found');
      setGeneratedLogicPlan(prerequisitesMatch ? prerequisitesMatch[1].trim() : 'No Prerequisites found');

      setIsLoading(false);
      toast.success('Plan generated successfully!');
      return;

    } catch (error) {
      console.error('Error generating plan:', error);
      toast.error(`${error}`);
      setIsLoading(false);
      throw error;
    }
  }

  const code = async () => {
    setShowPlans(false);
    setIsLoading(true);
    setPhase('coding');

    try {
      const codeResponse = await fetch(`${process.env.NEXT_PUBLIC_GEMINI_API_URL}?key=${process.env.NEXT_PUBLIC_GEMINI_API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `${prompt}\n\nUI Plan:\n${generatedUIPlan}\n\nFlow Plan:\n${generatedFlowPlan}\n\nPrerequisites:\n${generatedLogicPlan}\n\nGenerate the complete code for the app described above in plain HTML, CSS, JS no other frameworks. Provide the full code formatted EXACTLY like this:\n\nHTML:\n[your html code]\n\nCSS:\n[your css code]\n\nJS:\n[your javascript code]\n\nDo not include any explanations. Only provide the code sections.`
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

      if (!codeData.candidates || !codeData.candidates[0] || !codeData.candidates[0].content) {
        throw new Error('Invalid code response structure');
      }

      const codeText = codeData.candidates[0].content.parts[0].text;

      // Parse the generated code
      const htmlMatch = codeText.match(/HTML:(.*?)(?=CSS:|JS:|$)/s);
      const cssMatch = codeText.match(/CSS:(.*?)(?=JS:|$)/s);
      const jsMatch = codeText.match(/JS:(.*?)$/s);

      setGeneratedCode({
        html: htmlMatch ? htmlMatch[1].trim() : '<!-- No HTML generated -->',
        css: cssMatch ? cssMatch[1].trim() : '/* No CSS generated */',
        js: jsMatch ? jsMatch[1].trim() : '// No JS generated'
      });

      setPhase('completed');
      setIsLoading(false);
      toast.success('Code generated successfully!');
    } catch (error) {
      console.error('Error generating code:', error);
      toast.error('Error generating code');
      setIsLoading(false);
    }
  }

  // Create preview HTML
  const getPreviewHTML = () => {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${newAppName}</title>
  <style>${generatedCode.css}</style>
</head>
<body>
  ${generatedCode.html}
  <script>${generatedCode.js}</script>
</body>
</html>
    `;
  };

  return (
    <div className="p-6">
      <div className={"m-auto max-w-2xl transition-all duration-300 " + `${showProjects ? '' : 'mt-[10%]'}`}>
        <p className="text-5xl text-start font-semibold">Build something <span className="font-[800]">Perfect</span></p>
        <Textarea placeholder="Describe your app idea and generate a plan and code with AI." className="mb-4 h-45 resize-none mt-5" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
        <Button size="lg" className="w-full" onClick={() => setMagicSheet(true)}>
          <Sparkles className="mr-2" />
          {isLoading ? (phase === 'planning' ? 'Planning...' : phase === 'coding' ? 'Coding...' : 'Completed!') : `Show magic to ${user?.firstName}`}
        </Button>
      </div>

      <br />

      <div className="m-auto max-w-2xl">
        <Button variant={'secondary'} onClick={() => setShowProjects(!showProjects)}>
          {showProjects ? 'Hide Projects' : 'Show Projects'}
        </Button>
      </div>
      <br />
      {showProjects === true && (
        <div className="m-auto max-w-2xl space-y-2">
          {projects.length === 0 ? (
            <p className="text-center text-gray-500 py-8">No projects yet. Create your first one!</p>
          ) : (
            projects.map((proj: any) => (
              <Link href={`/projects/${proj.id}`} target="_blank" key={proj.id} className="block">
                <div
                  className="border rounded-lg p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <p className="text-xl font-semibold">{proj.name}</p>
                  <p className="text-gray-600">{proj.description.slice(0, 100)}...</p>
                </div>
              </Link>
            ))
          )}
        </div>
      )}

      <Sheet open={magicSheet} onOpenChange={setMagicSheet}>
        <SheetContent className="overflow-y-auto p-6 sm:max-w-[800px]">
          <SheetHeader>
            <SheetTitle className="mb-4 text-3xl font-semibold">Create your project</SheetTitle>
          </SheetHeader>
          <div className="space-y-4">
            {phase === 'planning' && showPlans && (
              <>
                <Input placeholder="Project Name" value={newAppName} onChange={(e) => setNewAppName(e.target.value)} />
                <Textarea placeholder="Describe your app idea and generate a plan and code with AI." className="h-45 resize-none" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
                <Button size="lg" className="w-full p-6" onClick={handleGenerate} disabled={isLoading}>
                  <Sparkles className="mr-2" />
                  Generate Plan & Code
                </Button>
              </>
            )}
            {formError && <p className="text-sm text-red-500">{formError}</p>}

            {isLoading && phase === 'planning' && (
              <div className="mt-4 flex items-center">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                <p>Generating plan...</p>
              </div>
            )}

            {(generatedUIPlan || generatedFlowPlan || generatedLogicPlan) && showPlans && !isLoading && (
              <>
                <Card className="mt-4">
                  <Tabs defaultValue="ui" className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="ui">UI Plan</TabsTrigger>
                      <TabsTrigger value="flow">Flow Plan</TabsTrigger>
                      <TabsTrigger value="logic">Prerequisites</TabsTrigger>
                    </TabsList>
                    <TabsContent value="ui">
                      <CardHeader>
                        <CardTitle className="flex items-center"><FileText className="mr-2" /> UI Plan</CardTitle>
                        <CardDescription>Detailed user interface design plan including layout, components, and user experience</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Textarea
                          value={generatedUIPlan}
                          onChange={(e) => setGeneratedUIPlan(e.target.value)}
                          className="font-mono resize-none h-[400px]"
                        />
                      </CardContent>
                    </TabsContent>
                    <TabsContent value="flow">
                      <CardHeader>
                        <CardTitle className="flex items-center"><FileText className="mr-2" /> Flow Plan</CardTitle>
                        <CardDescription>User flow and navigation structure</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Textarea
                          value={generatedFlowPlan}
                          onChange={(e) => setGeneratedFlowPlan(e.target.value)}
                          className="font-mono resize-none h-[400px]"
                        />
                      </CardContent>
                    </TabsContent>
                    <TabsContent value="logic">
                      <CardHeader>
                        <CardTitle className="flex items-center"><FileText className="mr-2" /> Prerequisites</CardTitle>
                        <CardDescription>Logic handling, dependencies and setup needed</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Textarea
                          value={generatedLogicPlan}
                          onChange={(e) => setGeneratedLogicPlan(e.target.value)}
                          className="font-mono resize-none h-[400px]"
                        />
                      </CardContent>
                    </TabsContent>
                  </Tabs>
                </Card>
                <Button size="lg" className="w-full" onClick={code} disabled={isLoading}>
                  <Check className="mr-2" />
                  Approve & Generate Code
                </Button>
              </>
            )}

            {isLoading && phase === 'coding' && (
              <div className="mt-4 flex items-center">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                <p>Generating code...</p>
              </div>
            )}

            {!showPlans && phase !== 'planning' && (
              <Card className="mt-4">
                <Tabs defaultValue="code" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="code">
                      <Code className="mr-2 h-4 w-4" />
                      Code
                    </TabsTrigger>
                    <TabsTrigger value="preview">
                      <Play className="mr-2 h-4 w-4" />
                      Preview
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="code">
                    <CardHeader>
                      <CardTitle>Generated Code</CardTitle>
                      <CardDescription>View and copy your generated code</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Tabs defaultValue="html" className="w-full">
                        <TabsList className="grid w-full grid-cols-3">
                          <TabsTrigger value="html">HTML</TabsTrigger>
                          <TabsTrigger value="css">CSS</TabsTrigger>
                          <TabsTrigger value="js">JavaScript</TabsTrigger>
                        </TabsList>
                        <TabsContent value="html">
                          <Textarea
                            value={generatedCode.html}
                            onChange={(e) => setGeneratedCode({ ...generatedCode, html: e.target.value })}
                            className="font-mono text-sm resize-none h-[500px]"
                          />
                        </TabsContent>
                        <TabsContent value="css">
                          <Textarea
                            value={generatedCode.css}
                            onChange={(e) => setGeneratedCode({ ...generatedCode, css: e.target.value })}
                            className="font-mono text-sm resize-none h-[500px]"
                          />
                        </TabsContent>
                        <TabsContent value="js">
                          <Textarea
                            value={generatedCode.js}
                            onChange={(e) => setGeneratedCode({ ...generatedCode, js: e.target.value })}
                            className="font-mono text-sm resize-none h-[500px]"
                          />
                        </TabsContent>
                      </Tabs>
                    </CardContent>
                  </TabsContent>

                  <TabsContent value="preview">
                    <CardHeader>
                      <CardTitle>Live Preview</CardTitle>
                      <CardDescription>Preview your generated application</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="border rounded-lg overflow-hidden">
                        <iframe
                          srcDoc={getPreviewHTML()}
                          className="w-full h-[500px] bg-white"
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
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => {
                  setPhase('planning');
                  setShowPlans(true);
                  setGeneratedCode({ html: '', css: '', js: '' });
                  setGeneratedUIPlan('');
                  setGeneratedFlowPlan('');
                  setGeneratedLogicPlan('');
                  setNewAppName('');
                  setPrompt('');
                }}>
                  <Sparkles className="mr-2" />
                  New Project
                </Button>
                <Button className="flex-1" onClick={async () => {
                  if (!user) {
                    toast.error('You must be logged in to save a project');
                    return;
                  }
                  if (!newAppName || !prompt || !generatedCode.html) {
                    toast.error('Missing project data');
                    return;
                  }
                  const { error } = await supabase.from('projects').insert([{
                    user_id: user.id,
                    name: newAppName,
                    description: prompt,
                    uiPlan: generatedUIPlan,
                    flowPlan: generatedFlowPlan,
                    prerequisites: generatedLogicPlan,
                    generated_code: { html: generatedCode.html, css: generatedCode.css, js: generatedCode.js }
                  }]);
                  if (error) {
                    console.error('Error saving project:', error);
                    toast.error('Error saving project');
                  } else {
                    toast.success('Project saved successfully!');
                    await fetchProjects(); // Add this line
                    setMagicSheet(false);
                  }
                }}>
                  <Save className="mr-2" />
                  Save Project
                </Button>
              </div>
            )}
          </div>
          <SheetFooter className="mt-6">
            <p className="text-sm text-muted-foreground">By using this feature, you agree to our Terms of Service and Privacy Policy.</p>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}