
import React, { useState, useEffect } from 'react';
import { X, Sparkles, Loader2, Pin, AlertTriangle, Wand2, Image as ImageIcon } from 'lucide-react';
import { LinkItem, Category, AIConfig } from '../types';
import { generateLinkDescription, suggestCategory } from '../services/geminiService';

interface LinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (link: Omit<LinkItem, 'id' | 'createdAt'>) => void;
  categories: Category[];
  existingLinks?: LinkItem[];
  initialData?: LinkItem;
  aiConfig: AIConfig;
}

const LinkModal: React.FC<LinkModalProps> = ({ isOpen, onClose, onSave, categories, existingLinks, initialData, aiConfig }) => {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [iconUrl, setIconUrl] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState(categories[0]?.id || 'common');
  const [pinned, setPinned] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  
  // New State for Icon Auto-fetch
  const [autoFetchIcon, setAutoFetchIcon] = useState(true);
  
  const [duplicateWarning, setDuplicateWarning] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setTitle(initialData.title);
        setUrl(initialData.url);
        setIconUrl(initialData.icon || '');
        setDescription(initialData.description || '');
        setCategoryId(categories.some(c => c.id === initialData.categoryId) ? initialData.categoryId : (categories[0]?.id || 'common'));
        setPinned(initialData.pinned || false);
        // Default to true even for edits, allowing user to opt-out manually
        setAutoFetchIcon(true);
      } else {
        setTitle('');
        setUrl('');
        setIconUrl('');
        setDescription('');
        setCategoryId(categories[0]?.id || 'common');
        setPinned(false);
        setAutoFetchIcon(true);
      }
      setDuplicateWarning('');
    }
  }, [isOpen, initialData, categories]);

  // Logic to fetch icon
  const fetchIconFromUrl = (targetUrl: string) => {
      if (!targetUrl) return;
      try {
        let normalizedUrl = targetUrl;
        if (!targetUrl.startsWith('http')) {
            normalizedUrl = 'https://' + targetUrl;
        }
        
        // Use Google's specialized favicon service which is more robust
        // t2.gstatic.com is used by Chrome internal pages
        // fallback_opts=TYPE,SIZE,URL ensures it tries multiple ways to get an icon
        const newIcon = `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(normalizedUrl)}&size=128`;
        
        setIconUrl(newIcon);
      } catch (e) {
          // invalid url
      }
  };

  const handleUrlBlur = () => {
      if (!url) return;
      
      let normalizedUrl = url;
      if (!url.startsWith('http')) {
          normalizedUrl = 'https://' + url;
          setUrl(normalizedUrl);
      }

      // 1. Check Duplicate
      if (existingLinks && !initialData) {
          const exists = existingLinks.some(l => {
              const u1 = l.url.replace(/\/$/, '').toLowerCase();
              const u2 = normalizedUrl.replace(/\/$/, '').toLowerCase();
              return u1 === u2;
          });
          if (exists) {
              setDuplicateWarning('注意：该链接已存在！');
          } else {
              setDuplicateWarning('');
          }
      }

      // 2. Auto fetch icon if enabled
      if (autoFetchIcon) {
          fetchIconFromUrl(normalizedUrl);
      }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ title, url, description, categoryId, pinned, icon: iconUrl });
    onClose();
  };

  const handleAIAssist = async () => {
    if (!url || !title) return;
    if (!aiConfig.apiKey) {
        alert("请先点击侧边栏左下角设置图标配置 AI API Key");
        return;
    }

    setIsGenerating(true);
    try {
        const descPromise = generateLinkDescription(title, url, aiConfig);
        const catPromise = suggestCategory(title, url, categories, aiConfig);
        const [desc, cat] = await Promise.all([descPromise, catPromise]);
        
        if (desc) setDescription(desc);
        // AI 返回的分类必须真实存在，否则保持当前选择
        if (cat && categories.some(c => c.id === cat)) setCategoryId(cat);
    } catch (e) {
        console.error("AI Assist failed", e);
    } finally {
        setIsGenerating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-slate-700 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold dark:text-white">
            {initialData ? '编辑链接' : '添加新链接'}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors">
            <X className="w-5 h-5 dark:text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-4 space-y-4">
          
          {/* URL Input */}
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-slate-300">URL 链接</label>
            <div className="relative">
                <input
                    type="url"
                    required
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onBlur={handleUrlBlur}
                    className={`w-full p-2 rounded-lg border ${duplicateWarning ? 'border-amber-500 focus:ring-amber-500' : 'border-slate-300 dark:border-slate-600 focus:ring-blue-500'} dark:bg-slate-700 dark:text-white focus:ring-2 outline-none transition-all`}
                    placeholder="https://..."
                />
                {duplicateWarning && (
                    <div className="absolute right-2 top-2 text-amber-500 animate-pulse" title={duplicateWarning}>
                        <AlertTriangle size={20} />
                    </div>
                )}
            </div>
            {duplicateWarning && <p className="text-xs text-amber-500 mt-1">{duplicateWarning}</p>}
          </div>

          {/* Title Input */}
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-slate-300">标题</label>
            <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                placeholder="网站名称"
            />
          </div>

          {/* Icon Section - Redesigned */}
          <div>
             <label className="block text-sm font-medium mb-1 dark:text-slate-300">图标 URL</label>
             <div className="flex gap-2">
                 {/* Preview */}
                 <div className="shrink-0 w-10 h-10 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 flex items-center justify-center overflow-hidden">
                    {iconUrl ? (
                         <img 
                            src={iconUrl} 
                            className="w-full h-full object-contain"
                            onError={(e) => {e.currentTarget.style.display='none'}}
                         />
                    ) : (
                        <ImageIcon size={18} className="text-slate-400"/>
                    )}
                 </div>
                 
                 {/* Input */}
                 <input 
                    type="text"
                    value={iconUrl}
                    onChange={(e) => setIconUrl(e.target.value)}
                    className="flex-1 p-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="https://example.com/icon.png"
                 />

                 {/* Button */}
                 <button
                    type="button"
                    onClick={() => fetchIconFromUrl(url)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1 whitespace-nowrap transition-colors"
                 >
                    <Wand2 size={14} /> 获取图标
                 </button>
             </div>
             
             {/* Checkbox */}
             <div className="mt-2 flex items-center gap-2">
                <input 
                    type="checkbox" 
                    id="autoFetch"
                    checked={autoFetchIcon}
                    onChange={(e) => setAutoFetchIcon(e.target.checked)}
                    className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <label htmlFor="autoFetch" className="text-sm text-slate-600 dark:text-slate-400 cursor-pointer select-none">
                    自动获取 URL 链接的图标
                </label>
             </div>
          </div>

          {/* Description & Category */}
          <div className="grid grid-cols-1 gap-4">
              <div>
                <div className="flex justify-between items-center mb-1">
                    <label className="block text-sm font-medium dark:text-slate-300">描述 (选填)</label>
                    {(title && url) && (
                        <button
                            type="button"
                            onClick={handleAIAssist}
                            disabled={isGenerating}
                            className="text-xs flex items-center gap-1 text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 transition-colors"
                        >
                            {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                            AI 自动填写
                        </button>
                    )}
                </div>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all h-20 resize-none"
                  placeholder="简短描述..."
                />
              </div>

              <div className="flex gap-4">
                <div className="flex-1">
                    <label className="block text-sm font-medium mb-1 dark:text-slate-300">分类</label>
                    <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    >
                    {categories.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                    </select>
                </div>
                <div className="flex items-end pb-1">
                    <button
                        type="button"
                        onClick={() => setPinned(!pinned)}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border transition-all h-[42px] ${
                            pinned 
                            ? 'bg-blue-100 border-blue-200 text-blue-600 dark:bg-blue-900/40 dark:border-blue-800 dark:text-blue-300' 
                            : 'bg-slate-50 border-slate-200 text-slate-500 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-400'
                        }`}
                    >
                        <Pin size={16} className={pinned ? "fill-current" : ""} />
                        <span className="text-sm font-medium">置顶</span>
                    </button>
                </div>
              </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors shadow-lg shadow-blue-500/30"
            >
              保存链接
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LinkModal;
