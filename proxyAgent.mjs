import { SocksProxyAgent } from 'socks-proxy-agent';
import HttpsProxyAgent from 'https-proxy-agent';
import { parse as parseUrl } from 'url';

export function createProxyAgent() {
    const proxyUrl = process.env.https_proxy || process.env.HTTPS_PROXY;
    
    if (!proxyUrl) {
        console.log('https_proxy 环境变量未设置，将不使用代理。');
        return null;
    }

    // 检查是否是 SOCKS5 代理
    if (proxyUrl.startsWith('socks5://')) {
        const [host, port, username, password] = proxyUrl.slice(9).split(':');
        return new SocksProxyAgent({
            host,
            port,
            userId: username,
            password,
        });
    } else {
        // 处理 HTTP/HTTPS 代理
        return new HttpsProxyAgent.HttpsProxyAgent(proxyUrl);
    }
}

export function getProxyArgs() {
    const proxyUrl = process.env.https_proxy || process.env.HTTPS_PROXY;
    
    if (!proxyUrl) {
        return [];
    }

    if (proxyUrl.startsWith('socks5://')) {
        const [host, port] = proxyUrl.slice(9).split(':');
        return [`--proxy-server=socks5://${host}:${port}`];
    } else {
        const parsedUrl = parseUrl(proxyUrl);
        return [`--proxy-server=${parsedUrl.host}`];
    }
}

export function getProxyEnv() {
    const proxyUrl = process.env.https_proxy || process.env.HTTPS_PROXY;
    
    if (!proxyUrl || !proxyUrl.startsWith('socks5://')) {
        return {};
    }

    const [, , username, password] = proxyUrl.slice(9).split(':');
    return {
        SOCKS_USERNAME: username,
        SOCKS_PASSWORD: password,
    };
}
