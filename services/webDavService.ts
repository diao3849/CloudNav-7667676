
import { Category, LinkItem, WebDavConfig } from "../types";

// Helper to call our Cloudflare Proxy
// This solves the CORS issue by delegating the request to the backend
// 最近一次失败的原因（状态码），用于在界面上提示
let lastWebDavError = '';
export const getLastWebDavError = () => lastWebDavError;

const callWebDavProxy = async (operation: 'check' | 'upload' | 'download', config: WebDavConfig, payload?: any) => {
    lastWebDavError = '';
    try {
        const response = await fetch('/api/webdav', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-auth-password': localStorage.getItem('cloudnav_auth_token') || ''
            },
            body: JSON.stringify({
                operation,
                config,
                payload
            })
        });
        
        if (!response.ok) {
            console.error(`WebDAV Proxy Error: ${response.status}`);
            lastWebDavError = response.status === 401 ? '请先登录' : `状态码 ${response.status}`;
            return null;
        }
        
        const result = await response.json();
        if (result && result.success === false && result.status) {
            lastWebDavError = `WebDAV 状态码 ${result.status}`;
        }
        return result;
    } catch (e) {
        console.error("WebDAV Proxy Network Error", e);
        lastWebDavError = '网络错误';
        return null;
    }
}

export const checkWebDavConnection = async (config: WebDavConfig): Promise<boolean> => {
    if (!config.url || !config.username || !config.password) return false;
    const result = await callWebDavProxy('check', config);
    return result?.success === true;
};

export const uploadBackup = async (config: WebDavConfig, data: { links: LinkItem[], categories: Category[] }): Promise<boolean> => {
    const result = await callWebDavProxy('upload', config, data);
    return result?.success === true;
};

export const downloadBackup = async (config: WebDavConfig): Promise<{ links: LinkItem[], categories: Category[] } | null> => {
    const result = await callWebDavProxy('download', config);
    
    // Check if the result looks like valid backup data
    if (result && Array.isArray(result.links) && Array.isArray(result.categories)) {
        return result as { links: LinkItem[], categories: Category[] };
    }
    return null;
};
