
import React, { useState, useEffect, useRef } from 'react';
import { X, Save, Bot, Cpu, Key, Globe, Sparkles, Loader2, PauseCircle, Wrench, Bookmark, Copy, Box, Check } from 'lucide-react';
import { AIConfig, LinkItem } from '../types';
import { generateLinkDescription } from '../services/geminiService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: AIConfig;
  onSave: (config: AIConfig) => void;
  links: LinkItem[];
  onUpdateLinks: (links: LinkItem[]) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ 
    isOpen, onClose, config, onSave, links, onUpdateLinks 
}) => {
  const [activeTab, setActiveTab] = useState<'ai' | 'tools'>('ai');
  const [localConfig, setLocalConfig] = useState<AIConfig>(config);
  
  // Bulk Generation State
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const shouldStopRef = useRef(false);

  // Tools State
  const [password, setPassword] = useState('');
  const [domain, setDomain] = useState('');
  const [showExtCode, setShowExtCode] = useState(false);
  const [copiedManifest, setCopiedManifest] = useState(false);
  const [copiedBackground, setCopiedBackground] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLocalConfig(config);
      setIsProcessing(false);
      setProgress({ current: 0, total: 0 });
      shouldStopRef.current = false;
      setDomain(window.location.origin);
      // Try to recover password from localStorage for convenience, though strictly auth token is stored
      const storedToken = localStorage.getItem('cloudnav_auth_token');
      if (storedToken) setPassword(storedToken);
    }
  }, [isOpen, config]);

  const handleChange = (key: keyof AIConfig, value: string) => {
    setLocalConfig(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    onSave(localConfig);
    onClose();
  };

  const handleBulkGenerate = async () => {
    if (!localConfig.apiKey) {
        alert("请先配置并保存 API Key");
        return;
    }

    const missingLinks = links.filter(l => !l.description);
    if (missingLinks.length === 0) {
        alert("所有链接都已有描述！");
        return;
    }

    if (!confirm(`发现 ${missingLinks.length} 个链接缺少描述，确定要使用 AI 自动生成吗？这可能需要一些时间。`)) return;

    setIsProcessing(true);
    shouldStopRef.current = false;
    setProgress({ current: 0, total: missingLinks.length });
    
    // Create a local copy to mutate
    let currentLinks = [...links];

    // We process sequentially to avoid rate limits
    for (let i = 0; i < missingLinks.length; i++) {
        if (shouldStopRef.current) break;

        const link = missingLinks[i];
        try {
            const desc = await generateLinkDescription(link.title, link.url, localConfig);
            
            // Update the specific link in our local copy
            currentLinks = currentLinks.map(l => l.id === link.id ? { ...l, description: desc } : l);
            
            // Sync to parent every 1 item to show progress in UI
            onUpdateLinks(currentLinks);
            
            setProgress({ current: i + 1, total: missingLinks.length });

        } catch (e) {
            console.error(`Failed to generate for ${link.title}`, e);
        }
    }

    setIsProcessing(false);
  };

  const handleStop = () => {
      shouldStopRef.current = true;
      setIsProcessing(false);
  };

  const handleCopy = (text: string, type: 'manifest' | 'background') => {
      navigator.clipboard.writeText(text);
      if (type === 'manifest') {
          setCopiedManifest(true);
          setTimeout(() => setCopiedManifest(false), 2000);
      } else {
          setCopiedBackground(true);
          setTimeout(() => setCopiedBackground(false), 2000);
      }
  };

  // 100% Reliability Bookmarklet Strategy: Window Open
  const bookmarkletCode = `javascript:(function(){
var u = window.location.href;
var t = document.title;
var target = '${domain}/?add_url='+encodeURIComponent(u)+'&add_title='+encodeURIComponent(t);
window.open(target, '_blank');
})();`.replace(/\s+/g, ' ');

  // Updated Extension Codes with Notification
  const extManifest = `{
  "manifest_version": 3,
  "name": "CloudNav 快捷保存",
  "version": "2.1",
  "permissions": ["activeTab", "notifications"],
  "action": { "default_title": "保存到 CloudNav" },
  "background": { "service_worker": "background.js" }
}`;

  const extBackground = `const CONFIG = {
  api: "${domain}/api/link",
  password: "${password}"
};

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.url) return;
  
  chrome.action.setBadgeText({ text: "..." });
  chrome.action.setBadgeBackgroundColor({ color: "#3b82f6" });

  try {
    const res = await fetch(CONFIG.api, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-auth-password": CONFIG.password
      },
      body: JSON.stringify({ title: tab.title, url: tab.url })
    });

    if (res.ok) {
        const data = await res.json();
        chrome.action.setBadgeText({ text: "OK" });
        chrome.action.setBadgeBackgroundColor({ color: "#22c55e" });
        
        // Show notification
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icon.png', // Fallback to puzzle icon if missing
            title: '保存成功',
            message: \`已保存到 [\${data.categoryName || '默认'}] 分类\`,
            priority: 1
        });
    } else {
        chrome.action.setBadgeText({ text: "ERR" });
        chrome.action.setBadgeBackgroundColor({ color: "#ef4444" });
    }
  } catch (e) {
    chrome.action.setBadgeText({ text: "NET" });
    chrome.action.setBadgeBackgroundColor({ color: "#ef4444" });
  }
  
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), 3000);
});`;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 dark:border-slate-700 flex flex-col max-h-[90vh]">
        
        <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <div className="flex gap-4">
              <button 
                onClick={() => setActiveTab('ai')}
                className={`text-sm font-semibold flex items-center gap-2 pb-1 transition-colors ${activeTab === 'ai' ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-500' : 'text-slate-500 dark:text-slate-400'}`}
              >
                <Bot size={18} /> AI 设置
              </button>
              <button 
                onClick={() => setActiveTab('tools')}
                className={`text-sm font-semibold flex items-center gap-2 pb-1 transition-colors ${activeTab === 'tools' ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-500' : 'text-slate-500 dark:text-slate-400'}`}
              >
                <Wrench size={18} /> 快捷工具
              </button>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors">
            <X className="w-5 h-5 dark:text-slate-400" />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto min-h-[300px]">
            
            {activeTab === 'ai' && (
                <>
                    {/* Provider Selection */}
                    <div>
                        <label className="block text-sm font-medium mb-2 dark:text-slate-300">API 提供商</label>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => handleChange('provider', 'gemini')}
                                className={`flex items-center justify-center gap-2 p-3 rounded-lg border transition-all ${
                                    localConfig.provider === 'gemini'
                                    ? 'bg-blue-50 border-blue-500 text-blue-700 dark:bg-blue-900/30 dark:border-blue-500 dark:text-blue-300'
                                    : 'border-slate-200 dark:border-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                                }`}
                            >
                                <span className="font-semibold">Google Gemini</span>
                            </button>
                            <button
                                onClick={() => handleChange('provider', 'openai')}
                                className={`flex items-center justify-center gap-2 p-3 rounded-lg border transition-all ${
                                    localConfig.provider === 'openai'
                                    ? 'bg-purple-50 border-purple-500 text-purple-700 dark:bg-purple-900/30 dark:border-purple-500 dark:text-purple-300'
                                    : 'border-slate-200 dark:border-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                                }`}
                            >
                                <span className="font-semibold">OpenAI 兼容</span>
                            </button>
                        </div>
                    </div>

                    {/* Model Config */}
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                                <Key size={12}/> API Key
                            </label>
                            <input
                                type="password"
                                value={localConfig.apiKey}
                                onChange={(e) => handleChange('apiKey', e.target.value)}
                                placeholder="sk-..."
                                className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                            />
                        </div>

                        {localConfig.provider === 'openai' && (
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                                    <Globe size={12}/> Base URL (API 地址)
                                </label>
                                <input
                                    type="text"
                                    value={localConfig.baseUrl}
                                    onChange={(e) => handleChange('baseUrl', e.target.value)}
                                    placeholder="https://api.openai.com/v1"
                                    className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                />
                                <p className="text-[10px] text-slate-400 mt-1">
                                    例如: https://api.deepseek.com/v1 (不需要加 /chat/completions)
                                </p>
                            </div>
                        )}

                        <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                                <Cpu size={12}/> 模型名称
                            </label>
                            <input
                                type="text"
                                value={localConfig.model}
                                onChange={(e) => handleChange('model', e.target.value)}
                                placeholder={localConfig.provider === 'gemini' ? "gemini-2.5-flash" : "gpt-3.5-turbo"}
                                className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                            />
                        </div>
                    </div>

                    {/* Bulk Actions */}
                    <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                        <h4 className="text-sm font-medium dark:text-white mb-3 flex items-center gap-2">
                            <Sparkles className="text-amber-500" size={16} /> 批量操作
                        </h4>
                        
                        {isProcessing ? (
                            <div className="bg-slate-50 dark:bg-slate-700/50 p-4 rounded-lg space-y-3">
                                <div className="flex justify-between text-xs text-slate-600 dark:text-slate-300">
                                    <span>正在生成描述...</span>
                                    <span>{progress.current} / {progress.total}</span>
                                </div>
                                <div className="w-full bg-slate-200 dark:bg-slate-600 rounded-full h-2">
                                    <div 
                                        className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                                        style={{ width: `${(progress.current / progress.total) * 100}%` }}
                                    ></div>
                                </div>
                                <button 
                                    onClick={handleStop}
                                    className="w-full py-1.5 text-xs flex items-center justify-center gap-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded border border-red-200 dark:border-red-800 transition-colors"
                                >
                                    <PauseCircle size={12} /> 停止处理
                                </button>
                            </div>
                        ) : (
                            <div className="bg-slate-50 dark:bg-slate-700/50 p-4 rounded-lg">
                                <div className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                                    自动扫描所有没有描述的链接，并调用上方配置的 AI 模型生成简介。
                                </div>
                                <button
                                    onClick={handleBulkGenerate}
                                    className="w-full py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 hover:border-blue-500 hover:text-blue-500 dark:hover:text-blue-400 dark:text-slate-200 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                                >
                                    <Sparkles size={16} /> 一键补全所有描述
                                </button>
                            </div>
                        )}
                    </div>
                </>
            )}

            {activeTab === 'tools' && (
                <div className="space-y-6">
                    <div className="space-y-3">
                        <label className="block text-xs font-medium text-slate-500 mb-1">
                            第一步：输入您的访问密码 (用于生成扩展代码)
                        </label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none font-mono tracking-widest"
                            placeholder="部署时设置的 PASSWORD"
                        />
                    </div>

                    <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg text-sm text-blue-800 dark:text-blue-200">
                        <h4 className="font-bold flex items-center gap-2 mb-2"><Bookmark size={16}/> 方案A：小书签 (推荐更新)</h4>
                        <p className="mb-3 text-xs opacity-80">
                            <strong>全新升级版：</strong> 无惧网页拦截，100% 成功率。<br/>
                            拖拽到书签栏后，点击它会弹出一个新窗口，让您手动确认分类并保存。
                        </p>
                        <div className="flex justify-center py-2 border-2 border-dashed border-blue-200 dark:border-blue-800/50 rounded-xl bg-white/50 dark:bg-black/20">
                            <a 
                                href={bookmarkletCode}
                                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-full shadow-lg cursor-move transition-transform hover:scale-105 active:scale-95 text-xs"
                                title="拖拽我到书签栏"
                                onClick={(e) => e.preventDefault()} 
                            >
                                <Save size={14} /> 保存到 CloudNav
                            </a>
                        </div>
                    </div>

                    <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                        <h4 className="font-bold dark:text-white mb-2 text-sm flex items-center gap-2">
                            <Box size={16} /> 方案B：Chrome 扩展
                        </h4>
                        <p className="text-xs text-slate-500 mb-4">
                            支持系统通知提示。请更新您的代码以获得最佳体验。
                        </p>
                        
                        {!showExtCode ? (
                            <button 
                                onClick={() => setShowExtCode(true)}
                                className="w-full py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded text-xs font-medium transition-colors"
                            >
                                显示扩展程序代码
                            </button>
                        ) : (
                            <div className="space-y-4 animate-in fade-in zoom-in duration-300">
                                <div>
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-xs font-mono font-bold text-slate-500">1. manifest.json</span>
                                        <button 
                                            onClick={() => handleCopy(extManifest, 'manifest')}
                                            className="text-[10px] flex items-center gap-1 px-2 py-1 rounded bg-slate-100 dark:bg-slate-700 hover:bg-blue-100 text-slate-600 dark:text-slate-300"
                                        >
                                            {copiedManifest ? <Check size={12}/> : <Copy size={12}/>} 复制
                                        </button>
                                    </div>
                                    <pre className="bg-slate-100 dark:bg-slate-900 p-3 rounded text-[10px] font-mono text-slate-600 dark:text-slate-300 overflow-x-auto border border-slate-200 dark:border-slate-700">
                                        {extManifest}
                                    </pre>
                                </div>
                                
                                <div>
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-xs font-mono font-bold text-slate-500">2. background.js</span>
                                        <button 
                                            onClick={() => handleCopy(extBackground, 'background')}
                                            className="text-[10px] flex items-center gap-1 px-2 py-1 rounded bg-slate-100 dark:bg-slate-700 hover:bg-blue-100 text-slate-600 dark:text-slate-300"
                                        >
                                            {copiedBackground ? <Check size={12}/> : <Copy size={12}/>} 复制
                                        </button>
                                    </div>
                                    <pre className="bg-slate-100 dark:bg-slate-900 p-3 rounded text-[10px] font-mono text-slate-600 dark:text-slate-300 overflow-x-auto border border-slate-200 dark:border-slate-700">
                                        {extBackground}
                                    </pre>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

        </div>

        {activeTab === 'ai' && (
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-3 shrink-0">
                <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors">取消</button>
                <button 
                    onClick={handleSave}
                    className="px-4 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2 font-medium"
                >
                    <Save size={16} /> 保存设置
                </button>
            </div>
        )}
      </div>
    </div>
  );
};

export default SettingsModal;
