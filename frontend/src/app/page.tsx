"use client";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import axios from "axios";
import GraphView from "@/components/graph-view";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  Terminal,
  Zap,
  Send,
  FileText,
  Loader2,
  Box,
  LayoutGrid,
  FileCode,
  MessageSquare,
  Command,
  Wifi,
  WifiOff,
  Server,
  Cpu,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Copy,
  Check,
  BookOpen,
} from "lucide-react";

// --- SETTINGS ---
const API_BASE_URL = "http://127.0.0.1:8000";

// --- TYPES & HELPERS ---

type FileNode = {
  name: string;
  path: string;
  type: "file" | "folder";
  children?: FileNode[];
};

const buildFileTree = (paths: string[]): FileNode[] => {
  const root: FileNode[] = [];
  paths.forEach((path) => {
    if (path.startsWith("module:")) return;
    const parts = path.split("/");
    let currentLevel = root;
    parts.forEach((part, index) => {
      const isFile = index === parts.length - 1;
      const existingNode = currentLevel.find((node) => node.name === part);
      if (existingNode) {
        if (!isFile) currentLevel = existingNode.children!;
      } else {
        const newNode: FileNode = {
          name: part,
          path: isFile ? path : parts.slice(0, index + 1).join("/"),
          type: isFile ? "file" : "folder",
          children: isFile ? undefined : [],
        };
        currentLevel.push(newNode);
        if (!isFile) currentLevel = newNode.children!;
      }
    });
  });

  const sortNodes = (nodes: FileNode[]) => {
    nodes.sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === "folder" ? -1 : 1;
    });
    nodes.forEach((node) => {
      if (node.children) sortNodes(node.children);
    });
  };
  sortNodes(root);
  return root;
};

// --- COMPONENTS ---

const FileTreeItem = ({
  node,
  level,
  onSelect,
  selectedFile,
}: {
  node: FileNode;
  level: number;
  onSelect: (path: string) => void;
  selectedFile: string | null;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const isSelected = selectedFile === node.path;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (node.type === "folder") setIsOpen(!isOpen);
    else onSelect(node.path);
  };

  return (
    <div>
      <div
        onClick={handleClick}
        className={`flex items-center gap-2 py-1.5 px-2 cursor-pointer transition-all duration-200 text-sm select-none rounded-md mx-1
            ${
              isSelected
                ? "bg-orange-500/10 text-orange-400 border border-orange-500/20"
                : "hover:bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-transparent"
            }
        `}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
      >
        <span className="text-zinc-600 shrink-0">
          {node.type === "folder" &&
            (isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
        </span>

        {node.type === "folder" ? (
          isOpen ? (
            <FolderOpen size={14} className="text-amber-500/80 shrink-0" />
          ) : (
            <Folder size={14} className="text-amber-500/80 shrink-0" />
          )
        ) : (
          <FileCode
            size={14}
            className={`shrink-0 ${isSelected ? "text-orange-500" : "text-zinc-500"}`}
          />
        )}

        <span className="truncate font-medium">{node.name}</span>
      </div>

      {isOpen && node.children && (
        <div className="border-l border-zinc-800/50 ml-3">
          {node.children.map((child) => (
            <FileTreeItem
              key={child.path}
              node={child}
              level={level + 1}
              onSelect={onSelect}
              selectedFile={selectedFile}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const CodeCell = ({ language, code }: { language: string; code: string }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-3 rounded-lg overflow-hidden border border-zinc-800 bg-[#080808] shadow-lg w-full group relative">
      <div className="flex items-center justify-between px-3 py-2 bg-[#121212] border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-zinc-700/50"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-zinc-700/50"></div>
          </div>
          <span className="text-[10px] font-bold text-orange-500 uppercase font-mono tracking-wider bg-orange-500/10 px-1.5 py-0.5 rounded">
            {language || "TEXT"}
          </span>
        </div>
        <button
          onClick={handleCopy}
          className="text-zinc-500 hover:text-white transition-colors p-1"
          title="Copy Code"
        >
          {copied ? (
            <Check size={14} className="text-green-500" />
          ) : (
            <Copy size={14} />
          )}
        </button>
      </div>
      <div className="p-0 overflow-x-auto">
        <SyntaxHighlighter
          language={language || "python"}
          style={vscDarkPlus}
          customStyle={{
            margin: 0,
            padding: "1rem",
            background: "transparent",
            fontSize: "0.875rem", // text-sm equivalent
            fontFamily: "monospace",
            lineHeight: "1.6",
          }}
          showLineNumbers={false} // Clean look as per original design, set true if needed
        >
          {code}
        </SyntaxHighlighter>
      </div>
    </div>
  );
};

// --- MAIN PAGE ---

export default function Home() {
  const [graphData, setGraphData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"graph" | "code">("graph");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [isFileLoading, setIsFileLoading] = useState(false);
  const [input, setInput] = useState("");
  const [chatLog, setChatLog] = useState<any[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Panel States
  const [isLeftOpen, setIsLeftOpen] = useState(true);
  const [isRightOpen, setIsRightOpen] = useState(true);

  // Connection States
  const [backendStatus, setBackendStatus] = useState<"online" | "offline">(
    "offline",
  );
  const [llmStatus, setLlmStatus] = useState<"online" | "offline">("offline");

  const fileTree = useMemo(
    () =>
      !graphData?.nodes
        ? []
        : buildFileTree(graphData.nodes.map((n: any) => n.id)),
    [graphData],
  );

  // --- API CALLS (FIXED URLS) ---

  const checkHealth = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/health`, { timeout: 2000 });
      setBackendStatus("online");
      setLlmStatus(res.data.llm === "connected" ? "online" : "offline");
    } catch {
      setBackendStatus("offline");
      setLlmStatus("offline");
    }
  }, []);

  const fetchGraph = useCallback(async () => {
    if (backendStatus === "offline") return;
    try {
      const res = await axios.get(`${API_BASE_URL}/analyze`);
      setGraphData((prev: any) =>
        JSON.stringify(prev) !== JSON.stringify(res.data) ? res.data : prev,
      );
    } catch (e) {
      // Hata logunu temizledik, 404 hataları backend kapalıyken normaldir.
    }
  }, [backendStatus]);

  useEffect(() => {
    checkHealth();
    fetchGraph();
    const i1 = setInterval(checkHealth, 3000);
    const i2 = setInterval(fetchGraph, 5000);
    return () => {
      clearInterval(i1);
      clearInterval(i2);
    };
  }, [checkHealth, fetchGraph]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatLog, isChatLoading]);

  // Handle File Open
  const handleOpenFile = async (filePath: string) => {
    if (backendStatus === "offline") return;
    setSelectedFile(filePath);
    setActiveTab("code");

    if (filePath.startsWith("module:")) {
      setFileContent(
        `"""\nEXTERNAL LIBRARY: ${filePath.replace("module:", "")}\nBinary content not available.\n"""`,
      );
      return;
    }

    setFileContent(null);
    setIsFileLoading(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/read-file?path=${filePath}`);
      if (res.data.error)
        setFileContent(`# Error loading file\n${res.data.error}`);
      else setFileContent(res.data.content);
    } catch {
      setFileContent("# Error\nCould not connect to file server.");
    } finally {
      setIsFileLoading(false);
    }
  };

  // Send Chat
  const handleSendChat = async () => {
    if (!input.trim()) return;
    if (llmStatus === "offline") {
      setChatLog((prev) => [
        ...prev,
        { type: "user", text: input },
        { type: "error", text: "⚠️ AI Model is OFFLINE." },
      ]);
      setInput("");
      return;
    }
    const msg = input;
    setInput("");
    setChatLog((prev) => [...prev, { type: "user", text: msg }]);
    setIsChatLoading(true);

    try {
      const res = await axios.post(`${API_BASE_URL}/chat`, { message: msg });

      const { plan, code, role } = res.data;
      const newMessages: any[] = [];

      if (plan) {
        newMessages.push({
          type: "agent",
          role: role || "Architect",
          text: plan,
        });
      }

      if (code && code.trim() !== "") {
        newMessages.push({
          type: "agent",
          role: "Engineer",
          text: code,
        });
      }

      setChatLog((prev) => [...prev, ...newMessages]);
    } catch {
      setChatLog((prev) => [
        ...prev,
        { type: "error", text: "Connection Failed" },
      ]);
    } finally {
      setIsChatLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-[#050505] text-zinc-300 font-sans overflow-hidden selection:bg-orange-500/30">
      {/* LEFT PANEL */}
      <div
        className={`bg-[#0a0a0a] border-r border-zinc-800/50 flex flex-col transition-all duration-300 ease-in-out relative z-20 ${isLeftOpen ? "w-72 translate-x-0" : "w-0 -translate-x-full opacity-0 border-none overflow-hidden"}`}
      >
        <div className="h-14 flex items-center px-5 border-b border-zinc-800/50 bg-[#0a0a0a] justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="bg-orange-500/10 p-1.5 rounded-lg border border-orange-500/20">
              <Command size={18} className="text-orange-500" />
            </div>
            <span className="font-bold text-zinc-100 tracking-wide text-lg">
              UMBRA
            </span>
          </div>
          <button
            onClick={() => setIsLeftOpen(false)}
            className="text-zinc-500 hover:text-white transition-colors"
          >
            <PanelLeftClose size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 scrollbar-thin scrollbar-thumb-zinc-800">
          {backendStatus === "offline" ? (
            <div className="flex flex-col items-center justify-center h-48 text-red-500/50 gap-3 border border-red-900/20 rounded-xl bg-red-950/5 mx-2 mt-4">
              <WifiOff size={32} />
              <div className="text-center">
                <span className="text-sm font-bold block text-red-400">
                  DISCONNECTED
                </span>
                <span className="text-[10px] text-red-500/60">
                  Check Core Server
                </span>
              </div>
            </div>
          ) : (
            <>
              <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3 px-2 mt-2 flex items-center gap-2">
                <Folder size={12} /> PROJECT SOURCE
              </div>
              <div className="space-y-0.5 pb-6">
                {fileTree.map((node) => (
                  <FileTreeItem
                    key={node.path}
                    node={node}
                    level={0}
                    onSelect={handleOpenFile}
                    selectedFile={selectedFile}
                  />
                ))}
              </div>
              {graphData?.nodes?.some((n: any) =>
                n.id.startsWith("module:"),
              ) && (
                <>
                  <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-4 mb-3 px-2 flex items-center gap-2 border-t border-zinc-800 pt-4">
                    <Box size={12} /> DEPENDENCIES
                  </div>
                  <div className="space-y-0.5">
                    {graphData?.nodes
                      ?.filter((n: any) => n.id.startsWith("module:"))
                      .map((node: any) => (
                        <div
                          key={node.id}
                          onClick={() => handleOpenFile(node.id)}
                          className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-sm hover:bg-zinc-800/50 text-zinc-500 ml-2 group transition-colors"
                        >
                          <Box
                            size={14}
                            className="text-amber-700 group-hover:text-amber-500 shrink-0 transition-colors"
                          />
                          <span className="truncate group-hover:text-zinc-300">
                            {node.id.replace("module:", "")}
                          </span>
                        </div>
                      ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
        <div className="h-10 border-t border-zinc-800/50 flex items-center justify-between px-4 text-[10px] font-bold bg-[#080808] shrink-0">
          <div className="flex items-center gap-2 bg-zinc-900/50 px-2 py-1 rounded border border-zinc-800">
            <Server
              size={12}
              className={
                backendStatus === "online" ? "text-green-500" : "text-red-500"
              }
            />
            <span
              className={
                backendStatus === "online" ? "text-zinc-400" : "text-red-500"
              }
            >
              CORE
            </span>
          </div>
          <div className="flex items-center gap-2 bg-zinc-900/50 px-2 py-1 rounded border border-zinc-800">
            <Cpu
              size={12}
              className={
                llmStatus === "online" ? "text-orange-500" : "text-zinc-700"
              }
            />
            <span
              className={
                llmStatus === "online" ? "text-orange-500" : "text-zinc-600"
              }
            >
              {llmStatus === "online" ? "AI READY" : "AI OFF"}
            </span>
          </div>
        </div>
      </div>

      {/* MIDDLE PANEL */}
      <div className="flex-1 flex flex-col bg-[#050505] min-w-0 relative z-10 transition-all duration-300">
        <div className="h-14 flex items-center bg-[#0a0a0a] border-b border-zinc-800/50 px-4 justify-between gap-4">
          <div className="flex items-center gap-4 h-full">
            {!isLeftOpen && (
              <button
                onClick={() => setIsLeftOpen(true)}
                className="text-zinc-500 hover:text-white p-1 rounded hover:bg-zinc-800 transition-colors"
              >
                <PanelLeftOpen size={20} />
              </button>
            )}
            <div className="flex items-center bg-zinc-900/50 p-1 rounded-lg border border-zinc-800/50 h-9">
              <button
                onClick={() => setActiveTab("graph")}
                className={`px-4 h-full flex items-center gap-2 text-xs font-medium rounded-md transition-all ${activeTab === "graph" ? "bg-zinc-800 text-orange-400 shadow-sm" : "text-zinc-500 hover:text-zinc-300"}`}
              >
                <LayoutGrid size={14} /> Graph
              </button>
              <button
                onClick={() => setActiveTab("code")}
                className={`px-4 h-full flex items-center gap-2 text-xs font-medium rounded-md transition-all ${activeTab === "code" ? "bg-zinc-800 text-orange-400 shadow-sm" : "text-zinc-500 hover:text-zinc-300"}`}
              >
                <FileText size={14} /> Code
              </button>
            </div>
            <div className="h-6 w-[1px] bg-zinc-800"></div>
            <span className="text-sm text-zinc-400 font-medium flex items-center gap-2 truncate">
              {selectedFile ? (
                <>
                  <FileCode size={16} className="text-orange-500" />
                  {selectedFile.split("/").pop()}
                </>
              ) : (
                <span className="text-zinc-600 italic">No file selected</span>
              )}
            </span>
          </div>
          {!isRightOpen && (
            <button
              onClick={() => setIsRightOpen(true)}
              className="text-zinc-500 hover:text-white p-1 rounded hover:bg-zinc-800 transition-colors"
            >
              <PanelRightOpen size={20} />
            </button>
          )}
        </div>

        <div className="flex-1 relative overflow-hidden bg-[#050505]">
          <div
            className={`absolute inset-0 transition-opacity duration-300 ${activeTab === "graph" ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"}`}
          >
            {graphData ? (
              <GraphView
                initialNodes={graphData.nodes}
                initialEdges={graphData.edges}
                onNodeClick={handleOpenFile}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-zinc-500 flex-col gap-4">
                {backendStatus === "offline" ? (
                  <div className="flex items-center gap-2 text-red-500 bg-red-950/10 px-4 py-2 rounded-full border border-red-900/20">
                    <WifiOff size={18} /> Waiting for Backend Connection...
                  </div>
                ) : (
                  <>
                    <Loader2
                      className="animate-spin text-orange-500"
                      size={40}
                    />
                    <span className="text-xs uppercase tracking-[0.2em] text-zinc-600">
                      Initializing Neural Map...
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
          <div
            className={`absolute inset-0 bg-[#050505] overflow-auto transition-opacity duration-300 scrollbar-thin scrollbar-thumb-zinc-800 ${activeTab === "code" ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"}`}
          >
            {selectedFile ? (
              isFileLoading ? (
                <div className="flex h-full items-center justify-center gap-3 text-zinc-500">
                  <Loader2 className="animate-spin text-orange-500" /> Reading
                  file stream...
                </div>
              ) : (
                <div className="p-8 max-w-5xl mx-auto">
                  <div className="prose prose-sm max-w-none prose-invert">
                    <ReactMarkdown
                      components={{
                        code({ node, className, children, ...props }: any) {
                          const match = /language-(\w+)/.exec(className || "");
                          return match ? (
                            <CodeCell
                              language={match[1]}
                              code={String(children).replace(/\n$/, "")}
                            />
                          ) : (
                            <code
                              className="bg-white/10 px-1.5 py-0.5 rounded text-xs font-mono text-orange-100/90 border border-white/5"
                              {...props}
                            >
                              {children}
                            </code>
                          );
                        },
                        pre({ children }) {
                          return (
                            <div className="not-prose my-6">{children}</div>
                          );
                        },
                        p({ children }) {
                          return <p className="mb-2 last:mb-0">{children}</p>;
                        },
                        ul({ children }) {
                          return (
                            <ul className="list-disc pl-4 space-y-1 mb-2">
                              {children}
                            </ul>
                          );
                        },
                        ol({ children }) {
                          return (
                            <ol className="list-decimal pl-4 space-y-1 mb-2">
                              {children}
                            </ol>
                          );
                        },
                      }}
                    >{`\`\`\`python\n${fileContent}\n\`\`\``}</ReactMarkdown>
                  </div>
                </div>
              )
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-zinc-700 gap-6">
                <div className="w-24 h-24 bg-zinc-900/30 border border-zinc-800 rounded-full flex items-center justify-center shadow-2xl">
                  <LayoutGrid size={40} className="text-orange-500/30" />
                </div>
                <p className="text-sm font-medium tracking-wide">
                  Select a file from Explorer or Graph to view source.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* RIGHT PANEL (AI CHAT) */}
      <div
        className={`bg-[#0a0a0a] border-l border-zinc-800/50 flex flex-col transition-all duration-300 ease-in-out relative z-20 shrink-0 ${isRightOpen ? "w-[450px] translate-x-0" : "w-0 translate-x-full opacity-0 border-none overflow-hidden"}`}
      >
        <div className="h-14 flex items-center justify-between px-5 border-b border-zinc-800/50 bg-[#0a0a0a]">
          <div className="flex items-center gap-2.5">
            <MessageSquare size={18} className="text-orange-500" />
            <span className="font-bold text-sm text-zinc-200 tracking-wide">
              CO-PILOT
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div
              className={`text-[10px] font-bold px-2 py-0.5 rounded border flex items-center gap-1.5 ${llmStatus === "online" ? "bg-orange-500/10 text-orange-500 border-orange-500/20" : "bg-zinc-800 text-zinc-600 border-zinc-700"}`}
            >
              <div
                className={`w-1.5 h-1.5 rounded-full ${llmStatus === "online" ? "bg-orange-500 animate-pulse" : "bg-zinc-600"}`}
              ></div>
              {llmStatus === "online" ? "ACTIVE" : "OFFLINE"}
            </div>
            <button
              onClick={() => setIsRightOpen(false)}
              className="text-zinc-500 hover:text-white transition-colors"
            >
              <PanelRightClose size={18} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-6 scrollbar-thin scrollbar-thumb-zinc-800 bg-[#0a0a0a]">
          {chatLog.map((msg, i) => (
            <div
              key={i}
              className={`flex flex-col ${msg.type === "user" ? "items-end" : "items-start"} animate-in fade-in slide-in-from-bottom-2 duration-300`}
            >
              <div
                className={`max-w-[95%] rounded-2xl p-4 text-sm shadow-md border ${msg.type === "user" ? "bg-gradient-to-br from-orange-600 to-amber-700 text-white border-transparent rounded-br-none" : msg.type === "error" ? "bg-red-950/20 text-red-300 border-red-900/50" : "bg-[#121212] border-zinc-800 text-zinc-300 rounded-bl-none w-full"}`}
              >
                {msg.type !== "user" && (
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-zinc-800/50">
                    <div
                      className={`p-1 rounded ${
                        msg.role === "Architect"
                          ? "bg-purple-500/10 text-purple-400"
                          : msg.role === "Sage"
                            ? "bg-green-500/10 text-green-400"
                            : "bg-blue-500/10 text-blue-400"
                      }`}
                    >
                      {msg.role === "Architect" ? (
                        <Zap size={12} />
                      ) : msg.role === "Sage" ? (
                        <BookOpen size={12} />
                      ) : (
                        <Terminal size={12} />
                      )}
                    </div>
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                      {msg.role}
                    </span>
                  </div>
                )}
                <div
                  className={`prose prose-sm max-w-none ${msg.type === "user" ? "prose-invert" : "prose-zinc dark:prose-invert"} leading-relaxed`}
                >
                  <ReactMarkdown
                    components={{
                      code({ node, className, children, ...props }: any) {
                        const match = /language-(\w+)/.exec(className || "");
                        return match ? (
                          <CodeCell
                            language={match[1]}
                            code={String(children).replace(/\n$/, "")}
                          />
                        ) : (
                          <code
                            className="bg-white/10 px-1.5 py-0.5 rounded text-xs font-mono text-orange-100/90 border border-white/5"
                            {...props}
                          >
                            {children}
                          </code>
                        );
                      },
                      pre({ children }) {
                        return (
                          <div className="not-prose my-3 w-full">
                            {children}
                          </div>
                        );
                      },
                      p({ children }) {
                        return <p className="mb-2 last:mb-0">{children}</p>;
                      },
                      ul({ children }) {
                        return (
                          <ul className="list-disc pl-4 space-y-1 mb-2">
                            {children}
                          </ul>
                        );
                      },
                      ol({ children }) {
                        return (
                          <ol className="list-decimal pl-4 space-y-1 mb-2">
                            {children}
                          </ol>
                        );
                      },
                    }}
                  >
                    {msg.text}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          ))}
          {isChatLoading && (
            <div className="flex items-center gap-3 text-zinc-500 text-xs pl-2">
              <Loader2 size={16} className="animate-spin text-orange-500" />
              <span className="animate-pulse">Processing request...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        <div className="p-4 border-t border-zinc-800/50 bg-[#0a0a0a]">
          <div className="relative group">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" &&
                !e.shiftKey &&
                (e.preventDefault(), handleSendChat())
              }
              placeholder={
                llmStatus === "offline"
                  ? "System Offline..."
                  : "Type instructions here..."
              }
              disabled={llmStatus === "offline"}
              className="relative w-full bg-[#121212] border border-zinc-800 rounded-xl p-4 pr-14 text-sm text-zinc-200 focus:outline-none focus:border-orange-500/40 resize-none h-[80px] placeholder-zinc-600 shadow-inner font-medium disabled:opacity-50 transition-colors"
            />
            <button
              onClick={handleSendChat}
              disabled={
                !input.trim() || isChatLoading || llmStatus === "offline"
              }
              className="absolute right-3 bottom-3 p-2.5 bg-orange-600 hover:bg-orange-500 text-white rounded-lg disabled:opacity-50 disabled:bg-zinc-800 disabled:text-zinc-600 transition-all shadow-lg shadow-orange-900/20"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
