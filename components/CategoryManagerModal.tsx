
import React, { useState } from 'react';
import { X, ArrowUp, ArrowDown, Trash2, Edit2, Plus, Check, Lock, Merge, Smile } from 'lucide-react';
import { Category, LinkItem } from '../types';
import Icon from './Icon';

interface CategoryManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  links: LinkItem[];
  onUpdateCategories: (newCategories: Category[], newLinks?: LinkItem[]) => void;
  onDeleteCategory: (id: string) => void;
}

// 预定义常用图标列表
const COMMON_ICONS = [
  { value: 'Folder', label: '文件夹' },
  { value: 'Star', label: '收藏/星标' },
  { value: 'Code', label: '开发/代码' },
  { value: 'Palette', label: '设计/调色板' },
  { value: 'BookOpen', label: '阅读/书籍' },
  { value: 'Gamepad2', label: '游戏/娱乐' },
  { value: 'Bot', label: '人工智能/机器人' },
  { value: 'ShoppingBag', label: '购物/商店' },
  { value: 'Globe', label: '全球/网络' },
  { value: 'Server', label: '服务器/运维' },
  { value: 'Terminal', label: '终端/系统' },
  { value: 'Cpu', label: '硬件/芯片' },
  { value: 'Music', label: '音乐' },
  { value: 'Video', label: '视频' },
  { value: 'Image', label: '图片' },
  { value: 'Mail', label: '邮箱' },
  { value: 'MessageCircle', label: '社交/聊天' },
  { value: 'Briefcase', label: '办公/工作' },
  { value: 'Cloud', label: '云服务' },
  { value: 'Shield', label: '安全' },
];

const CategoryManagerModal: React.FC<CategoryManagerModalProps> = ({ 
  isOpen, 
  onClose, 
  categories, 
  links,
  onUpdateCategories,
  onDeleteCategory
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editIcon, setEditIcon] = useState('');
  const [editPassword, setEditPassword] = useState('');
  
  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('Folder');
  const [newCatPassword, setNewCatPassword] = useState('');

  // Merge State
  const [mergingCatId, setMergingCatId] = useState<string | null>(null);
  const [targetMergeId, setTargetMergeId] = useState<string>('');

  if (!isOpen) return null;

  const handleMove = (index: number, direction: 'up' | 'down') => {
    const newCats = [...categories];
    if (direction === 'up' && index > 0) {
      [newCats[index], newCats[index - 1]] = [newCats[index - 1], newCats[index]];
    } else if (direction === 'down' && index < newCats.length - 1) {
      [newCats[index], newCats[index + 1]] = [newCats[index + 1], newCats[index]];
    }
    onUpdateCategories(newCats);
  };

  const startEdit = (cat: Category) => {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditIcon(cat.icon || 'Folder');
    setEditPassword(cat.password || '');
    setMergingCatId(null);
  };

  const saveEdit = () => {
    if (!editingId || !editName.trim()) return;
    const newCats = categories.map(c => c.id === editingId ? { 
        ...c, 
        name: editName.trim(),
        icon: editIcon.trim(),
        password: editPassword.trim() || undefined
    } : c);
    onUpdateCategories(newCats);
    setEditingId(null);
  };

  const handleAdd = () => {
    if (!newCatName.trim()) return;
    const newCat: Category = {
      id: Date.now().toString(),
      name: newCatName.trim(),
      icon: newCatIcon.trim() || 'Folder',
      password: newCatPassword.trim() || undefined
    };
    onUpdateCategories([...categories, newCat]);
    setNewCatName('');
    setNewCatIcon('Folder');
    setNewCatPassword('');
  };

  const openMerge = (catId: string) => {
      setMergingCatId(catId);
      // Default target is first category that is not self
      const firstTarget = categories.find(c => c.id !== catId);
      if (firstTarget) setTargetMergeId(firstTarget.id);
  };

  const executeMerge = () => {
      if (!mergingCatId || !targetMergeId) return;
      if (mergingCatId === targetMergeId) return;

      if (!confirm('确定合并吗？合并后原分类将被删除。')) return;

      // 1. Move all links
      const newLinks = links.map(l => l.categoryId === mergingCatId ? { ...l, categoryId: targetMergeId } : l);

      // 2. Remove old category
      const newCats = categories.filter(c => c.id !== mergingCatId);

      onUpdateCategories(newCats, newLinks);
      setMergingCatId(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200 dark:border-slate-700 flex flex-col max-h-[85vh]">
        <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold dark:text-white">分类管理</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors">
            <X className="w-5 h-5 dark:text-slate-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {categories.map((cat, index) => (
            <div key={cat.id} className="flex flex-col p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg group gap-2 border border-slate-100 dark:border-slate-600">
              <div className="flex items-center gap-2">
                  {/* Order Controls */}
                  <div className="flex flex-col gap-1 mr-2">
                    <button 
                      onClick={() => handleMove(index, 'up')}
                      disabled={index === 0}
                      className="p-0.5 text-slate-400 hover:text-blue-500 disabled:opacity-30"
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button 
                      onClick={() => handleMove(index, 'down')}
                      disabled={index === categories.length - 1}
                      className="p-0.5 text-slate-400 hover:text-blue-500 disabled:opacity-30"
                    >
                      <ArrowDown size={14} />
                    </button>
                  </div>

                  {/* Name & Content */}
                  <div className="flex-1 min-w-0">
                    {editingId === cat.id ? (
                      <div className="flex flex-col gap-2">
                          <div className="flex gap-2">
                              <div className="relative w-32 shrink-0">
                                <select
                                    value={editIcon}
                                    onChange={(e) => setEditIcon(e.target.value)}
                                    className="w-full p-1.5 text-sm rounded border border-blue-500 dark:bg-slate-800 dark:text-white outline-none appearance-none"
                                >
                                    {COMMON_ICONS.map(icon => (
                                        <option key={icon.value} value={icon.value}>
                                            {icon.label}
                                        </option>
                                    ))}
                                </select>
                                <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                                    <Icon name={editIcon} size={14} />
                                </div>
                              </div>
                              <input 
                                type="text" 
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="flex-1 p-1.5 px-2 text-sm rounded border border-blue-500 dark:bg-slate-800 dark:text-white outline-none"
                                placeholder="分类名称"
                                autoFocus
                              />
                          </div>
                          <div className="flex items-center gap-2">
                              <Lock size={14} className="text-slate-400" />
                              <input 
                                type="text" 
                                value={editPassword}
                                onChange={(e) => setEditPassword(e.target.value)}
                                className="flex-1 p-1.5 px-2 text-xs rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white outline-none"
                                placeholder="设置密码 (留空则不加密)"
                              />
                          </div>
                      </div>
                    ) : mergingCatId === cat.id ? (
                        <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-900/20 p-2 rounded">
                            <span className="text-sm dark:text-slate-200 whitespace-nowrap">合并到 &rarr;</span>
                            <select 
                                value={targetMergeId}
                                onChange={(e) => setTargetMergeId(e.target.value)}
                                className="flex-1 text-sm p-1 rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                            >
                                {categories.filter(c => c.id !== cat.id).map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                            <button onClick={executeMerge} className="text-xs bg-blue-600 text-white px-2 py-1 rounded">确认</button>
                            <button onClick={() => setMergingCatId(null)} className="text-xs text-slate-500 px-2 py-1">取消</button>
                        </div>
                    ) : (
                      <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded bg-white dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-600">
                             {cat.icon && cat.icon.length <= 4 && !/^[a-zA-Z]+$/.test(cat.icon) 
                                ? <span className="text-lg">{cat.icon}</span> 
                                : <Icon name={cat.icon} size={16} />
                             }
                          </div>
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                                <span className="font-medium dark:text-slate-200 truncate">{cat.name}</span>
                                {cat.password && <Lock size={12} className="text-amber-500" />}
                            </div>
                            <span className="text-xs text-slate-400">{links.filter(l => l.categoryId === cat.id).length} 个链接</span>
                          </div>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  {editingId !== cat.id && mergingCatId !== cat.id && (
                      <div className="flex items-center gap-1 self-start mt-2">
                        <button onClick={() => startEdit(cat)} className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-slate-200 dark:hover:bg-slate-600 rounded" title="编辑">
                            <Edit2 size={14} />
                        </button>
                        <button onClick={() => openMerge(cat.id)} className="p-1.5 text-slate-400 hover:text-purple-500 hover:bg-slate-200 dark:hover:bg-slate-600 rounded" title="合并到其他分类">
                            <Merge size={14} />
                        </button>
                        <button 
                        onClick={() => {
                            const rest = categories.filter(c => c.id !== cat.id);
                            const target = rest.find(c => c.id === 'common') || rest[0];
                            const targetName = target ? target.name : '常用推荐';
                            if(confirm(`确定删除"${cat.name}"分类吗？该分类下的书签将移动到"${targetName}"。`)) onDeleteCategory(cat.id);
                        }}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-slate-200 dark:hover:bg-slate-600 rounded"
                        title="删除"
                        >
                        <Trash2 size={14} />
                        </button>
                      </div>
                  )}
                  {editingId === cat.id && (
                       <button onClick={saveEdit} className="self-start mt-2 text-green-500 hover:bg-green-50 dark:hover:bg-slate-600 p-1.5 rounded bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-600"><Check size={16}/></button>
                  )}
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
           <label className="text-xs font-semibold text-slate-500 uppercase mb-2 block">添加新分类</label>
           <div className="flex flex-col gap-2">
             <div className="flex gap-2">
                 <div className="relative w-32 shrink-0">
                    <select
                        value={newCatIcon}
                        onChange={(e) => setNewCatIcon(e.target.value)}
                        className="w-full p-2 pl-2 pr-8 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white text-sm outline-none appearance-none"
                    >
                        {COMMON_ICONS.map(icon => (
                            <option key={icon.value} value={icon.value}>
                                {icon.label}
                            </option>
                        ))}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                        <Icon name={newCatIcon} size={16} />
                    </div>
                 </div>
                 
                 <input 
                    type="text"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    placeholder="分类名称"
                    className="flex-1 p-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                 />
             </div>
             <div className="flex gap-2">
                 <div className="flex-1 relative">
                    <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input 
                        type="text"
                        value={newCatPassword}
                        onChange={(e) => setNewCatPassword(e.target.value)}
                        placeholder="密码 (可选)"
                        className="w-full pl-8 p-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                    />
                 </div>
                 <button 
                    onClick={handleAdd}
                    disabled={!newCatName.trim()}
                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg transition-colors flex items-center"
                 >
                   <Plus size={18} />
                 </button>
             </div>
           </div>
        </div>
      </div>
    </div>
  );
};

export default CategoryManagerModal;
