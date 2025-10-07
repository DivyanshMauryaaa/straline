'use client'

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import supabase from "@/lib/supabase";
import { useUser } from "@clerk/nextjs";
import { Save, Sparkles, Check, Loader2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface Plan {
  name: string;
  uiPlan: string;
  flowPlan: string;
  prerequisites: string;
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

  const { user } = useUser();
  const [projects, setProjects] = useState<any[]>([]);

  const fetchProjects = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', user.id);
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

  const generateWithGemini = async (userPrompt: string, projectName: string) => {
    const GEMINI_API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      throw new Error('Gemini API key not configured');
    }

    const systemPrompt = `You are an expert web application planner. Based on the user's idea, generate a comprehensive plan with exactly these three sections:

1. UI_PLAN: Detailed user interface design plan including layout, components, and user experience
2. FLOW_PLAN: User flow and navigation structure
3. PREREQUISITES: Logic Handeling (for eg. How exactly are we going to handle SignUp() etc.) In clear steps ,Dependencies and setup needed

Format your response EXACTLY like this:
UI_PLAN:[your ui plan here]
FLOW_PLAN:[your flow plan here]
PREREQUISITES:[your prerequisites here]

Be specific and practical. For project: "${projectName}" and idea: "${userPrompt}"`;

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
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.statusText}`);
    }

    const data = await response.json();
    const responseText = data.candidates[0].content.parts[0].text;

    // Parse the response
    const uiPlanMatch = responseText.match(/UI_PLAN:(.*?)(?=FLOW_PLAN:|$)/s);
    const flowPlanMatch = responseText.match(/FLOW_PLAN:(.*?)(?=PREREQUISITES:|$)/s);
    const prerequisitesMatch = responseText.match(/PREREQUISITES:(.*?)$/s);

    return {
      uiPlan: uiPlanMatch ? uiPlanMatch[1].trim() : 'No UI plan generated.',
      flowPlan: flowPlanMatch ? flowPlanMatch[1].trim() : 'No flow plan generated.',
      prerequisites: prerequisitesMatch ? prerequisitesMatch[1].trim() : 'No prerequisites generated.'
    };
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
      // First create the project
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

      // Generate plan with Gemini AI
      const aiPlan = await generateWithGemini(prompt, name);

      const plan: Plan = {
        name: name,
        uiPlan: aiPlan.uiPlan,
        flowPlan: aiPlan.flowPlan,
        prerequisites: aiPlan.prerequisites
      };

      setGeneratedPlan(plan);
      setCurrentPhase('complete');
      toast.success("Plan generated successfully!");

    } catch (error) {
      console.error('Error generating plan:', error);
      setError('Failed to generate plan. Please try again.');
      toast.error('Failed to generate plan. Please try again.');
    } finally {
      setIsGenerating(false);
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
    } catch (error) {
      console.error('Error saving plan:', error);
      toast.error("Failed to save plan. Please try again.");
    }
  };

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

            {/* Loading State */}
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

                    <Button
                      className="flex gap-2 mt-4"
                      onClick={approvePlan}
                      disabled={isGenerating}
                    >
                      <Check /> Approve & Save Plan
                    </Button>
                  </div>
                ) : (
                  !isGenerating && <p className="text-gray-500">No plan generated yet.</p>
                )}
              </CardContent>
            </Card>

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

      {/* Existing projects list */}
      {projects.map((proj: any) => (
        <Sheet key={proj.id}>
          <SheetTrigger asChild>
            <div className="m-auto cursor-pointer w-1/2 p-[20px] border-t border-gray-300">
              <p className="flex gap-2 mb-3">
                <Trash2 size={17} className="hover:text-red-500" onClick={async () => { await supabase.from('projects').delete().eq('id', proj.id); fetchProjects(); }} />
              </p>
              <p className="text-start text-4xl font-semibold">{proj.name}</p>
              <p className="text-start text-xl font-light">{proj.description}</p>
            </div>
          </SheetTrigger>
          <SheetContent className="w-[100%] p-6 overflow-y-scroll">
            <SheetHeader>
              <SheetTitle>{proj.name}</SheetTitle>
            </SheetHeader>
            <p className="border-b border-gray-300 py-4">
              {proj.description}
            </p>

            <div className="p-5 mt-6 flex gap-3">
              <Button variant={selectedEditTab === 'overview' ? 'default' : 'ghost'} onClick={() => setSelectedEditTab('overview')}>Overview</Button>
              <Button variant={selectedEditTab === 'code' ? 'default' : 'ghost'} onClick={() => setSelectedEditTab('code')}>Code</Button>
            </div>

            <Card className="mt-3">
              <CardContent>
                {selectedEditTab === 'overview' && (
                  <div>
                    <div className="flex gap-3">
                      <Button variant={selectedTab === 'uiPlan' ? 'default' : 'outline'} onClick={() => setSelectedTab('uiPlan')}>UI Plan</Button>
                      <Button variant={selectedTab === 'flowPlan' ? 'default' : 'outline'} onClick={() => setSelectedTab('flowPlan')}>Flow Plan</Button>
                      <Button variant={selectedTab === 'prerequisites' ? 'default' : 'outline'} onClick={() => setSelectedTab('prerequisites')}>Prerequisites</Button>
                    </div>

                    <div className="space-y-4 mt-5">
                      {selectedTab === 'uiPlan' && (
                        <div>
                          <Textarea
                            value={proj.uiPlan || 'No UI Plan available.'}
                            onChange={async (e) => {
                              const { error } = await supabase
                                .from('projects')
                                .update({ uiPlan: e.target.value })
                                .eq('id', proj.id);
                              if (error) {
                                toast.error('Failed to save changes');
                              } else {
                                toast.success('Changes saved');
                                fetchProjects();
                              }
                            }}
                            className="min-h-[400px] font-mono text-sm"
                          />
                        </div>
                      )}
                      {selectedTab === 'flowPlan' && (
                        <div>
                          <Textarea
                            value={proj.flowPlan || 'No Flow Plan available.'}
                            onChange={async (e) => {
                              const { error } = await supabase
                                .from('projects')
                                .update({ flowPlan: e.target.value })
                                .eq('id', proj.id);
                              if (error) {
                                toast.error('Failed to save changes');
                              } else {
                                toast.success('Changes saved');
                                fetchProjects();
                              }
                            }}
                            className="min-h-[400px] font-mono text-sm"
                          />
                        </div>
                      )}
                      {selectedTab === 'prerequisites' && (
                        <div>
                          <Textarea
                            value={proj.prerequisites || 'No Prerequisites available.'}
                            onChange={async (e) => {
                              const { error } = await supabase
                                .from('projects')
                                .update({ prerequisites: e.target.value })
                                .eq('id', proj.id);
                              if (error) {
                                toast.error('Failed to save changes');
                              } else {
                                toast.success('Changes saved');
                                fetchProjects();
                              }
                            }}
                            className="min-h-[400px] font-mono text-sm"
                          />
                        </div>
                      )}
                    </div>
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