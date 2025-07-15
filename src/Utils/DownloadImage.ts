import { Context , Session } from 'koishi';

export function getSessionImageUrl( session: Session ): string | null {
  if (!session?.elements) {
    return null;
  }
  const imageElement = session.elements.find(element => {
    const isImage = element.type === 'img' || element.type === 'image';
    return isImage && element.attrs?.src;
  });
  return imageElement?.attrs?.src ?? null;
}

export async function downloadImageAsBase64(
  url: string,
  ctx: Context
): Promise< { mimeType: string; data: string } | null > {
  try {
    // 优先使用 Koishi 的 HTTP 客户端（自动处理代理/重试等）
    const koishiResponse = await ctx.http.get(url, {
      responseType: 'arraybuffer',
    });
    
    const bufferData = Buffer.from(koishiResponse);
    const base64ImageData = bufferData.toString('base64');
    
    // 尝试通过扩展名获取 MIME 类型
    const extension = url.split('.').pop()?.toLowerCase() || '';
    const mimeTypeMap: Record<string, string> = {
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
    };
    
    return {
      mimeType: mimeTypeMap[extension] || 'image/jpeg',
      data: base64ImageData,
    };
    
  } catch ( error ) {
    ctx.logger.warn(`图片下载失败: ${url}`, error);
    return null;
  }
}