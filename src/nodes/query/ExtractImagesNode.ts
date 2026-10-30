import { BaseNode } from '@gravitydock/types';
import type { InputDefinition, OutputDefinition, PropertyDefinition } from '@gravitydock/types';
import { WebQueryCategory } from '../../category';
import { resolveUrl } from '../../utils/resolveUrl';
import * as cheerio from 'cheerio';
import * as aq from 'arquero';

interface ImageRow {
    src: string;
    alt: string;
    title: string;
    width: number | null;
    height: number | null;
}

const EMPTY_OUTPUTS = { 'Image URLs': [] as string[], 'Image Data': { __arqueroData: [] as ImageRow[] }, 'Count': 0 };

export class ExtractImagesNode extends BaseNode {
    readonly typeId = 'web.extract-images';
    readonly displayName = 'Extract Images';
    readonly category = WebQueryCategory;
    readonly visible = true;

    readonly inputs: InputDefinition[] = [
        { name: 'HTML', acceptsType: 'core:string' },
        { name: 'Base URL', acceptsType: 'core:string' }
    ];

    readonly outputs: OutputDefinition[] = [
        { name: 'Image URLs', outputType: 'core:string-array' },
        { name: 'Image Data', outputType: 'core:dataframe' },
        { name: 'Count', outputType: 'core:number' }
    ];

    readonly properties: PropertyDefinition[] = [
        { name: 'selector', label: 'Selector', type: 'string', defaultValue: 'img[src]' },
        { name: 'excludeDataUri', label: 'Exclude data: URIs', type: 'boolean', defaultValue: true }
    ];

    async evaluate(inputs: Record<string, any>, properties: Record<string, any>): Promise<Record<string, any>> {
        const html = inputs['HTML'] != null ? String(inputs['HTML']) : '';
        if (!html) return EMPTY_OUTPUTS;

        const baseUrl = inputs['Base URL'] != null ? String(inputs['Base URL']) : '';
        const selector = String(properties['selector'] || 'img[src]');
        const excludeDataUri = properties['excludeDataUri'] !== false;

        try {
            const $ = cheerio.load(html);
            const rows: ImageRow[] = [];

            $(selector).each((_, el) => {
                const rawSrc = $(el).attr('src') ?? '';
                if (excludeDataUri && rawSrc.startsWith('data:')) return;

                const src = resolveUrl(rawSrc, baseUrl);
                if (!src) return;

                const widthAttr = $(el).attr('width');
                const heightAttr = $(el).attr('height');
                const width = widthAttr != null ? parseInt(widthAttr, 10) : null;
                const height = heightAttr != null ? parseInt(heightAttr, 10) : null;

                rows.push({
                    src,
                    alt: $(el).attr('alt') ?? '',
                    title: $(el).attr('title') ?? '',
                    width: width != null && !isNaN(width) ? width : null,
                    height: height != null && !isNaN(height) ? height : null
                });
            });

            return {
                'Image URLs': rows.map(r => r.src),
                'Image Data': { __arqueroData: aq.from(rows).objects() },
                'Count': rows.length
            };
        } catch {
            return EMPTY_OUTPUTS;
        }
    }
}
