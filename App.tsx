
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Search, Plus, Upload, Moon, Sun, Menu, 
  Trash2, Edit2, Loader2, Cloud, CheckCircle2, AlertCircle,
  Pin, Settings, Lock, CloudCog, Github, GitFork, MoreVertical,
  QrCode, Copy, LayoutGrid, List, Check, ExternalLink, ArrowRight
} from 'lucide-react';
import { 
    LinkItem, Category, DEFAULT_CATEGORIES, INITIAL_LINKS, 
    WebDavConfig, AIConfig, SiteSettings, SearchEngine, DEFAULT_SEARCH_ENGINES 
} from './types';

// 链接指向的分类不存在时（例如删掉了“常用推荐”、AI 返回了不存在的分类），
// 把它放回一个存在的分类，避免链接从页面上“隐身”
const fixOrphanLinks = (links: LinkItem[], cats: Category[]): LinkItem[] => {
  if (!cats || cats.length === 0) return links;
  const ids = new Set(cats.map(c => c.id));
  if (links.every(l => ids.has(l.categoryId))) return links;
  const fallbackId = ids.has('common') ? 'common' : cats[0].id;
  return links.map(l => ids.has(l.categoryId) ? l : { ...l, categoryId: fallbackId });
};

type SavePayload = { links: LinkItem[]; categories: Category[]; settings: SiteSettings };
import Icon from './components/Icon';
import LinkModal from './components/LinkModal';
import AuthModal from './components/AuthModal';
import CategoryManagerModal from './components/CategoryManagerModal';
import BackupModal from './components/BackupModal';
import CategoryAuthModal from './components/CategoryAuthModal';
import ImportModal from './components/ImportModal';
import SettingsModal from './components/SettingsModal';
import SearchSettingsModal from './components/SearchSettingsModal';

const GITHUB_REPO_URL = 'https://github.com/sese972010/CloudNav-';

const LOCAL_STORAGE_KEY = 'cloudnav_data_cache';
const AUTH_KEY = 'cloudnav_auth_token';
const WEBDAV_CONFIG_KEY = 'cloudnav_webdav_config';
const AI_CONFIG_KEY = 'cloudnav_ai_config';
const SEARCH_ENGINES_KEY = 'cloudnav_search_engines';

function App() {
  // --- State ---
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('all'); 
  const [searchQuery, setSearchQuery] = useState('');
  
  // New Search State
  const [searchMode, setSearchMode] = useState<'local' | 'external'>('local');
  const [externalEngines, setExternalEngines] = useState<SearchEngine[]>(() => {
      const saved = localStorage.getItem(SEARCH_ENGINES_KEY);
      if (saved) {
          try { return JSON.parse(saved); } catch(e) {}
      }
      // Filter out 'local' from defaults for the external list
      return DEFAULT_SEARCH_ENGINES.filter(e => e.id !== 'local');
  });
  const [activeEngineId, setActiveEngineId] = useState<string>(() => {
      return externalEngines[0]?.id || 'google';
  });
  const [isSearchSettingsOpen, setIsSearchSettingsOpen] = useState(false);

  const [darkMode, setDarkMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // Site Settings - Initialized with defaults to prevent crash
  const [siteSettings, setSiteSettings] = useState<SiteSettings>({
      title: 'CloudNav - 我的导航',
      navTitle: '云航 CloudNav',
      favicon: '',
      cardStyle: 'detailed'
  });
  
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, link: LinkItem | null } | null>(null);
  
  const [qrCodeLink, setQrCodeLink] = useState<LinkItem | null>(null);

  const [unlockedCategoryIds, setUnlockedCategoryIds] = useState<Set<string>>(new Set());

  const [webDavConfig, setWebDavConfig] = useState<WebDavConfig>({
      url: '',
      username: '',
      password: '',
      enabled: false
  });

  const [aiConfig, setAiConfig] = useState<AIConfig>(() => {
      const saved = localStorage.getItem(AI_CONFIG_KEY);
      if (saved) {
          try {
              return JSON.parse(saved);
          } catch (e) {}
      }
      
      // Safe access to process env
      let defaultKey = '';
      try {
          if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
              defaultKey = process.env.API_KEY;
          }
      } catch(e) {}

      return {
          provider: 'gemini',
          apiKey: defaultKey, 
          baseUrl: '',
          model: 'gemini-2.5-flash'
      };
  });
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isCatManagerOpen, setIsCatManagerOpen] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [catAuthModalData, setCatAuthModalData] = useState<Category | null>(null);
  
  const [editingLink, setEditingLink] = useState<LinkItem | undefined>(undefined);
  const [prefillLink, setPrefillLink] = useState<Partial<LinkItem> | undefined>(undefined);
  
  const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [authToken, setAuthToken] = useState<string>('');

  const mainRef = useRef<HTMLDivElement>(null);
  const isAutoScrollingRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // 手机长按弹出菜单（iOS Safari 长按链接不会触发 contextmenu）
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressStartRef = useRef<{ x: number, y: number } | null>(null);
  const longPressFiredRef = useRef(false);   // 本次触摸已经触发了长按，松手时不要打开链接
  const menuOpenedAtRef = useRef(0);         // 菜单弹出的时间，防止刚弹出就被随后的 click 关掉
  const menuClosedByTouchAtRef = useRef(0);  // 触摸菜单外面关闭菜单的时间，这次点按不打开链接

  // 云端同步状态
  const cloudVersionRef = useRef<number>(0);       // 本页数据对应的云端版本号
  const isRedactedRef = useRef(false);             // 本页数据是否是未登录时拿到的（不含私密目录）
  const authTokenRef = useRef('');
  const pendingSaveRef = useRef<SavePayload | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false);
  const lastSaveAtRef = useRef(0);

  useEffect(() => { authTokenRef.current = authToken; }, [authToken]);

  // --- Helpers ---

  const loadFromLocal = () => {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setLinks(fixOrphanLinks(parsed.links || INITIAL_LINKS, parsed.categories || DEFAULT_CATEGORIES));
        setCategories(parsed.categories || DEFAULT_CATEGORIES);
        if (parsed.settings) setSiteSettings(prev => ({ ...prev, ...parsed.settings }));
      } catch (e) {
        setLinks(INITIAL_LINKS);
        setCategories(DEFAULT_CATEGORIES);
      }
    } else {
      setLinks(INITIAL_LINKS);
      setCategories(DEFAULT_CATEGORIES);
    }
  };

  const fetchCloudData = async (token: string) => {
      const res = await fetch('/api/storage', {
          headers: token ? { 'x-auth-password': token } : {},
          cache: 'no-store'
      });
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      return res.json();
  };

  // 用云端数据替换页面上的数据
  const applyCloudData = (data: any) => {
      const cats: Category[] = data.categories || DEFAULT_CATEGORIES;
      const fixedLinks = fixOrphanLinks(data.links || [], cats);
      setLinks(fixedLinks);
      setCategories(cats);
      if (data.settings) setSiteSettings(prev => ({ ...prev, ...data.settings }));
      cloudVersionRef.current = Number(data.version) || 0;
      isRedactedRef.current = !!data.redacted;
      if (data.redacted) setUnlockedCategoryIds(new Set());
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ ...data, links: fixedLinks, categories: cats }));
  };

  // 云端已被别处修改：让用户选择载入云端最新数据，还是用本页覆盖
  const handleSaveConflict = async (payload: SavePayload, cloudVersion: number): Promise<SavePayload | null> => {
      let latest: any = null;
      try { latest = await fetchCloudData(authTokenRef.current); } catch (e) {}
      const useCloud = confirm('云端数据已经在别处（其他设备、浏览器或扩展）更新过，和本页不一致。\n\n点“确定”：载入云端最新数据，放弃本页刚才的改动（推荐）。\n点“取消”：用本页数据覆盖云端，别处的改动会丢失。');
      if (useCloud) {
          pendingSaveRef.current = null;
          if (latest) {
              applyCloudData(latest);
              setSyncStatus('idle');
          } else {
              window.location.reload();
          }
          return null;
      }
      cloudVersionRef.current = Math.max(cloudVersion, Number(latest?.version) || 0);
      return pendingSaveRef.current || payload;
  };

  // 把排队中的最新数据上传到云端。同一时间只有一个请求，两次写入至少间隔 1.1 秒
  // （Cloudflare KV 同一个键每秒只能写 1 次），并带上版本号，避免旧页面覆盖新数据
  const flushSave = async (force = false) => {
      if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
      if (isSavingRef.current) return;
      const payload = pendingSaveRef.current;
      const token = authTokenRef.current;
      if (!payload || !token) return;

      const wait = lastSaveAtRef.current + 1100 - Date.now();
      if (wait > 0 && !force) {
          saveTimerRef.current = setTimeout(() => flushSave(), wait);
          return;
      }

      pendingSaveRef.current = null;
      isSavingRef.current = true;
      lastSaveAtRef.current = Date.now();
      let retryPayload: SavePayload | null = null;
      try {
          const response = await fetch('/api/storage', {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  'x-auth-password': token,
                  'x-base-version': String(cloudVersionRef.current)
              },
              body: JSON.stringify(payload)
          });

          if (response.status === 401) {
              authTokenRef.current = '';
              setAuthToken('');
              localStorage.removeItem(AUTH_KEY);
              setIsAuthOpen(true);
              setSyncStatus('error');
          } else if (response.status === 409) {
              const body = await response.json().catch(() => ({}));
              retryPayload = await handleSaveConflict(payload, Number(body.version) || 0);
          } else if (!response.ok) {
              throw new Error('Network response was not ok');
          } else {
              const body = await response.json().catch(() => ({}));
              if (body.version) cloudVersionRef.current = Number(body.version);
              if (!pendingSaveRef.current) {
                  setSyncStatus('saved');
                  setTimeout(() => setSyncStatus(s => s === 'saved' ? 'idle' : s), 2000);
              }
          }
      } catch (error) {
          console.error("Sync failed", error);
          setSyncStatus('error');
      } finally {
          isSavingRef.current = false;
      }

      if (retryPayload && !pendingSaveRef.current) pendingSaveRef.current = retryPayload;
      if (pendingSaveRef.current && authTokenRef.current) {
          setSyncStatus('saving');
          flushSave();
      }
  };

  const updateData = (newLinks: LinkItem[], newCategories: Category[], newSettings: SiteSettings = siteSettings) => {
      if (authToken && isRedactedRef.current) {
          alert('当前页面的数据不完整，请刷新页面后再修改。');
          return;
      }
      newLinks = fixOrphanLinks(newLinks, newCategories);
      setLinks(newLinks);
      setCategories(newCategories);
      setSiteSettings(newSettings);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ links: newLinks, categories: newCategories, settings: newSettings }));
      if (authToken) {
          // 短时间内的连续改动（拖拽排序等）合并成一次上传
          pendingSaveRef.current = { links: newLinks, categories: newCategories, settings: newSettings };
          setSyncStatus('saving');
          if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
          saveTimerRef.current = setTimeout(() => flushSave(), 600);
      }
  };

  useEffect(() => {
    if (localStorage.getItem('theme') === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      setDarkMode(true);
      document.documentElement.classList.add('dark');
    }
    const savedToken = localStorage.getItem(AUTH_KEY);
    if (savedToken) {
        authTokenRef.current = savedToken;
        setAuthToken(savedToken);
    }

    const savedWebDav = localStorage.getItem(WEBDAV_CONFIG_KEY);
    if (savedWebDav) {
        try {
            setWebDavConfig(JSON.parse(savedWebDav));
        } catch (e) {}
    }

    const urlParams = new URLSearchParams(window.location.search);
    const addUrl = urlParams.get('add_url');
    if (addUrl) {
        const addTitle = urlParams.get('add_title') || '';
        window.history.replaceState({}, '', window.location.pathname);
        setPrefillLink({
            title: addTitle,
            url: addUrl,
            categoryId: 'common'
        });
        setEditingLink(undefined);
        setIsModalOpen(true);
    }

    const initData = async () => {
        try {
            const data = await fetchCloudData(savedToken || '');
            if (data.redacted && savedToken) {
                // 保存的管理密码已失效（服务器没有返回完整数据），退出登录
                authTokenRef.current = '';
                setAuthToken('');
                localStorage.removeItem(AUTH_KEY);
            }
            if ((data.links && data.links.length > 0) || (data.categories && data.categories.length > 0)) {
                applyCloudData(data);
                return;
            }
            cloudVersionRef.current = Number(data.version) || 0;
        } catch (e) {
            console.warn("Failed to fetch from cloud, falling back to local.", e);
        }
        loadFromLocal();
    };

    initData();
  }, []);

  // 切回这个标签页时，如果云端有更新（别的设备或扩展改过），自动载入最新数据；
  // 离开标签页时，把还没上传的改动立即上传
  useEffect(() => {
      const handleVisibility = async () => {
          if (document.visibilityState === 'hidden') {
              if (pendingSaveRef.current) flushSave(true);
              return;
          }
          if (pendingSaveRef.current || isSavingRef.current) return;
          try {
              const data = await fetchCloudData(authTokenRef.current);
              if (pendingSaveRef.current || isSavingRef.current) return;
              if ((Number(data.version) || 0) > cloudVersionRef.current) {
                  applyCloudData(data);
              }
          } catch (e) {}
      };
      document.addEventListener('visibilitychange', handleVisibility);
      return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  useEffect(() => {
      document.title = siteSettings.title || 'CloudNav';
      const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
      if (link && siteSettings.favicon) {
          link.href = siteSettings.favicon;
      }
  }, [siteSettings]);

  useEffect(() => {
      const handleClickOutside = (e: MouseEvent) => {
          if (openMenuId) setOpenMenuId(null);
          // 长按刚弹出菜单时，松手可能还会补发一次 click，忽略它
          if (Date.now() - menuOpenedAtRef.current < 600) return;
          if (contextMenu && contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
             setContextMenu(null);
          }
      };

      // iOS 上点空白处不一定会产生 click，所以触摸菜单外面也关闭菜单
      const handleTouchOutside = (e: TouchEvent) => {
          if (!contextMenu) return;
          if (Date.now() - menuOpenedAtRef.current < 600) return;
          if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
              menuClosedByTouchAtRef.current = Date.now();
              setContextMenu(null);
          }
      };
      
      const handleScroll = () => {
         if (contextMenu) setContextMenu(null);
      };

      window.addEventListener('click', handleClickOutside);
      window.addEventListener('touchstart', handleTouchOutside, { passive: true });
      window.addEventListener('scroll', handleScroll, true); 
      
      const handleGlobalContextMenu = (e: MouseEvent) => {
          if (contextMenu) {
              e.preventDefault();
              setContextMenu(null);
          }
      }
      window.addEventListener('contextmenu', handleGlobalContextMenu);

      return () => {
          window.removeEventListener('click', handleClickOutside);
          window.removeEventListener('touchstart', handleTouchOutside);
          window.removeEventListener('scroll', handleScroll, true);
          window.removeEventListener('contextmenu', handleGlobalContextMenu);
      }
  }, [openMenuId, contextMenu]);

  useEffect(() => {
    const handleScroll = () => {
        if (isAutoScrollingRef.current) return;
        if (!mainRef.current) return;
        
        const scrollPosition = mainRef.current.scrollTop + 150;

        if (mainRef.current.scrollTop < 80) {
            setActiveCategory('all');
            return;
        }

        let currentCatId = 'all';
        for (const cat of categories) {
            const el = document.getElementById(`cat-${cat.id}`);
            if (el && el.offsetTop <= scrollPosition && (el.offsetTop + el.offsetHeight) > scrollPosition) {
                currentCatId = cat.id;
                break;
            }
        }
        if (currentCatId !== 'all') setActiveCategory(currentCatId);
    };

    const mainEl = mainRef.current;
    if (mainEl) mainEl.addEventListener('scroll', handleScroll);
    return () => mainEl?.removeEventListener('scroll', handleScroll);
  }, [categories]);

  const toggleTheme = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    if (newMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  // --- Handlers ---
  // 登录只验证密码，不再把页面上的数据写到云端；登录后载入云端最新的完整数据
  const handleLogin = async (password: string): Promise<boolean> => {
      try {
        const response = await fetch('/api/storage?action=check', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-auth-password': password
            },
            body: '{}'
        });
        if (!response.ok) return false;

        const data = await fetchCloudData(password);
        authTokenRef.current = password;
        setAuthToken(password);
        localStorage.setItem(AUTH_KEY, password);
        setIsAuthOpen(false);

        const cloudEmpty = !(data.links && data.links.length) && !(data.categories && data.categories.length);
        if (cloudEmpty) {
            // 全新部署、云端还没有数据：和以前一样，把当前页面上的数据作为初始数据存上去
            cloudVersionRef.current = Number(data.version) || 0;
            isRedactedRef.current = false;
            pendingSaveRef.current = { links, categories, settings: siteSettings };
            setSyncStatus('saving');
            flushSave(true);
        } else {
            applyCloudData(data);
            setSyncStatus('saved');
            setTimeout(() => setSyncStatus(s => s === 'saved' ? 'idle' : s), 2000);
        }
        return true;
      } catch (e) {
          return false;
      }
  };

  // 未登录时解锁私密目录：密码由服务器验证，验证通过后才拿到该目录的链接
  const handleVerifyCategoryPassword = async (catId: string, password: string): Promise<boolean> => {
      try {
          const res = await fetch('/api/storage?action=unlock', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ categoryId: catId, password })
          });
          if (!res.ok) return false;
          const data = await res.json();
          const catLinks: LinkItem[] = data.links || [];
          setLinks(prev => [...prev.filter(l => l.categoryId !== catId), ...catLinks]);
          return true;
      } catch (e) {
          return false;
      }
  };

  const handleImportConfirm = (newLinks: LinkItem[], newCategories: Category[]) => {
      const mergedCategories = [...categories];
      newCategories.forEach(nc => {
          if (!mergedCategories.some(c => c.id === nc.id || c.name === nc.name)) {
              mergedCategories.push(nc);
          }
      });
      const mergedLinks = [...links, ...newLinks];
      updateData(mergedLinks, mergedCategories);
      setIsImportModalOpen(false);
      alert(`成功导入 ${newLinks.length} 个新书签!`);
  };

  const handleAddLink = (data: Omit<LinkItem, 'id' | 'createdAt'>) => {
    if (!authToken) { setIsAuthOpen(true); return; }
    const newLink: LinkItem = {
      ...data,
      id: Date.now().toString(),
      createdAt: Date.now()
    };
    updateData([newLink, ...links], categories);
    setPrefillLink(undefined);
  };

  const handleEditLink = (data: Omit<LinkItem, 'id' | 'createdAt'>) => {
    if (!authToken) { setIsAuthOpen(true); return; }
    if (!editingLink) return;
    const updated = links.map(l => l.id === editingLink.id ? { ...l, ...data } : l);
    updateData(updated, categories);
    setEditingLink(undefined);
  };

  const handleDeleteLink = (id: string) => {
    if (!authToken) { setIsAuthOpen(true); return; }
    if (confirm('确定删除此链接吗?')) {
      updateData(links.filter(l => l.id !== id), categories);
    }
  };

  const togglePin = (id: string) => {
      if (!authToken) { setIsAuthOpen(true); return; }
      const updated = links.map(l => l.id === id ? { ...l, pinned: !l.pinned } : l);
      updateData(updated, categories);
  };
  
  const handleCopyLink = (text: string) => {
      navigator.clipboard.writeText(text);
  };

  const handleSaveAIConfig = (config: AIConfig, newSiteSettings: SiteSettings) => {
      setAiConfig(config);
      localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(config));
      if (authToken) {
          updateData(links, categories, newSiteSettings);
      } else {
          setSiteSettings(newSiteSettings);
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ links, categories, settings: newSiteSettings }));
      }
  };

  const scrollToCategory = (catId: string) => {
      setActiveCategory(catId);
      setSidebarOpen(false);
      
      if (catId === 'all') {
          isAutoScrollingRef.current = true;
          mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
          setTimeout(() => isAutoScrollingRef.current = false, 800);
          return;
      }
      const el = document.getElementById(`cat-${catId}`);
      if (el) {
          isAutoScrollingRef.current = true;
          const top = el.offsetTop - 80;
          mainRef.current?.scrollTo({ top, behavior: 'smooth' });
          setTimeout(() => isAutoScrollingRef.current = false, 800);
      }
  };

  const handleUnlockCategory = (catId: string) => {
      setUnlockedCategoryIds(prev => new Set(prev).add(catId));
  };

  const handleUpdateCategories = (newCats: Category[], newLinks?: LinkItem[]) => {
      if (!authToken) { setIsAuthOpen(true); return; }
      updateData(newLinks || links, newCats);
  };

  const handleDeleteCategory = (catId: string) => {
      if (!authToken) { setIsAuthOpen(true); return; }
      const newCats = categories.filter(c => c.id !== catId);
      if (newCats.length === 0) newCats.push(DEFAULT_CATEGORIES[0]);
      // 优先移到“常用推荐”；它不存在（或正是被删的分类）时移到第一个分类
      const targetId = newCats.some(c => c.id === 'common') ? 'common' : newCats[0].id;
      const newLinks = links.map(l => l.categoryId === catId ? { ...l, categoryId: targetId } : l);
      updateData(newLinks, newCats);
  };

  const handleSaveWebDavConfig = (config: WebDavConfig) => {
      setWebDavConfig(config);
      localStorage.setItem(WEBDAV_CONFIG_KEY, JSON.stringify(config));
  };

  const handleRestoreBackup = (restoredLinks: LinkItem[], restoredCategories: Category[]) => {
      updateData(restoredLinks, restoredCategories);
      setIsBackupModalOpen(false);
  };
  
  // Updated Search Logic
  const handleSearchSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!searchQuery.trim()) return;
      
      if (searchMode === 'external') {
          const engine = externalEngines.find(e => e.id === activeEngineId) || externalEngines[0];
          if (engine) {
              window.open(engine.url + encodeURIComponent(searchQuery), '_blank');
              setSearchQuery('');
          }
      }
  };

  const handleUpdateSearchEngines = (newEngines: SearchEngine[]) => {
      setExternalEngines(newEngines);
      localStorage.setItem(SEARCH_ENGINES_KEY, JSON.stringify(newEngines));
  };

  const isCategoryLocked = (catId: string) => {
      const cat = categories.find(c => c.id === catId);
      if (!cat || !cat.password) return false;
      return !unlockedCategoryIds.has(catId);
  };

  const pinnedLinks = useMemo(() => {
      return links.filter(l => l.pinned && !isCategoryLocked(l.categoryId));
  }, [links, categories, unlockedCategoryIds]);

  const searchResults = useMemo(() => {
    // Only filter locally if mode is 'local'
    if (searchMode !== 'local') return links;

    let result = links;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(l => 
        l.title.toLowerCase().includes(q) || 
        l.url.toLowerCase().includes(q) ||
        (l.description && l.description.toLowerCase().includes(q))
      );
    }
    return result;
  }, [links, searchQuery, searchMode]);

  const activeExternalEngine = useMemo(() => {
      return externalEngines.find(e => e.id === activeEngineId) || externalEngines[0];
  }, [externalEngines, activeEngineId]);

  // --- Render Components ---

  // 在 (x, y) 处弹出链接菜单，靠近屏幕边缘时往里挪
  const openLinkMenu = (clientX: number, clientY: number, link: LinkItem) => {
      let x = clientX;
      let y = clientY;
      if (x + 180 > window.innerWidth) x = window.innerWidth - 190;
      if (y + 220 > window.innerHeight) y = window.innerHeight - 230;
      x = Math.max(8, x);
      y = Math.max(8, y);
      setContextMenu({ x, y, link });
  };

  const cancelLongPress = () => {
      if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
      }
      longPressStartRef.current = null;
  };

  const handleCardTouchStart = (e: React.TouchEvent, link: LinkItem) => {
      cancelLongPress();
      longPressFiredRef.current = false;
      if (e.touches.length !== 1) return; // 双指缩放等不算长按
      const t = e.touches[0];
      longPressStartRef.current = { x: t.clientX, y: t.clientY };
      longPressTimerRef.current = setTimeout(() => {
          longPressTimerRef.current = null;
          const start = longPressStartRef.current;
          if (!start) return;
          longPressFiredRef.current = true;
          menuOpenedAtRef.current = Date.now();
          openLinkMenu(start.x, start.y, link);
          try { navigator.vibrate?.(10); } catch { /* iOS 不支持震动，忽略 */ }
      }, 500);
  };

  const handleCardTouchMove = (e: React.TouchEvent) => {
      const start = longPressStartRef.current;
      if (!start || !longPressTimerRef.current) return;
      const t = e.touches[0];
      // 手指移动超过 10px 视为滚动，取消长按
      if (!t || Math.abs(t.clientX - start.x) > 10 || Math.abs(t.clientY - start.y) > 10) {
          cancelLongPress();
      }
  };

  const handleCardTouchEnd = (e: React.TouchEvent) => {
      cancelLongPress();
      if (longPressFiredRef.current) {
          // 已经弹出菜单：阻止松手后补发的 click，不打开链接
          if (e.cancelable) e.preventDefault();
      }
  };

  const handleCardClick = (e: React.MouseEvent) => {
      const justClosedMenu = Date.now() - menuClosedByTouchAtRef.current < 600;
      if (longPressFiredRef.current || justClosedMenu) {
          e.preventDefault();
          e.stopPropagation();
          longPressFiredRef.current = false;
          menuClosedByTouchAtRef.current = 0;
      }
  };

  const renderLinkCard = (link: LinkItem) => {
      const iconDisplay = link.icon ? (
         <img 
            src={link.icon} 
            alt="" 
            className="w-5 h-5 object-contain" 
            onError={(e) => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.parentElement!.innerText = link.title.charAt(0);
            }}
         />
      ) : link.title.charAt(0);
      
      const isSimple = siteSettings.cardStyle === 'simple';

      return (
        <a
            key={link.id}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                // 长按已经弹出了菜单（部分安卓浏览器长按也会发 contextmenu），不重复处理
                if (longPressFiredRef.current) return false;
                openLinkMenu(e.clientX, e.clientY, link);
                return false;
            }}
            onTouchStart={(e) => handleCardTouchStart(e, link)}
            onTouchMove={handleCardTouchMove}
            onTouchEnd={handleCardTouchEnd}
            onTouchCancel={cancelLongPress}
            onClick={handleCardClick}
            draggable={false}
            style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
            className={`group relative flex flex-col ${isSimple ? 'p-2' : 'p-3'} bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700/50 shadow-sm hover:shadow-lg hover:border-blue-200 dark:hover:border-slate-600 hover:-translate-y-0.5 transition-all duration-200 hover:bg-blue-50 dark:hover:bg-slate-750`}
            title={link.description || link.url}
        >
            <div className={`flex items-center gap-3 ${isSimple ? '' : 'mb-1.5'} pr-6`}>
                <div className={`${isSimple ? 'w-6 h-6 text-xs' : 'w-8 h-8 text-sm'} rounded-lg bg-slate-50 dark:bg-slate-700 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold uppercase shrink-0 overflow-hidden`}>
                    {iconDisplay}
                </div>
                <h3 className="font-medium text-sm text-slate-800 dark:text-slate-200 truncate flex-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    {link.title}
                </h3>
            </div>
            {!isSimple && (
                <div className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 h-4 w-full overflow-hidden">
                    {link.description || <span className="opacity-0">.</span>}
                </div>
            )}
        </a>
      );
  };

  return (
    <div className="flex h-screen overflow-hidden text-slate-900 dark:text-slate-50">
      
      {/* Right Click Context Menu */}
      {contextMenu && (
          <div 
             ref={contextMenuRef}
             className="fixed z-[9999] bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-100 dark:border-slate-600 w-44 py-2 flex flex-col animate-in fade-in zoom-in duration-100 overflow-hidden"
             style={{ top: contextMenu.y, left: contextMenu.x }}
             onClick={(e) => e.stopPropagation()}
             onContextMenu={(e) => e.preventDefault()}
          >
             <button onClick={() => { handleCopyLink(contextMenu.link!.url); setContextMenu(null); }} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors text-left">
                 <Copy size={16} className="text-slate-400"/> <span>复制链接</span>
             </button>
             <button onClick={() => { setQrCodeLink(contextMenu.link); setContextMenu(null); }} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors text-left">
                 <QrCode size={16} className="text-slate-400"/> <span>显示二维码</span>
             </button>
             <div className="h-px bg-slate-100 dark:bg-slate-700 my-1 mx-2"/>
             <button onClick={() => { if(!authToken) setIsAuthOpen(true); else { setEditingLink(contextMenu.link!); setIsModalOpen(true); setContextMenu(null); }}} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors text-left">
                 <Edit2 size={16} className="text-slate-400"/> <span>编辑链接</span>
             </button>
             <button onClick={() => { togglePin(contextMenu.link!.id); setContextMenu(null); }} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors text-left">
                 <Pin size={16} className={contextMenu.link!.pinned ? "fill-current text-blue-500" : "text-slate-400"}/> <span>{contextMenu.link!.pinned ? '取消置顶' : '置顶'}</span>
             </button>
             <div className="h-px bg-slate-100 dark:bg-slate-700 my-1 mx-2"/>
             <button onClick={() => { handleDeleteLink(contextMenu.link!.id); setContextMenu(null); }} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors text-left">
                 <Trash2 size={16}/> <span>删除链接</span>
             </button>
          </div>
      )}

      {/* QR Code Modal */}
      {qrCodeLink && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setQrCodeLink(null)}>
              <div className="bg-white p-6 rounded-2xl shadow-2xl flex flex-col items-center gap-4 animate-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                  <h3 className="font-bold text-lg text-slate-800">{qrCodeLink.title}</h3>
                  <div className="p-2 border border-slate-200 rounded-lg">
                    <img 
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrCodeLink.url)}`} 
                        alt="QR Code" 
                        className="w-48 h-48"
                    />
                  </div>
                  <p className="text-xs text-slate-500 max-w-[200px] truncate">{qrCodeLink.url}</p>
              </div>
          </div>
      )}

      <AuthModal isOpen={isAuthOpen} onLogin={handleLogin} onClose={() => setIsAuthOpen(false)} />
      
      <CategoryAuthModal 
        isOpen={!!catAuthModalData}
        category={catAuthModalData}
        onClose={() => setCatAuthModalData(null)}
        onUnlock={handleUnlockCategory}
        onVerify={handleVerifyCategoryPassword}
      />

      <CategoryManagerModal 
        isOpen={isCatManagerOpen} 
        onClose={() => setIsCatManagerOpen(false)}
        categories={categories}
        links={links}
        onUpdateCategories={handleUpdateCategories}
        onDeleteCategory={handleDeleteCategory}
      />

      <BackupModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
        links={links}
        categories={categories}
        onRestore={handleRestoreBackup}
        webDavConfig={webDavConfig}
        onSaveWebDavConfig={handleSaveWebDavConfig}
      />

      <ImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        existingLinks={links}
        categories={categories}
        onImport={handleImportConfirm}
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        config={aiConfig}
        siteSettings={siteSettings}
        onSave={handleSaveAIConfig}
        links={links}
        categories={categories}
        onUpdateLinks={(newLinks) => updateData(newLinks, categories)}
      />

      <SearchSettingsModal
        isOpen={isSearchSettingsOpen}
        onClose={() => setIsSearchSettingsOpen(false)}
        engines={externalEngines}
        activeEngineId={activeEngineId}
        onUpdateEngines={handleUpdateSearchEngines}
        onSelectEngine={setActiveEngineId}
      />

      {/* Sidebar Mobile Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-20 bg-black/50 lg:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={`
          fixed lg:static inset-y-0 left-0 z-30 w-64 transform transition-transform duration-300 ease-in-out
          bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex flex-col
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <div className="h-16 flex items-center px-6 border-b border-slate-100 dark:border-slate-700 shrink-0 gap-3">
             <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-blue-500/30 overflow-hidden">
                 {siteSettings.favicon ? (
                    <img src={siteSettings.favicon} alt="" className="w-full h-full object-cover" />
                 ) : (
                    "C"
                 )}
             </div>
            <span className="text-lg font-bold bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent truncate">
              {siteSettings.navTitle || 'CloudNav'}
            </span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-1 scrollbar-hide">
            <button
              onClick={() => scrollToCategory('all')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                activeCategory === 'all' 
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium' 
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              <div className="p-1"><Icon name="LayoutGrid" size={18} /></div>
              <span>全部链接</span>
            </button>
            
            <div className="flex items-center justify-between pt-4 pb-2 px-4">
               <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">分类目录</span>
               <button 
                  onClick={() => { if(!authToken) setIsAuthOpen(true); else setIsCatManagerOpen(true); }}
                  className="p-1 text-slate-400 hover:text-blue-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
                  title="管理分类"
               >
                  <Settings size={14} />
               </button>
            </div>

            {categories.map(cat => {
                const isLocked = cat.password && !unlockedCategoryIds.has(cat.id);
                const isEmoji = cat.icon && cat.icon.length <= 4 && !/^[a-zA-Z]+$/.test(cat.icon);
                
                return (
                  <button
                    key={cat.id}
                    onClick={() => scrollToCategory(cat.id)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all group ${
                      activeCategory === cat.id 
                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium' 
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    <div className={`p-1.5 rounded-lg transition-colors flex items-center justify-center ${activeCategory === cat.id ? 'bg-blue-100 dark:bg-blue-800' : 'bg-slate-100 dark:bg-slate-800'}`}>
                      {isLocked ? <Lock size={16} className="text-amber-500" /> : (isEmoji ? <span className="text-base leading-none">{cat.icon}</span> : <Icon name={cat.icon} size={16} />)}
                    </div>
                    <span className="truncate flex-1 text-left">{cat.name}</span>
                    {activeCategory === cat.id && <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>}
                  </button>
                );
            })}
        </div>

        <div className="p-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 shrink-0">
            <div className="grid grid-cols-3 gap-2 mb-2">
                <button 
                    onClick={() => { if(!authToken) setIsAuthOpen(true); else setIsImportModalOpen(true); }}
                    className="flex flex-col items-center justify-center gap-1 p-2 text-xs text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600 transition-all"
                    title="导入书签"
                >
                    <Upload size={14} />
                    <span>导入</span>
                </button>
                <button 
                    onClick={() => { if(!authToken) setIsAuthOpen(true); else setIsBackupModalOpen(true); }}
                    className="flex flex-col items-center justify-center gap-1 p-2 text-xs text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600 transition-all"
                    title="备份与恢复"
                >
                    <CloudCog size={14} />
                    <span>备份</span>
                </button>
                <button 
                    onClick={() => setIsSettingsModalOpen(true)}
                    className="flex flex-col items-center justify-center gap-1 p-2 text-xs text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600 transition-all"
                    title="AI 设置"
                >
                    <Settings size={14} />
                    <span>设置</span>
                </button>
            </div>
            
            <div className="flex items-center justify-between text-xs px-2 mt-2">
               <div className="flex items-center gap-1 text-slate-400">
                 {syncStatus === 'saving' && <Loader2 className="animate-spin w-3 h-3 text-blue-500" />}
                 {syncStatus === 'saved' && <CheckCircle2 className="w-3 h-3 text-green-500" />}
                 {syncStatus === 'error' && <AlertCircle className="w-3 h-3 text-red-500" />}
                 {authToken ? <span className="text-green-600">已同步</span> : <span className="text-amber-500">离线</span>}
               </div>
               <a 
                 href={GITHUB_REPO_URL} 
                 target="_blank" 
                 rel="noopener noreferrer"
                 className="flex items-center gap-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                 title="Fork this project on GitHub"
               >
                 <GitFork size={14} />
                 <span>Fork 项目</span>
               </a>
            </div>
        </div>
      </aside>

      <main 
          ref={mainRef}
          className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-slate-900 overflow-y-auto relative scroll-smooth"
      >
        <header className="h-16 px-4 lg:px-8 flex items-center justify-between bg-white/80 dark:bg-slate-800/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-700 sticky top-0 z-30 shrink-0">
          <div className="flex items-center gap-4 flex-1">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 -ml-2 text-slate-600 dark:text-slate-300">
              <Menu size={24} />
            </button>

            {/* Redesigned Search Bar */}
            <div className="relative w-full max-w-xl hidden sm:flex items-center gap-3">
                {/* Search Mode Toggle (Pill) */}
                <div className="bg-slate-100 dark:bg-slate-700 p-1 rounded-full flex items-center shrink-0">
                    <button
                        onClick={() => setSearchMode('local')}
                        className={`px-3 py-1.5 text-sm font-medium rounded-full transition-all ${
                            searchMode === 'local' 
                            ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm' 
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                        }`}
                    >
                        站内
                    </button>
                    <button
                        onClick={() => setSearchMode('external')}
                        className={`px-3 py-1.5 text-sm font-medium rounded-full transition-all ${
                            searchMode === 'external' 
                            ? 'bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-400 shadow-sm' 
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                        }`}
                    >
                        站外
                    </button>
                </div>

                {/* Settings Gear (Visible only for External) */}
                {searchMode === 'external' && (
                    <button 
                        onClick={() => setIsSearchSettingsOpen(true)}
                        className="p-2 text-slate-400 hover:text-blue-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors animate-in fade-in slide-in-from-left-2 duration-200"
                        title="管理搜索引擎"
                    >
                        <Settings size={18} />
                    </button>
                )}

                {/* Search Input */}
                <form onSubmit={handleSearchSubmit} className="flex-1 relative flex items-center group">
                    <input
                        ref={searchInputRef}
                        type="text"
                        placeholder={searchMode === 'local' ? "搜索书签..." : `在 ${activeExternalEngine?.name} 搜索...`}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-slate-100 dark:bg-slate-700/50 hover:bg-white dark:hover:bg-slate-700 border border-transparent hover:border-slate-200 dark:hover:border-slate-600 rounded-full text-sm dark:text-white placeholder-slate-400 outline-none transition-all focus:bg-white dark:focus:bg-slate-700 focus:ring-2 focus:ring-blue-500/50"
                    />
                    <div className="absolute left-3 text-slate-400 pointer-events-none flex items-center gap-2">
                        {searchMode === 'local' ? (
                            <Search size={16} />
                        ) : activeExternalEngine?.icon?.startsWith('http') ? (
                            <img src={activeExternalEngine.icon} className="w-4 h-4 rounded-full object-cover" />
                        ) : (
                            <Search size={16} />
                        )}
                    </div>
                    
                    {/* Visual Indicator for Search */}
                    {searchQuery && (
                        <button type="submit" className="absolute right-2 p-1.5 bg-blue-100 dark:bg-blue-900/40 text-blue-600 rounded-full hover:bg-blue-200 transition-colors">
                            <ArrowRight size={14} />
                        </button>
                    )}
                </form>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden md:flex bg-slate-100 dark:bg-slate-700 rounded-lg p-1 mr-2">
                <button 
                    onClick={() => authToken && updateData(links, categories, { ...siteSettings, cardStyle: 'simple' })}
                    title="简约模式"
                    className={`p-1.5 rounded transition-all ${siteSettings.cardStyle === 'simple' ? 'bg-white dark:bg-slate-600 shadow text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                >
                    <LayoutGrid size={16} />
                </button>
                <button 
                    onClick={() => authToken && updateData(links, categories, { ...siteSettings, cardStyle: 'detailed' })}
                    title="详情模式"
                    className={`p-1.5 rounded transition-all ${siteSettings.cardStyle === 'detailed' ? 'bg-white dark:bg-slate-600 shadow text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                >
                    <List size={16} />
                </button>
            </div>

            <button onClick={toggleTheme} className="p-2 rounded-full text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            {!authToken && (
                <button onClick={() => setIsAuthOpen(true)} className="hidden sm:flex items-center gap-2 bg-slate-200 dark:bg-slate-700 px-3 py-1.5 rounded-full text-xs font-medium">
                    <Cloud size={14} /> 登录
                </button>
            )}

            <button
              onClick={() => { if(!authToken) setIsAuthOpen(true); else { setEditingLink(undefined); setIsModalOpen(true); }}}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-full text-sm font-medium shadow-lg shadow-blue-500/30"
            >
              <Plus size={16} /> <span className="hidden sm:inline">添加</span>
            </button>
          </div>
        </header>

        <div className="p-4 lg:p-8 space-y-8">
            
            {pinnedLinks.length > 0 && !searchQuery && (
                <section>
                    <div className="flex items-center gap-2 mb-4">
                        <Pin size={16} className="text-blue-500 fill-blue-500" />
                        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            置顶 / 常用
                        </h2>
                    </div>
                    <div className={`grid gap-3 ${siteSettings.cardStyle === 'simple' ? 'grid-cols-2 md:grid-cols-5 lg:grid-cols-8 xl:grid-cols-10' : 'grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8'}`}>
                        {pinnedLinks.map(link => renderLinkCard(link))}
                    </div>
                </section>
            )}

            {categories.map(cat => {
                let catLinks = searchResults.filter(l => l.categoryId === cat.id);
                const isLocked = cat.password && !unlockedCategoryIds.has(cat.id);
                
                // Logic Fix: If External Search, do NOT hide categories based on links
                // Because external search doesn't filter links.
                // However, the user probably wants to see the links grid even when typing for external search
                // Current logic: if search query exists AND local search -> filter. 
                // If search query exists AND external search -> show all (searchResults returns all).
                
                if (searchQuery && searchMode === 'local' && catLinks.length === 0) return null;

                return (
                    <section key={cat.id} id={`cat-${cat.id}`} className="scroll-mt-24">
                        <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-100 dark:border-slate-800">
                             <div className="text-slate-400">
                                {cat.icon && cat.icon.length <= 4 && !/^[a-zA-Z]+$/.test(cat.icon) ? <span className="text-lg">{cat.icon}</span> : <Icon name={cat.icon} size={20} />}
                             </div>
                             <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200">
                                 {cat.name}
                             </h2>
                             {isLocked && <Lock size={16} className="text-amber-500" />}
                        </div>
                        
                        {isLocked ? (
                             <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 p-8 flex flex-col items-center justify-center text-center">
                                <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mb-4 text-amber-600 dark:text-amber-400">
                                    <Lock size={24} />
                                </div>
                                <h3 className="text-slate-800 dark:text-slate-200 font-medium mb-1">私密目录</h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">该分类已加密，需要验证密码才能查看内容</p>
                                <button 
                                    onClick={() => setCatAuthModalData(cat)}
                                    className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium transition-colors"
                                >
                                    输入密码解锁
                                </button>
                             </div>
                        ) : (
                             <>
                                {catLinks.length === 0 ? (
                                    <div className="text-center py-8 text-slate-400 text-sm italic">
                                        暂无链接
                                    </div>
                                ) : (
                                    <div className={`grid gap-3 ${siteSettings.cardStyle === 'simple' ? 'grid-cols-2 md:grid-cols-5 lg:grid-cols-8 xl:grid-cols-10' : 'grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8'}`}>
                                        {catLinks.map(link => renderLinkCard(link))}
                                    </div>
                                )}
                             </>
                        )}
                    </section>
                );
            })}
            
            {/* Empty State for Local Search */}
            {searchQuery && searchMode === 'local' && searchResults.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                    <Search size={40} className="opacity-30 mb-4" />
                    <p>没有找到相关内容</p>
                    <button onClick={() => setIsModalOpen(true)} className="mt-4 text-blue-500 hover:underline">添加一个?</button>
                </div>
            )}

            <div className="h-20"></div>
        </div>
      </main>

      <LinkModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setEditingLink(undefined); setPrefillLink(undefined); }}
        onSave={editingLink ? handleEditLink : handleAddLink}
        categories={categories}
        existingLinks={links}
        initialData={editingLink || (prefillLink as LinkItem)}
        aiConfig={aiConfig}
      />
    </div>
  );
}

export default App;
