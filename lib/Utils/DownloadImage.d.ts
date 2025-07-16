import { Context, Session } from 'koishi';
export declare function getSessionImageUrl(session: Session): string | null;
export declare function downloadImageAsBase64(url: string, ctx: Context): Promise<{
    mimeType: string;
    data: string;
} | null>;
